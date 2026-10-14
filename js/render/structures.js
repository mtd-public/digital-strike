// Buildings, built in the vertex-colour kit (one or two draw calls each). Origin on the ground at the
// footprint centre, +Z is the front. Where they come from:
//   dataHall / dataCore   Vertical-Vantage OCEAN CORE: 'oc-dc' data hall (graphite walls, cooling-fin ribs,
//                         rack-LED bands, neon crown, roof fans), 'oc-cooling' hyperboloid cooling towers,
//                         'oc-chiller' roof chillers, 'oc-lattice' comms mast, 'oc-spine' data-haven tower
//   radar                 Vertical-Vantage fortress-backdrops radar() (a dish on a yoke, sweeping)
//   crane, ship, pier     Vertical-Vantage level-view crane() / ship() / pier() (HARBOR 9)
//   everything else       new, in the same kit
import * as THREE from 'three';
import { Kit, box, cyl, ball, cone, part, faces, kitMeshes, mat, glowMat, canvasTex, G } from './kit.js';
import { seg } from '../retro.js';

const NEON = [0x2be8ff, 0xff2bd6, 0x3dff7a, 0xffb02b];
const RED = 0xff2a2a;

// ------------------------------------------------------------------ data centers
function coolingTower(K, x, z, r, h, neon) {
  const n = seg(20, 10), prof = [];
  for (let i = 0; i <= 8; i++) { const t = i / 8, k = 1 - 0.16 * Math.sin(Math.PI * Math.min(1, t * 1.2)) + 0.04 * t; prof.push(new THREE.Vector2(r * k, h * (1 - t))); }
  K.add('flat', part(new THREE.LatheGeometry(prof.reverse(), n), { x, z, color: 0xd8d4cc }));
  K.add('flat', cyl(r * 0.92, r * 0.92, 1.0, n, { x, z, y: h - 1.6, color: 0xc8302a }), cyl(r * 0.88, r * 0.88, 0.1, n, { x, z, y: h - 0.2, color: 0x2e3540 }));
  K.add('glow', part(new THREE.TorusGeometry(r * 0.98, 0.12, 3, n), { rx: Math.PI / 2, x, z, y: h - 0.5, color: neon }));
  for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2; K.add('flat', box(r * 0.8, 0.06, r * 0.18, { x: x + Math.cos(a) * r * 0.35, z: z - Math.sin(a) * r * 0.35, y: h - 0.15, ry: a + 0.3, color: 0x7a8492 })); }
}
function lattice(K, x, z, w, h) {
  const hw = w / 2;
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) for (let y = 0, i = 0; y < h; y += 6, i++) K.add('flat', box(0.22, Math.min(6, h - y), 0.22, { x: x + sx * hw, y: y + Math.min(6, h - y) / 2, z: z + sz * hw, color: i % 2 ? 0xd8343c : 0xeef0f2 }));
  for (let y = 1.5; y < h; y += 3) for (const f of faces(w, w)) K.add('flat', box(f.tx ? w * 1.4 : 0.1, 0.1, f.tz ? w * 1.4 : 0.1, { x: x + f.nx * hw, y, z: z + f.nz * hw, ...(f.tx ? { rz: Math.round(y) % 2 ? 0.75 : -0.75 } : { rx: Math.round(y) % 2 ? 0.75 : -0.75 }), color: 0xc8ccd2 }));
  for (const [y, a] of [[h * 0.55, 0.4], [h * 0.75, 2.6], [h * 0.9, 4.4]]) K.add('flat', part(new THREE.CylinderGeometry(1.2, 0.35, 0.5, seg(10, 6)), { x: x + Math.cos(a) * 1.6, y, z: z + Math.sin(a) * 1.6, rz: Math.PI / 2, ry: -a, color: 0xeef0f2 }));
  K.add('glow', box(0.35, 0.35, 0.35, { x, y: h + 0.3, z, color: RED }));
  K.add('flat', box(0.08, 4, 0.08, { x, y: h + 2, z, color: 0xc8ccd2 }));
}
// The data hall ('oc-dc' stood on the ground): 22 × 14 × 7.5 m.
function hallBody(K, cx, cz, w, d, H, neon) {
  K.add('flat', box(w, H, d, { x: cx, y: H / 2, z: cz, color: 0x2a303c }));
  K.add('flat', box(w + 0.3, 0.35, d + 0.3, { x: cx, y: H + 0.17, z: cz, color: 0x5a6474 }));
  for (let x = -w / 2 + 4; x < w / 2 - 2; x += 7) K.add('flat', cyl(1.3, 1.3, 0.1, 10, { x: cx + x, y: H + 0.4, z: cz, color: 0x16181e }));
  for (const f of faces(w, d)) {
    const n = Math.floor(f.width / 1.3);
    for (let k = 0; k < n; k++) { const o = -f.width / 2 + 0.65 + k * 1.3; K.add('flat', box(f.tx ? 0.14 : 0.35, H - 1.4, f.tz ? 0.14 : 0.35, { x: cx + f.nx * (f.half + 0.15) + f.tx * o, y: H / 2 - 0.2, z: cz + f.nz * (f.half + 0.15) + f.tz * o, color: 0x4a5262 })); }
    for (const y of [2.0, 3.8, 5.6]) if (y < H - 1) for (let k = 0; k < Math.floor(f.width / 2.4); k++) {
      const o = -f.width / 2 + 1.2 + k * 2.4, c = [0x3dff7a, 0x2be8ff, 0x3dff7a, 0xffb02b, 0x3dff7a][(k + Math.round(y)) % 5];
      K.add('glow', box(f.tx ? 0.9 : 0.06, 0.14, f.tz ? 0.9 : 0.06, { x: cx + f.nx * (f.half + 0.36) + f.tx * o, y, z: cz + f.nz * (f.half + 0.36) + f.tz * o, color: c }));
    }
    K.add('glow', box(f.tx ? f.width + 0.5 : 0.16, 0.22, f.tz ? f.width + 0.5 : 0.16, { x: cx + f.nx * (f.half + 0.14), y: H - 0.4, z: cz + f.nz * (f.half + 0.14), color: neon }));
  }
}
// A security fence round [x0, x1] × [z0, z1]: posts every 3 m, two rails and a barbed top wire, a gate gap
// `gate` wide in the middle of the front (+z) side.
export function fence(K, x0, x1, z0, z1, gate = 0) {
  const sides = [[x0, z1, x1, z1, true], [x0, z0, x1, z0], [x0, z0, x0, z1], [x1, z0, x1, z1]];
  for (const [ax, az, bx, bz, front] of sides) {
    const L = Math.hypot(bx - ax, bz - az), n = Math.round(L / 3), ry = Math.atan2(-(bz - az), bx - ax);
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      if (front && Math.abs(x - (x0 + x1) / 2) < gate / 2) continue;
      K.add('flat', box(0.12, 2.6, 0.12, { x, y: 1.3, z, color: 0x7a8088 }));
    }
    const spans = front && gate ? [[ax, (x0 + x1) / 2 - gate / 2], [(x0 + x1) / 2 + gate / 2, bx]] : [[0, 0]];
    for (const [s0, s1] of spans) {
      const sx0 = front && gate ? s0 : ax, sx1 = front && gate ? s1 : bx, sz0 = front && gate ? az : az, sz1 = front && gate ? bz : bz;
      const len = Math.hypot(sx1 - sx0, sz1 - sz0), mx = (sx0 + sx1) / 2, mz = (sz0 + sz1) / 2;
      for (const [y, c, th] of [[0.9, 0x9aa0a8, 0.05], [2.0, 0x9aa0a8, 0.05], [2.6, 0x2a2a2a, 0.07]]) K.add('flat', box(len, th, th, { x: mx, y, z: mz, ry, color: c }));
      K.add('chain', box(len, 1.9, 0.02, { x: mx, y: 1.45, z: mz, ry, color: 0x8a9098 })); // the chain-link, see-through
    }
  }
}
// A concrete footing under a building: a slab poking out of the ground with a darker skirt, so buildings
// sit in the terrain instead of on it.
export function foundation(w, d) {
  const g = new THREE.Group(), K = new Kit();
  K.add('flat', box(w, 2.2, d, { y: -0.85, color: 0x6e6a60 }), box(w - 0.3, 0.06, d - 0.3, { y: 0.27, color: 0x8e8a7e }));
  for (const [x, z] of [[-w / 2 + 0.6, -d / 2 + 0.6], [w / 2 - 0.6, -d / 2 + 0.6], [-w / 2 + 0.6, d / 2 - 0.6], [w / 2 - 0.6, d / 2 - 0.6]]) K.add('flat', box(0.9, 0.08, 0.25, { x, y: 0.3, z, color: 0xf2c21a }), box(0.25, 0.08, 0.9, { x, y: 0.3, z, color: 0xf2c21a }));
  return kitMeshes(K, g);
}
export function dataHall(tint = 0) {
  const g = new THREE.Group(), K = new Kit(), neon = NEON[tint % 4];
  hallBody(K, 0, 0, 22, 14, 7.5, neon);
  for (const x of [-5.5, 4]) { K.add('flat', box(4.2, 1.3, 3.2, { x, y: 8.3, z: 2.5, color: 0xd8dce2 })); K.add('flat', cyl(0.9, 0.9, 0.08, 8, { x: x - 1, y: 9.0, z: 2.5, color: 0x22252e }), cyl(0.9, 0.9, 0.08, 8, { x: x + 1, y: 9.0, z: 2.5, color: 0x22252e })); K.add('flat', box(4.25, 0.3, 3.25, { x, y: 8.0, z: 2.5, color: 0xc8302a })); }
  coolingTower(K, -7.5, -11, 3.3, 9, neon); coolingTower(K, 0, -11, 3.3, 9, neon);
  lattice(K, 8.5, -10.5, 2.6, 17);
  K.add('flat', box(9, 0.6, 1.2, { x: -3.8, y: 0.3, z: -7.6, color: 0x7a828e })); // cable tray to the towers
  // a satellite dish on the roof, condensers along the side
  K.add('flat', part(new THREE.CylinderGeometry(1.4, 0.3, 0.5, seg(12, 8), 1, true), { x: -8, y: 9.2, z: -3.5, rx: -0.9, color: 0xe4e8ec }), cyl(0.12, 0.15, 1.6, 6, { x: -8, y: 8.3, z: -3.2, color: 0x8a929e }));
  for (let z = -4.5; z <= 4.5; z += 3) K.add('flat', box(1.6, 1.3, 2.2, { x: 12.6, y: 0.65, z, color: 0xc8ccd2 }), cyl(0.55, 0.55, 0.06, 8, { x: 12.6, y: 1.33, z, color: 0x22252e }));
  // the perimeter fence (gate in front) and floodlight poles at the corners
  fence(K, -16, 16, -17, 12, 3.5);
  for (const [x, z] of [[-14, 9], [14, 9], [-14, -9], [14, -9]]) { K.add('flat', cyl(0.12, 0.16, 6, 6, { x, y: 3, z, color: 0x8a929e }), box(0.8, 0.35, 0.5, { x, y: 6.1, z, color: 0x3a3f48 })); K.add('glow', box(0.7, 0.08, 0.4, { x, y: 5.9, z, color: 0xfff2c8 })); }
  for (let i = 0; i < 5; i++) K.add('flat', cyl(0.14, 0.14, 8.6, 5, { x: -3.8, y: 0.75, z: -7.4 + (i - 2) * 0.22, rz: Math.PI / 2, color: [0x2a6ab8, 0xc8302a, 0x16181e, 0xf2c21a, 0x3a8a4a][i] }));
  return kitMeshes(K, g);
}
export function dataCore(tint = 1) {
  const g = new THREE.Group(), K = new Kit(), neon = NEON[tint % 4], w = 13, H = 24;
  K.add('flat', box(w, H, w, { y: H / 2, color: 0x141c2a }));
  K.add('flat', box(w + 0.5, 0.45, w + 0.5, { y: H + 0.2, color: 0x3a4252 }));
  for (const f of faces(w, w)) {
    for (let o = -f.width / 2 + 1.6; o < f.width / 2 - 1; o += 3.2) K.add('glow', box(f.tx ? 0.18 : 0.07, H - 3, f.tz ? 0.18 : 0.07, { x: f.nx * (f.half + 0.04) + f.tx * o, y: H / 2 + 0.5, z: f.nz * (f.half + 0.04) + f.tz * o, color: Math.round(o) % 3 ? 0x2be8ff : 0x3a7bff }));
    for (let y = 6; y < H - 1; y += 6) K.add('flat', box(f.tx ? f.width + 0.6 : 0.3, 0.45, f.tz ? f.width + 0.6 : 0.3, { x: f.nx * (f.half + 0.15), y, z: f.nz * (f.half + 0.15), color: 0x3a4252 }));
    K.add('glow', box(f.tx ? f.width + 0.6 : 0.16, 0.3, f.tz ? f.width + 0.6 : 0.16, { x: f.nx * (f.half + 0.22), y: H - 0.6, z: f.nz * (f.half + 0.22), color: neon }));
  }
  K.add('flat', box(0.4, 8, 0.4, { x: w / 2 - 1, y: H + 4, z: w / 2 - 1, color: 0x8a929e }));
  for (const y of [H + 3, H + 6, H + 8.2]) K.add('glow', box(0.45, 0.45, 0.45, { x: w / 2 - 1, y, z: w / 2 - 1, color: RED }));
  hallBody(K, -11, 0, 7, 22, 6, neon); hallBody(K, 11, 0, 7, 22, 6, neon);
  for (const sx of [-1, 1]) {
    K.add('flat', part(new THREE.CylinderGeometry(1.1, 0.25, 0.4, seg(12, 8), 1, true), { x: sx * 11, y: 7.4, z: -6, rx: -0.9, color: 0xe4e8ec }));
    for (const z of [2, 6]) K.add('flat', box(2.4, 0.9, 1.8, { x: sx * 11, y: 6.75, z, color: 0xc8ccd2 }), cyl(0.5, 0.5, 0.06, 8, { x: sx * 11, y: 7.22, z, color: 0x22252e }));
  }
  K.add('flat', box(5, 0.1, 5, { y: H + 0.47, color: 0x2a6ab8 })); K.add('glow', box(0.6, 0.06, 3, { x: -1, y: H + 0.55, color: 0xffd23a }), box(0.6, 0.06, 3, { x: 1, y: H + 0.55, color: 0xffd23a }), box(1.4, 0.06, 0.6, { y: H + 0.55, color: 0xffd23a })); // roof helipad
  return kitMeshes(K, g);
}

// ------------------------------------------------------------------ enemy structures
export function radar() {
  const g = new THREE.Group(), K = new Kit();
  K.add('flat', box(6.4, 3.6, 6.4, { y: 1.8, color: 0x8a8678 }), box(6.6, 0.3, 6.6, { y: 3.7, color: 0x5a5648 }), cyl(0.35, 0.45, 3, 6, { y: 5.2, color: 0x6b7480 }));
  K.add('glow', box(0.3, 0.3, 0.3, { x: 3, y: 4.0, z: 3, color: RED }));
  kitMeshes(K, g);
  const pivot = new THREE.Group(); pivot.position.y = 6.6; g.add(pivot);
  const D = new Kit();
  D.add('flat', box(4.2, 0.3, 0.5, { color: 0x6b7480 }));
  D.add('flat', part(new THREE.CylinderGeometry(3.4, 0.6, 1.2, seg(14, 8), 1, true), { y: 0.8, z: -0.4, rx: -1.25, color: 0xe0e4ea }));
  D.add('flat', part(new THREE.CylinderGeometry(3.38, 0.58, 1.18, seg(14, 8), 1, true), { y: 0.8, z: -0.42, rx: -1.25, sx: -1, color: 0x9aa2ae }));
  D.add('flat', box(0.14, 0.14, 3, { y: 1.1, z: -1.8, color: 0x3a3f48 }));
  kitMeshes(D, pivot);
  g.userData.spin = pivot;
  return g;
}
export function barracks() {
  const g = new THREE.Group(), K = new Kit();
  K.add('flat', box(14, 3.6, 8, { y: 1.8, color: 0x8a8270 }), part(new THREE.CylinderGeometry(4.3, 4.3, 14.2, seg(10, 6), 1, false, 0, Math.PI), { y: 3.4, rz: Math.PI / 2, sy: 1, sz: 0.25, color: 0x5a6048 }));
  K.add('flat', box(2, 2.4, 0.2, { y: 1.2, z: 4.05, color: 0x3a3428 }));
  for (let i = -6; i <= 6; i += 2) K.add('flat', box(1.2, 0.5, 0.6, { x: i, y: 0.25, z: 5.2, color: 0xb8a878 }));
  K.add('flat', cyl(0.06, 0.06, 6, 4, { x: 6, y: 3, z: -3, color: 0x888888 }), box(1.6, 1, 0.05, { x: 6.8, y: 5.4, z: -3, color: 0xc8302a }));
  for (const [x, z, c] of [[-7.6, 3.4, 0x3a5a3a], [-7.6, 2.4, 0x5a3a2a], [-6.9, 3.0, 0x3a5a3a]]) K.add('flat', cyl(0.32, 0.32, 0.95, 8, { x, y: 0.47, z, color: c }));
  for (const [x, z] of [[7.8, 2.8], [7.8, 1.6]]) K.add('flat', box(1.0, 0.8, 1.0, { x, y: 0.4, z, color: 0x7a6a40 }), box(1.02, 0.08, 1.02, { x, y: 0.62, z, color: 0x4a3a20 }));
  return kitMeshes(K, g);
}
export function depot(white = false) {
  const g = new THREE.Group(), K = new Kit(), body = white ? 0xe8ecf0 : 0xd8d4cc, band = white ? 0x2a6ab8 : 0xc8302a;
  for (const x of [-2.6, 2.6]) K.add('flat', cyl(2.3, 2.3, 4.2, 12, { x, y: 2.1, color: body }), cyl(2.32, 2.32, 0.5, 12, { x, y: 3.2, color: band }), cyl(1.6, 2.3, 0.4, 12, { x, y: 4.4, color: body }));
  K.add('flat', box(5.2, 0.3, 0.3, { y: 1, z: 1.8, color: 0x8a8a8a }), box(0.3, 1, 0.3, { x: 0, y: 0.5, z: 1.8, color: 0x8a8a8a }));
  return kitMeshes(K, g);
}
export function battery() {
  const g = new THREE.Group(), K = new Kit();
  K.add('flat', box(6.4, 2.4, 6.4, { y: 1.2, color: 0x7a7468 }), box(7, 0.4, 7, { y: 2.6, color: 0x5a5648 }));
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; K.add('flat', box(1.4, 0.6, 0.7, { x: Math.cos(a) * 4.2, y: 0.3, z: Math.sin(a) * 4.2, ry: -a, color: 0xb8a878 })); }
  kitMeshes(K, g);
  const head = new THREE.Group(); head.position.y = 2.8; g.add(head);
  const H = new Kit();
  H.add('flat', box(3.4, 1.6, 3.6, { y: 0.8, color: 0x5a6448 }), cyl(0.28, 0.36, 6, 8, { y: 1.0, z: 4.6, rx: Math.PI / 2, color: 0x2a2a2a }));
  kitMeshes(H, head);
  const tip = new THREE.Mesh(G.sphere(0.5, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff6a20 })); tip.position.set(0, 1.0, 7.7); tip.visible = false; head.add(tip);
  g.userData = { head, tip };
  return g;
}
export function boomTower() {
  const g = new THREE.Group(), K = new Kit();
  lattice(K, 0, 0, 4.6, 12);
  K.add('flat', box(5.2, 0.5, 5.2, { y: 0.25, color: 0x5a5648 }), cyl(1.0, 1.0, 2.4, 10, { y: 1.6, z: 1.6, rz: Math.PI / 2, color: 0xd8a020 }));
  return kitMeshes(K, g);
}
// The chain boom between two towers: floats on the water and a chain over them.
export function boomChain(ax, az, bx, bz) {
  const g = new THREE.Group(), K = new Kit(), n = 18;
  for (let i = 0; i <= n; i++) {
    const t = i / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
    K.add('flat', cyl(0.7, 0.7, 1.6, 8, { x, y: 0.2, z, rz: Math.PI / 2, ry: -Math.atan2(bz - az, bx - ax), color: i % 2 ? 0xff8a1a : 0xf2f2f2 }));
  }
  const L = Math.hypot(bx - ax, bz - az);
  K.add('flat', box(L, 0.25, 0.25, { x: (ax + bx) / 2, y: 0.95, z: (az + bz) / 2, ry: -Math.atan2(bz - az, bx - ax), color: 0x3a3a3a }));
  return kitMeshes(K, g, false);
}
// Shield generator (the alien base): an octagonal plinth, a column of glowing rings, a crackling crown.
export function generator() {
  const g = new THREE.Group(), K = new Kit();
  K.add('flat', cyl(4, 4.4, 1.6, 8, { y: 0.8, color: 0x2a2630 }), cyl(2.0, 2.6, 2.2, 8, { y: 2.6, color: 0x3a3442 }), cyl(0.7, 0.9, 6, 8, { y: 5, color: 0x4a4256 }));
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; K.add('flat', box(0.5, 3, 0.5, { x: Math.cos(a) * 3.4, y: 2.2, z: Math.sin(a) * 3.4, color: 0x5a5266 })); }
  kitMeshes(K, g);
  const glow = new THREE.MeshBasicMaterial({ color: 0xff3df0 });
  const rings = [];
  for (let i = 0; i < 4; i++) { const r = new THREE.Mesh(G.torus(1.3 - i * 0.18, 0.12, 4, 16), glow); r.rotation.x = Math.PI / 2; r.position.y = 4 + i * 1.1; g.add(r); rings.push(r); }
  const orb = new THREE.Mesh(G.sphere(0.8, 10, 8), glow); orb.position.y = 8.6; g.add(orb);
  // electric arcs crackling from the orb down to the pylons (re-jagged every few frames in view.js)
  const arcs = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * 7 * 2 * 3), 3)), new THREE.LineBasicMaterial({ color: 0xffa0ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  arcs.frustumCulled = false; g.add(arcs);
  g.userData = { rings, orb, glow, arcs };
  return g;
}

// ------------------------------------------------------------------ friendly buildings (defense missions)
export function vault() { // Hangar 18: a big quonset with yellow-striped doors
  const g = new THREE.Group(), K = new Kit();
  K.add('flat', part(new THREE.CylinderGeometry(11, 11, 24, seg(16, 10), 1, false, 0, Math.PI), { y: 0, rx: Math.PI / 2, rz: Math.PI / 2, sx: 1, color: 0xb8b0a0 }));
  K.add('flat', box(32, 0.6, 24.4, { y: 0.3, color: 0x8a8478 }));
  K.add('flat', box(16, 9, 0.4, { y: 4.5, z: 12.1, color: 0x4a4a48 }));
  for (let x = -7; x <= 7; x += 2) K.add('flat', box(1, 9, 0.45, { x, y: 4.5, z: 12.12, color: x % 4 ? 0xf2c21a : 0x1a1a1a }));
  for (let x = -14; x <= 14; x += 7) K.add('glow', box(0.5, 0.5, 0.3, { x, y: 10.5, z: 12.2, color: 0xffd23a }));
  kitMeshes(K, g);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(6, 3), new THREE.MeshBasicMaterial({ map: canvasTex(64, 32, (c, w, h) => { c.fillStyle = '#1a1a1a'; c.fillRect(0, 0, w, h); c.fillStyle = '#ffd23a'; c.font = 'bold 26px monospace'; c.textAlign = 'center'; c.fillText('18', w / 2, 26); }) }));
  sign.position.set(0, 10, 12.4); g.add(sign);
  return g;
}
export function dome() {
  const g = new THREE.Group(), K = new Kit();
  K.add('flat', box(12, 4, 12, { y: 2, color: 0x8a8678 }), part(new THREE.SphereGeometry(5.6, seg(16, 10), seg(10, 6), 0, Math.PI * 2, 0, Math.PI * 0.6), { y: 5.2, color: 0xeef0f2 }));
  K.add('glow', box(0.4, 0.4, 0.4, { y: 10.9, color: RED }));
  return kitMeshes(K, g);
}
export function ctower() {
  const g = new THREE.Group(), K = new Kit();
  K.add('flat', box(4, 12, 4, { y: 6, color: 0xd8d4cc }), box(7, 0.6, 7, { y: 12.3, color: 0x5a5648 }), box(6.6, 3, 6.6, { y: 14, color: 0x22384c }), box(7.2, 0.5, 7.2, { y: 15.7, color: 0x5a5648 }));
  K.add('flat', cyl(0.06, 0.06, 4, 4, { y: 18, color: 0x888888 }));
  K.add('glow', box(0.3, 0.3, 0.3, { y: 20, color: RED }), box(6.62, 0.2, 6.62, { y: 13, color: 0x7ad8ff }));
  return kitMeshes(K, g);
}

// ------------------------------------------------------------------ the Strip's casinos (Vegas)
function casinoSign(name, color) {
  const tex = canvasTex(128, 32, (c, w, h) => {
    c.fillStyle = '#10081a'; c.fillRect(0, 0, w, h);
    c.strokeStyle = color; c.lineWidth = 3; c.strokeRect(2, 2, w - 4, h - 4);
    c.fillStyle = color; c.font = 'bold 15px monospace'; c.textAlign = 'center'; c.fillText(name, w / 2, 21);
  });
  return new THREE.Mesh(new THREE.PlaneGeometry(10, 2.5), new THREE.MeshBasicMaterial({ map: tex }));
}
export function casino(style, name, tint = 0) {
  const g = new THREE.Group(), K = new Kit(), neon = [0xffd23a, 0xff2bd6, 0x2be8ff, 0x3dff7a][tint % 4];
  let signY = 7, signZ = 14;
  if (style === 'pyramid') {
    K.add('flat', part(new THREE.ConeGeometry(18, 24, 4), { y: 12, ry: Math.PI / 4, color: 0x1a1a24 }));
    for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2; K.add('glow', box(0.3, 30, 0.3, { x: Math.cos(a) * 6.3, y: 12, z: Math.sin(a) * 6.3, rx: Math.sin(a) * 0.63, rz: -Math.cos(a) * 0.63, color: 0xffd23a })); }
    K.add('flat', box(4, 3, 9, { y: 1.5, z: 16, color: 0xd8b878 }), box(3, 3, 3, { y: 4, z: 19, color: 0xd8b878 })); // the sphinx
    signZ = 22;
    K.add('glow', cyl(0.5, 0.9, 3, 6, { y: 25, color: 0xfff8d0 })); // the beacon at the apex
  } else if (style === 'castle') {
    K.add('flat', box(24, 13, 20, { y: 6.5, color: 0xeee8dc }));
    for (const [x, z, c] of [[-10, -8, 0xc8302a], [10, -8, 0x2a6ab8], [-10, 8, 0xf2c21a], [10, 8, 0xc8302a], [0, 0, 0x2a6ab8]]) K.add('flat', cyl(2.5, 2.5, 18, 10, { x, y: 9, z, color: 0xeee8dc }), cone(3, 5, 10, { x, y: 20.5, z, color: c }));
    for (let x = -11; x <= 11; x += 2) K.add('flat', box(1, 1.2, 1, { x, y: 13.6, z: 10, color: 0xeee8dc }));
  } else if (style === 'needle') {
    K.add('flat', box(12, 7, 12, { y: 3.5, color: 0xd8d4cc }), cyl(2.6, 3.4, 50, 10, { y: 25, color: 0xc8c4bc }), cyl(6.5, 5.5, 5, 14, { y: 49, color: 0xe8e4dc }), cyl(5.2, 6.5, 2, 14, { y: 45.6, color: 0x22384c }), cyl(0.4, 0.6, 14, 6, { y: 58, color: 0xc8c4bc }));
    K.add('glow', part(new THREE.TorusGeometry(6.55, 0.18, 3, 24), { rx: Math.PI / 2, y: 50, color: neon }), box(0.6, 0.6, 0.6, { y: 65.3, color: RED }));
    signY = 9; signZ = 7;
  } else if (style === 'palms') {
    K.add('flat', box(26, 26, 10, { y: 13, color: 0xd8c8a8 }), box(28, 6, 6, { y: 3, z: 7, color: 0xc8b898 }));
    for (let y = 4; y < 26; y += 3) K.add('glow', box(26.2, 0.25, 10.2, { y, color: y % 2 ? 0x3dff7a : 0x1a8a4a }));
  } else { // tower
    K.add('flat', box(20, 34, 10, { y: 17, color: [0xc8a860, 0x3a2a4a, 0xd8dce4][tint % 3] }), box(26, 6, 6, { y: 3, z: 6, color: 0x5a4a3a }));
    for (let y = 8; y < 34; y += 4) K.add('glow', box(20.3, 0.3, 10.3, { y, color: neon }));
    K.add('glow', box(14, 3, 0.4, { y: 31, z: 5.2, color: neon }));
  }
  kitMeshes(K, g);
  const sign = casinoSign(name, '#' + neon.toString(16).padStart(6, '0'));
  sign.position.set(0, signY, signZ); g.add(sign);
  return g;
}

// ------------------------------------------------------------------ solids (indestructible scenery)
export function solid(kind, hw, hd, h) {
  const g = new THREE.Group(), K = new Kit();
  if (kind === 'hangar') {
    K.add('flat', part(new THREE.CylinderGeometry(h, h, hd * 2, seg(12, 8), 1, false, 0, Math.PI), { rx: Math.PI / 2, rz: Math.PI / 2, sx: hw / h, color: 0x9a9a8c }));
    K.add('flat', box(hw * 1.4, h * 0.85, 0.3, { y: h * 0.42, z: hd + 0.1, color: 0x4a4a48 }));
  } else if (kind === 'tower') {
    K.add('flat', box(hw * 2, h - 3, hd * 2, { y: (h - 3) / 2, color: 0xd8d4cc }), box(hw * 2 + 1.4, 2.6, hd * 2 + 1.4, { y: h - 1.5, color: 0x22384c }), box(hw * 2 + 1.8, 0.4, hd * 2 + 1.8, { y: h, color: 0x5a5648 }));
    K.add('glow', box(0.3, 0.3, 0.3, { y: h + 0.5, color: RED }));
  } else if (kind === 'containers') {
    const cols = [0xb8442e, 0x2e6eb8, 0x3a8a4a, 0xd8a020, 0x8a3a8a];
    for (let y = 0, i = 0; y < h - 0.1; y += 2.7, i++) for (let z = -hd + 3; z < hd; z += 6.2) K.add('flat', box(hw * 2 - 0.2, 2.6, 6, { y: y + 1.3, z, color: cols[(i * 3 + Math.round(z)) % cols.length & 7] ?? cols[0] }));
  } else if (kind === 'crane') {
    const yel = 0xf2a81a;
    for (const sz of [-1, 1]) K.add('flat', box(1, h, 1, { x: -hw, y: h / 2, z: sz * hd, color: yel }), box(1, h, 1, { x: hw, y: h / 2, z: sz * hd, color: yel }));
    K.add('flat', box(hw * 2 + 1, 1.2, hd * 2 + 1, { y: h, color: yel }), box(3, 2.4, 3, { x: 0, y: h + 1.8, z: -hd + 2, color: 0xe8e4dc }), box(1.2, 1.2, 30, { x: 0, y: h + 1, z: 10, color: yel }));
    K.add('glow', box(0.5, 0.5, 0.5, { y: h + 2, z: 24, color: RED }));
  } else if (kind === 'ship' || kind === 'carrier') {
    const carrier = kind === 'carrier';
    K.add('flat', box(hw * 2, h, hd * 2, { y: h / 2 - 2, color: carrier ? 0x6e7680 : 0x8a2a22 }), part(new THREE.ConeGeometry(hw, 8, 4), { y: h / 2 - 2, z: hd + 3, rx: Math.PI / 2, ry: Math.PI / 4, sz: 1, color: carrier ? 0x6e7680 : 0x8a2a22 }));
    K.add('flat', box(hw * 2 + 0.2, 0.2, hd * 2 + 0.2, { y: h - 2 + 0.1, color: carrier ? 0x3a3f46 : 0x5a6a5a }));
    if (carrier) {
      K.add('flat', box(4, 8, 10, { x: hw - 2, y: h + 2, z: -6, color: 0x6e7680 }), box(4.1, 1.2, 10.1, { x: hw - 2, y: h + 4, z: -6, color: 0x22384c }));
      for (let z = -hd + 4; z < hd - 2; z += 6) K.add('glow', box(0.2, 0.05, 2.5, { x: 0, y: h - 1.85, z, color: 0xf2f2f2 }));
      for (const [x, z] of [[-6, 20], [-6, -20], [0, 0]]) { K.add('flat', box(9, 0.06, 9, { x, y: h - 1.84, z, color: 0x2a6ab8 })); K.add('glow', box(1, 0.06, 6, { x: x - 2, y: h - 1.8, z, color: 0xffd23a }), box(1, 0.06, 6, { x: x + 2, y: h - 1.8, z, color: 0xffd23a }), box(3, 0.06, 1, { x, y: h - 1.8, z, color: 0xffd23a })); }
    } else {
      K.add('flat', box(hw * 1.6, 6, 7, { y: h + 1, z: -hd + 6, color: 0xf0f0ec }));
      for (let z = -hd + 16; z < hd - 4; z += 7) for (const x of [-hw * 0.5, hw * 0.5]) K.add('flat', box(hw * 0.9, 2.6, 6, { x, y: h - 0.7, z, color: [0xb8442e, 0x2e6eb8, 0x3a8a4a][Math.abs(Math.round(z + x)) % 3] }));
    }
  } else if (kind === 'tent') {
    K.add('flat', part(new THREE.CylinderGeometry(0.01, hw * 1.4, h, 4), { y: h / 2, ry: Math.PI / 4, sz: hd / hw, color: 0x6a7a4a }));
    K.add('flat', cyl(0.05, 0.05, h + 3, 4, { x: hw + 1, y: (h + 3) / 2, color: 0x888888 }), box(1.6, 1, 0.05, { x: hw + 1.8, y: h + 2.3, color: 0x2a6ab8 }));
  } else if (kind === 'hwall') {
    K.add('flat', box(hw * 2, h, hd * 2, { y: h / 2, color: 0x2a2630 }));
    for (let y = 2; y < h; y += 3) K.add('glow', box(hw * 2 + 0.1, 0.12, hd * 2 + 0.1, { y, color: 0xff3df0 }));
  } else if (kind === 'roof') {
    return roofPanels(hw, hd);
  } else K.add('flat', box(hw * 2, h, hd * 2, { y: h / 2, color: 0x8a8678 }));
  return kitMeshes(K, g);
}
// The alien hangar's roof: two halves that slide apart when the shield drops (userData.open 0..1).
function roofPanels(hw, hd) {
  const g = new THREE.Group(), halves = [];
  for (const s of [-1, 1]) {
    const K = new Kit(), h = new THREE.Group();
    K.add('flat', box(hw, 1.4, hd * 2 + 1, { x: s * hw / 2, y: 0.7, color: 0x3a3442 }));
    for (let z = -hd; z <= hd; z += 5) K.add('glow', box(hw * 0.9, 0.1, 0.25, { x: s * hw / 2, y: 1.45, z, color: 0xff3df0 }));
    kitMeshes(K, h); g.add(h); halves.push({ g: h, s });
  }
  g.userData = { halves, open: 0, hw };
  return g;
}
// The alien hangar's shield: a translucent dome that ripples where you hit it.
export function shieldDome(r) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, seg(28, 16), seg(14, 8), 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xc86aff, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
  return m;
}

// ------------------------------------------------------------------ pads, runways, piers
export function lzPad(r = 9) {
  const g = new THREE.Group(), K = new Kit();
  K.add('flat', box(r * 1.8, 0.3, r * 1.8, { y: 0.15, color: 0x5a5e62 }));
  K.add('glow', box(0.9, 0.05, 6, { x: -2, y: 0.32, color: 0xffd23a }), box(0.9, 0.05, 6, { x: 2, y: 0.32, color: 0xffd23a }), box(3.2, 0.05, 0.9, { y: 0.32, color: 0xffd23a }));
  for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; K.add('glow', box(0.35, 0.15, 0.35, { x: Math.cos(a) * r * 0.82, y: 0.35, z: Math.sin(a) * r * 0.82, color: k % 2 ? 0x3ddc84 : 0xffd23a })); }
  return kitMeshes(K, g, false);
}
export function runway(x0, x1, w, alongX = true) {
  const g = new THREE.Group(), K = new Kit(), L = x1 - x0;
  K.add('flat', box(L, 0.12, w, { color: 0x3a3c40 }));
  for (let x = 4; x < L - 4; x += 10) K.add('glow', box(5, 0.04, 0.5, { x: -L / 2 + x, y: 0.08, color: 0xe8e8e8 }));
  for (let x = 0; x <= L; x += 12) for (const s of [-1, 1]) K.add('glow', box(0.3, 0.2, 0.3, { x: -L / 2 + x, y: 0.12, z: s * (w / 2 + 0.4), color: 0x7ad8ff }));
  kitMeshes(K, g, false);
  if (!alongX) g.rotation.y = Math.PI / 2;
  return g;
}
export function pier(L, w) {
  const g = new THREE.Group(), K = new Kit();
  K.add('flat', box(L, 1.2, w, { y: 1.4, color: 0xa8a49a }));
  for (let x = -L / 2 + 2; x < L / 2; x += 6) for (const s of [-1, 1]) K.add('flat', cyl(0.4, 0.4, 8, 6, { x, y: -2, z: s * (w / 2 - 0.6), color: 0x4a4038 }));
  for (let x = -L / 2; x < L / 2; x += 2) K.add('flat', box(1, 0.08, 0.4, { x, y: 2.04, z: w / 2 - 0.3, color: Math.round(x / 2) % 2 ? 0x1a1a1a : 0xffcc1a }));
  return kitMeshes(K, g);
}
export function rubble(w, d, seed = 1) {
  const g = new THREE.Group(), K = new Kit();
  let s = seed * 7919 + 1;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  K.add('flat', part(new THREE.CircleGeometry(1, 10), { rx: -Math.PI / 2, y: 0.05, sx: w * 0.75, sy: d * 0.75, color: 0x14110e })); // the scorch
  for (let i = 0; i < 16; i++) K.add('flat', box(1 + r() * 3, 0.4 + r() * 1.6, 1 + r() * 3, { x: (r() - 0.5) * w, y: 0.4, z: (r() - 0.5) * d, ry: r() * 3, rx: (r() - 0.5) * 0.6, color: [0x2a2622, 0x3a342e, 0x1a1816, 0x4a443c][i % 4] }));
  for (let i = 0; i < 7; i++) K.add('flat', box(0.18, 0.18, 2 + r() * 4, { x: (r() - 0.5) * w * 0.8, y: 0.8 + r() * 1.5, z: (r() - 0.5) * d * 0.8, rx: (r() - 0.5) * 1.6, ry: r() * 3, rz: (r() - 0.5) * 0.8, color: [0x5a2a1a, 0x3a3a3a][i % 2] })); // twisted girders
  for (let i = 0; i < 4; i++) K.add('glow', box(0.6 + r(), 0.1, 0.6 + r(), { x: (r() - 0.5) * w * 0.6, y: 0.5, z: (r() - 0.5) * d * 0.6, ry: r() * 3, color: 0xff6a20 })); // embers
  return kitMeshes(K, g);
}
export function searchlight() {
  const g = new THREE.Group(), K = new Kit();
  K.add('flat', cyl(0.3, 0.4, 8, 6, { y: 4, color: 0x5a5a5a }), box(1.2, 1, 1.2, { y: 8.4, color: 0x3a3a3a }));
  kitMeshes(K, g);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 7, 70, 10, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff6c8, transparent: true, opacity: 0.09, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
  beam.geometry.translate(0, -35, 0);
  const pivot = new THREE.Group(); pivot.position.y = 8.6; pivot.add(beam); g.add(pivot);
  g.userData.pivot = pivot;
  return g;
}
export { mat, glowMat };
