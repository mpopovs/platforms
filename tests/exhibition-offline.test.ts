import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// lib/storage.ts (via getStorageThumbnailUrl) creates a Supabase client from env vars at load time.
process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'https://example.test';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= 'test-anon-key';

const { collectExhibitionAssets } = require('../components/exhibition/exhibition-assets');
const { resolveCellTexture } = require('../components/exhibition/use-cell-texture');
const {
  createDefaultCellConfig,
  DEFAULT_EXHIBITION_TUNABLES,
  normalizeShowConnectionIndicator,
} = require('../lib/types/exhibition');
import type { ViewerModelWithAllTextures, ModelTextureRow } from '../lib/types/viewer';

const storage = (path: string) => `https://db.example.com/storage/v1/object/public/${path}`;

function makeTexture(id: string, modelId: string, uploadedAt: string): ModelTextureRow {
  return {
    id,
    model_id: modelId,
    original_photo_url: storage(`user-texture-photos/${id}.jpg`),
    corrected_texture_url: storage(`processed-textures/${id}.webp`),
    uploaded_at: uploadedAt,
    processed_at: uploadedAt,
  };
}

function makeModel(id: string, textures: ModelTextureRow[]): ViewerModelWithAllTextures {
  return {
    id,
    viewer_id: 'viewer_1',
    name: id,
    model_file_url: storage(`3d-models/${id}.glb`),
    texture_template_url: storage(`templates/${id}.png`),
    qr_code_data: '',
    qr_code_image_url: null,
    order_index: 0,
    created_at: '2026-01-01T00:00:00Z',
    textures,
  } as ViewerModelWithAllTextures;
}

const config = (cells: unknown[]) => ({ cells, tunables: DEFAULT_EXHIBITION_TUNABLES });
const startDim = DEFAULT_EXHIBITION_TUNABLES.qualityStepDownTextureDims[0];
const quality = DEFAULT_EXHIBITION_TUNABLES.textureQuality;

describe('collectExhibitionAssets', () => {
  const uploads = [
    makeTexture('t_old', 'model_a', '2026-01-01T00:00:00Z'),
    makeTexture('t_new', 'model_a', '2026-03-01T00:00:00Z'),
    makeTexture('t_mid', 'model_a', '2026-02-01T00:00:00Z'),
  ];
  const modelA = makeModel('model_a', uploads);
  const modelB = makeModel('model_b', [makeTexture('t_b', 'model_b', '2026-01-01T00:00:00Z')]);

  test("a user-uploads cell needs every upload, at exactly the URLs the grid requests while cycling", () => {
    const cell = { ...createDefaultCellConfig('c1', 'viewer_1', 'model_a'), textureMode: 'user-uploads' };
    const assets = collectExhibitionAssets(config([cell]), { model_a: modelA });
    const textureUrls = new Set(assets.filter((a: any) => a.kind === 'texture').map((a: any) => a.url));

    const gridUrls = uploads.map((_, i) => resolveCellTexture(cell, modelA, i, startDim, quality).url);
    assert.deepEqual(textureUrls, new Set(gridUrls));
    assert.ok(assets.some((a: any) => a.kind === 'model' && a.url === modelA.model_file_url));
  });

  test('a locked cell needs only its locked texture, never the upload pool', () => {
    const cell = { ...createDefaultCellConfig('c1', 'viewer_1', 'model_a'), lockedTextureId: 't_mid' };
    const assets = collectExhibitionAssets(config([cell]), { model_a: modelA });
    const textures = assets.filter((a: any) => a.kind === 'texture');
    assert.equal(textures.length, 1);
    assert.equal(textures[0].url, resolveCellTexture(cell, modelA, 0, startDim, quality).url);
    assert.equal(textures[0].textureId, 't_mid');
  });

  test('a user-uploads cell with no uploads yet needs the template it falls back to', () => {
    const empty = makeModel('model_c', []);
    const cell = { ...createDefaultCellConfig('c1', 'viewer_1', 'model_c'), textureMode: 'user-uploads' };
    const textures = collectExhibitionAssets(config([cell]), { model_c: empty }).filter((a: any) => a.kind === 'texture');
    assert.deepEqual(textures.map((a: any) => a.url), [resolveCellTexture(cell, empty, 0, startDim, quality).url]);
  });

  test('files shared by several cells are listed once; cells without loaded data are skipped', () => {
    const cells = [
      { ...createDefaultCellConfig('c1', 'viewer_1', 'model_a'), textureMode: 'user-uploads' },
      { ...createDefaultCellConfig('c2', 'viewer_1', 'model_a'), textureMode: 'user-uploads' },
      createDefaultCellConfig('c3', 'viewer_1', 'model_b'),
      createDefaultCellConfig('c4', 'viewer_1', 'model_missing'),
    ];
    const assets = collectExhibitionAssets(config(cells), { model_a: modelA, model_b: modelB });
    const urls = assets.map((a: any) => a.url);
    assert.equal(new Set(urls).size, urls.length);
    // model_a + 3 uploads, model_b + its template (locked cell without a pinned texture)
    assert.equal(assets.length, 6);
  });

  test('temporary local URLs are not downloadable and are left out', () => {
    const local = { ...makeModel('model_l', []), model_file_url: 'blob:https://app/123', texture_template_url: 'local://indexeddb' };
    const assets = collectExhibitionAssets(config([createDefaultCellConfig('c1', 'viewer_1', 'model_l')]), { model_l: local });
    assert.deepEqual(assets, []);
  });
});

describe('texture identity across quality levels (blink on texture change)', () => {
  test('the quality ladder changes the texture URL but never its id, so it never counts as a texture change', () => {
    const uploads = [makeTexture('t1', 'model_a', '2026-01-01T00:00:00Z'), makeTexture('t2', 'model_a', '2026-02-01T00:00:00Z')];
    const model = makeModel('model_a', uploads);
    const cells = [
      { ...createDefaultCellConfig('c1', 'viewer_1', 'model_a'), textureMode: 'user-uploads' },
      { ...createDefaultCellConfig('c2', 'viewer_1', 'model_a'), lockedTextureId: 't1' },
      createDefaultCellConfig('c3', 'viewer_1', 'model_a'),
    ];
    for (const cell of cells) {
      for (const cycleIndex of [0, 1]) {
        const results = DEFAULT_EXHIBITION_TUNABLES.qualityStepDownTextureDims.map((dim: number) =>
          resolveCellTexture(cell, model, cycleIndex, dim, quality)
        );
        assert.equal(new Set(results.map((r: any) => r.url)).size, results.length, 'each quality level is a different URL');
        assert.equal(new Set(results.map((r: any) => r.textureId)).size, 1, 'but the same texture id');
      }
    }
  });
});

describe('normalizeShowConnectionIndicator', () => {
  test('shown unless explicitly turned off', () => {
    assert.equal(normalizeShowConnectionIndicator(undefined), true);
    assert.equal(normalizeShowConnectionIndicator(true), true);
    assert.equal(normalizeShowConnectionIndicator(false), false);
  });
});
