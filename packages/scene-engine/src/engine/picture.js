// Picture -> 2.5D backdrop, entirely in the browser (port of
// tools/make_depth_backdrop.py, without the splat):
//
//  1. Depth Anything V2 Small (Apache-2.0) via onnxruntime-web (WebGPU when
//     available, else WebAssembly) -> relative depth (disparity) of the picture
//  2. metric scale from a simple camera guess: the bottom of the picture is
//     ground, the camera stands `height` metres above it, tilted `pitch`
//     degrees with a `vfov` lens. (Or, without ground: nearest..farthest.)
//  3. two layers: the picture (front, cut at depth edges) and a background
//     pushed back and filled in behind every edge, so small camera moves
//     never show holes
//
// Files written (all under backdrop/): color.jpg, color_bg.jpg, depth.png,
// depth_bg.png (millimetres, high byte R, low byte G), backdrop.json, and
// source.jpg + disparity.png so the depth can be re-fitted later without
// running the model again.

import { encodeGray16, decodePNG } from './png16.js';

export const DEFAULT_DEPTH_MODEL = 'https://huggingface.co/onnx-community/depth-anything-v2-small/resolve/main/onnx/model.onnx';
const ORT_CDN = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.30.0/dist/';
export const DEFAULT_FIT = { vfov: 40, pitch: -5, height: 1.6, far: 60, near: 2, ground: true, soft: 0.5 };
const MAX_MM = 65000;
const tick = () => new Promise(r => setTimeout(r, 0));

// ---------------------------------------------------------------- model
let session = null, sessionKey = '';
async function fetchCached(url, onProgress) {
  let cache = null;
  try { cache = await caches.open('claypixels-models-v1'); const hit = await cache.match(url); if (hit) return new Uint8Array(await hit.arrayBuffer()); } catch { cache = null; }
  const r = await fetch(url);
  if (!r.ok) throw new Error(`depth model download failed (${r.status})`);
  const total = +r.headers.get('content-length') || 0, reader = r.body.getReader(), parts = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    parts.push(value); got += value.length;
    onProgress?.(total ? `Downloading the depth model ${Math.round(got / total * 100)}% (once, then kept in this browser)` : `Downloading the depth model ${(got / 1e6).toFixed(0)} MB`);
  }
  const buf = new Uint8Array(got); let o = 0; for (const p of parts) { buf.set(p, o); o += p.length; }
  try { await cache?.put(url, new Response(buf, { headers: { 'content-type': 'application/octet-stream' } })); } catch { }
  return buf;
}
async function getSession({ modelUrl = DEFAULT_DEPTH_MODEL, wasmPaths = ORT_CDN, onProgress } = {}) {
  const key = modelUrl + '|' + wasmPaths;
  if (session && sessionKey === key) return session;
  const ort = await import('onnxruntime-web/webgpu');
  ort.env.wasm.wasmPaths = wasmPaths;
  // only real errors: its warnings go to console.error, which Next.js dev shows as an error overlay
  ort.env.logLevel = 'error';
  ort.env.wasm.numThreads = globalThis.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 2) : 1;
  const bytes = await fetchCached(modelUrl, onProgress);
  onProgress?.('Starting the depth model…');
  let s = null, ep = 'wasm';
  if (navigator.gpu) { try { s = await ort.InferenceSession.create(bytes, { executionProviders: ['webgpu'], logSeverityLevel: 3 }); ep = 'webgpu'; } catch (e) { console.warn('[picture] WebGPU depth failed, using WebAssembly', e); } }
  if (!s) s = await ort.InferenceSession.create(bytes, { executionProviders: ['wasm'], logSeverityLevel: 3 });
  session = { ort, s, ep }; sessionKey = key;
  return session;
}

/** Relative depth (disparity: bigger = nearer) of an ImageBitmap. */
export async function estimateDisparity(bmp, opts = {}) {
  const { ort, s, ep } = await getSession(opts);
  const target = opts.detail ?? (ep === 'webgpu' ? 1022 : 770);
  const mw = 14 * Math.max(8, Math.round(Math.min(target, bmp.width) / 14));
  const mh = 14 * Math.max(8, Math.round(mw * bmp.height / bmp.width / 14));
  const c = new OffscreenCanvas(mw, mh), g = c.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingQuality = 'high'; g.drawImage(bmp, 0, 0, mw, mh);
  const px = g.getImageData(0, 0, mw, mh).data, n = mw * mh, x = new Float32Array(3 * n);
  const mean = [0.485, 0.456, 0.406], std = [0.229, 0.224, 0.225];
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) x[k * n + i] = (px[i * 4 + k] / 255 - mean[k]) / std[k];
  opts.onProgress?.(`Working out the depth (${ep === 'webgpu' ? 'graphics card' : 'processor, may take a minute'})…`);
  await tick();
  const out = await s.run({ [s.inputNames[0]]: new ort.Tensor('float32', x, [1, 3, mh, mw]) });
  const t = out[s.outputNames[0]];
  const [oh, ow] = t.dims.slice(-2);
  return { d: Float32Array.from(t.data), w: ow, h: oh };
}

// ---------------------------------------------------------------- metric fit
function basis(pitchDeg) {
  const p = pitchDeg * Math.PI / 180;
  return { fwd: [0, Math.sin(p), -Math.cos(p)], up: [0, Math.cos(p), Math.sin(p)] }; // right = +x
}
/**
 * disparity -> metres along the view axis, using the camera guess.
 * @param {{d: Float32Array, w: number, h: number}} disp
 * @param {Partial<typeof DEFAULT_FIT>} [fit]
 */
export function fitDepth(disp, fit = DEFAULT_FIT) {
  const { d, w, h } = disp, F = { ...DEFAULT_FIT, ...fit };
  const fy = (h / 2) / Math.tan(F.vfov * Math.PI / 360), { fwd, up } = basis(F.pitch);
  let lo = Infinity, hi = -Infinity; for (const v of d) { if (v < lo) lo = v; if (v > hi) hi = v; }
  let a = 0, b = 0, how = 'range', dg = lo;
  if (F.ground) {
    // bottom quarter of the picture, middle 60 %: assume it is ground (y = 0)
    const xs = [], ys = [];
    for (let v = Math.floor(h * 0.75); v < h; v += 2) {
      const ry = fwd[1] + up[1] * ((h / 2 - v - 0.5) / fy);
      if (ry > -0.02) continue;
      const tz = F.height / -ry;
      if (tz < 0.3 || tz > F.far) continue;
      for (let u = Math.floor(w * 0.2); u < w * 0.8; u += 2) { xs.push(d[v * w + u]); ys.push(1 / tz); }
    }
    if (xs.length > 200) {
      // bin by disparity, median per bin, least squares on the medians (robust to a rock or two)
      const idx = xs.map((_, i) => i).sort((p, q) => xs[p] - xs[q]), B = 16, bx = [], by = [];
      for (let k = 0; k < B; k++) {
        const part = idx.slice(Math.floor(k * idx.length / B), Math.floor((k + 1) * idx.length / B)); if (part.length < 10) continue;
        const sx = part.map(i => xs[i]).sort((p, q) => p - q), sy = part.map(i => ys[i]).sort((p, q) => p - q);
        bx.push(sx[sx.length >> 1]); by.push(sy[sy.length >> 1]);
      }
      const mx = bx.reduce((s, v) => s + v, 0) / bx.length, my = by.reduce((s, v) => s + v, 0) / by.length;
      let sxx = 0, sxy = 0; for (let i = 0; i < bx.length; i++) { sxx += (bx[i] - mx) ** 2; sxy += (bx[i] - mx) * (by[i] - my); }
      a = sxx > 0 ? sxy / sxx : 0; b = my - a * mx;
      if (a > 0) { how = 'ground'; dg = bx[0]; }
    }
  }
  if (how !== 'ground') { // no usable ground: nearest point at `near`, farthest at `far`
    const iN = 1 / F.near, iF = 1 / F.far; a = (iN - iF) / Math.max(hi - lo, 1e-6); b = iF - a * lo;
  }
  const z = new Float32Array(d.length), zmin = 0.3;
  // beyond the farthest ground we measured, fade smoothly out to `far` (sky, distant hills)
  const iF = 1 / F.far, iG = Math.max(a * dg + b, iF);
  for (let i = 0; i < d.length; i++) {
    const inv = d[i] >= dg ? a * d[i] + b : iF + (iG - iF) * Math.max(0, (d[i] - lo) / Math.max(dg - lo, 1e-6));
    z[i] = Math.min(F.far, Math.max(zmin, 1 / Math.max(inv, iF)));
  }
  return { z, w, h, how, a, b };
}

// ---------------------------------------------------------------- image helpers
function resizeF(src, sw, sh, dw, dh) { // bilinear
  const out = new Float32Array(dw * dh);
  for (let y = 0; y < dh; y++) {
    const fy = Math.min(sh - 1, Math.max(0, (y + 0.5) * sh / dh - 0.5)), y0 = Math.floor(fy), y1 = Math.min(sh - 1, y0 + 1), ty = fy - y0;
    for (let x = 0; x < dw; x++) {
      const fx = Math.min(sw - 1, Math.max(0, (x + 0.5) * sw / dw - 0.5)), x0 = Math.floor(fx), x1 = Math.min(sw - 1, x0 + 1), tx = fx - x0;
      out[y * dw + x] = (src[y0 * sw + x0] * (1 - tx) + src[y0 * sw + x1] * tx) * (1 - ty) + (src[y1 * sw + x0] * (1 - tx) + src[y1 * sw + x1] * tx) * ty;
    }
  }
  return out;
}
function maxFilter(src, w, h, r) { // separable square max
  const tmp = new Float32Array(src.length), out = new Float32Array(src.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let m = -Infinity; for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r); k++) m = Math.max(m, src[y * w + k]); tmp[y * w + x] = m; }
  for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) { let m = -Infinity; for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r); k++) m = Math.max(m, tmp[k * w + x]); out[y * w + x] = m; }
  return out;
}
// push-pull fill: holes (wt 0) get a smooth blend of the colours around them
function pushPull(rgb, wt, w, h) {
  if (w <= 1 && h <= 1) return;
  let holes = false; for (let i = 0; i < wt.length; i++) if (wt[i] < 1) { holes = true; break; }
  if (!holes) return;
  const cw = Math.max(1, (w + 1) >> 1), ch = Math.max(1, (h + 1) >> 1), crgb = new Float32Array(cw * ch * 3), cwt = new Float32Array(cw * ch);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, j = (y >> 1) * cw + (x >> 1), q = wt[i];
    cwt[j] += q; crgb[j * 3] += rgb[i * 3] * q; crgb[j * 3 + 1] += rgb[i * 3 + 1] * q; crgb[j * 3 + 2] += rgb[i * 3 + 2] * q;
  }
  for (let j = 0; j < cw * ch; j++) { if (cwt[j] > 0) { crgb[j * 3] /= cwt[j]; crgb[j * 3 + 1] /= cwt[j]; crgb[j * 3 + 2] /= cwt[j]; } cwt[j] = Math.min(1, cwt[j]); }
  pushPull(crgb, cwt, cw, ch);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, q = wt[i]; if (q >= 1) continue;
    // bilinear from the coarser level
    const fx = Math.min(cw - 1, Math.max(0, (x + 0.5) / 2 - 0.5)), fy = Math.min(ch - 1, Math.max(0, (y + 0.5) / 2 - 0.5));
    const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(cw - 1, x0 + 1), y1 = Math.min(ch - 1, y0 + 1), tx = fx - x0, ty = fy - y0;
    for (let k = 0; k < 3; k++) {
      const c = (crgb[(y0 * cw + x0) * 3 + k] * (1 - tx) + crgb[(y0 * cw + x1) * 3 + k] * tx) * (1 - ty) + (crgb[(y1 * cw + x0) * 3 + k] * (1 - tx) + crgb[(y1 * cw + x1) * 3 + k] * tx) * ty;
      rgb[i * 3 + k] = rgb[i * 3 + k] * q + c * (1 - q);
    }
    wt[i] = 1;
  }
}
// box mean via an integral image (radius r), used by the guided filter
function boxMean(src, w, h, r) {
  const I = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) { let row = 0; for (let x = 0; x < w; x++) { row += src[y * w + x]; I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + row; } }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
      out[y * w + x] = (I[y1 * (w + 1) + x1] - I[y0 * (w + 1) + x1] - I[y1 * (w + 1) + x0] + I[y0 * (w + 1) + x0]) / ((x1 - x0) * (y1 - y0));
    }
  }
  return out;
}
// guided filter (He et al.): smooths p while keeping the edges of guide g (both w*h)
function guidedFilter(g, p, w, h, r, eps) {
  const mI = boxMean(g, w, h, r), mP = boxMean(p, w, h, r);
  const gp = new Float32Array(w * h), gg = new Float32Array(w * h);
  for (let i = 0; i < gp.length; i++) { gp[i] = g[i] * p[i]; gg[i] = g[i] * g[i]; }
  const mIP = boxMean(gp, w, h, r), mII = boxMean(gg, w, h, r), a = new Float32Array(w * h), b = new Float32Array(w * h);
  for (let i = 0; i < a.length; i++) { const v = mII[i] - mI[i] * mI[i]; a[i] = (mIP[i] - mI[i] * mP[i]) / (v + eps); b[i] = mP[i] - a[i] * mI[i]; }
  const mA = boxMean(a, w, h, r), mB = boxMean(b, w, h, r), out = new Float32Array(w * h);
  for (let i = 0; i < out.length; i++) out[i] = mA[i] * g[i] + mB[i];
  return out;
}
const grayOf = im => { const n = im.width * im.height, g = new Float32Array(n); for (let i = 0; i < n; i++) g[i] = (im.data[i * 4] * 0.299 + im.data[i * 4 + 1] * 0.587 + im.data[i * 4 + 2] * 0.114) / 255; return g; };
async function alphaPNG(a, w, h) {
  const c = new OffscreenCanvas(w, h), g = c.getContext('2d'), im = g.createImageData(w, h);
  for (let i = 0; i < a.length; i++) { const v = Math.round(a[i] * 255); im.data[i * 4] = im.data[i * 4 + 1] = im.data[i * 4 + 2] = v; im.data[i * 4 + 3] = 255; }
  g.putImageData(im, 0, 0);
  return c.convertToBlob({ type: 'image/png' });
}
async function bitmapRGB(bmp, w, h) {
  const c = new OffscreenCanvas(w, h), g = c.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingQuality = 'high'; g.drawImage(bmp, 0, 0, w, h);
  return g.getImageData(0, 0, w, h);
}
const jpeg = async (im, q) => { const c = new OffscreenCanvas(im.width, im.height); c.getContext('2d').putImageData(im, 0, 0); return c.convertToBlob({ type: 'image/jpeg', quality: q }); };
async function depthPNG(z, w, h, mul = 1) {
  const c = new OffscreenCanvas(w, h), g = c.getContext('2d'), im = g.createImageData(w, h);
  for (let i = 0; i < z.length; i++) { const v = Math.max(1, Math.min(MAX_MM, Math.round(z[i] * mul * 1000))); im.data[i * 4] = v >> 8; im.data[i * 4 + 1] = v & 255; im.data[i * 4 + 3] = 255; }
  g.putImageData(im, 0, 0);
  return c.convertToBlob({ type: 'image/png' });
}

// metric depth at gw x gh, edge-aware: near depth jumps the depth snaps to the
// picture's own edges (guided filter on log depth, guided by the picture)
async function shapedDepth(bmp, m, gw, gh) {
  const zf = resizeF(m.z, m.w, m.h, gw, gh);
  const guide = grayOf(await bitmapRGB(bmp, gw, gh));
  const lz0 = zf.map(Math.log), jump = new Float32Array(gw * gh);
  for (let y = 1; y < gh - 1; y++) for (let x = 1; x < gw - 1; x++) {
    const i = y * gw + x; jump[i] = Math.max(Math.abs(lz0[i + 1] - lz0[i - 1]), Math.abs(lz0[i + gw] - lz0[i - gw])) > 0.05 ? 1 : 0;
  }
  const near = boxMean(jump, gw, gh, Math.max(3, Math.round(gw / 200))), gf = guidedFilter(guide, lz0, gw, gh, Math.max(4, Math.round(gw / 160)), 4e-4);
  for (let i = 0; i < zf.length; i++) { const t = Math.min(1, near[i] * 6); zf[i] = Math.exp(lz0[i] * (1 - t) + gf[i] * t); }
  return zf;
}


// soft edge: 1 away from the seeds, fading to 0 on them over about `soft` x w/160 pixels
// (soft 0 = hard cut). Blurred twice so the ramp has no visible steps.
function featherAlpha(seed, w, h, soft) {
  const out = new Float32Array(w * h).fill(1);
  if (!(soft > 0)) { for (let i = 0; i < out.length; i++) if (seed[i]) out[i] = 0.25; return out; }
  const r = Math.max(1, Math.round(soft * w / 160)), rb = Math.max(1, r >> 1);
  const s = boxMean(boxMean(maxFilter(seed, w, h, r), w, h, rb), w, h, rb);
  for (let i = 0; i < out.length; i++) { const t = Math.min(1, s[i] * 1.15); out[i] = 1 - t * t * (3 - 2 * t); }
  return out;
}

// ---------------------------------------------------------------- layers
/** Build all backdrop files from a picture and its disparity. */
export async function buildBackdrop(bmp, disp, fit = DEFAULT_FIT, opts = {}) {
  const { onProgress, grid = 1280, tex = 4096, fill = 'ai', prevFill = null } = opts;
  const F = { ...DEFAULT_FIT, ...fit };
  onProgress?.('Shaping the depth…'); await tick();
  const m = fitDepth(disp, F);
  const W0 = bmp.width, H0 = bmp.height;
  const gw = Math.min(grid, W0), gh = Math.round(gw * H0 / W0);
  const zf = await shapedDepth(bmp, m, gw, gh);
  // depth edges: big jumps of log depth between neighbours
  const lz = zf.map(Math.log), edge = new Uint8Array(gw * gh);
  for (let y = 1; y < gh - 1; y++) for (let x = 1; x < gw - 1; x++) {
    const L = (dx, dy) => lz[(y + dy) * gw + x + dx];
    const gx = Math.abs(L(1, -1) + 2 * L(1, 0) + L(1, 1) - L(-1, -1) - 2 * L(-1, 0) - L(-1, 1)) / 8;
    const gy = Math.abs(L(-1, 1) + 2 * L(0, 1) + L(1, 1) - L(-1, -1) - 2 * L(0, -1) - L(1, -1)) / 8;
    if (Math.max(gx, gy) > 0.04) edge[y * gw + x] = 1;
  }
  // 2. soft outline: the near side of every depth jump fades out over ~2 grid pixels,
  //    so the front layer has a smooth edge instead of jagged steps (backdrop.js alpha map)
  const nearSide = new Float32Array(gw * gh);
  for (let y = 1; y < gh - 1; y++) for (let x = 1; x < gw - 1; x++) {
    const i = y * gw + x;
    if (lz[i - 1] - lz[i] > 0.05 || lz[i + 1] - lz[i] > 0.05 || lz[i - gw] - lz[i] > 0.05 || lz[i + gw] - lz[i] > 0.05) nearSide[i] = 1;
  }
  const alpha = featherAlpha(nearSide, gw, gh, F.soft);
  onProgress?.('Making the background layer…'); await tick();
  const r = Math.max(2, Math.round(gw / 240));
  const zDil = maxFilter(zf, gw, gh, r), eDil = maxFilter(Float32Array.from(edge), gw, gh, r);
  const zb = new Float32Array(gw * gh), occl = new Uint8Array(gw * gh);
  for (let i = 0; i < zb.length; i++) { const ne = eDil[i] > 0; zb[i] = ne ? zDil[i] : zf[i]; occl[i] = ne && zb[i] > zf[i] * 1.04 ? 1 : 0; }
  // background colour: what is hidden behind objects gets filled in
  // background at the picture's own resolution (up to 2048 px): what the AI fills stays sharp
  const tw = Math.min(tex, W0), th = Math.round(tw * H0 / W0), bw = Math.max(64, Math.min(2048, W0)), bh = Math.round(bw * H0 / W0);
  const bgIm = await bitmapRGB(bmp, bw, bh);
  const occBig = maxFilter(resizeF(Float32Array.from(occl), gw, gh, bw, bh), bw, bh, 3);
  const mask = new Uint8Array(bw * bh); for (let i = 0; i < mask.length; i++) mask[i] = occBig[i] > 0.01 ? 1 : 0;
  let filled = 'fast';
  if (fill === 'ai') {
    try {
      const { inpaint } = await import('./inpaint.js');
      await inpaint(bgIm, mask, opts); filled = 'ai';
    } catch (e) { console.warn('[picture] AI fill failed, using the quick fill', e); onProgress?.('AI fill not available (' + e.message + '); using the quick fill…'); }
  }
  if (filled !== 'ai') {
    // quick fill; where an earlier AI fill covered the same spot, keep it
    const rgb = new Float32Array(bw * bh * 3), wt = new Float32Array(bw * bh);
    const prev = prevFill && prevFill.im.width === bw && prevFill.im.height === bh ? prevFill : null;
    for (let i = 0; i < bw * bh; i++) {
      const usePrev = prev && mask[i] && prev.mask[i];
      const src = usePrev ? prev.im.data : bgIm.data;
      rgb[i * 3] = src[i * 4]; rgb[i * 3 + 1] = src[i * 4 + 1]; rgb[i * 3 + 2] = src[i * 4 + 2]; wt[i] = mask[i] && !usePrev ? 0 : 1;
    }
    pushPull(rgb, wt, bw, bh);
    for (let i = 0; i < bw * bh; i++) { bgIm.data[i * 4] = rgb[i * 3]; bgIm.data[i * 4 + 1] = rgb[i * 3 + 1]; bgIm.data[i * 4 + 2] = rgb[i * 3 + 2]; }
    if (prev) filled = 'ai-reused';
  }
  onProgress?.('Saving the layers…'); await tick();
  const meta = {
    image: 'source.jpg', width: gw, height: gh, depth_scale: 0.001, far: F.far,
    camera: { position: [0, F.height, 0], vfov: F.vfov, pitch: F.pitch, yaw: 0, roll: 0 },
    edge_threshold: 0.04, model: 'Depth Anything V2 Small (Apache-2.0)', made: 'in the editor', alpha: 'alpha.png',
    fill: filled === 'fast' ? 'quick' : 'ai', fillMask: 'fillmask.png',
    fit: { ...F, how: m.how }
  };
  return {
    meta, how: m.how, filled,
    files: {
      'backdrop/color.jpg': await jpeg(await bitmapRGB(bmp, tw, th), 0.9),
      'backdrop/color_bg.jpg': await jpeg(bgIm, 0.9),
      'backdrop/depth.png': await depthPNG(zf, gw, gh),
      'backdrop/depth_bg.png': await depthPNG(zb, gw, gh, 1.02), // a little behind the front: no z-fighting
      'backdrop/alpha.png': await alphaPNG(alpha, gw, gh),
      'backdrop/fillmask.png': await alphaPNG(Float32Array.from(mask), bw, bh),
      'backdrop/backdrop.json': new Blob([JSON.stringify(meta, null, 2)], { type: 'application/json' })
    }
  };
}

// disparity stored as a 16-bit PNG (normalised) so a re-fit needs no model
export async function disparityPNG(disp) {
  let lo = Infinity, hi = -Infinity; for (const v of disp.d) { if (v < lo) lo = v; if (v > hi) hi = v; }
  const q = new Uint16Array(disp.d.length), s = 65535 / Math.max(hi - lo, 1e-9);
  for (let i = 0; i < q.length; i++) q[i] = Math.round((disp.d[i] - lo) * s);
  return { blob: await encodeGray16(disp.w, disp.h, q), range: [lo, hi] };
}
export async function readDisparity(blob, range) {
  const png = await decodePNG(await blob.arrayBuffer()), d = new Float32Array(png.w * png.h), [lo, hi] = range;
  for (let y = 0; y < png.h; y++) for (let x = 0; x < png.w; x++) d[y * png.w + x] = lo + png.get(x, y, 0) / 65535 * (hi - lo);
  return { d, w: png.w, h: png.h };
}

/** The whole thing from a picture file: returns { files, meta, how }. */
export async function pictureToBackdrop(file, fit = DEFAULT_FIT, opts = {}) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const maxSrc = 4096, sw = Math.min(maxSrc, bmp.width), sh = Math.round(sw * bmp.height / bmp.width);
  const disp = await estimateDisparity(bmp, opts);
  const out = await buildBackdrop(bmp, disp, fit, opts);
  const dp = await disparityPNG(disp);
  out.meta.disparity = { file: 'disparity.png', range: dp.range };
  out.files['backdrop/backdrop.json'] = new Blob([JSON.stringify(out.meta, null, 2)], { type: 'application/json' });
  out.files['backdrop/disparity.png'] = dp.blob;
  out.files['backdrop/source.jpg'] = await jpeg(await bitmapRGB(bmp, sw, sh), 0.92);
  bmp.close();
  return out;
}

/** Re-fit a picture backdrop made here, with new camera settings (no model run). */
export async function refitBackdrop(getBlob, meta, fit, opts = {}) {
  if (!meta.disparity) throw new Error('This backdrop was not made in the editor; make it again from a picture.');
  const [src, dpng] = await Promise.all([getBlob('source.jpg'), getBlob(meta.disparity.file)]);
  const bmp = await createImageBitmap(src), disp = await readDisparity(dpng, meta.disparity.range);
  let prevFill = null;
  if (opts.fill !== 'ai' && meta.fill === 'ai') { // keep the AI fill made before; only new gaps get the quick fill
    try {
      const [cb, fm] = await Promise.all([getBlob('color_bg.jpg'), getBlob(meta.fillMask || 'fillmask.png')]);
      const read = async b => { const bm = await createImageBitmap(b); const im = await bitmapRGB(bm, bm.width, bm.height); bm.close(); return im; };
      const im = await read(cb), mi = await read(fm), mask = new Uint8Array(mi.width * mi.height);
      for (let i = 0; i < mask.length; i++) mask[i] = mi.data[i * 4] > 127 ? 1 : 0;
      if (mi.width === im.width) prevFill = { im, mask };
    } catch { prevFill = null; }
  }
  const out = await buildBackdrop(bmp, disp, fit, { fill: 'fast', ...opts, prevFill }); bmp.close();
  out.meta.disparity = meta.disparity;
  out.files['backdrop/backdrop.json'] = new Blob([JSON.stringify(out.meta, null, 2)], { type: 'application/json' });
  return out;
}

// ---------------------------------------------------------------- automatic layers
// 1-D k-means on log depth: where the picture naturally separates into planes
function depthClusters(lz, k) {
  const sorted = Float32Array.from(lz).sort();
  let c = Array.from({ length: k }, (_, i) => sorted[Math.floor((i + 0.5) / k * (sorted.length - 1))]);
  const step = Math.max(1, Math.floor(lz.length / 200000));
  for (let it = 0; it < 15; it++) {
    const sum = new Float64Array(k), n = new Float64Array(k);
    for (let i = 0; i < lz.length; i += step) { let b = 0; for (let j = 1; j < k; j++) if (Math.abs(lz[i] - c[j]) < Math.abs(lz[i] - c[b])) b = j; sum[b] += lz[i]; n[b]++; }
    c = c.map((v, j) => n[j] ? sum[j] / n[j] : v);
  }
  c.sort((a, b) => b - a); // far first
  const cuts = []; for (let j = 0; j < k - 1; j++) cuts.push((c[j] + c[j + 1]) / 2);
  return cuts; // descending log-depth boundaries
}
const encodeLayer = async im => {
  const c = new OffscreenCanvas(im.width, im.height); c.getContext('2d').putImageData(im, 0, 0);
  const b = await c.convertToBlob({ type: 'image/webp', quality: 0.92 }); // smaller than PNG; PNG where WebP can't be written
  return b.type === 'image/webp' ? b : c.convertToBlob({ type: 'image/png' });
};

/**
 * Split a picture into `count` layers far -> near, each filled (AI) behind the
 * nearer layers in a band, so the camera can move without showing holes.
 * Returns { def (layers.json), files: { 'layers/...': Blob } }.
 */
export async function splitLayers(bmp, disp, fit = DEFAULT_FIT, opts = {}) {
  const { onProgress, count = 4, width = 2048, fill = 'ai' } = opts;
  const F = { ...DEFAULT_FIT, ...fit }, softL = F.soft;
  const W = Math.min(width, bmp.width), H = Math.round(W * bmp.height / bmp.width);
  onProgress?.('Shaping the depth…'); await tick();
  const m = fitDepth(disp, F), z = await shapedDepth(bmp, m, W, H), lz = z.map(Math.log), N = W * H;
  const cuts = depthClusters(lz, count);
  const label = new Uint8Array(N);
  for (let i = 0; i < N; i++) { let k = 0; while (k < cuts.length && lz[i] < cuts[k]) k++; label[i] = k; } // 0 = farthest
  // tidy speckles: 3x3 majority, twice
  for (let pass = 0; pass < 2; pass++) {
    const nl = label.slice();
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const cnt = new Uint8Array(count); for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) cnt[label[(y + dy) * W + x + dx]]++;
      let b = label[y * W + x]; for (let j = 0; j < count; j++) if (cnt[j] > cnt[b] + 1) b = j; nl[y * W + x] = b;
    }
    label.set(nl);
  }
  const src = await bitmapRGB(bmp, W, H), band = Math.round(W * 0.06), feather = Math.max(4, Math.round(band / 6));
  const files = {}, layers = [], stamp = Date.now().toString(36);
  for (let k = 0; k < count; k++) {
    onProgress?.(`Layer ${k + 1} of ${count}…`); await tick();
    const own = new Float32Array(N), nearer = new Uint8Array(N);
    let nOwn = 0; for (let i = 0; i < N; i++) { if (label[i] === k) { own[i] = 1; nOwn++; } else if (label[i] > k) nearer[i] = 1; }
    if (nOwn < N * 0.002) continue; // (almost) empty: skip
    // band: hidden pixels (behind nearer layers) close to this layer's own pixels
    const reach = boxMean(own, W, H, band), reachWide = boxMean(own, W, H, band + 32);
    const im = new ImageData(new Uint8ClampedArray(src.data), W, H), mask = new Uint8Array(N), alpha = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      if (own[i]) { alpha[i] = 1; continue; }
      if (nearer[i] && reachWide[i] > 0) mask[i] = 1; // filled (with some extra context around the band)
      if (nearer[i] && reach[i] > 0) alpha[i] = Math.min(1, reach[i] * band / feather); // fades out at the band's outer edge
    }
    const bandPx = mask.reduce((a, v) => a + v, 0);
    if (k === 0 && bandPx) { // the farthest layer is the backdrop: everything behind nearer layers becomes opaque
      for (let i = 0; i < N; i++) if (nearer[i]) { mask[i] = 1; alpha[i] = 1; }
    }
    if (bandPx) {
      let done = false;
      if (fill === 'ai') {
        try {
          const { inpaint } = await import('./inpaint.js');
          // the deep inside of big holes (back layer) is never seen: quick fill there, AI along the edges
          const aiMask = k === 0 ? Uint8Array.from(mask, (v, i) => v && reachWide[i] > 0 ? 1 : 0) : mask;
          await inpaint(im, aiMask, { ...opts, onProgress: t => onProgress?.(`Layer ${k + 1} of ${count}: ${t}`) });
          if (k === 0) quickFill(im, Uint8Array.from(mask, (v, i) => v && !aiMask[i] ? 1 : 0));
          done = true;
        } catch (e) { console.warn('[picture] AI fill failed, using the quick fill', e); onProgress?.('AI fill not available (' + e.message + '); using the quick fill…'); }
      }
      if (!done) quickFill(im, mask);
    }
    // soft outline where this layer is in front of farther ones
    const seedL = new Float32Array(N);
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = y * W + x; if (!own[i]) continue;
      if (label[i - 1] < k || label[i + 1] < k || label[i - W] < k || label[i + W] < k) seedL[i] = 1;
    }
    { const fa = featherAlpha(seedL, W, H, softL); for (let i = 0; i < N; i++) if (own[i]) alpha[i] = Math.min(alpha[i], fa[i]); }
    for (let i = 0; i < N; i++) im.data[i * 4 + 3] = Math.round(alpha[i] * 255);
    // distance and relief from the layer's own depth; the filled band continues it
    const zs = []; for (let i = 0; i < N; i += 7) if (own[i]) zs.push(z[i]);
    zs.sort((a, b) => a - b);
    const z0 = zs[Math.floor(zs.length * 0.05)], z1 = zs[Math.floor(zs.length * 0.95)], D = (z0 + z1) / 2;
    const relief = Math.min(1, Math.max(0, (z1 / D - 1) / 0.35));
    const zl = new Float32Array(N), wt = new Float32Array(N);
    for (let i = 0; i < N; i++) { zl[i] = own[i] ? z[i] : 0; wt[i] = own[i]; }
    pushPull1(zl, wt, W, H);
    const dw = Math.min(512, W), dh = Math.round(dw * H / W), zsmall = resizeF(zl, W, H, dw, dh), q = new Uint16Array(dw * dh);
    for (let i = 0; i < q.length; i++) q[i] = Math.round(Math.min(1, Math.max(0, (z1 - zsmall[i]) / Math.max(1e-6, z1 - z0))) * 65535); // 1 = nearest
    const base = `layers/auto_${stamp}_${k + 1}`, img = await encodeLayer(im), ext = img.type === 'image/webp' ? 'webp' : 'png';
    files[`${base}.${ext}`] = img;
    files[`${base}_disp.png`] = await encodeGray16(dw, dh, q);
    layers.push({ id: `layer_${stamp}_${k + 1}`, name: `Layer ${k + 1} (${z0.toFixed(1)}–${z1.toFixed(1)} m)`, file: `${base}.${ext}`, fit: 'frame',
      distance: +D.toFixed(2), relief: +relief.toFixed(2), disp: `${base}_disp.png`, visible: true });
  }
  const def = { camera: { position: [0, F.height, 0], vfov: F.vfov, pitch: F.pitch, yaw: 0, roll: 0 }, width: W, height: H, layers, made: 'split from one picture', fit: F };
  return { def, files };
}
function quickFill(im, mask) {
  const n = mask.length, rgb = new Float32Array(n * 3), wt = new Float32Array(n);
  for (let i = 0; i < n; i++) { for (let c = 0; c < 3; c++) rgb[i * 3 + c] = im.data[i * 4 + c]; wt[i] = mask[i] ? 0 : 1; }
  pushPull(rgb, wt, im.width, im.height);
  for (let i = 0; i < n; i++) if (mask[i]) for (let c = 0; c < 3; c++) im.data[i * 4 + c] = rgb[i * 3 + c];
}
function pushPull1(v, wt, w, h) { // one channel
  const rgb = new Float32Array(v.length * 3); for (let i = 0; i < v.length; i++) rgb[i * 3] = v[i];
  pushPull(rgb, wt, w, h); for (let i = 0; i < v.length; i++) v[i] = rgb[i * 3];
}

/** Picture file -> layers (depth model + split). */
export async function pictureToLayers(file, fit = DEFAULT_FIT, opts = {}) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const disp = await estimateDisparity(bmp, opts);
  const out = await splitLayers(bmp, disp, fit, opts); bmp.close();
  return out;
}
/** Split a picture backdrop made earlier in the editor (no depth model run). */
export async function backdropToLayers(getBlob, meta, fit, opts = {}) {
  if (!meta.disparity) throw new Error('This backdrop was not made in the editor; make it again from a picture.');
  const [src, dpng] = await Promise.all([getBlob('source.jpg'), getBlob(meta.disparity.file)]);
  const bmp = await createImageBitmap(src), disp = await readDisparity(dpng, meta.disparity.range);
  const out = await splitLayers(bmp, disp, fit, opts); bmp.close();
  return out;
}
