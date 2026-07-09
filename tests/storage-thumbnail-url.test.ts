import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// lib/storage.ts transitively imports lib/supabase.ts, which instantiates a
// Supabase client from env vars at module-load time. Set harmless dummy
// values first so this test is hermetic (doesn't require a real .env file).
process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'https://example.test';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= 'test-anon-key';

const { getStorageThumbnailUrl } = require('../lib/storage');

const publicUrl = 'https://db.example.com/storage/v1/object/public/processed-textures/a/b/texture.webp';

describe('getStorageThumbnailUrl', () => {
  test('rewrites object/public to render/image/public and sets width+quality', () => {
    const result = getStorageThumbnailUrl(publicUrl, { width: 2048, quality: 75 });
    assert.ok(result.startsWith('https://db.example.com/storage/v1/render/image/public/processed-textures/a/b/texture.webp?'));
    const params = new URL(result).searchParams;
    assert.equal(params.get('width'), '2048');
    assert.equal(params.get('quality'), '75');
  });

  test('does NOT set height/resize unless height is explicitly requested', () => {
    // Regression guard: forcing a square crop on a real (non-square) model
    // texture would visibly distort it. height must be opt-in only.
    const result = getStorageThumbnailUrl(publicUrl, { width: 2048, quality: 75 });
    const params = new URL(result).searchParams;
    assert.equal(params.get('height'), null);
    assert.equal(params.get('resize'), null);
  });

  test('sets height + resize=cover only when height is explicitly requested (square admin thumbnails)', () => {
    const result = getStorageThumbnailUrl(publicUrl, { width: 300, height: 300 });
    const params = new URL(result).searchParams;
    assert.equal(params.get('height'), '300');
    assert.equal(params.get('resize'), 'cover');
  });

  test('passes through non-Supabase-storage URLs unchanged (e.g. local:// placeholders)', () => {
    assert.equal(getStorageThumbnailUrl('local://indexeddb', { width: 300 }), 'local://indexeddb');
    assert.equal(getStorageThumbnailUrl('', { width: 300 }), '');
  });

  test('defaults width to 300 and quality to 60 when omitted', () => {
    const result = getStorageThumbnailUrl(publicUrl);
    const params = new URL(result).searchParams;
    assert.equal(params.get('width'), '300');
    assert.equal(params.get('quality'), '60');
  });
});
