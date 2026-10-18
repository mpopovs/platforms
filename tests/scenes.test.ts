import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { applyPatch, parseRef, resolveAccess, resolveFile } from '../lib/scenes/access';
import { assetKey, keyBelongsToScene, s3ConfigFromEnv } from '../lib/scenes/storage';
import { contentTypeFor, emptyManifest, isValidFileName, missingEssentials, parseManifest } from '../packages/scene-engine/src/manifest';

const SHA = 'a'.repeat(64);

describe('parseRef', () => {
  test('known refs', () => {
    assert.deepEqual(parseRef('draft'), { kind: 'draft' });
    assert.deepEqual(parseRef('published'), { kind: 'published' });
    assert.deepEqual(parseRef('v3'), { kind: 'version', version: 3 });
    assert.deepEqual(parseRef('p.abcdefghijklmnop1234'), { kind: 'preview', token: 'abcdefghijklmnop1234' });
  });
  test('junk is rejected', () => {
    for (const r of ['v0', 'v-1', 'vx', 'p.short', 'p.', '', 'DRAFT', '../x']) assert.equal(parseRef(r), null, r);
  });
});

describe('resolveAccess', () => {
  const scene = { preview_token: 'tok_tok_tok_tok_tok_1', published_version: 2 };
  test('draft only for admins', () => {
    assert.deepEqual(resolveAccess({ kind: 'draft' }, scene, true), { source: 'draft' });
    assert.equal(resolveAccess({ kind: 'draft' }, scene, false), null);
  });
  test('preview token gives the draft to anyone with the link', () => {
    assert.deepEqual(resolveAccess({ kind: 'preview', token: 'tok_tok_tok_tok_tok_1' }, scene, false), { source: 'draft' });
    assert.equal(resolveAccess({ kind: 'preview', token: 'tok_tok_tok_tok_tok_2' }, scene, false), null);
  });
  test('published is public; unpublished scene has none', () => {
    assert.deepEqual(resolveAccess({ kind: 'published' }, scene, false), { source: 'version', version: 2 });
    assert.equal(resolveAccess({ kind: 'published' }, { ...scene, published_version: null }, false), null);
  });
  test('old versions only for admins', () => {
    assert.deepEqual(resolveAccess({ kind: 'version', version: 2 }, scene, false), { source: 'version', version: 2 });
    assert.equal(resolveAccess({ kind: 'version', version: 1 }, scene, false), null);
    assert.deepEqual(resolveAccess({ kind: 'version', version: 1 }, scene, true), { source: 'version', version: 1 });
  });
});

describe('manifest', () => {
  test('valid manifest parses; bad names and keys fail', () => {
    const m = parseManifest({ format: 1, files: { 'backdrop/color.jpg': `scenes/scene_1/${SHA}.jpg` }, json: { 'scene.json': { a: 1 } } });
    assert.equal(Object.keys(m.files).length, 1);
    assert.throws(() => parseManifest({ format: 1, files: { '../x': `scenes/scene_1/${SHA}` }, json: {} }));
    assert.throws(() => parseManifest({ format: 1, files: { 'a.jpg': 'http://evil/x.jpg' }, json: {} }));
    assert.throws(() => parseManifest({ format: 2, files: {}, json: {} }));
  });
  test('file names', () => {
    assert.equal(isValidFileName('capys/baby/baby_capy_v2.glb'), true);
    for (const n of ['/abs', 'a/../b', 'a//b', 'sp ace.jpg', '']) assert.equal(isValidFileName(n), false, n);
  });
  test('essentials and content types', () => {
    assert.deepEqual(missingEssentials(emptyManifest()), ['scene.json']);
    assert.equal(contentTypeFor('x/y.JPG'), 'image/jpeg');
    assert.equal(contentTypeFor('capy.glb'), 'model/gltf-binary');
    assert.equal(contentTypeFor('noext'), 'application/octet-stream');
  });
});

describe('resolveFile / applyPatch', () => {
  test('json wins over files; patch moves names between them and deletes with null', () => {
    let m = { ...emptyManifest(), files: { 'a.jpg': `scenes/s/${SHA}.jpg` }, json: { 'zones.json': { x: 1 } } };
    assert.deepEqual(resolveFile(m, 'zones.json'), { json: { x: 1 } });
    assert.deepEqual(resolveFile(m, 'a.jpg'), { key: `scenes/s/${SHA}.jpg` });
    assert.equal(resolveFile(m, 'missing.png'), null);
    assert.equal(resolveFile(m, '__proto__'), null);
    m = applyPatch(m, { json: { 'a.jpg': { now: 'json' } }, files: { 'zones.json': null } });
    assert.deepEqual(m.files, {});
    assert.deepEqual(m.json, { 'a.jpg': { now: 'json' } });
  });
});

describe('storage keys', () => {
  test('content-addressed key format', () => {
    assert.equal(assetKey('scene_1', SHA, 'Backdrop/Color.JPG'), `scenes/scene_1/${SHA}.jpg`);
    assert.equal(assetKey('scene_1', SHA, 'noext'), `scenes/scene_1/${SHA}`);
    assert.throws(() => assetKey('../x', SHA, 'a.jpg'));
    assert.throws(() => assetKey('scene_1', 'nothex', 'a.jpg'));
  });
  test('keys must belong to the scene', () => {
    assert.equal(keyBelongsToScene(`scenes/scene_1/${SHA}.jpg`, 'scene_1'), true);
    assert.equal(keyBelongsToScene(`scenes/scene_2/${SHA}.jpg`, 'scene_1'), false);
    assert.equal(keyBelongsToScene(`scenes/scene_1/../x`, 'scene_1'), false);
  });
  test('S3 config only when a bucket is set; Hetzner defaults', () => {
    assert.equal(s3ConfigFromEnv({}), null);
    const c = s3ConfigFromEnv({ SCENES_S3_BUCKET: 'magicforms' })!;
    assert.equal(c.endpoint, 'https://hel1.your-objectstorage.com');
    assert.equal(c.region, 'hel1');
    assert.equal(c.publicBase, 'https://magicforms.hel1.your-objectstorage.com');
  });
});
