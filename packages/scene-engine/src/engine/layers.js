// Layered 2.5D: several prepared pictures (PNG with transparency) standing at
// chosen distances in front of the camera, like flats on a theatre stage.
//
// layers.json (scene.json files.layers):
// { "camera": { "position": [0, 1.6, 0], "vfov": 40, "pitch": -5, "yaw": 0, "roll": 0 },
//   "width": 1920, "height": 1080,                      frame size (aspect of the composition)
//   "layers": [{ "id", "name", "file": "layers/sky.png",
//      "fit": "frame" | "piece",                         whole frame, or a cut-out placed by hand
//      "x": 0.5, "y": 0.5, "size": 0.3,                  piece: centre in the frame (0..1) and width (share of frame width)
//      "distance": 12,                                   metres from the camera
//      "relief": 0, "disp": "layers/sky_disp.png",       optional rounded depth inside the layer (0..1)
//      "floor": false,                                   lies flat on the ground below the horizon: models walk on it
//      "visible": true }] }
// Seen from the camera, a layer always looks exactly as composed: moving it
// farther only changes how much it shifts when the camera moves.

import * as THREE from 'three/webgpu';
import { decodePNG } from './png16.js';

export const LAYERS_DEFAULT_CAMERA = { position: [0, 1.6, 0], vfov: 40, pitch: -5, yaw: 0, roll: 0 };

function basis(c) {
  const p = THREE.MathUtils.degToRad(c.pitch || 0), y = THREE.MathUtils.degToRad(c.yaw || 0);
  const fwd = new THREE.Vector3(-Math.sin(y) * Math.cos(p), Math.sin(p), -Math.cos(y) * Math.cos(p));
  const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
  const up = new THREE.Vector3().crossVectors(right, fwd);
  return { fwd, right, up };
}

// per file: texture, size, a small alpha mask (for picking) and relief data
const cache = new Map();
async function loadImage(url) {
  if (cache.has(url)) return cache.get(url);
  const p = (async () => {
    const blob = await (await fetch(url)).blob();
    const bmp = await createImageBitmap(blob, { premultiplyAlpha: 'none', imageOrientation: 'from-image' });
    const tex = new THREE.Texture(bmp); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8; tex.flipY = false; tex.needsUpdate = true; // uv v runs from the top
    const mw = 128, mh = Math.max(1, Math.round(128 * bmp.height / bmp.width));
    const c = new OffscreenCanvas(mw, mh), g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(bmp, 0, 0, mw, mh);
    const px = g.getImageData(0, 0, mw, mh).data, alpha = new Uint8Array(mw * mh);
    for (let i = 0; i < alpha.length; i++) alpha[i] = px[i * 4 + 3];
    return { tex, w: bmp.width, h: bmp.height, alpha, mw, mh };
  })();
  cache.set(url, p);
  p.catch(() => cache.delete(url));
  return p;
}
const dispCache = new Map();
async function loadDisp(url) {
  if (!dispCache.has(url)) dispCache.set(url, (async () => {
    const png = await decodePNG(await (await fetch(url)).arrayBuffer()), d = new Float32Array(png.w * png.h);
    for (let y = 0; y < png.h; y++) for (let x = 0; x < png.w; x++) d[y * png.w + x] = png.get(x, y, 0) / (png.bitDepth === 16 ? 65535 : 255);
    return { d, w: png.w, h: png.h };
  })().catch(e => { dispCache.delete(url); throw e; }));
  return dispCache.get(url);
}
const sample = (D, u, v) => { // bilinear, u v in 0..1 (v from the top)
  const x = Math.min(D.w - 1, Math.max(0, u * D.w - 0.5)), y = Math.min(D.h - 1, Math.max(0, v * D.h - 0.5));
  const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(D.w - 1, x0 + 1), y1 = Math.min(D.h - 1, y0 + 1), tx = x - x0, ty = y - y0;
  return (D.d[y0 * D.w + x0] * (1 - tx) + D.d[y0 * D.w + x1] * tx) * (1 - ty) + (D.d[y1 * D.w + x0] * (1 - tx) + D.d[y1 * D.w + x1] * tx) * ty;
};

/** Where a layer sits in the frame: [x0, y0, x1, y1] in frame fractions (y from the top). */
export function layerRect(def, l, img) {
  if (l.fit !== 'piece') return [0, 0, 1, 1];
  const A = (def.width || 16) / (def.height || 9), w = l.size ?? 0.3, h = w * A * (img ? img.h / img.w : 1);
  const cx = l.x ?? 0.5, cy = l.y ?? 0.5;
  return [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2];
}

function layerMesh(def, l, img, disp) {
  const cam = { ...LAYERS_DEFAULT_CAMERA, ...(def.camera || {}) }, { fwd, right, up } = basis(cam);
  const o = new THREE.Vector3().fromArray(cam.position), A = (def.width || 16) / (def.height || 9);
  const tv = Math.tan(THREE.MathUtils.degToRad(cam.vfov) / 2), D = Math.max(0.2, l.distance ?? 10);
  const [x0, y0, x1, y1] = layerRect(def, l, img);
  const shaped = l.floor || (l.relief > 0 && disp);
  const N = shaped ? 96 : 1, M = shaped ? Math.max(2, Math.round(96 * (y1 - y0) / Math.max(1e-6, (x1 - x0) * A))) : 1;
  const pos = new Float32Array((N + 1) * (M + 1) * 3), uv = new Float32Array((N + 1) * (M + 1) * 2), dir = new THREE.Vector3();
  for (let j = 0; j <= M; j++) for (let i = 0; i <= N; i++) {
    const s = i / N, t = j / M, k = j * (N + 1) + i;
    const fx = x0 + s * (x1 - x0), fy = y0 + t * (y1 - y0);
    dir.copy(fwd).addScaledVector(right, (fx - 0.5) * 2 * tv * A).addScaledVector(up, (0.5 - fy) * 2 * tv);
    let z = D;
    if (l.floor && dir.y < -1e-4) z = Math.min(D, (0 - o.y) / dir.y);      // lies on the ground below the horizon
    else if (l.relief > 0 && disp) z = D * (1 + (l.relief || 0) * 0.35 * (1 - 2 * sample(disp, s, t))); // near parts come forward
    pos[k * 3] = o.x + dir.x * z; pos[k * 3 + 1] = o.y + dir.y * z; pos[k * 3 + 2] = o.z + dir.z * z;
    uv[k * 2] = s; uv[k * 2 + 1] = t;
  }
  const idx = [];
  for (let j = 0; j < M; j++) for (let i = 0; i < N; i++) { const a = j * (N + 1) + i, b = a + 1, c = a + N + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(idx);
  g.computeBoundingSphere();
  const m = new THREE.Mesh(g, new THREE.MeshBasicNodeMaterial({ map: img.tex, transparent: true, alphaTest: 0.08, depthWrite: true, side: THREE.DoubleSide, toneMapped: false, fog: false }));
  m.renderOrder = 1000 - Math.round(D * 10); // far first
  m.frustumCulled = false; m.userData.layer = l.id; m.userData.img = img;
  return m;
}

/** Build all layers; returns { group, floor (group of floor layers), meta (for the hero camera) }. */
export async function buildLayers(def, base, { bust = '' } = {}) {
  const q = bust ? `?v=${bust}` : '';
  const group = new THREE.Group(); group.name = 'layers';
  const floor = new THREE.Group(); floor.name = 'layer-floor'; group.add(floor);
  const list = (def.layers || []).filter(l => l.visible !== false && l.file);
  const built = await Promise.all(list.map(async l => {
    try {
      const img = await loadImage(`${base}/${l.file}${q}`);
      const disp = l.relief > 0 && l.disp ? await loadDisp(`${base}/${l.disp}${q}`).catch(() => null) : null;
      return layerMesh(def, l, img, disp);
    } catch (e) { console.warn('[layers]', l.file, e); return null; }
  }));
  built.forEach((m, i) => { if (m) (list[i].floor ? floor : group).add(m); });
  const cam = { ...LAYERS_DEFAULT_CAMERA, ...(def.camera || {}) };
  return { group, floor, meta: { camera: cam, width: def.width || 1920, height: def.height || 1080, far: 80 } };
}

/** The visible layer under a ray (alpha-aware), or null. */
export function pickLayer(group, raycaster) {
  const hits = raycaster.intersectObject(group, true);
  for (const h of hits) {
    const img = h.object.userData.img; if (!img || !h.uv) continue;
    const x = Math.min(img.mw - 1, Math.floor(h.uv.x * img.mw)), y = Math.min(img.mh - 1, Math.floor(h.uv.y * img.mh));
    if (img.alpha[y * img.mw + x] > 100) return h.object.userData.layer;
  }
  return null;
}

/** Forget cached files (after replacing an image or its depth). */
export function forgetLayerFile(url) { for (const k of [...cache.keys()]) if (k.startsWith(url)) cache.delete(k); for (const k of [...dispCache.keys()]) if (k.startsWith(url)) dispCache.delete(k); }
