/**
 * Copy the editor's AI models into the Hetzner bucket (public read), so the
 * editor downloads them from your own storage instead of Hugging Face.
 *
 *   pnpm tsx scripts/models-to-bucket.ts
 *
 * Uses SCENES_S3_* from .env.local (same bucket as the scenes). Afterwards add
 * the two lines it prints to .env.local (and the server's .env) and restart.
 *   - depth: Depth Anything V2 Small (Apache-2.0), ~100 MB
 *   - AI fill: LaMa fp32 (Apache-2.0), ~200 MB
 */
import { config } from 'dotenv';
import { HeadObjectCommand, PutBucketPolicyCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { s3Client, s3ConfigFromEnv } from '../lib/scenes/storage';

config({ path: '.env.local' });
config();

const MODELS = [
  { env: 'NEXT_PUBLIC_DEPTH_MODEL_URL', key: 'models/depth-anything-v2-small.onnx', from: 'https://huggingface.co/onnx-community/depth-anything-v2-small/resolve/main/onnx/model.onnx' },
  { env: 'NEXT_PUBLIC_INPAINT_MODEL_URL', key: 'models/lama-fp32.onnx', from: 'https://huggingface.co/Carve/LaMa-ONNX/resolve/main/lama_fp32.onnx' }
];

async function download(url: string): Promise<Buffer> {
  const r = await fetch(url);
  if (!r.ok || !r.body) throw new Error(`download failed ${r.status}: ${url}`);
  const total = Number(r.headers.get('content-length')) || 0, parts: Uint8Array[] = [];
  let got = 0, shown = 0;
  const reader = r.body.getReader();
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    parts.push(value); got += value.length;
    if (got - shown > 10e6) { shown = got; process.stdout.write(`\r  ${(got / 1e6).toFixed(0)}${total ? ` / ${(total / 1e6).toFixed(0)}` : ''} MB`); }
  }
  process.stdout.write('\n');
  return Buffer.concat(parts);
}

async function main() {
  const cfg = s3ConfigFromEnv();
  if (!cfg) throw new Error('Set SCENES_S3_BUCKET (and SCENES_S3_ENDPOINT, keys) in .env.local first');
  const s3 = s3Client(cfg);

  // public read for scenes/* (players) and models/* (editor)
  try {
    await s3.send(new PutBucketPolicyCommand({
      Bucket: cfg.bucket,
      Policy: JSON.stringify({
        Version: '2012-10-17',
        Statement: [{ Sid: 'PublicReadSceneAssetsAndModels', Effect: 'Allow', Principal: '*', Action: ['s3:GetObject'],
          Resource: [`arn:aws:s3:::${cfg.bucket}/scenes/*`, `arn:aws:s3:::${cfg.bucket}/models/*`] }]
      })
    }));
    console.log('Public read policy: scenes/* and models/*');
  } catch (e) {
    console.warn(`Bucket policy not set (${e instanceof Error ? e.message : e}); objects are uploaded with public-read instead.`);
  }

  const lines: string[] = [];
  for (const m of MODELS) {
    const url = `${cfg.publicBase}/${m.key}`;
    let exists = false;
    try { await s3.send(new HeadObjectCommand({ Bucket: cfg.bucket, Key: m.key })); exists = true; } catch { /* not there yet */ }
    if (exists) console.log(`${m.key}: already in the bucket`);
    else {
      console.log(`${m.key}: downloading from Hugging Face…`);
      const body = await download(m.from);
      console.log(`  uploading ${(body.length / 1e6).toFixed(0)} MB…`);
      await s3.send(new PutObjectCommand({
        Bucket: cfg.bucket, Key: m.key, Body: body, ACL: 'public-read',
        ContentType: 'application/octet-stream', CacheControl: 'public, max-age=31536000, immutable'
      }));
    }
    // check it can be read from a browser on your site (public + CORS)
    const origin = (process.env.SCENES_CORS_ORIGINS || 'http://localhost:3000').split(',')[0].trim();
    const r = await fetch(url, { method: 'HEAD', headers: { Origin: origin } });
    const cors = r.headers.get('access-control-allow-origin');
    console.log(`  ${url}: ${r.status}${cors ? `, CORS ok for ${origin}` : ', no CORS header: run scripts/scenes-bucket-setup.ts'}`);
    lines.push(`${m.env}=${url}`);
  }
  console.log('\nAdd these to .env.local (and the server .env), then restart:\n');
  console.log(lines.join('\n'));
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
