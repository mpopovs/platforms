import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';

const { fetchTexture } = require('../lib/texture-cache');

const originalUrl = 'https://db.example.com/storage/v1/object/public/processed-textures/a/texture.webp';
const resizedUrl = 'https://db.example.com/storage/v1/render/image/public/processed-textures/a/texture.webp?width=1024&quality=80';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function mockFetch(statusFor: (url: string) => number) {
  const calls: Array<{ url: string; accept?: string }> = [];
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    calls.push({ url, accept: (init?.headers as Record<string, string>)?.Accept });
    return new Response('img', { status: statusFor(url) });
  }) as typeof fetch;
  return calls;
}

describe('fetchTexture', () => {
  test('asks for WebP and returns the resized texture when it works', async () => {
    const calls = mockFetch(() => 200);
    const res = await fetchTexture(resizedUrl);
    assert.equal(res.status, 200);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, resizedUrl);
    assert.match(calls[0].accept ?? '', /image\/webp/);
  });

  test('falls back to the original file when the resized one fails', async () => {
    const calls = mockFetch((url) => (url.includes('/render/image/') ? 500 : 200));
    const res = await fetchTexture(resizedUrl);
    assert.equal(res.status, 200);
    assert.deepEqual(calls.map((c) => c.url), [resizedUrl, originalUrl]);
  });

  test('does not retry plain storage URLs', async () => {
    const calls = mockFetch(() => 404);
    const res = await fetchTexture(originalUrl);
    assert.equal(res.status, 404);
    assert.equal(calls.length, 1);
  });
});
