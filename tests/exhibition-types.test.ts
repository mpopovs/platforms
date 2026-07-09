import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  GRID_PRESETS,
  MAX_EXHIBITION_CELLS,
  createDefaultCellConfig,
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
