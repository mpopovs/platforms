import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { normaliseHost, resolveBrand } from '../lib/brand';

describe('normaliseHost', () => {
  test('lowercases, strips port, trailing dot and proxy list', () => {
    assert.equal(normaliseHost('MagicForms.EU:443'), 'magicforms.eu');
    assert.equal(normaliseHost('claypixels.eu.'), 'claypixels.eu');
    assert.equal(normaliseHost('magicforms.eu, 10.0.0.1'), 'magicforms.eu');
    assert.equal(normaliseHost(null), '');
  });
});

describe('resolveBrand', () => {
  test('known hosts', () => {
    assert.equal(resolveBrand('claypixels.eu'), 'claypixels');
    assert.equal(resolveBrand('www.claypixels.eu'), 'claypixels');
    assert.equal(resolveBrand('magicforms.eu'), 'magicforms');
    assert.equal(resolveBrand('www.magicforms.eu:443'), 'magicforms');
  });

  test('subdomains such as staging', () => {
    assert.equal(resolveBrand('staging.magicforms.eu'), 'magicforms');
    assert.equal(resolveBrand('db.claypixels.eu'), 'claypixels');
  });

  test('look-alike hosts do not match', () => {
    assert.equal(resolveBrand('evilmagicforms.eu'), 'claypixels');
    assert.equal(resolveBrand('magicforms.eu.example.com'), 'claypixels');
  });

  test('localhost uses DEV_BRAND override, else default', () => {
    assert.equal(resolveBrand('localhost:3000'), 'claypixels');
    assert.equal(resolveBrand('localhost:3000', { devOverride: 'magicforms' }), 'magicforms');
    assert.equal(resolveBrand('localhost:3000', { devOverride: 'nope' }), 'claypixels');
  });

  test('override never beats a real brand host', () => {
    assert.equal(resolveBrand('claypixels.eu', { devOverride: 'magicforms' }), 'claypixels');
  });
});
