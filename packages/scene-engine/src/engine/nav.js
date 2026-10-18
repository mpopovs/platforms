// Navigation for the capybaras: a walk/swim grid built from zones.json,
// A* paths with smoothing, and spot picking that avoids crowding.
//
// zones.json (edited in the page with ?edit=1):
//   water:   { y, polygon: [[x, z], ...] }                 live water + swim area
//   walk:    [{ name, polygon, y? }]                        where capybaras may walk; y = fixed height (terrace)
//   blocked: [{ name, polygon }]                            never walk here (rocks, posts, trees)
//   spots:   [{ type: 'rest' | 'start' | 'entry', x, z }]   favourite places; entry = where they get in/out of the water

export const CELL = 0.2;

// ---------------------------------------------------------------- polygon helpers
export function polyContains(poly, x, z) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
export function polyEdgeDist(poly, x, z) {
  let d = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, az] = poly[j], [bx, bz] = poly[i], ex = bx - ax, ez = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez || 1)));
    d = Math.min(d, Math.hypot(x - ax - t * ex, z - az - t * ez));
  }
  return d;
}
export function polyCentroid(poly) {
  let a = 0, cx = 0, cz = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j], f = xj * zi - xi * zj;
    a += f; cx += (xi + xj) * f; cz += (zi + zj) * f;
  }
  if (Math.abs(a) < 1e-9) return [poly[0][0], poly[0][1]];
  return [cx / (3 * a), cz / (3 * a)];
}

// ---------------------------------------------------------------- grid
const LAND = 1, WATER = 2;

export class Nav {
  // groundY(x, z): terrain height; fallbackWalk(x, z, g): used when zones has no walk areas
  constructor(zones, groundY, { bounds = { x0: -16, x1: 16, z0: -26, z1: 6 }, fallbackWalk = null, waterMargin = 0.3 } = {}) {
    this.z = zones; this.groundY = groundY; this.b = bounds;
    this.W = Math.ceil((bounds.x1 - bounds.x0) / CELL); this.H = Math.ceil((bounds.z1 - bounds.z0) / CELL);
    const N = this.W * this.H;
    this.type = new Uint8Array(N); this.hgt = new Float32Array(N); this.deep = new Uint8Array(N);
    const water = zones.water?.polygon?.length > 2 ? zones.water.polygon : null;
    const walks = (zones.walk || []).filter(w => w.polygon?.length > 2);
    const blocked = (zones.blocked || []).filter(w => w.polygon?.length > 2);
    for (let zi = 0; zi < this.H; zi++) for (let xi = 0; xi < this.W; xi++) {
      const k = zi * this.W + xi, x = this.cx(xi), z = this.cz(zi);
      if (blocked.some(b => polyContains(b.polygon, x, z))) continue;
      if (water && polyContains(water, x, z)) {
        this.type[k] = WATER; this.hgt[k] = zones.water.y;
        if (polyEdgeDist(water, x, z) >= waterMargin) this.deep[k] = 1; // targets stay off the rim
        continue;
      }
      let w = null;
      for (const a of walks) if (polyContains(a.polygon, x, z)) { w = a; if (a.y != null) break; }
      if (w) { this.type[k] = LAND; this.hgt[k] = w.y != null ? w.y : groundY(x, z); }
      else if (!walks.length && fallbackWalk) {
        const g = groundY(x, z);
        if (fallbackWalk(x, z, g)) { this.type[k] = LAND; this.hgt[k] = g; }
      }
    }
    // keep a body-width away from blocked edges: drop land cells touching nothing-cells
    const t2 = this.type.slice();
    for (let zi = 1; zi < this.H - 1; zi++) for (let xi = 1; xi < this.W - 1; xi++) {
      const k = zi * this.W + xi; if (this.type[k] !== LAND) continue;
      let open = 0;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (this.type[k + dz * this.W + dx]) open++;
      if (open < 3) t2[k] = 0;
    }
    this.type = t2;
    // where land meets water: allowed crossings (near entry spots if there are any)
    const entries = (zones.spots || []).filter(s => s.type === 'entry');
    this.cross = new Uint8Array(N);
    for (let zi = 1; zi < this.H - 1; zi++) for (let xi = 1; xi < this.W - 1; xi++) {
      const k = zi * this.W + xi; if (!this.type[k]) continue;
      if (entries.length && !entries.some(s => Math.hypot(s.x - this.cx(xi), s.z - this.cz(zi)) < 0.9)) continue;
      for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
        const q = this.type[k + dz * this.W + dx];
        if (q && q !== this.type[k]) this.cross[k] = 1;
      }
    }
    this.land = []; this.water = [];
    for (let k = 0; k < N; k++) { if (this.type[k] === LAND) this.land.push(k); else if (this.type[k] === WATER && this.deep[k]) this.water.push(k); }
  }
  cx(xi) { return this.b.x0 + (xi + 0.5) * CELL; }
  cz(zi) { return this.b.z0 + (zi + 0.5) * CELL; }
  key(x, z) {
    const xi = Math.floor((x - this.b.x0) / CELL), zi = Math.floor((z - this.b.z0) / CELL);
    if (xi < 0 || zi < 0 || xi >= this.W || zi >= this.H) return -1;
    return zi * this.W + xi;
  }
  kind(x, z) { const k = this.key(x, z); return k < 0 ? 0 : this.type[k]; }
  isWater(x, z) { return this.kind(x, z) === WATER; }
  isLand(x, z) { return this.kind(x, z) === LAND; }
  height(x, z) { const k = this.key(x, z); return k >= 0 && this.type[k] ? this.hgt[k] : this.groundY(x, z); }
  // nearest open cell (for capybaras pushed into a wall, or clicks just outside)
  nearestOpen(x, z, kind = 0, maxR = 3) {
    const k0 = this.key(x, z);
    if (k0 >= 0 && this.type[k0] && (!kind || this.type[k0] === kind)) return [x, z];
    const xi0 = Math.floor((x - this.b.x0) / CELL), zi0 = Math.floor((z - this.b.z0) / CELL);
    for (let r = 1; r <= maxR / CELL; r++) {
      let best = null, bd = Infinity;
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const xi = xi0 + dx, zi = zi0 + dz; if (xi < 0 || zi < 0 || xi >= this.W || zi >= this.H) continue;
        const t = this.type[zi * this.W + xi]; if (!t || (kind && t !== kind)) continue;
        const d = dx * dx + dz * dz; if (d < bd) { bd = d; best = [this.cx(xi), this.cz(zi)]; }
      }
      if (best) return best;
    }
    return null;
  }
  randomCell(kind) {
    const list = kind === WATER ? this.water : this.land;
    if (!list.length) return null;
    const k = list[Math.floor(Math.random() * list.length)];
    return [this.cx(k % this.W) + (Math.random() - 0.5) * CELL, this.cz(Math.floor(k / this.W)) + (Math.random() - 0.5) * CELL];
  }

  // A* on the grid; land<->water only through crossing cells. Returns [[x, z], ...] or null.
  path(ax, az, bx, bz) {
    let s = this.key(ax, az), g = this.key(bx, bz);
    if (s < 0 || !this.type[s]) { const p = this.nearestOpen(ax, az); if (!p) return null; s = this.key(p[0], p[1]); }
    if (g < 0 || !this.type[g]) { const p = this.nearestOpen(bx, bz); if (!p) return null; g = this.key(p[0], p[1]); }
    const W = this.W, N = this.type.length, gx = g % W, gz = (g / W) | 0;
    const cost = new Float32Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
    const heap = [[0, s]]; cost[s] = 0;
    const push = (f, k) => { heap.push([f, k]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
    const H = k => { const dx = Math.abs(k % W - gx), dz = Math.abs(((k / W) | 0) - gz); return (dx + dz + (Math.SQRT2 - 2) * Math.min(dx, dz)); };
    let found = false, iter = 0;
    while (heap.length && iter++ < 60000) {
      const [, k] = pop(); if (closed[k]) continue; closed[k] = 1;
      if (k === g) { found = true; break; }
      const xi = k % W, zi = (k / W) | 0, tk = this.type[k];
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const nx = xi + dx, nz = zi + dz; if (nx < 0 || nz < 0 || nx >= W || nz >= this.H) continue;
        const n = nz * W + nx, tn = this.type[n]; if (!tn || closed[n]) continue;
        if (dx && dz && (!this.type[zi * W + nx] || !this.type[nz * W + xi])) continue; // no corner cutting
        if (tn !== tk && !(this.cross[k] || this.cross[n])) continue;
        const c = cost[k] + (dx && dz ? Math.SQRT2 : 1) * (tn === WATER ? 1.15 : 1);
        if (c < cost[n]) { cost[n] = c; from[n] = k; push(c + H(n), n); }
      }
    }
    if (!found) return null;
    const cells = []; for (let k = g; k !== -1; k = from[k]) cells.push(k);
    cells.reverse();
    // string-pulling: skip cells while the straight line stays on one kind of cell
    const out = [[ax, az]];
    let i = 0;
    while (i < cells.length - 1) {
      let j = cells.length - 1;
      for (; j > i + 1; j--) if (this.clear(cells[i], cells[j])) break;
      out.push([this.cx(cells[j] % W), this.cz((cells[j] / W) | 0)]);
      i = j;
    }
    out[out.length - 1] = this.type[this.key(bx, bz)] ? [bx, bz] : out[out.length - 1];
    return out;
  }
  clear(a, b) {
    const W = this.W, ta = this.type[a];
    const x0 = this.cx(a % W), z0 = this.cz((a / W) | 0), x1 = this.cx(b % W), z1 = this.cz((b / W) | 0);
    const steps = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / (CELL * 0.5));
    for (let s = 1; s <= steps; s++) {
      const t = s / steps, k = this.key(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t);
      if (k < 0 || this.type[k] !== ta) return false;
    }
    return true;
  }
}
export const KIND = { LAND, WATER };
