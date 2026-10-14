// The town and the greenery, from the gig-ambulance GLBs: road tiles fitted to their neighbours (gig's
// js/town.js fitRotation), buildings on their lots, houses, and trees / palms / bushes scattered over the
// land. Everything static is baked into a few meshes (bakeStatic).
import * as THREE from 'three';
import { spawn, bakeStatic, hasModel } from './assets.js';
import { cityRoads, cityX, cityZ, yawFor, FOOTPRINTS } from '../sim/levels/common.js';
import { mulberry32 } from '../utils.js';

const ROAD_BASES = { road_cross: 'ENWS', road_t: 'ENW', road_straight: 'NS', road_corner: 'EN', road_end: 'N' };
const ORDER = ['E', 'N', 'W', 'S'];
const rotateDir = (d, k) => ORDER[(ORDER.indexOf(d) + k) % 4];
function fitRotation(base, conn) {
  if (base.length !== conn.size) return -1;
  for (let k = 0; k < 4; k++) { const rot = new Set([...base].map((d) => rotateDir(d, k))); if ([...conn].every((d) => rot.has(d))) return k; }
  return -1;
}
export const CITY_ASSETS = ['road_straight', 'road_crosswalk', 'road_corner', 'road_t', 'road_cross', 'road_end', 'lot_park', 'lot_grass',
  'bld_apartment', 'bld_cafe', 'bld_house_lilac', 'bld_house_peach', 'bld_office', 'bld_pharmacy', 'bld_pizzeria', 'bld_hospital', 'bld_lighthouse',
  'veh_car_blue', 'veh_car_pink', 'veh_taxi', 'veh_bus', 'veh_pickup', 'prop_palm', 'prop_tree_pine', 'prop_tree_round', 'prop_bush', 'prop_lamp_post', 'prop_umbrella', 'prop_barrier', 'prop_fence'];

export function buildTown(w, theme) {
  const L = w.level, root = new THREE.Group(), T = w.terrain, rng = mulberry32(1234);
  const put = (name, x, z, yaw, y = T.surface(x, z), s = 1) => { if (!hasModel(name)) return; const o = spawn(name); o.position.set(x, y, z); o.rotation.y = yaw; o.scale.setScalar(s); root.add(o); return o; };
  if (L.city) {
    const C = L.city;
    for (const cell of cityRoads(C)) {
      let piece = Object.keys(ROAD_BASES).find((n) => fitRotation(ROAD_BASES[n], cell.conn) >= 0) || 'road_straight';
      const k = Math.max(0, fitRotation(ROAD_BASES[piece], cell.conn));
      if (piece === 'road_straight' && rng() < 0.3) piece = 'road_crosswalk';
      put(piece, cell.x, cell.z, (k * Math.PI) / 2, C.y + 0.02);
      if (rng() < 0.3 && piece !== 'road_cross') put('prop_lamp_post', cell.x + 7, cell.z + 7, 0, C.y + 0.2);
    }
    for (const [c, r, model, facing, span] of C.lots) put(model, cityX(C, c) + (span === 2 ? 8 : 0), cityZ(C, r), yawFor(facing), C.y + 0.01);
  }
  for (const [x, z, model, facing] of L.houses || []) put(model, x, z, yawFor(facing));
  // greenery: deterministic scatter over open land, away from pads, roads, buildings and the sea
  const pal = L.decor?.palms || 'tropic';
  const kinds = { tropic: [['prop_palm', 0.3], ['prop_tree_round', 0.45], ['prop_bush', 1]], pine: [['prop_tree_pine', 0.75], ['prop_tree_round', 0.85], ['prop_bush', 1]],
    desert: [['prop_bush', 1]], vegas: [['prop_bush', 0.7], ['prop_palm', 1]] }[pal];
  const count = { tropic: 230, pine: 300, desert: 70, vegas: 50 }[pal];
  const busy = [...w.solids.map((b) => [b.x, b.z, Math.max(b.hw, b.hd) + 6]), ...w.ents.filter((e) => e.kind === 'struct').map((e) => [e.x, e.z, 16])];
  const inFlat = (x, z) => L.island.flats.some((f) => x > f.x0 - 6 && x < f.x1 + 6 && z > f.z0 - 6 && z < f.z1 + 6);
  let placed = 0;
  for (let tries = 0; tries < count * 12 && placed < count; tries++) {
    const x = (rng() * 2 - 1) * (L.island.half - 30), z = (rng() * 2 - 1) * (L.island.half - 30), h = T.height(x, z);
    if (h < 1.6 || h > 30 || T.slope(x, z) > 0.45 || inFlat(x, z) || busy.some(([bx, bz, r]) => Math.hypot(bx - x, bz - z) < r)) continue;
    if (L.escort && Math.abs(polyDistQuick(L.escort.path, x, z)) < 40) continue;
    const roll = rng(), name = kinds.find(([, p]) => roll <= p)[0];
    put(name, x, z, rng() * 6.28, h, 0.9 + rng() * 0.9);
    placed++;
  }
  // Vegas: palms down the Strip
  if (pal === 'vegas' && L.city) for (let r = 1; r < L.city.rows; r += 2) for (const s of [-1, 1]) put('prop_palm', cityX(L.city, 3) + s * 7.4, cityZ(L.city, r), 0, L.city.y + 0.2, 1.3);
  // the beach at the LZ: umbrellas and barriers
  if (L.lz && !L.lz.follow) { put('prop_barrier', L.lz.x + 10, L.lz.z, Math.PI / 2); put('prop_barrier', L.lz.x - 10, L.lz.z, Math.PI / 2); }
  return bakeStatic(root);
}
function polyDistQuick(pts, x, z) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) { const [ax, az] = pts[i], [bx, bz] = pts[i + 1], dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2)); best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t)); }
  return best;
}
export { FOOTPRINTS };
