import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { wrapWorksheetPages } from '../lib/qr-codes';

describe('classroom worksheet print layout', () => {
  test('places two landscape worksheet panels on each portrait A4 sheet', () => {
    const html = wrapWorksheetPages([
      '<div class="template">Worksheet one</div>',
      '<div class="template">Worksheet two</div>',
      '<div class="template">Worksheet three</div>',
    ]);

    assert.match(html, /@page \{ size: A4 portrait; margin: 0; \}/);
    assert.equal((html.match(/class="worksheet-sheet"/g) ?? []).length, 2);
    assert.equal((html.match(/class="worksheet-panel"/g) ?? []).length, 3);
    assert.match(html, /\.worksheet-panel \{ width: 210mm; height: 148\.5mm/);
  });

  test('keeps instruction pages outside the paired worksheet sheets', () => {
    const instruction = '<div class="ws-page instr-page">Instructions</div>';
    const worksheet = '<div class="template">Worksheet</div>';
    const html = wrapWorksheetPages([instruction, worksheet]);

    assert.ok(html.indexOf(instruction) < html.indexOf('class="worksheet-sheet"'));
    assert.equal((html.match(/class="worksheet-panel"/g) ?? []).length, 1);
    assert.match(html, /@page landscape-instr \{ size: A4 landscape; margin: 0; \}/);
  });
});