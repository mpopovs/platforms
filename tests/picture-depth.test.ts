import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { fitDepth } from '../packages/scene-engine/src/engine/picture.js';

// a synthetic picture: flat ground seen from 1.6 m with a 40° lens, tilted 5° down;
// the "model" output is disparity = 3 / depth (unknown scale to fitDepth)
function groundScene(w = 160, h = 90, fit = { vfov: 40, pitch: -5, height: 1.6 }) {
  const fy = (h / 2) / Math.tan((fit.vfov * Math.PI) / 360), p = (fit.pitch * Math.PI) / 180;
  const d = new Float32Array(w * h), truth = new Float32Array(w * h);
  for (let v = 0; v < h; v++) {
    const ry = Math.sin(p) + Math.cos(p) * ((h / 2 - v - 0.5) / fy);
    const z = ry < -0.02 ? Math.min(60, fit.height / -ry) : 60;
    for (let u = 0; u < w; u++) { truth[v * w + u] = z; d[v * w + u] = 3 / z; }
  }
  return { disp: { d, w, h }, truth };
}

describe('picture depth fit', () => {
  test('ground at the bottom comes out at the right distance', () => {
    const { disp, truth } = groundScene();
    const m = fitDepth(disp, { vfov: 40, pitch: -5, height: 1.6, far: 60, near: 2, ground: true });
    assert.equal(m.how, 'ground');
    for (const v of [80, 85, 89]) {
      const i = v * disp.w + 80;
      assert.ok(Math.abs(m.z[i] - truth[i]) / truth[i] < 0.03, `row ${v}: ${m.z[i]} vs ${truth[i]}`);
    }
  });

  test('without ground uses near / far and stays in range', () => {
    const { disp } = groundScene();
    const m = fitDepth(disp, { vfov: 40, pitch: -5, height: 1.6, far: 30, near: 2, ground: false });
    assert.equal(m.how, 'range');
    let lo = Infinity, hi = -Infinity; for (const z of m.z) { lo = Math.min(lo, z); hi = Math.max(hi, z); }
    assert.ok(Math.abs(lo - 2) < 0.01, `nearest ${lo}`);
    assert.ok(hi <= 30 + 1e-6, `farthest ${hi}`);
  });

  test('nearer in the picture is never farther in metres', () => {
    const { disp } = groundScene();
    const m = fitDepth(disp, { vfov: 40, pitch: -5, height: 1.6, far: 60, near: 2, ground: true });
    const idx = [...disp.d.keys()].sort((a, b) => disp.d[a] - disp.d[b]);
    for (let k = 1; k < idx.length; k++) assert.ok(m.z[idx[k]] <= m.z[idx[k - 1]] + 1e-4);
  });
});
