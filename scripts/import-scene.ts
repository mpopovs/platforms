/**
 * Import a hot spring style world folder (and the capybaras) as a scene.
 *
 *   pnpm tsx scripts/import-scene.ts <world folder> --name "Hot spring" \
 *     [--capys <animations folder>] [--scene <scene id to update>] [--publish]
 *
 * Example (on the Mac):
 *   pnpm tsx scripts/import-scene.ts \
 *     "$HOME/Desktop/claypixels research/capys/hotspring/world/198232fb-..." \
 *     --capys "$HOME/Desktop/claypixels research/capys/animations" \
 *     --name "Hot spring" --publish
 *
 * Uses .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and,
 * for Hetzner, SCENES_S3_*. Files already stored (same content) are skipped.
 */
import { config } from 'dotenv';
import { createHash, randomBytes } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { INLINE_JSON_MAX_BYTES, contentTypeFor, emptyManifest, isValidFileName, parseManifest } from '../packages/scene-engine/src/manifest';
import { applyPatch } from '../lib/scenes/access';
import { assetKey, sceneStorage } from '../lib/scenes/storage';

config({ path: '.env.local' });
config();

const SKIP = /(^|\/)(\.|__pycache__\/)|\.bak$|\.pyc$/;

function args() {
  const a = process.argv.slice(2);
  const out: { world?: string; name?: string; capys?: string; scene?: string; publish: boolean } = { publish: false };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--name') out.name = a[++i];
    else if (a[i] === '--capys') out.capys = a[++i];
    else if (a[i] === '--scene') out.scene = a[++i];
    else if (a[i] === '--publish') out.publish = true;
    else if (!out.world) out.world = a[i];
  }
  return out;
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;

async function main() {
  const o = args();
  if (!o.world) {
    console.error('usage: import-scene.ts <world folder> --name "Hot spring" [--capys <animations folder>] [--scene <id>] [--publish]');
    process.exit(1);
  }
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const storage = sceneStorage();
  console.log(`storage: ${storage.kind}`);

  // files to import: name in the scene -> path on disk
  const entries: [string, string][] = [];
  for (const p of walk(o.world)) {
    const rel = relative(o.world, p).split(sep).join('/');
    if (!SKIP.test(rel)) entries.push([rel, p]);
  }
  if (!entries.some(([n]) => n === 'scene.json')) throw new Error('No scene.json in the world folder');
  if (o.capys) {
    for (const p of walk(o.capys)) {
      const rel = relative(o.capys, p).split(sep).join('/');
      if (/^[^/]+\/[^/]+_capy_v2\.glb$/.test(rel)) entries.push([`capys/${rel}`, p]);
    }
  }

  // scene row
  let sceneId = o.scene;
  if (!sceneId) {
    sceneId = `scene_${randomBytes(7).toString('hex')}`;
    const { error } = await db.from('scenes').insert({
      id: sceneId, name: o.name ?? 'Imported scene', brand_id: 'magicforms',
      draft: emptyManifest(), preview_token: randomBytes(18).toString('base64url')
    });
    if (error) throw new Error(error.message);
    console.log(`created ${sceneId}`);
  }

  const files: Record<string, string> = {};
  const json: Record<string, unknown> = {};
  let uploaded = 0, skipped = 0, bytes = 0;
  for (const [name, path] of entries) {
    if (!isValidFileName(name)) { console.warn(`skip (name): ${name}`); continue; }
    const buf = readFileSync(path);
    if (name.endsWith('.json') && buf.length <= INLINE_JSON_MAX_BYTES) {
      try { json[name] = JSON.parse(buf.toString('utf8')); continue; } catch { /* store as file */ }
    }
    const key = assetKey(sceneId, createHash('sha256').update(buf).digest('hex'), name);
    if (await storage.exists(key)) skipped++;
    else {
      process.stdout.write(`upload ${name} (${mb(buf.length)})… `);
      await storage.putObject(key, buf, contentTypeFor(name));
      uploaded++; bytes += buf.length;
      console.log('ok');
    }
    files[name] = key;
  }

  const { data: row, error: readErr } = await db.from('scenes').select('draft').eq('id', sceneId).single();
  if (readErr) throw new Error(readErr.message);
  const draft = parseManifest(applyPatch(parseManifest(row.draft), { files, json }));
  const { error } = await db.from('scenes').update({ draft, draft_updated_at: new Date().toISOString() }).eq('id', sceneId);
  if (error) throw new Error(error.message);
  console.log(`draft: ${Object.keys(draft.files).length} files, ${Object.keys(draft.json).length} JSON · uploaded ${uploaded} (${mb(bytes)}), already stored ${skipped}`);

  if (o.publish) {
    const { data: last } = await db.from('scene_versions').select('version').eq('scene_id', sceneId).order('version', { ascending: false }).limit(1).maybeSingle();
    const version = (last?.version ?? 0) + 1;
    const ins = await db.from('scene_versions').insert({ scene_id: sceneId, version, manifest: draft, note: 'imported' });
    if (ins.error) throw new Error(ins.error.message);
    await db.from('scenes').update({ published_version: version }).eq('id', sceneId);
    console.log(`published v${version}`);
  }
  console.log(`\nEdit:    /admin/scenes/${sceneId}\nPlayer:  /scene/${sceneId}`);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
