import sharp from 'sharp';

/**
 * Turns a photographed/scanned drawing into a print-ready PNG for a garment:
 *   1. auto-orient, flatten onto white
 *   2. flat-field: divide out the paper colour so paper is white, ink keeps colour
 *   3. key out the paper: near-white pixels become transparent, with a soft
 *      ramp so stroke edges stay smooth (no white box printed on the shirt)
 *   4. crop to the drawing, plus a small margin
 *   5. scale into the print area and place it top-centre on a transparent
 *      canvas of the exact print-file size
 *
 * Pure image work, no network or storage, so it is unit-tested with fixtures.
 */

export interface PrintFileOptions {
  /** Print area in inches. Printful DTG front is up to 12 x 16 in. */
  widthIn?: number;
  heightIn?: number;
  /** Output resolution. Printful recommends 300; 150 is fine for DTG this size. */
  dpi?: number;
  /** min(R,G,B) at or above this is paper (fully transparent). */
  paperLevel?: number;
  /** min(R,G,B) at or below this is ink (fully opaque). */
  inkLevel?: number;
  /** Saturated pixels count as ink even when light (e.g. yellow crayon). */
  saturationInk?: number;
  /** Margin around the cropped drawing, as a fraction of its size. */
  margin?: number;
}

export interface PrintFileResult {
  png: Buffer;
  width: number;
  height: number;
  /** Fraction of the canvas that is (mostly) opaque ink. */
  coverage: number;
  /** Source pixels per printed inch after scaling; under ~100 looks soft. */
  effectiveDpi: number;
}

export class EmptyDrawingError extends Error {
  constructor() {
    super('No drawing found on the page');
    this.name = 'EmptyDrawingError';
  }
}

const DEFAULTS: Required<PrintFileOptions> = {
  widthIn: 12,
  heightIn: 16,
  dpi: 150,
  paperLevel: 225,
  inkLevel: 185,
  saturationInk: 60,
  margin: 0.03
};

/** Alpha for one pixel from its colour (exported for tests). */
export function inkAlpha(r: number, g: number, b: number, o: Required<PrintFileOptions> = DEFAULTS): number {
  const min = Math.min(r, g, b);
  const sat = Math.max(r, g, b) - min;
  if (sat >= o.saturationInk) return 255;
  if (min >= o.paperLevel) return 0;
  if (min <= o.inkLevel) return 255;
  return Math.round((255 * (o.paperLevel - min)) / (o.paperLevel - o.inkLevel));
}

export async function makePrintFile(input: Buffer, options: PrintFileOptions = {}): Promise<PrintFileResult> {
  const o = { ...DEFAULTS, ...options };

  // 1. orient, flatten onto white
  const base = sharp(input).rotate().flatten({ background: '#ffffff' }).removeAlpha();
  const { data: src, info } = await base.clone().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;

  // 2. flat-field correction: estimate the paper colour everywhere (uneven
  // light, warm paper) and divide it out, so paper becomes white and ink
  // keeps its true colour. Works on blank pages too.
  const illum = await estimatePaper(base, width, height);
  const data = Buffer.alloc(src.length);
  for (let k = 0; k < src.length; k++) {
    data[k] = Math.min(255, Math.round((src[k] * 255) / Math.max(illum[k], 1)));
  }

  const rgba = Buffer.alloc(width * height * 4);
  let minX = width, minY = height, maxX = -1, maxY = -1;

  // 3. key out the paper, track the drawing's bounding box
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      const j = (y * width + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const a = inkAlpha(r, g, b, o);
      rgba[j] = r; rgba[j + 1] = g; rgba[j + 2] = b; rgba[j + 3] = a;
      if (a > 64) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) throw new EmptyDrawingError();

  // 4. crop with margin
  const bw = maxX - minX + 1, bh = maxY - minY + 1;
  const mx = Math.round(bw * o.margin), my = Math.round(bh * o.margin);
  const left = Math.max(0, minX - mx), top = Math.max(0, minY - my);
  const cropW = Math.min(width - left, bw + 2 * mx);
  const cropH = Math.min(height - top, bh + 2 * my);

  // 5. fit into print area, top-centre on transparent canvas
  const canvasW = Math.round(o.widthIn * o.dpi);
  const canvasH = Math.round(o.heightIn * o.dpi);
  const scale = Math.min(canvasW / cropW, canvasH / cropH);
  const drawW = Math.max(1, Math.round(cropW * scale));
  const drawH = Math.max(1, Math.round(cropH * scale));

  const drawing = await sharp(rgba, { raw: { width, height, channels: 4 } })
    .extract({ left, top, width: cropW, height: cropH })
    .resize(drawW, drawH, { kernel: 'lanczos3' })
    .png()
    .toBuffer();

  const png = await sharp({
    create: { width: canvasW, height: canvasH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
  })
    .composite([{ input: drawing, left: Math.round((canvasW - drawW) / 2), top: 0 }])
    .png({ compressionLevel: 9 })
    .withMetadata({ density: o.dpi })
    .toBuffer();

  // coverage on a small thumbnail to keep it cheap
  const thumb = await sharp(png).resize(120, 160, { fit: 'fill' }).ensureAlpha().raw().toBuffer();
  let opaque = 0;
  for (let k = 3; k < thumb.length; k += 4) if (thumb[k] > 128) opaque++;

  return {
    png,
    width: canvasW,
    height: canvasH,
    coverage: opaque / (120 * 160),
    effectiveDpi: Math.round((cropW / drawW) * o.dpi)
  };
}

/**
 * Paper colour at every pixel. Lighting changes slowly across a page, so we
 * work on a coarse grid (about 12 cells across): each cell takes the colour
 * of the most paper-like pixel (highest min channel) within 3 cells, which
 * looks past coloured-in areas up to about half the page. Cells that still
 * do not look like paper fall back to the page-wide paper colour. The grid is
 * smoothed and scaled back up.
 */
async function estimatePaper(base: sharp.Sharp, width: number, height: number): Promise<Buffer> {
  const sw = 12;
  const sh = Math.max(4, Math.round((12 * height) / width));
  const small = await base.clone().resize(sw, sh, { fit: 'fill' }).raw().toBuffer();
  const px = (x: number, y: number) => (y * sw + x) * 3;
  const minc = (k: number) => Math.min(small[k], small[k + 1], small[k + 2]);

  // page-wide paper colour: the brightest cell
  let best = 0;
  for (let k = 0; k < small.length; k += 3) if (minc(k) > minc(best)) best = k;
  const global = [small[best], small[best + 1], small[best + 2]];

  const R = 3;
  const out = Buffer.alloc(small.length);
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      let pick = px(x, y);
      for (let dy = -R; dy <= R; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= sh) continue;
        for (let dx = -R; dx <= R; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= sw) continue;
          const k = px(xx, yy);
          if (minc(k) > minc(pick)) pick = k;
        }
      }
      const r = small[pick], g = small[pick + 1], b = small[pick + 2];
      const paperLike = Math.min(r, g, b) >= 140 && Math.max(r, g, b) - Math.min(r, g, b) <= 45;
      const o = px(x, y);
      [out[o], out[o + 1], out[o + 2]] = paperLike ? [r, g, b] : global;
    }
  }
  return sharp(out, { raw: { width: sw, height: sh, channels: 3 } })
    .resize(width, height, { fit: 'fill', kernel: 'cubic' })
    .blur(Math.max(1, width / 60))
    .raw()
    .toBuffer();
}
