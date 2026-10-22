// AI fill (inpainting) with LaMa (Apache-2.0, ONNX, 512 x 512), in the browser.
// Fills what is hidden behind objects, so moving the camera shows believable
// background instead of a smear. Runs only where the mask has pixels: the mask
// is covered with 512-px squares (with context around the hole), each filled
// by the model and blended back softly.
//
// Model: inputs image [1,3,512,512] 0..1 RGB and mask [1,1,512,512] (1 = fill),
// output [1,3,512,512] (0..255; 0..1 is detected too).

export const DEFAULT_INPAINT_MODEL = 'https://huggingface.co/Carve/LaMa-ONNX/resolve/main/lama_fp32.onnx';
const ORT_CDN = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.30.0/dist/';
const S = 512;
const tick = () => new Promise(r => setTimeout(r, 0));

let session = null, sessionKey = '';
async function fetchCached(url, onProgress) {
  let cache = null;
  try { cache = await caches.open('claypixels-models-v1'); const hit = await cache.match(url); if (hit) return new Uint8Array(await hit.arrayBuffer()); } catch { cache = null; }
  const r = await fetch(url);
  if (!r.ok) throw new Error(`AI fill model download failed (${r.status})`);
  const total = +r.headers.get('content-length') || 0, reader = r.body.getReader(), parts = [];
  let got = 0, last = 0;
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    parts.push(value); got += value.length;
    if (got - last > 2e6) { last = got; onProgress?.(total ? `Downloading the AI fill model ${Math.round(got / total * 100)}% (once, then kept in this browser)` : `Downloading the AI fill model ${(got / 1e6).toFixed(0)} MB`); }
  }
  const buf = new Uint8Array(got); let o = 0; for (const p of parts) { buf.set(p, o); o += p.length; }
  try { await cache?.put(url, new Response(buf, { headers: { 'content-type': 'application/octet-stream' } })); } catch { }
  return buf;
}
async function getSession({ inpaintModelUrl = DEFAULT_INPAINT_MODEL, wasmPaths = ORT_CDN, onProgress } = {}) {
  const key = inpaintModelUrl + '|' + wasmPaths;
  if (session && sessionKey === key) return session;
  const ort = await import('onnxruntime-web/webgpu');
  ort.env.wasm.wasmPaths = wasmPaths; ort.env.logLevel = 'error';
  ort.env.wasm.numThreads = globalThis.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 2) : 1;
  const bytes = await fetchCached(inpaintModelUrl, onProgress);
  onProgress?.('Starting the AI fill model…');
  let s = null, ep = 'wasm';
  if (navigator.gpu) { try { s = await ort.InferenceSession.create(bytes, { executionProviders: ['webgpu'], logSeverityLevel: 3 }); ep = 'webgpu'; } catch (e) { console.warn('[inpaint] WebGPU failed, using WebAssembly', e); } }
  if (!s) s = await ort.InferenceSession.create(bytes, { executionProviders: ['wasm'], logSeverityLevel: 3 });
  const maskName = s.inputNames.find(n => /mask/i.test(n)) || s.inputNames[1], imageName = s.inputNames.find(n => n !== maskName);
  session = { ort, s, ep, maskName, imageName }; sessionKey = key;
  return session;
}

// squares that together cover every mask pixel (with `pad` context around holes)
export function planTiles(mask, w, h, { size = S, pad = 48 } = {}) {
  const tiles = [], covered = new Uint8Array(w * h), inner = size - pad * 2;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; if (!mask[i] || covered[i]) continue;
    // a square whose inner part starts at this pixel's row and is centred on the run
    let x1 = x; while (x1 + 1 < w && mask[y * w + x1 + 1] && x1 - x < inner) x1++;
    const cx = Math.round((x + x1) / 2), cy = y + Math.round(inner / 2);
    const tx = Math.max(0, Math.min(w - size, cx - size / 2)), ty = Math.max(0, Math.min(h - size, cy - size / 2));
    const sx = Math.min(size, w), sy = Math.min(size, h);
    tiles.push([tx, ty, sx, sy]);
    // inner region counts as done (edges get context from the next square)
    const ix0 = tx + (tx > 0 ? pad : 0), iy0 = ty + (ty > 0 ? pad : 0), ix1 = tx + sx - (tx + sx < w ? pad : 0), iy1 = ty + sy - (ty + sy < h ? pad : 0);
    for (let yy = iy0; yy < iy1; yy++) for (let xx = ix0; xx < ix1; xx++) covered[yy * w + xx] = 1;
    if (tiles.length > 400) break;
  }
  return tiles;
}

/**
 * Fill the masked pixels of an ImageData in place.
 * mask: Uint8Array w*h (1 = fill). Returns how many squares were filled.
 * Big pictures are worked on at a lower scale when there would be too many squares.
 */
export async function inpaint(im, mask, opts = {}) {
  const { onProgress, maxTiles = 40 } = opts;
  const { ort, s, maskName, imageName, ep } = await getSession(opts);
  // choose a working scale so the squares stay few
  let scale = 1, W = im.width, H = im.height, wm = mask, tiles;
  for (;;) {
    W = Math.round(im.width * scale); H = Math.round(im.height * scale);
    if (scale < 1) {
      wm = new Uint8Array(W * H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        // any masked source pixel under this one
        const sx0 = Math.floor(x / scale), sy0 = Math.floor(y / scale), sx1 = Math.min(im.width, Math.ceil((x + 1) / scale)), sy1 = Math.min(im.height, Math.ceil((y + 1) / scale));
        let m = 0; for (let yy = sy0; yy < sy1 && !m; yy++) for (let xx = sx0; xx < sx1; xx++) if (mask[yy * im.width + xx]) { m = 1; break; }
        wm[y * W + x] = m;
      }
    }
    tiles = planTiles(wm, W, H);
    if (tiles.length <= maxTiles || scale <= 0.26) break;
    scale *= 0.7;
  }
  if (!tiles.length) return 0;
  const src = new OffscreenCanvas(im.width, im.height); src.getContext('2d').putImageData(im, 0, 0);
  const work = new OffscreenCanvas(W, H), wg = work.getContext('2d', { willReadFrequently: true });
  wg.imageSmoothingQuality = 'high'; wg.drawImage(src, 0, 0, W, H);
  const wim = wg.getImageData(0, 0, W, H), out = new Float32Array(W * H * 3), wsum = new Float32Array(W * H);
  const img = new Float32Array(3 * S * S), msk = new Float32Array(S * S);
  for (let t = 0; t < tiles.length; t++) {
    const [tx, ty, sx, sy] = tiles[t];
    onProgress?.(`AI fill ${t + 1} / ${tiles.length}${ep === 'webgpu' ? '' : ' (processor, slower)'}…`);
    await tick();
    img.fill(0); msk.fill(0);
    for (let y = 0; y < sy; y++) for (let x = 0; x < sx; x++) {
      const i = (ty + y) * W + tx + x, k = y * S + x, m = wm[i];
      msk[k] = m;
      for (let c = 0; c < 3; c++) img[c * S * S + k] = m ? 0 : wim.data[i * 4 + c] / 255;
    }
    const res = await s.run({ [imageName]: new ort.Tensor('float32', img, [1, 3, S, S]), [maskName]: new ort.Tensor('float32', msk, [1, 1, S, S]) });
    const o = res[s.outputNames[0]].data;
    let mx = 0; for (let i = 0; i < o.length; i += 97) mx = Math.max(mx, o[i]);
    const mul = mx > 2 ? 1 : 255;
    // soft weight: strongest in the middle of the square, so overlapping squares blend
    for (let y = 0; y < sy; y++) for (let x = 0; x < sx; x++) {
      const i = (ty + y) * W + tx + x; if (!wm[i]) continue;
      const k = y * S + x, ex = Math.min(x + 1, sx - x), ey = Math.min(y + 1, sy - y), wgt = Math.min(1, Math.min(ex, ey) / 32) + 1e-3;
      for (let c = 0; c < 3; c++) out[i * 3 + c] += Math.min(255, Math.max(0, o[c * S * S + k] * mul)) * wgt;
      wsum[i] += wgt;
    }
  }
  // back to full size: masked pixels take the filled colour (upscaled), feathered 1 px at the mask edge
  const fill = new ImageData(W, H);
  for (let i = 0; i < W * H; i++) {
    if (wsum[i] > 0) { for (let c = 0; c < 3; c++) fill.data[i * 4 + c] = out[i * 3 + c] / wsum[i]; }
    else for (let c = 0; c < 3; c++) fill.data[i * 4 + c] = wim.data[i * 4 + c];
    fill.data[i * 4 + 3] = 255;
  }
  const fc = new OffscreenCanvas(W, H); fc.getContext('2d').putImageData(fill, 0, 0);
  const big = new OffscreenCanvas(im.width, im.height), bg = big.getContext('2d', { willReadFrequently: true });
  bg.imageSmoothingQuality = 'high'; bg.drawImage(fc, 0, 0, im.width, im.height);
  const up = bg.getImageData(0, 0, im.width, im.height).data, w = im.width, h = im.height;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; if (!mask[i]) continue;
    // pixels right at the hole's edge blend half with the original for a seamless join
    const edge = (x > 0 && !mask[i - 1]) || (x < w - 1 && !mask[i + 1]) || (y > 0 && !mask[i - w]) || (y < h - 1 && !mask[i + w]);
    const a = edge ? 0.5 : 1;
    for (let c = 0; c < 3; c++) im.data[i * 4 + c] = im.data[i * 4 + c] * (1 - a) + up[i * 4 + c] * a;
  }
  return tiles.length;
}
