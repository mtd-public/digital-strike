// MISSION 2 · OPERATION NARROWS: escort a tanker up a winding strait held by the enemy. Shore guns shell
// it, gunboats hunt it, naval mines float in the channel and a chain boom blocks the way until you knock
// down its two towers. Rearm on the tanker's helipad. Lose the tanker, lose the mission.
import { pathLength, pathPoint } from './common.js';

// The channel's centreline, south (start) to north (open sea).
const C = [[0, 470], [10, 300], [-50, 200], [-55, 90], [20, -10], [55, -110], [10, -210], [-35, -300], [-30, -470]];
const L = pathLength(C);
// A point on a bank: `s` metres up the channel, `off` metres out to one side (side ±1).
const bank = (s, side, off) => { const p = pathPoint(C, s); return [p.x - Math.cos(p.yaw) * side * off, p.z + Math.sin(p.yaw) * side * off]; };
const at = (s, side, off, extra) => { const [x, z] = bank(s, side, off); return { x, z, ...extra }; };
const BOOM_S = 535;
const TOWERS = [bank(BOOM_S, 1, 46), bank(BOOM_S, -1, 46)]; // each on a rocky outcrop at the channel's edge
const rock = ([x, z]) => ({ x0: x - 5, x1: x + 5, z0: z - 5, z1: z + 5, h: 3, edge: 7 });

const island = {
  half: 420, step: 3,
  blobs: [{ x: 0, z: 0, rx: 340, rz: 360, pow: 6 }],
  channels: [{ pts: C, w: 66, edge: 26 }],
  sea: -10, land: 3, rough: 7,
  hills: [[-170, 150, 26, 70], [-180, -120, 30, 80], [-130, -290, 22, 60], [160, 230, 22, 70], [190, -40, 28, 80], [140, -260, 24, 60],
    [-110, 50, 12, 40], [110, -160, 12, 40], [-120, -200, 10, 35], [120, 100, 12, 40]],
  flats: [
    { x0: 70, x1: 130, z0: 300, z1: 336, h: 2.2, edge: 10 }, // fishing village (friendly)
    { x0: -78, x1: -58, z0: 330, z1: 350, h: 2.4, edge: 8 }, // lighthouse point
    { x0: -196, x1: -166, z0: -134, z1: -106, h: 26, edge: 12 }, // radar hill
    ...TOWERS.map(rock),
  ],
};

export default {
  id: 'strait', code: 'MISSION 2', name: 'OPERATION NARROWS', theme: 'strait',
  brief: 'A fuel tanker has to run the enemy strait. Keep it afloat: silence the shore guns, clear the naval mines and bring down the boom towers so it can pass.',
  tips: ['Shoot the floating mines before the tanker reaches them', 'Hover over the tanker\'s helipad to rearm'],
  par: 19000, // a strong run's score: ranks are measured against it
  island,
  objective: { kind: 'escort' },
  escort: { path: C, s0: 70, end: L - 60, speed: 4.6, hp: 1400, boomS: BOOM_S, waitS: BOOM_S - 48 },
  start: { x: pathPoint(C, 70).x, z: pathPoint(C, 70).z - 6, yaw: Math.PI },
  lz: { follow: 'tanker', r: 8 },
  houses: [[82, 310, 'bld_house_peach', 'S'], [100, 310, 'bld_house_lilac', 'S'], [118, 326, 'bld_cafe', 'N'], [-68, 340, 'bld_lighthouse', 'E']],
  structures: [
    { kind: 'radar', x: -181, z: -120 },
    at(200, 1, 64, { kind: 'battery' }), at(420, -1, 66, { kind: 'battery' }), at(650, 1, 64, { kind: 'battery' }), at(810, -1, 62, { kind: 'battery' }),
    ...TOWERS.map(([x, z]) => ({ kind: 'boomtower', x, z, boom: 0 })),
    at(300, -1, 92, { kind: 'sam' }), at(570, 1, 96, { kind: 'sam' }), at(845, 1, 90, { kind: 'sam' }),
    at(120, -1, 82, { kind: 'flak' }), at(380, 1, 86, { kind: 'flak' }), at(620, -1, 82, { kind: 'flak' }), at(760, -1, 88, { kind: 'flak' }),
    at(400, 1, 116, { kind: 'barracks', yaw: 0 }), at(660, -1, 112, { kind: 'barracks', yaw: 0 }),
    at(470, -1, 120, { kind: 'depot' }),
  ],
  solids: [],
  squads: [
    [...bank(235, -1, 68), 4, 2, 10], [...bank(330, 1, 68), 4, 2, 10], [...bank(480, 1, 68), 4, 2, 10],
    [...bank(585, -1, 68), 4, 2, 10], [...bank(720, -1, 68), 4, 2, 10], [...bank(860, 1, 68), 4, 2, 10],
  ],
  tanks: [at(250, 1, 82, {}), at(450, -1, 92, {}), at(700, 1, 86, {}), at(880, -1, 82, {})],
  technicals: [],
  drones: [],
  gunships: { patrol: null, pads: [[-30, -440], [10, -440]], initial: 0, schedule: [70, 150] },
  civCars: [],
  pickups: [
    ['fuel', ...bank(220, 1, 50)], ['ammo', ...bank(400, -1, 52)], ['armor', ...bank(560, 1, 56)],
    ['fuel', ...bank(700, -1, 54)], ['ammo', ...bank(820, 1, 52)],
  ],
  // Gunboats: two waiting up the channel, then pairs coming down from the north mouth.
  boats: { hunt: true, list: [{ x: pathPoint(C, 330).x, z: pathPoint(C, 330).z }, { x: pathPoint(C, 640).x, z: pathPoint(C, 640).z }], waves: { every: 42, n: 2, from: [pathPoint(C, L - 30).x, pathPoint(C, L - 30).z], first: 30 } },
  navalMines: [[150, 8], [262, -10], [342, 6], [472, -6], [602, 10], [690, -8], [762, 4], [862, -10]].map(([s, o]) => { const [x, z] = bank(s, 1, o); return [x, z]; }),
  decor: { boom: { towers: TOWERS }, palms: 'pine' },
};
