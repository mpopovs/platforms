import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// lib/storage.ts (imported transitively via getStorageThumbnailUrl) pulls in
// lib/supabase.ts, which instantiates a Supabase client from env vars at
// module-load time. Set harmless dummy values first so this test is hermetic
// (doesn't require a real .env file to exist).
process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'https://example.test';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= 'test-anon-key';

const { resolveCellTexture } = require('../components/exhibition/use-cell-texture');
const { createDefaultCellConfig } = require('../lib/types/exhibition');
import type { ViewerModelWithAllTextures, ModelTextureRow } from '../lib/types/viewer';

function makeTexture(id: string, uploadedAt: string, overrides: Partial<ModelTextureRow> = {}): ModelTextureRow {
  return {
    id,
    model_id: 'model_1',
    original_photo_url: `https://db.example.com/storage/v1/object/public/user-texture-photos/${id}.jpg`,
    corrected_texture_url: `https://db.example.com/storage/v1/object/public/processed-textures/${id}.webp`,
    uploaded_at: uploadedAt,
    processed_at: uploadedAt,
    ...overrides,
  };
}

function makeModel(textures: ModelTextureRow[], overrides: Partial<ViewerModelWithAllTextures> = {}): ViewerModelWithAllTextures {
  return {
    id: 'model_1',
    viewer_id: 'viewer_1',
    name: 'Test Model',
    model_file_url: 'https://db.example.com/storage/v1/object/public/3d-models/model_1/model.glb',
    texture_template_url: 'https://db.example.com/storage/v1/object/public/texture-templates/model_1/template.png',
    qr_code_data: '{}',
    qr_code_image_url: null,
    order_index: 0,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    textures,
    ...overrides,
  };
}

describe('resolveCellTexture: original-locked cells', () => {
  test('uses the curator-pinned lockedTextureId, ignoring cycleIndex entirely', () => {
    const textures = [
      makeTexture('tex_old', '2025-01-01T00:00:00Z'),
      makeTexture('tex_new', '2025-06-01T00:00:00Z'),
    ];
    const model = makeModel(textures);
    const cell = createDefaultCellConfig('cell-1', 'viewer_1', 'model_1');
    cell.textureMode = 'original-locked';
    cell.lockedTextureId = 'tex_old';

    // cycleIndex is deliberately non-zero here — a locked cell must ignore it completely.
    const result = resolveCellTexture(cell, model, 5, 2048, 75);
    assert.equal(result.textureId, 'tex_old');
    assert.ok(result.url?.includes('tex_old'));
  });

  test('falls back to the model template when lockedTextureId is unset', () => {
    const model = makeModel([makeTexture('tex_a', '2025-01-01T00:00:00Z')]);
    const cell = createDefaultCellConfig('cell-1', 'viewer_1', 'model_1');
    cell.textureMode = 'original-locked';

    const result = resolveCellTexture(cell, model, 0, 2048, 75);
    assert.equal(result.textureId, 'template');
    assert.ok(result.url?.includes('template.png'));
  });

  test('falls back to the model template when lockedTextureId points at a texture that no longer exists', () => {
    const model = makeModel([makeTexture('tex_a', '2025-01-01T00:00:00Z')]);
    const cell = createDefaultCellConfig('cell-1', 'viewer_1', 'model_1');
    cell.textureMode = 'original-locked';
    cell.lockedTextureId = 'tex_deleted';

    const result = resolveCellTexture(cell, model, 0, 2048, 75);
    assert.equal(result.textureId, 'template');
  });

  test('never touches the community upload pool, even with many uploads present', () => {
    const textures = Array.from({ length: 10 }, (_, i) =>
      makeTexture(`tex_${i}`, new Date(2025, 0, i + 1).toISOString())
    );
    const model = makeModel(textures);
    const cell = createDefaultCellConfig('cell-1', 'viewer_1', 'model_1');
    cell.textureMode = 'original-locked';
    cell.lockedTextureId = 'tex_3';

    for (const cycleIndex of [0, 1, 9, 999]) {
      const result = resolveCellTexture(cell, model, cycleIndex, 2048, 75);
      assert.equal(result.textureId, 'tex_3', `cycleIndex ${cycleIndex} must not change a locked cell's texture`);
    }
  });
});

describe('resolveCellTexture: user-uploads cells', () => {
  test('sorts newest-first and picks by cycleIndex', () => {
    const textures = [
      makeTexture('tex_oldest', '2025-01-01T00:00:00Z'),
      makeTexture('tex_middle', '2025-03-01T00:00:00Z'),
      makeTexture('tex_newest', '2025-06-01T00:00:00Z'),
    ];
    const model = makeModel(textures);
    const cell = createDefaultCellConfig('cell-1', 'viewer_1', 'model_1');
    cell.textureMode = 'user-uploads';

    assert.equal(resolveCellTexture(cell, model, 0, 2048, 75).textureId, 'tex_newest');
    assert.equal(resolveCellTexture(cell, model, 1, 2048, 75).textureId, 'tex_middle');
    assert.equal(resolveCellTexture(cell, model, 2, 2048, 75).textureId, 'tex_oldest');
  });

  test('clamps out-of-range cycleIndex to the last available texture instead of crashing', () => {
    const model = makeModel([makeTexture('tex_only', '2025-01-01T00:00:00Z')]);
    const cell = createDefaultCellConfig('cell-1', 'viewer_1', 'model_1');
    cell.textureMode = 'user-uploads';

    const result = resolveCellTexture(cell, model, 999, 2048, 75);
    assert.equal(result.textureId, 'tex_only');
  });

  test('falls back to the model template when no uploads exist yet', () => {
    const model = makeModel([]);
    const cell = createDefaultCellConfig('cell-1', 'viewer_1', 'model_1');
    cell.textureMode = 'user-uploads';

    const result = resolveCellTexture(cell, model, 0, 2048, 75);
    assert.equal(result.textureId, 'template');
    assert.ok(result.url?.includes('template.png'));
  });

  test('ignores lockedTextureId entirely, even if one happens to be set', () => {
    const textures = [makeTexture('tex_a', '2025-01-01T00:00:00Z'), makeTexture('tex_b', '2025-02-01T00:00:00Z')];
    const model = makeModel(textures);
    const cell = createDefaultCellConfig('cell-1', 'viewer_1', 'model_1');
    cell.textureMode = 'user-uploads';
    cell.lockedTextureId = 'tex_a'; // should be irrelevant in user-uploads mode

    const result = resolveCellTexture(cell, model, 0, 2048, 75);
    assert.equal(result.textureId, 'tex_b'); // newest, not the "locked" one
  });
});

describe('resolveCellTexture: missing model', () => {
  test('returns a null url without throwing when the model has not loaded yet', () => {
    const cell = createDefaultCellConfig('cell-1', 'viewer_1', 'model_1');
    const result = resolveCellTexture(cell, undefined, 0, 2048, 75);
    assert.equal(result.url, null);
  });
});
