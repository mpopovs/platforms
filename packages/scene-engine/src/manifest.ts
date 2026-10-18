import { z } from 'zod';

/**
 * scene manifest v1: what one version (or the draft) of a scene is made of.
 *
 * - files: logical file name -> storage key of a content-addressed asset
 *   (e.g. "backdrop/color.jpg" -> "scenes/scene_x/ab12….jpg")
 * - json: small JSON documents kept inline (scene.json, layout.json, zones.json,
 *   backdrop meta...) so editing them never re-uploads anything
 *
 * The engine reads everything as `${base}/${name}`; the server resolves a name
 * through json first, then files.
 */
export const SCENE_FORMAT_VERSION = 1 as const;

const fileName = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9_\-./]+$/, 'only letters, digits, _ - . /')
  .refine((s) => !s.startsWith('/') && !s.split('/').includes('..') && !s.includes('//'), 'invalid path');

const storageKey = z.string().regex(/^scenes\/[A-Za-z0-9_-]+\/[a-f0-9]{64}(\.[a-z0-9]{1,8})?$/, 'invalid storage key');

export const sceneManifestSchema = z.object({
  format: z.literal(SCENE_FORMAT_VERSION),
  files: z.record(fileName, storageKey),
  json: z.record(fileName, z.unknown())
});

export type SceneManifest = z.infer<typeof sceneManifestSchema>;

export const emptyManifest = (): SceneManifest => ({ format: SCENE_FORMAT_VERSION, files: {}, json: {} });

export function parseManifest(value: unknown): SceneManifest {
  return sceneManifestSchema.parse(value);
}

export function isValidFileName(name: string): boolean {
  return fileName.safeParse(name).success;
}

/** Files the scene can't start without. */
export function missingEssentials(m: SceneManifest): string[] {
  const has = (n: string) => n in m.json || n in m.files;
  return ['scene.json'].filter((n) => !has(n));
}

/** Content type by extension, for uploads and responses. */
export function contentTypeFor(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return (
    {
      json: 'application/json',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
      glb: 'model/gltf-binary',
      spz: 'application/octet-stream',
      ply: 'application/octet-stream',
      ktx2: 'image/ktx2'
    }[ext] ?? 'application/octet-stream'
  );
}

/** JSON documents small enough to keep inline in the manifest. */
export const INLINE_JSON_MAX_BYTES = 512 * 1024;
