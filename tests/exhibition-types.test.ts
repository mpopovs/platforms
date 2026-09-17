import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  GRID_PRESETS,
  MAX_EXHIBITION_CELLS,
  createDefaultCellConfig,
  normalizeWaterfallConfig,
  normalizeModelScale,
  advanceWaterfallProgress,
  waterfallLoopPeriod,
  DEFAULT_WATERFALL_CONFIG,
  WATERFALL_SPEED_MIN,
  WATERFALL_SPEED_MAX,
  WATERFALL_LOOP_GAP_MAX,
  MODEL_SCALE_MIN,
  MODEL_SCALE_MAX,
  normalizeBackgroundColor,
  nextTextureChangeDelayMs,
  cyclingUsesInterval,
  normalizeRandomTextureTiming,
  RANDOM_TEXTURE_TIMING_SPREAD,
  normalizeTextureChangeBlink,
  DEFAULT_TEXTURE_CHANGE_BLINK,
  TEXTURE_CHANGE_BLINK_FRAMES_MIN,
  TEXTURE_CHANGE_BLINK_FRAMES_MAX,
  type GridPresetKey,
} from '../lib/types/exhibition';

describe('exhibition grid presets', () => {
  test('4x5 preset has exactly 20 cells (the documented max)', () => {
    assert.equal(GRID_PRESETS['4x5'].cells.length, 20);
    assert.equal(GRID_PRESETS['4x5'].cells.length, MAX_EXHIBITION_CELLS);
  });

  test('every preset has unique, in-bounds cell ids and coordinates', () => {
    const keys = Object.keys(GRID_PRESETS) as GridPresetKey[];
    for (const key of keys) {
      const layout = GRID_PRESETS[key];
      const ids = new Set<string>();
      for (const cell of layout.cells) {
        assert.ok(!ids.has(cell.id), `duplicate cell id ${cell.id} in preset ${key}`);
        ids.add(cell.id);
        assert.ok(cell.col >= 0 && cell.col < layout.columns, `col out of bounds in ${key}`);
        assert.ok(cell.row >= 0 && cell.row < layout.rows, `row out of bounds in ${key}`);
        assert.ok((cell.col + (cell.colSpan ?? 1)) <= layout.columns, `colSpan overflows grid in ${key}`);
        assert.ok((cell.row + (cell.rowSpan ?? 1)) <= layout.rows, `rowSpan overflows grid in ${key}`);
      }
    }
  });

  test('uniform presets (non-hero) fill every cell of the grid exactly once', () => {
    const uniformKeys: GridPresetKey[] = ['1x2', '2x2', '2x3', '3x3', '4x4', '4x5'];
    for (const key of uniformKeys) {
      const layout = GRID_PRESETS[key];
      assert.equal(layout.cells.length, layout.columns * layout.rows);
    }
  });

  test("hero layouts reserve a 2x2 span for the hero cell and don't overlap it", () => {
    for (const key of ['hero-plus-5', 'hero-plus-9'] as GridPresetKey[]) {
      const layout = GRID_PRESETS[key];
      const hero = layout.cells.find((c) => c.id === 'cell-hero')!;
      assert.ok(hero, `${key} must have a cell-hero`);
      assert.equal(hero.colSpan, 2);
      assert.equal(hero.rowSpan, 2);

      for (const cell of layout.cells) {
        if (cell.id === 'cell-hero') continue;
        const overlapsHero = cell.col < 2 && cell.row < 2;
        assert.ok(!overlapsHero, `${key}: cell ${cell.id} overlaps the hero span`);
      }
    }
  });

  test('hero-plus-5 places exactly 5 extra cells, hero-plus-9 places exactly 9', () => {
    assert.equal(GRID_PRESETS['hero-plus-5'].cells.length - 1, 5);
    assert.equal(GRID_PRESETS['hero-plus-9'].cells.length - 1, 9);
  });
});

describe('createDefaultCellConfig', () => {
  test('defaults to a safe, non-destructive texture mode and sane rotation', () => {
    const cell = createDefaultCellConfig('cell-0-0', 'viewer_1', 'model_1');
    assert.equal(cell.cellId, 'cell-0-0');
    assert.equal(cell.viewerId, 'viewer_1');
    assert.equal(cell.modelId, 'model_1');
    assert.equal(cell.textureMode, 'original-locked');
    assert.equal(cell.rotation.enabled, true);
    assert.ok(cell.rotation.speed > 0);
    assert.ok(cell.cycling.intervalSec > 0);
  });
});

describe('normalizeWaterfallConfig', () => {
  test('rows saved before waterfall existed get the disabled default', () => {
    assert.deepEqual(normalizeWaterfallConfig(undefined), DEFAULT_WATERFALL_CONFIG);
    assert.deepEqual(normalizeWaterfallConfig(null), DEFAULT_WATERFALL_CONFIG);
    assert.equal(DEFAULT_WATERFALL_CONFIG.enabled, false);
  });

  test('keeps valid settings and clamps speed and loop gap into the supported range', () => {
    assert.deepEqual(normalizeWaterfallConfig({ enabled: true, speed: 12.5, loopGap: 30 }), { enabled: true, speed: 12.5, loopGap: 30 });
    assert.equal(normalizeWaterfallConfig({ enabled: true, speed: 0 }).speed, WATERFALL_SPEED_MIN);
    assert.equal(normalizeWaterfallConfig({ enabled: true, speed: 1000 }).speed, WATERFALL_SPEED_MAX);
    assert.equal(normalizeWaterfallConfig({ enabled: true, loopGap: -10 }).loopGap, 0);
    assert.equal(normalizeWaterfallConfig({ enabled: true, loopGap: 500 }).loopGap, WATERFALL_LOOP_GAP_MAX);
  });

  test('waterfall configs saved before loop gap existed stay seamless', () => {
    assert.equal(normalizeWaterfallConfig({ enabled: true, speed: 5 }).loopGap, 0);
  });

  test('rejects malformed imported values', () => {
    const cfg = normalizeWaterfallConfig({ enabled: 'yes', speed: 'fast', loopGap: 'big' } as any);
    assert.deepEqual(cfg, DEFAULT_WATERFALL_CONFIG);
    assert.equal(normalizeWaterfallConfig({ enabled: true, speed: Number.NaN }).speed, DEFAULT_WATERFALL_CONFIG.speed);
  });
});

describe('advanceWaterfallProgress', () => {
  test('speed is percent of the grid height per second', () => {
    assert.ok(Math.abs(advanceWaterfallProgress(0, 5, 1) - 0.05) < 1e-9);
    assert.ok(Math.abs(advanceWaterfallProgress(0.5, 10, 2) - 0.7) < 1e-9);
  });

  test('wraps around to stay within [0, 1) with no loop gap', () => {
    const next = advanceWaterfallProgress(0.95, 10, 1);
    assert.ok(Math.abs(next - 0.05) < 1e-9);
    assert.equal(advanceWaterfallProgress(0.5, 50, 1), 0);
    assert.ok(advanceWaterfallProgress(0.02, -5, 1) >= 0);
  });

  test('a loop gap lengthens the loop without changing how fast content moves', () => {
    assert.equal(waterfallLoopPeriod(0), 1);
    assert.equal(waterfallLoopPeriod(50), 1.5);
    // 0.95 + 0.1 = 1.05 is still inside a 1.5-grid-height loop...
    assert.ok(Math.abs(advanceWaterfallProgress(0.95, 10, 1, 50) - 1.05) < 1e-9);
    // ...and wraps only past the gap.
    assert.ok(Math.abs(advanceWaterfallProgress(1.45, 10, 1, 50) - 0.05) < 1e-9);
  });

  test('shrinking the loop gap re-wraps an offset that is now past the end', () => {
    assert.ok(Math.abs(advanceWaterfallProgress(1.4, 5, 0, 0) - 0.4) < 1e-9);
  });
});

describe('normalizeModelScale', () => {
  test('defaults to 1 for rows saved before object size existed or malformed values', () => {
    assert.equal(normalizeModelScale(undefined), 1);
    assert.equal(normalizeModelScale('huge'), 1);
    assert.equal(normalizeModelScale(Number.NaN), 1);
  });

  test('clamps into the supported range', () => {
    assert.equal(normalizeModelScale(1.5), 1.5);
    assert.equal(normalizeModelScale(0), MODEL_SCALE_MIN);
    assert.equal(normalizeModelScale(99), MODEL_SCALE_MAX);
  });
});

describe('normalizeBackgroundColor', () => {
  test('keeps #rrggbb colours (lower-cased) and defaults to black', () => {
    assert.equal(normalizeBackgroundColor('#FFAA00'), '#ffaa00');
    assert.equal(normalizeBackgroundColor(undefined), '#000000');
  });

  test('rejects anything that is not a 6-digit hex colour', () => {
    for (const bad of ['red', '#fff', '#12345g', 'url(x)', 123, null]) {
      assert.equal(normalizeBackgroundColor(bad), '#000000');
    }
  });
});

describe('normalizeTextureChangeBlink', () => {
  test('off by default, including for exhibitions saved before the option existed', () => {
    assert.deepEqual(normalizeTextureChangeBlink(undefined), DEFAULT_TEXTURE_CHANGE_BLINK);
    assert.equal(DEFAULT_TEXTURE_CHANGE_BLINK.enabled, false);
  });

  test('frame count is a whole number within the supported range', () => {
    assert.deepEqual(normalizeTextureChangeBlink({ enabled: true, frames: 10 }), { enabled: true, frames: 10 });
    assert.equal(normalizeTextureChangeBlink({ enabled: true, frames: 2.6 }).frames, 3);
    assert.equal(normalizeTextureChangeBlink({ enabled: true, frames: 0 }).frames, TEXTURE_CHANGE_BLINK_FRAMES_MIN);
    assert.equal(normalizeTextureChangeBlink({ enabled: true, frames: 999 }).frames, TEXTURE_CHANGE_BLINK_FRAMES_MAX);
    assert.equal(normalizeTextureChangeBlink({ enabled: 'yes', frames: 'many' } as any).enabled, false);
  });
});

describe('texture change timing', () => {
  test('only cycle and random strategies change on a timer', () => {
    assert.equal(cyclingUsesInterval('cycle'), true);
    assert.equal(cyclingUsesInterval('random'), true);
    assert.equal(cyclingUsesInterval('newest-first'), false);
  });

  test('without random timing every wait is exactly the interval (never under 1s)', () => {
    assert.equal(nextTextureChangeDelayMs(12, false), 12_000);
    assert.equal(nextTextureChangeDelayMs(0, false), 1_000);
  });

  test('random timing spreads each wait across the configured range around the interval', () => {
    const low = Math.round(12_000 * (1 - RANDOM_TEXTURE_TIMING_SPREAD));
    const high = Math.round(12_000 * (1 + RANDOM_TEXTURE_TIMING_SPREAD));
    assert.equal(nextTextureChangeDelayMs(12, true, () => 0), low);
    assert.equal(nextTextureChangeDelayMs(12, true, () => 0.5), 12_000);
    assert.equal(nextTextureChangeDelayMs(12, true, () => 0.999999), high);

    const waits = Array.from({ length: 200 }, () => nextTextureChangeDelayMs(12, true));
    assert.ok(waits.every((w) => w >= low && w <= high));
    assert.ok(new Set(waits).size > 100, 'waits differ from one change to the next');
  });

  test('random timing is off for exhibitions saved before the option existed', () => {
    assert.equal(normalizeRandomTextureTiming(undefined), false);
    assert.equal(normalizeRandomTextureTiming('yes'), false);
    assert.equal(normalizeRandomTextureTiming(true), true);
  });
});
