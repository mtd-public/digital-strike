// Shared level vocabulary: the gig-ambulance city tiles and building footprints, the data-center and
// structure hit volumes. Plain data, no three.js (the sim and tools/sim-check.mjs load it in node).
import { islandHeight } from '../terrain.js';

export const TILE = 16; // gig-ambulance street tile (assets/manifest.json tile_size)

// Collision footprints of the gig-ambulance buildings in model space ([x, z, half-w, half-d], from gig's
// js/town.js FOOTPRINTS) and their heights (assets/manifest.json size.y).
export const FOOTPRINTS = {
  bld_house_lilac: { rects: [[0, -0.5, 2.6, 2.3]], h: 5.6 },
  bld_house_peach: { rects: [[0, -0.5, 2.6, 2.3]], h: 5.6 },
  bld_apartment: { rects: [[0, -0.6, 3.2, 2.8]], h: 10.6 },
  bld_cafe: { rects: [[0, -0.8, 2.9, 2.4]], h: 6.1 },
  bld_pharmacy: { rects: [[0, -0.7, 2.8, 2.5]], h: 5.3 },
  bld_pizzeria: { rects: [[0, -0.8, 3.0, 2.4]], h: 6.9 },
  bld_office: { rects: [[0, -0.6, 2.8, 2.8]], h: 16.2 },
  bld_hospital: { rects: [[0, -0.9, 7.1, 2.5], [0, -0.6, 2.7, 2.8]], h: 9.2 },
  bld_lighthouse: { rects: [[0, -0.6, 2.2, 2.2]], h: 11 },
  lot_park: { rects: [[0, 0, 1.5, 1.5]], h: 2.5 },
};
export const yawFor = (facing) => (facing === 'N' ? Math.PI : facing === 'S' ? 0 : facing === 'E' ? Math.PI / 2 : -Math.PI / 2);

// City tile centre and the road cells (with which way each connects: E, N, W, S), for the renderer's
// tile picking (gig's fitRotation) and the traffic paths.
export const cityX = (C, c) => C.x0 + c * TILE, cityZ = (C, r) => C.z0 + r * TILE;
export function cityRoads(C) {
  const isRoad = (c, r) => c >= 0 && r >= 0 && c < C.cols && r < C.rows && (C.roadRows.includes(r) || C.roadCols.includes(c));
  const out = [];
  for (let r = 0; r < C.rows; r++) for (let c = 0; c < C.cols; c++) {
    if (!isRoad(c, r)) continue;
    const conn = new Set();
    if (isRoad(c + 1, r)) conn.add('E');
    if (isRoad(c - 1, r)) conn.add('W');
    if (isRoad(c, r - 1)) conn.add('N');
    if (isRoad(c, r + 1)) conn.add('S');
    out.push({ c, r, x: cityX(C, c), z: cityZ(C, r), conn });
  }
  return out;
}

// Data centers. 'hall' = a data hall with cooling towers, chillers and a comms mast (Vertical-Vantage
// OCEAN CORE oc-dc / oc-cooling / oc-chiller / oc-lattice); 'core' = a data-haven tower (oc-spine) over
// two halls. Pieces in the local frame: boxes [x, z, half-w, half-d, height], round towers [x, z, r, height].
export const DC_PARTS = {
  hall: { boxes: [[0, 0, 11, 7, 7.5], [8.5, -10.5, 1.4, 1.4, 17]], towers: [[-7.5, -11, 3.3, 9], [0, -11, 3.3, 9]] },
  core: { boxes: [[0, 0, 6.5, 6.5, 24], [-11, 0, 3.5, 11, 6], [11, 0, 3.5, 11, 6]], towers: [] },
};

// Enemy structures: hp, hit boxes [x, z, half-w, half-d, height], what they score as, what they drop.
export const STRUCT_TYPES = {
  radar: { hp: 220, boxes: [[0, 0, 3.2, 3.2, 8]], score: 'radar' },
  barracks: { hp: 240, boxes: [[0, 0, 7, 4, 4.2]], score: 'barracks', drop: 'armor' },
  depot: { hp: 120, boxes: [[-2.6, 0, 2.3, 2.3, 4.2], [2.6, 0, 2.3, 2.3, 4.2]], score: 'depot', drop: 'fuel' },
  flak: { hp: 90, boxes: [[0, 0, 1.8, 1.8, 2.8]], score: 'flak' },
  sam: { hp: 110, boxes: [[0, 0, 1.7, 1.7, 3.0]], score: 'sam' },
  battery: { hp: 180, boxes: [[0, 0, 3.2, 3.2, 3.4]], score: 'battery', drop: 'ammo' }, // shore gun (the strait): shells the tanker
  boomtower: { hp: 200, boxes: [[0, 0, 2.6, 2.6, 12]], score: 'boomtower' }, // holds the chain boom across the strait
  generator: { hp: 260, boxes: [[0, 0, 4, 4, 7]], score: 'generator' }, // powers the alien hangar's shield
  // Friendly buildings the enemy goes for (defense missions): losing the one named in objective.protect ends it.
  vault: { hp: 1500, boxes: [[0, 0, 16, 12, 11]] }, // Hangar 18
  dome: { hp: 500, boxes: [[0, 0, 6, 6, 9]] },
  ctower: { hp: 450, boxes: [[0, 0, 3.5, 3.5, 17]] },
  fuelfarm: { hp: 400, boxes: [[-4.5, 0, 3, 3, 5], [4.5, 0, 3, 3, 5]] },
  casino: { hp: 1100, styles: { // the Strip's casinos, by style
    pyramid: [[0, 0, 13, 13, 8], [0, 0, 8, 8, 16], [0, 0, 3, 3, 24]],
    castle: [[0, 0, 12, 10, 13], [-9, -7, 2.5, 2.5, 20], [9, -7, 2.5, 2.5, 20]],
    tower: [[0, 0, 10, 5, 34], [0, 6, 13, 3, 6]],
    needle: [[0, 0, 2.6, 2.6, 56], [0, 0, 6, 6, 7]],
    palms: [[0, 0, 13, 5, 26], [0, 7, 14, 3, 6]],
  } },
};

// Gunboats run one loop round an island, ~16 m out from where the sea gets deep.
export function boatLoop(island, cx = 0, cz = 0) {
  const pts = [];
  for (let k = 0; k < 28; k++) {
    const a = (k / 28) * Math.PI * 2;
    let r = 100;
    while (r < island.half - 20 && islandHeight(island, cx + Math.cos(a) * r, cz + Math.sin(a) * r) > -5) r += 4;
    pts.push([cx + Math.cos(a) * (r + 16), cz + Math.sin(a) * (r + 16)]);
  }
  return pts;
}

// Length along a path and the point at a given distance (paths are [[x, z], ...]).
export function pathLength(pts) { let L = 0; for (let i = 0; i < pts.length - 1; i++) L += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); return L; }
export function pathPoint(pts, s) {
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], L = Math.hypot(bx - ax, bz - az);
    if (s <= L || i === pts.length - 2) { const t = Math.max(0, Math.min(1, s / (L || 1))); return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, yaw: Math.atan2(bx - ax, bz - az) }; }
    s -= L;
  }
  const p = pts[pts.length - 1];
  return { x: p[0], z: p[1], yaw: 0 };
}
