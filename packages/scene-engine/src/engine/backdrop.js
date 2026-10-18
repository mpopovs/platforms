// 2.5D backdrop: the reference image displaced by its depth map, in two layers.
// Front layer = the image, cut wherever depth jumps (no rubber sheets).
// Back layer = pushed back and inpainted, fills the gaps the cuts open up
// when the camera moves a little. Both are opaque and write depth, so
// capybaras go behind rocks and posts correctly.
// Made by tools/make_depth_backdrop.py.

import * as THREE from 'three/webgpu';

async function readDepth(url) {
  const blob = await (await fetch(url)).blob();
  const bmp = await createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  const c = new OffscreenCanvas(bmp.width, bmp.height), g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(bmp, 0, 0);
  const px = g.getImageData(0, 0, bmp.width, bmp.height).data;
  const d = new Float32Array(bmp.width * bmp.height);
  for (let i = 0; i < d.length; i++) d[i] = (px[i * 4] * 256 + px[i * 4 + 1]) * 0.001; // mm -> m
  return { d, w: bmp.width, h: bmp.height };
}

function cameraBasis(c) {
  const p = THREE.MathUtils.degToRad(c.pitch), y = THREE.MathUtils.degToRad(c.yaw), r = THREE.MathUtils.degToRad(c.roll || 0);
  const fwd = new THREE.Vector3(-Math.sin(y) * Math.cos(p), Math.sin(p), -Math.cos(y) * Math.cos(p));
  let right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
  let up = new THREE.Vector3().crossVectors(right, fwd);
  if (r) { const r2 = right.clone().multiplyScalar(Math.cos(r)).addScaledVector(up, Math.sin(r)); up = right.clone().multiplyScalar(-Math.sin(r)).addScaledVector(up, Math.cos(r)); right = r2; }
  return { fwd, right, up };
}

// build a displaced grid; step = take every n-th depth sample; cut = log-depth jump that splits the mesh
function layerMesh(dep, cam, { step = 1, cut = 0, map, renderOrder = 0 }) {
  const { fwd, right, up } = cameraBasis(cam);
  const W = Math.floor((dep.w - 1) / step) + 1, H = Math.floor((dep.h - 1) / step) + 1;
  const fy = (dep.h / 2) / Math.tan(THREE.MathUtils.degToRad(cam.vfov) / 2);
  const pos = new Float32Array(W * H * 3), uv = new Float32Array(W * H * 2), lz = new Float32Array(W * H);
  const o = cam.position;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const u = Math.min(i * step, dep.w - 1), v = Math.min(j * step, dep.h - 1), k = j * W + i;
    const z = dep.d[v * dep.w + u];
    const a = (u + 0.5 - dep.w / 2) / fy, b = (dep.h / 2 - v - 0.5) / fy;
    pos[k * 3] = o[0] + z * (fwd.x + right.x * a + up.x * b);
    pos[k * 3 + 1] = o[1] + z * (fwd.y + right.y * a + up.y * b);
    pos[k * 3 + 2] = o[2] + z * (fwd.z + right.z * a + up.z * b);
    uv[k * 2] = (u + 0.5) / dep.w; uv[k * 2 + 1] = 1 - (v + 0.5) / dep.h;
    lz[k] = Math.log(z);
  }
  const idx = [];
  for (let j = 0; j < H - 1; j++) for (let i = 0; i < W - 1; i++) {
    const a = j * W + i, b = a + 1, c = a + W, d = c + 1;
    if (cut) {
      const mn = Math.min(lz[a], lz[b], lz[c], lz[d]), mx = Math.max(lz[a], lz[b], lz[c], lz[d]);
      if (mx - mn > cut) continue; // depth edge: leave a gap, the back layer shows through
    }
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  const m = new THREE.Mesh(g, new THREE.MeshBasicNodeMaterial({ map, toneMapped: false, fog: false }));
  m.renderOrder = renderOrder; m.frustumCulled = false;
  return m;
}

export async function loadDepthBackdrop(url, { phone = false, bust = '' } = {}) {
  const base = url.slice(0, url.lastIndexOf('/') + 1);
  const q = bust ? `?v=${bust}` : ''; // after an upload, make the browser fetch the new files
  const meta = await (await fetch(url + q)).json();
  const tl = new THREE.TextureLoader();
  const tex = async f => { const t = await tl.loadAsync(base + f + q); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.generateMipmaps = true; return t; };
  const [front, back, cf, cb] = await Promise.all([readDepth(base + 'depth.png' + q), readDepth(base + 'depth_bg.png' + q), tex('color.jpg'), tex('color_bg.jpg')]);
  const step = phone ? 2 : 1;
  const group = new THREE.Group();
  const frontMesh = layerMesh(front, meta.camera, { step, cut: 0.05 * step, map: cf });
  const backMesh = layerMesh(back, meta.camera, { step: step * 2, map: cb, renderOrder: -1 });
  group.add(backMesh, frontMesh);
  return { group, front: frontMesh, back: backMesh, meta };
}
