/**
 * Exhibition Grid stress-test config generator.
 *
 * Creates a saved exhibition config using the 4x5 (20-cell) preset, so you
 * can open it on the actual show computer and watch the FPS/quality-scaling
 * behavior under a full 20-model load before the real show.
 *
 * If the target account has fewer than 20 models across its viewers, models
 * are reused/repeated to still fill all 20 cells — for a raw rendering
 * stress test, duplicate content is fine (the point is GPU/memory load, not
 * variety). Cells alternate between 'original-locked' and 'user-uploads' so
 * both texture-resolution code paths get exercised too.
 *
 * Usage:
 *   npx tsx scripts/create-exhibition-stress-test.ts --user-id <uuid> [--name "Stress Test 20"]
 *
 * Run without --user-id to list candidate user ids (owners of at least one viewer).
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
// This repo keeps its local env vars in `.env` (not the more common `.env.local`) —
// prefer .env.local if present (e.g. on another machine), else fall back to .env.
const envLocalPath = path.resolve(process.cwd(), '.env.local');
dotenv.config({ path: fs.existsSync(envLocalPath) ? envLocalPath : path.resolve(process.cwd(), '.env') });

import { GRID_PRESETS, createDefaultCellConfig, type ExhibitionCellConfig } from '../lib/types/exhibition';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Error: Missing Supabase credentials');
  console.error('Please set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

function parseArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 ? process.argv[idx + 1] : undefined;
}

async function listCandidateUsers() {
  const { data, error } = await supabase.from('viewers').select('user_id').is('parent_viewer_id', null);
  if (error || !data) {
    console.error('Failed to list users:', error);
    return;
  }
  const ids = Array.from(new Set(data.map((r: any) => r.user_id)));
  console.log('No --user-id provided. Candidate user ids (owners of at least one viewer):');
  ids.forEach((id) => console.log('  ', id));
  console.log('\nRe-run with: npx tsx scripts/create-exhibition-stress-test.ts --user-id <uuid>');
}

async function main() {
  const userId = parseArg('--user-id');
  const name = parseArg('--name') || `Stress Test 20 (${new Date().toISOString().slice(0, 10)})`;

  if (!userId) {
    await listCandidateUsers();
    process.exit(1);
  }

  const { data: viewers, error: viewersError } = await supabase
    .from('viewers')
    .select('id, name')
    .eq('user_id', userId)
    .is('parent_viewer_id', null);

  if (viewersError || !viewers || viewers.length === 0) {
    console.error('❌ No viewers found for that user id.', viewersError);
    process.exit(1);
  }

  const { data: models, error: modelsError } = await supabase
    .from('viewer_models')
    .select('id, viewer_id, name')
    .in('viewer_id', viewers.map((v) => v.id))
    .order('order_index', { ascending: true });

  if (modelsError || !models || models.length === 0) {
    console.error('❌ No models found across this user\'s viewers.', modelsError);
    process.exit(1);
  }

  console.log(`📦 Found ${models.length} model(s) across ${viewers.length} viewer(s).`);

  const layout = GRID_PRESETS['4x5']; // 20 cells
  const cells: ExhibitionCellConfig[] = layout.cells.map((rect, i) => {
    const model = models[i % models.length]; // repeat models if fewer than 20
    const cell = createDefaultCellConfig(rect.id, model.viewer_id, model.id);
    // Alternate texture modes to exercise both code paths under load.
    cell.textureMode = i % 2 === 0 ? 'original-locked' : 'user-uploads';
    if (cell.textureMode === 'user-uploads') {
      cell.cycling = { strategy: 'newest-first', intervalSec: 10 };
    }
    return cell;
  });

  if (models.length < 20) {
    console.log(`⚠️  Only ${models.length} distinct model(s) available — repeating them to fill all 20 cells.`);
  }

  // Dynamic import: lib/exhibition.ts transitively imports lib/supabase.ts, which
  // instantiates a Supabase client from process.env at module-load time. Static
  // imports are hoisted above the dotenv.config() call above by tsx's esbuild-based
  // transform, so this MUST stay a dynamic import (evaluated here, at runtime,
  // after env vars are already loaded) rather than a static top-level import.
  const { createExhibitionConfig } = await import('../lib/exhibition');
  const { config, accessToken } = await createExhibitionConfig(userId, name, layout, cells, undefined, supabase);

  console.log('\n✅ Stress-test exhibition created:');
  console.log('   id:', config.id);
  console.log('   name:', config.name);
  console.log('   cells:', config.cells.length);
  console.log('\n🔗 Show URL (open fullscreen on the show computer):');
  console.log(`   ${process.env.NEXT_PUBLIC_ROOT_DOMAIN ? `https://${process.env.NEXT_PUBLIC_ROOT_DOMAIN}` : 'http://localhost:3000'}/exhibition?token=${accessToken}`);
  console.log('\nWatch the browser dev tools performance/FPS meter and this app\'s own quality-scaling');
  console.log('(texture resolution steps down automatically per-cell if fps drops below the configured floor).');
}

main().catch((err) => {
  console.error('❌ Unexpected error:', err);
  process.exit(1);
});
