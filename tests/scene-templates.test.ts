import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { TEMPLATES, templateManifest } from '../lib/scenes/templates';
import { parseManifest } from '../packages/scene-engine/src/manifest';
import { STEP_TYPES } from '../packages/scene-engine/src/engine/story.js';

type Step = { do: string; who?: string; spot?: number; route?: string; follow?: string; mode?: string };

describe('scene templates', () => {
  for (const t of TEMPLATES) {
    test(`${t.id}: valid manifest`, () => {
      const m = parseManifest(templateManifest(t.id));
      if (t.id !== 'hot-spring') assert.ok('scene.json' in m.json, 'has scene.json');
    });
  }

  test('fashion show: story only uses cast, spots and routes that exist', () => {
    const j = templateManifest('fashion-show').json as Record<string, any>;
    const ids = new Set(j['cast.json'].characters.map((c: { id: string }) => c.id));
    const spots = j['zones.json'].spots.length;
    const routes = new Set(j['zones.json'].routes.map((r: { name: string }) => r.name));
    const steps: Step[] = j['story.json'].steps;
    assert.ok(steps.length > 10);
    for (const s of steps) {
      assert.ok(STEP_TYPES.includes(s.do), `known step ${s.do}`);
      if (s.who && s.who !== 'all') assert.ok(ids.has(s.who), `cast has ${s.who}`);
      if (s.follow) assert.ok(ids.has(s.follow), `cast has ${s.follow}`);
      if (s.spot != null) assert.ok(s.spot >= 0 && s.spot < spots, `spot ${s.spot} exists`);
      if (s.route) assert.ok(routes.has(s.route), `route ${s.route} exists`);
      if (s.do === 'camera') assert.ok(['fixed', 'look', 'follow', 'orbit'].includes(s.mode ?? 'fixed'), `camera mode ${s.mode}`);
      if (s.do === 'camera' && s.mode && s.mode !== 'fixed') assert.ok(s.who && ids.has(s.who), 'camera mode has a character');
    }
    // characters stand still unless the story moves them
    const b = j['zones.json'].behaviour;
    assert.equal(b.walk + b.swim + b.soak + b.nap + b.surprise + b.route, 0);
    assert.equal(j['scene.json'].environment, 'stage');
  });

  test('empty stage has an explicit empty cast (no capybaras by default)', () => {
    const j = templateManifest('stage').json as Record<string, any>;
    assert.deepEqual(j['cast.json'], { characters: [] });
  });
});
