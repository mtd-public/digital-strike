// MISSION 5 · OPERATION NEON SKY: Las Vegas under alien air attack at night. Control the airspace: every
// aircraft you bring down fills the control meter, every one left flying drains it. Fill it before the
// raiders level three casinos on the Strip.
import { cityX as cx, cityZ as cz } from './common.js';

const ring = (n, r, h, rad, a0 = 0) => Array.from({ length: n }, (_, i) => { const a = a0 + (i / n) * Math.PI * 2; return [Math.cos(a) * r, Math.sin(a) * r, h * (0.7 + 0.6 * ((i * 53) % 10) / 10), rad]; });
const island = {
  half: 340,
  blobs: [{ x: 0, z: 0, rx: 2000, rz: 2000, pow: 2 }],
  sea: -9, land: 3, rough: 2.5,
  hills: ring(12, 300, 52, 75, 0.1),
  flats: [
    { x0: -60, x1: 60, z0: -205, z1: 205, h: 2, edge: 22 }, // the Strip
    { x0: 110, x1: 214, z0: 60, z1: 184, h: 2.4, edge: 18, paved: true }, // the airport (LZ)
  ],
};
// The Strip runs north–south down the middle column of gig-ambulance road tiles (col 3, x = 0).
const city = {
  x0: -48, z0: -192, cols: 7, rows: 25, roadCols: [0, 3, 6], roadRows: [0, 6, 12, 18, 24], y: 2.0, night: true,
  lots: [],
};
const X = (c) => cx(city, c), Z = (r) => cz(city, r);
// Casinos fill 2 × 2 lots (32 m blocks) on each side of the Strip; gig buildings fill the strip-side lots between.
const casinos = [
  { style: 'pyramid', name: 'THE SPHINX', c: 1.5, r: 2.5 }, { style: 'castle', name: "KING'S CASTLE", c: 1.5, r: 8.5 },
  { style: 'tower', name: 'GOLDEN ACE', c: 1.5, r: 14.5, tint: 0 }, { style: 'needle', name: 'THE NEEDLE', c: 1.5, r: 20.5 },
  { style: 'tower', name: 'LUCKY STAR', c: 4.5, r: 3.5, tint: 1 }, { style: 'palms', name: 'NEON PALMS', c: 4.5, r: 9.5 },
  { style: 'tower', name: 'DIAMOND', c: 4.5, r: 15.5, tint: 2 },
];
const used = new Set();
for (const k of casinos) for (const dc of [-0.5, 0.5]) for (const dr of [-0.5, 0.5]) used.add(`${k.c + dc},${k.r + dr}`);
const fill = ['bld_apartment', 'bld_office', 'bld_cafe', 'bld_pizzeria', 'bld_pharmacy', 'bld_office', 'bld_apartment'];
let fi = 0;
for (let r = 1; r < 24; r++) {
  if (city.roadRows.includes(r)) continue;
  for (const c of [2, 4]) if (!used.has(`${c},${r}`)) city.lots.push([c, r, fill[fi++ % fill.length], c === 2 ? 'E' : 'W']);
  for (const c of [1, 5]) if (!used.has(`${c},${r}`)) city.lots.push([c, r, 'lot_grass', 'N']); // parking lots
}
const strip = [[X(3), Z(0)], [X(3), Z(24)]];
const loopW = [[X(0), Z(0)], [X(3), Z(0)], [X(3), Z(24)], [X(0), Z(24)]];
const loopE = [[X(6), Z(24)], [X(3), Z(24)], [X(3), Z(0)], [X(6), Z(0)]];

export default {
  id: 'vegas', code: 'MISSION 5', name: 'OPERATION NEON SKY', theme: 'vegas',
  brief: 'Alien raiders are hitting Las Vegas from the air. Take control of the airspace: shoot down their aircraft until the control meter is full, and keep the Strip standing.',
  tips: ['Air kills fill the meter, raiders left flying drain it', 'Jets bomb casinos in straight runs: cut them off'],
  par: 21000, // a strong run's score: ranks are measured against it
  island, city,
  objective: { kind: 'airspace', goal: 100, loseAt: 3, perKill: { saucer: 3.5, drone: 2, jet: 5, gunship: 6.5, agunship: 7.5 }, decay: 0.3, cap: 9, every: 6.5 },
  start: { x: 160, z: 122, yaw: -Math.PI / 2 },
  lz: { x: 160, z: 122, r: 10 },
  structures: [
    ...casinos.map((k) => ({ kind: 'casino', style: k.style, name: k.name, tint: k.tint ?? 0, x: X(k.c), z: Z(k.r), team: 'friend' })),
    { kind: 'flak', x: X(6) + 14, z: Z(9) }, { kind: 'flak', x: X(0) - 14, z: Z(17) },
  ],
  solids: [[184, 96, 12, 9, 9, 'hangar'], [184, 150, 12, 9, 9, 'hangar'], [130, 70, 3, 3, 14, 'tower']],
  squads: [[X(3), Z(5), 4, 1, 14], [X(3), Z(13), 4, 1, 14], [X(3), Z(21), 4, 1, 14]].map((s) => [...s.slice(0, 5), 'alien']),
  tanks: [], technicals: [], drones: [],
  gunships: { patrol: null, pads: [], initial: 0 },
  civCars: [
    { path: strip.concat([[X(3), Z(0)]]), at: 0.1, model: 'veh_taxi', pingpong: true }, { path: loopW, at: 1.2, model: 'veh_car_pink' }, { path: loopE, at: 0.6, model: 'veh_bus' },
    { path: loopW, at: 2.6, model: 'veh_taxi' }, { path: loopE, at: 2.2, model: 'veh_car_blue' }, { path: loopE, at: 3.4, model: 'veh_taxi' },
  ],
  pickups: [['ammo', X(3), Z(9)], ['fuel', X(3), Z(16)], ['armor', 80, -60], ['ammo', -80, 90], ['fuel', -90, -120], ['armor', 70, 150]],
  // The raid: groups of raiders arrive from the desert while fewer than `cap` are flying.
  raid: [
    [['saucer', 3, -Math.PI / 2]], [['jet', 2, Math.PI]], [['saucer', 2, 0], ['drone', 3, 0]], [['gunship', 1, Math.PI / 2], ['saucer', 2, Math.PI / 2]],
    [['jet', 3, -Math.PI / 4]], [['agunship', 1, Math.PI], ['drone', 3, Math.PI]], [['saucer', 4, Math.PI * 0.75]],
  ],
  decor: { runway: { x0: 120, x1: 205, z: 172, w: 14, alongX: true }, palms: 'vegas' },
};
