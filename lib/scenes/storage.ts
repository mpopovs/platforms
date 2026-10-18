/**
 * Where scene assets live. Two backends, chosen by env:
 *
 *  - S3-compatible (Hetzner Object Storage, hel1) when SCENES_S3_BUCKET is set:
 *      SCENES_S3_ENDPOINT=https://hel1.your-objectstorage.com
 *      SCENES_S3_REGION=hel1
 *      SCENES_S3_BUCKET=<bucket>
 *      SCENES_S3_ACCESS_KEY_ID / SCENES_S3_SECRET_ACCESS_KEY
 *      SCENES_PUBLIC_BASE_URL (optional; default https://<bucket>.<endpoint host>)
 *  - otherwise the public `scenes` bucket in Supabase Storage.
 *
 * Assets are content-addressed: scenes/<sceneId>/<sha256>.<ext>. The same
 * bytes are stored once, versions only point at keys, and a key's content
 * never changes, so public URLs can be cached forever.
 *
 * No `server-only` import: scripts (import-scene, bucket setup) use it too.
 */
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const SUPABASE_SCENES_BUCKET = 'scenes';
export const MAX_ASSET_BYTES = 1024 * 1024 * 1024; // 1 GB hard cap per file

export type UploadTarget =
  | { kind: 'put'; url: string; headers: Record<string, string> }
  | { kind: 'supabase'; bucket: string; path: string; token: string };

export interface SceneStorage {
  kind: 's3' | 'supabase';
  publicUrl(key: string): string;
  uploadTarget(key: string, contentType: string): Promise<UploadTarget>;
  exists(key: string): Promise<boolean>;
  putObject(key: string, body: Buffer | Uint8Array, contentType: string): Promise<void>;
}

const EXT_RE = /\.([a-z0-9]{1,8})$/;

/** scenes/<sceneId>/<sha256>.<ext> */
export function assetKey(sceneId: string, sha256: string, fileName: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(sceneId)) throw new Error('bad scene id');
  if (!/^[a-f0-9]{64}$/.test(sha256)) throw new Error('bad sha256');
  const ext = fileName.toLowerCase().match(EXT_RE)?.[1];
  return `scenes/${sceneId}/${sha256}${ext ? '.' + ext : ''}`;
}

export function keyBelongsToScene(key: string, sceneId: string): boolean {
  return key.startsWith(`scenes/${sceneId}/`) && /^scenes\/[A-Za-z0-9_-]+\/[a-f0-9]{64}(\.[a-z0-9]{1,8})?$/.test(key);
}

type Env = Record<string, string | undefined>;

export function s3ConfigFromEnv(env: Env = process.env) {
  if (!env.SCENES_S3_BUCKET) return null;
  const endpoint = (env.SCENES_S3_ENDPOINT || 'https://hel1.your-objectstorage.com').replace(/\/$/, '');
  const bucket = env.SCENES_S3_BUCKET;
  const host = new URL(endpoint).host;
  return {
    endpoint,
    region: env.SCENES_S3_REGION || 'hel1',
    bucket,
    accessKeyId: env.SCENES_S3_ACCESS_KEY_ID || '',
    secretAccessKey: env.SCENES_S3_SECRET_ACCESS_KEY || '',
    publicBase: (env.SCENES_PUBLIC_BASE_URL || `https://${bucket}.${host}`).replace(/\/$/, '')
  };
}

export function s3Client(cfg: NonNullable<ReturnType<typeof s3ConfigFromEnv>>) {
  return new S3Client({
    endpoint: cfg.endpoint,
    region: cfg.region,
    forcePathStyle: false,
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey }
  });
}

function s3Storage(cfg: NonNullable<ReturnType<typeof s3ConfigFromEnv>>): SceneStorage {
  const client = s3Client(cfg);
  return {
    kind: 's3',
    publicUrl: (key) => `${cfg.publicBase}/${key}`,
    async uploadTarget(key, contentType) {
      const cmd = new PutObjectCommand({ Bucket: cfg.bucket, Key: key, ContentType: contentType, ACL: 'public-read', CacheControl: 'public, max-age=31536000, immutable' });
      const url = await getSignedUrl(client, cmd, { expiresIn: 60 * 30, signableHeaders: new Set(['content-type', 'x-amz-acl', 'cache-control']) });
      return {
        kind: 'put',
        url,
        headers: { 'Content-Type': contentType, 'x-amz-acl': 'public-read', 'Cache-Control': 'public, max-age=31536000, immutable' }
      };
    },
    async exists(key) {
      try {
        await client.send(new HeadObjectCommand({ Bucket: cfg.bucket, Key: key }));
        return true;
      } catch {
        return false;
      }
    },
    async putObject(key, body, contentType) {
      await client.send(new PutObjectCommand({
        Bucket: cfg.bucket, Key: key, Body: body, ContentType: contentType, ACL: 'public-read',
        CacheControl: 'public, max-age=31536000, immutable'
      }));
    }
  };
}

function supabaseStorage(db: SupabaseClient, publicSupabaseUrl: string): SceneStorage {
  const bucket = SUPABASE_SCENES_BUCKET;
  const path = (key: string) => key.replace(/^scenes\//, '');
  return {
    kind: 'supabase',
    publicUrl: (key) => `${publicSupabaseUrl.replace(/\/$/, '')}/storage/v1/object/public/${bucket}/${path(key)}`,
    async uploadTarget(key) {
      const { data, error } = await db.storage.from(bucket).createSignedUploadUrl(path(key), { upsert: true });
      if (error || !data) throw new Error(`Could not prepare upload: ${error?.message}`);
      return { kind: 'supabase', bucket, path: data.path, token: data.token };
    },
    async exists(key) {
      const { data } = await db.storage.from(bucket).exists(path(key));
      return Boolean(data);
    },
    async putObject(key, body, contentType) {
      const { error } = await db.storage.from(bucket).upload(path(key), body, {
        contentType, upsert: true, cacheControl: '31536000'
      });
      if (error) throw new Error(`Upload failed for ${key}: ${error.message}`);
    }
  };
}

/** Storage for the current environment. */
export function sceneStorage(env: Env = process.env): SceneStorage {
  const s3 = s3ConfigFromEnv(env);
  if (s3) return s3Storage(s3);
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('No scene storage configured (SCENES_S3_* or Supabase service key)');
  return supabaseStorage(createClient(url, key, { auth: { persistSession: false } }), url);
}
