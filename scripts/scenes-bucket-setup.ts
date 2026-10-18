/**
 * One-time setup of the Hetzner bucket for scene assets:
 *  - CORS so browsers can PUT (editor uploads) and GET (players) directly
 *  - public read for objects under scenes/ (content-addressed, unguessable ids)
 *
 *   pnpm tsx scripts/scenes-bucket-setup.ts
 *
 * Uses SCENES_S3_* from .env.local. Origins: SCENES_CORS_ORIGINS (comma list),
 * default claypixels.eu, magicforms.eu and localhost:3000.
 */
import { config } from 'dotenv';
import { GetBucketCorsCommand, PutBucketCorsCommand, PutBucketPolicyCommand } from '@aws-sdk/client-s3';
import { s3Client, s3ConfigFromEnv } from '../lib/scenes/storage';

config({ path: '.env.local' });
config();

async function main() {
  const cfg = s3ConfigFromEnv();
  if (!cfg) throw new Error('Set SCENES_S3_BUCKET (and SCENES_S3_ENDPOINT, keys) in .env.local first');
  const s3 = s3Client(cfg);
  const origins = (process.env.SCENES_CORS_ORIGINS ||
    'https://claypixels.eu,https://www.claypixels.eu,https://magicforms.eu,https://www.magicforms.eu,http://localhost:3000')
    .split(',').map((s) => s.trim()).filter(Boolean);

  await s3.send(new PutBucketCorsCommand({
    Bucket: cfg.bucket,
    CORSConfiguration: {
      CORSRules: [{
        AllowedOrigins: origins,
        AllowedMethods: ['GET', 'HEAD', 'PUT'],
        AllowedHeaders: ['*'],
        ExposeHeaders: ['ETag', 'Content-Length'],
        MaxAgeSeconds: 3600
      }]
    }
  }));
  console.log(`CORS set for ${origins.join(', ')}`);

  try {
    await s3.send(new PutBucketPolicyCommand({
      Bucket: cfg.bucket,
      Policy: JSON.stringify({
        Version: '2012-10-17',
        Statement: [{
          Sid: 'PublicReadSceneAssets',
          Effect: 'Allow',
          Principal: '*',
          Action: ['s3:GetObject'],
          Resource: [`arn:aws:s3:::${cfg.bucket}/scenes/*`]
        }]
      })
    }));
    console.log('Public read policy set for scenes/*');
  } catch (e) {
    console.warn(`Bucket policy not set (${e instanceof Error ? e.message : e}); uploads still send x-amz-acl: public-read.`);
  }

  const cors = await s3.send(new GetBucketCorsCommand({ Bucket: cfg.bucket }));
  console.log('Current CORS:', JSON.stringify(cors.CORSRules));
  console.log(`Public URL base: ${cfg.publicBase}`);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
