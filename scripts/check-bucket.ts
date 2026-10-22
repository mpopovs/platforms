/**
 * Check that browsers can read scene files and models from the Hetzner bucket.
 *
 *   pnpm tsx scripts/check-bucket.ts [origin]      (origin default http://localhost:3000)
 *
 * Prints the bucket's CORS rules and policy, then reads one scene file and the
 * models the way a browser on `origin` would (public, with CORS).
 */
import { config } from 'dotenv';
import { GetBucketCorsCommand, GetBucketPolicyCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { s3Client, s3ConfigFromEnv } from '../lib/scenes/storage';

config({ path: '.env.local' });
config();

async function probe(url: string, origin: string) {
  try {
    const r = await fetch(url, { headers: { Origin: origin, Range: 'bytes=0-15' } });
    const cors = r.headers.get('access-control-allow-origin');
    const ok = (r.status === 200 || r.status === 206) && cors;
    console.log(`${ok ? 'OK  ' : 'FAIL'} ${r.status} ${cors ? `CORS ${cors}` : 'no CORS header'}  ${url}`);
    if (!ok && r.status >= 400) console.log('     ' + (await r.text()).slice(0, 200).replace(/\s+/g, ' '));
  } catch (e) { console.log(`FAIL ${e instanceof Error ? e.message : e}  ${url}`); }
}

async function main() {
  const origin = process.argv[2] || 'http://localhost:3000';
  const cfg = s3ConfigFromEnv();
  if (!cfg) throw new Error('Set SCENES_S3_BUCKET (and SCENES_S3_ENDPOINT, keys) in .env.local first');
  const s3 = s3Client(cfg);
  console.log(`Bucket ${cfg.bucket}, public base ${cfg.publicBase}, checking as ${origin}\n`);
  try { const c = await s3.send(new GetBucketCorsCommand({ Bucket: cfg.bucket })); console.log('CORS:', JSON.stringify(c.CORSRules)); }
  catch (e) { console.log('CORS: none set (' + (e instanceof Error ? e.message : e) + ')'); }
  try { const p = await s3.send(new GetBucketPolicyCommand({ Bucket: cfg.bucket })); console.log('Policy:', p.Policy); }
  catch (e) { console.log('Policy: none (' + (e instanceof Error ? e.message : e) + ')'); }
  console.log('');
  const list = await s3.send(new ListObjectsV2Command({ Bucket: cfg.bucket, Prefix: 'scenes/', MaxKeys: 50 }));
  const files = (list.Contents || []).map((o) => o.Key!).filter((k) => /\.(png|jpg|webp)$/.test(k)).slice(-3);
  for (const k of files) await probe(`${cfg.publicBase}/${k}`, origin);
  for (const k of ['models/depth-anything-v2-small.onnx', 'models/lama-fp32.onnx']) await probe(`${cfg.publicBase}/${k}`, origin);
  console.log('\nFAIL with "no CORS header": add your origin and run scripts/scenes-bucket-setup.ts (SCENES_CORS_ORIGINS=...).');
  console.log('FAIL 403 AccessDenied: run scripts/scenes-bucket-setup.ts (public read for scenes/ and models/).');
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
