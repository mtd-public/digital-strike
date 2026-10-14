// The island: a pure height function (no three.js) shared by the sim (ground, altitude, water) and the
// renderer (the terrain mesh and its colours). Sea level is y = 0.
//
// Shape: a squarish superellipse with a wobbly coast, sea floor outside, rolling land inside, gaussian
// hills, and flat pads (the city, the airbase, the harbour quay, the LZ) blended in with soft edges.
// Sampled once into a grid (TERRAIN_STEP) so groundAt() is a cheap bilinear lookup every frame.

const TERRAIN_STEP = 2; // m between samples

function hash2(ix, iz) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz), b = hash2(ix + 1, iz), c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, z, oct = 4) {
  let s = 0, amp = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { s += amp * vnoise(x * f, z * f); f *= 2.03; amp *= 0.5; }
  return s / (1 - Math.pow(0.5, oct)); // 0..1
}
const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

// Distance from (x, z) to a polyline [[x, z], ...].
export function polyDist(pts, x, z) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return best;
}

// Raw height from a level's island description (js/sim/levels/*.js `island`):
//   blobs     land masses: superellipses { x, z, rx, rz, pow } with a wobbly coast (unioned)
//   channels  sea lanes carved through the land { pts, w, edge } (the strait)
//   hills     gaussian bumps [x, z, height, radius]
//   flats     pads blended in last { x0, x1, z0, z1, h, edge }
export function islandHeight(I, x, z) {
  let land = 0;
  for (const B of I.blobs) {
    const lx = x - B.x, lz = z - B.z, a = Math.atan2(lz, lx);
    const wob = 1 + 0.05 * Math.sin(3 * a + 1.1 + B.x * 0.01) + 0.035 * Math.sin(7 * a + 2.3) + 0.06 * (fbm(Math.cos(a) * 3 + 11 + B.z * 0.01, Math.sin(a) * 3 + 7, 3) - 0.5);
    const r = Math.pow(Math.pow(Math.abs(lx) / B.rx, B.pow) + Math.pow(Math.abs(lz) / B.rz, B.pow), 1 / B.pow) / wob;
    land = Math.max(land, smooth(1.02, 0.84, r)); // 1 inland, 0 out at sea
  }
  for (const C of I.channels || []) {
    const d = polyDist(C.pts, x, z) + (fbm(x / 40, z / 40, 2) - 0.5) * C.w * 0.25;
    land *= smooth(C.w / 2, C.w / 2 + C.edge, d);
  }
  let hl = I.land + (fbm(x / 70 + 3, z / 70 + 9) - 0.5) * (I.rough ?? 5);
  for (const [hx, hz, hh, hr] of I.hills) { const d2 = (x - hx) ** 2 + (z - hz) ** 2; hl += hh * Math.exp(-d2 / (hr * hr)); }
  let h = I.sea + (hl - I.sea) * land;
  for (const f of I.flats) {
    const dx = Math.max(f.x0 - x, 0, x - f.x1), dz = Math.max(f.z0 - z, 0, z - f.z1);
    const w = 1 - smooth(0, f.edge, Math.hypot(dx, dz));
    if (w > 0) h += (f.h - h) * w;
  }
  return h;
}

export class Terrain {
  constructor(I) {
    this.I = I;
    const step = (this.step = I.step || TERRAIN_STEP);
    this.x0 = -I.half; this.z0 = -I.half;
    this.n = Math.round((I.half * 2) / step) + 1;
    this.h = new Float32Array(this.n * this.n);
    for (let j = 0; j < this.n; j++) for (let i = 0; i < this.n; i++) this.h[j * this.n + i] = islandHeight(I, this.x0 + i * step, this.z0 + j * step);
  }
  // Terrain height (may be under the sea).
  height(x, z) {
    const n = this.n, fx = Math.min(n - 1.001, Math.max(0, (x - this.x0) / this.step)), fz = Math.min(n - 1.001, Math.max(0, (z - this.z0) / this.step));
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, H = this.h;
    const a = H[j * n + i], b = H[j * n + i + 1], c = H[(j + 1) * n + i], d = H[(j + 1) * n + i + 1];
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  // What a projectile or the chopper's altimeter sees: the land, or the sea surface over it.
  surface(x, z) { return Math.max(0, this.height(x, z)); }
  isWater(x, z) { return this.height(x, z) < 0.15; }
  slope(x, z) { const e = 2; return Math.hypot(this.height(x + e, z) - this.height(x - e, z), this.height(x, z + e) - this.height(x, z - e)) / (2 * e); }
}
