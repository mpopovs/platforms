import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { EmptyDrawingError, inkAlpha, makePrintFile } from '../lib/shop/print-file';

/** A "photo" of paper: warm off-white with uneven lighting, plus shapes. */
async function paperPhoto(shapes: string): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800">
    <defs><linearGradient id="l" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f4efe4"/><stop offset="1" stop-color="#d9d3c6"/>
    </linearGradient></defs>
    <rect width="600" height="800" fill="url(#l)"/>${shapes}</svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer();
}

async function pixel(png: Buffer, x: number, y: number) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const i = (y * info.width + x) * 4;
  return { r: data[i], g: data[i + 1], b: data[i + 2], a: data[i + 3] };
}

describe('inkAlpha', () => {
  test('paper transparent, ink opaque, ramp between', () => {
    assert.equal(inkAlpha(250, 250, 248), 0);
    assert.equal(inkAlpha(20, 20, 20), 255);
    const mid = inkAlpha(205, 205, 205);
    assert.ok(mid > 0 && mid < 255);
  });
  test('light but saturated colour counts as ink', () => {
    assert.equal(inkAlpha(250, 235, 90), 255); // yellow crayon
  });
});

describe('makePrintFile', () => {
  test('keys out paper, keeps the drawing, exact print size', async () => {
    const input = await paperPhoto(
      '<rect x="150" y="200" width="300" height="300" fill="#d01818"/>' +
      '<path d="M150 600 L450 650" stroke="#1830c0" stroke-width="14"/>'
    );
    const out = await makePrintFile(input);
    assert.equal(out.width, 1800);
    assert.equal(out.height, 2400);
    const meta = await sharp(out.png).metadata();
    assert.equal(meta.format, 'png');
    assert.equal(meta.hasAlpha, true);

    // corners are transparent (no paper box on the shirt)
    assert.equal((await pixel(out.png, 2, 2)).a, 0);
    assert.equal((await pixel(out.png, 1797, 2397)).a, 0);

    // the drawing is cropped and scaled to full width, top-aligned:
    // red square fills the upper middle
    const red = await pixel(out.png, 900, 600);
    assert.equal(red.a, 255);
    assert.ok(red.r > 180 && red.g < 80 && red.b < 80, JSON.stringify(red));

    assert.ok(out.coverage > 0.2 && out.coverage < 0.8, String(out.coverage));
    assert.ok(out.effectiveDpi < 150, 'upscaled source reports lower effective DPI');
  });

  test('large coloured-in area stays ink, not paper', async () => {
    const input = await paperPhoto('<rect x="60" y="80" width="480" height="560" fill="#2a6fd6"/><rect x="200" y="700" width="40" height="40" fill="#111"/>');
    const out = await makePrintFile(input);
    const p = await pixel(out.png, 900, 900);
    assert.equal(p.a, 255);
    assert.ok(p.b > 150 && p.r < 100, JSON.stringify(p));
  });

  test('blank paper throws EmptyDrawingError', async () => {
    const input = await paperPhoto('');
    await assert.rejects(makePrintFile(input), EmptyDrawingError);
  });

  test('custom print area and dpi', async () => {
    const input = await paperPhoto('<circle cx="300" cy="400" r="120" fill="#118833"/>');
    const out = await makePrintFile(input, { widthIn: 10, heightIn: 10, dpi: 100 });
    assert.equal(out.width, 1000);
    assert.equal(out.height, 1000);
  });
});
