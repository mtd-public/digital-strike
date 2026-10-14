// MISSION 3 · OPERATION SKYJACK: an enemy desert base keeps an experimental alien-technology helicopter
// in a shielded hangar. Sabotage the three generators that power the shield, land on the pad, get out
// on foot, run into the hangar and steal the prototype, then fly it out to the carrier offshore.
// The prototype stays yours: it unlocks as a craft for every mission.
const flat = (x0, x1, z0, z1, h, edge, paved = false) => ({ x0, x1, z0, z1, h, edge, paved });
const island = {
  half: 360,
  blobs: [{ x: 0, z: 0, rx: 285, rz: 215, pow: 3.5 }, { x: 250, z: -150, rx: 50, rz: 40, pow: 2 }],
  sea: -9, land: 3, rough: 4,
  hills: [[-180, -110, 24, 50], [150, -150, 20, 45], [-60, 160, 14, 40], [200, 110, 12, 35], [-230, 40, 16, 40]],
  flats: [
    flat(-122, 162, -102, 72, 3, 14, true), // the base apron
    flat(-212, -188, 138, 162, 2, 9, true), // the LZ
  ],
};
const H = { x: 30, z: -50 }; // the alien hangar (open to the south)
const apron = [[-100, -84], [140, -84], [140, 62], [-100, 62]];

export default {
  id: 'heist', code: 'MISSION 3', name: 'OPERATION SKYJACK', theme: 'dusk',
  brief: 'Enemy scientists are flight-testing a helicopter built from alien technology. Knock out the three shield generators, land at the hangar, go in on foot and steal it. Then fly it to the carrier.',
  tips: ['Hover on the hangar pad and press EXIT to get out', 'On foot you are fragile: run for the prototype'],
  par: 21000, // a strong run's score: ranks are measured against it
  island,
  objective: { kind: 'heist' },
  heist: {
    hangar: { x: H.x, z: H.z, hw: 20, hd: 15, h: 12 },
    shield: { x: H.x, z: H.z, r: 34 },
    proto: { x: H.x, z: H.z - 3, yaw: 0 },
    pad: { x: H.x, z: H.z + 44, r: 9 },
    extract: { x: 334, z: 60, r: 16, deck: 9 },
    alarm: { gunships: 3 },
  },
  start: { x: -200, z: 150, yaw: Math.PI * 0.75 },
  lz: { x: -200, z: 150, r: 9 },
  structures: [
    { kind: 'generator', x: -92, z: -68 }, { kind: 'generator', x: 142, z: -60 }, { kind: 'generator', x: 112, z: 52 },
    { kind: 'radar', x: 130, z: 18 }, { kind: 'radar', x: -100, z: 22 },
    { kind: 'sam', x: -62, z: -88 }, { kind: 'sam', x: 122, z: -94 }, { kind: 'sam', x: 88, z: 30 }, { kind: 'sam', x: -24, z: 62 }, { kind: 'sam', x: 2, z: -92 },
    { kind: 'flak', x: -112, z: -40 }, { kind: 'flak', x: 152, z: 0 }, { kind: 'flak', x: 40, z: 66 }, { kind: 'flak', x: -50, z: 36 }, { kind: 'flak', x: 82, z: -90 },
    { kind: 'barracks', x: -40, z: -60, yaw: Math.PI / 2 }, { kind: 'barracks', x: 100, z: -20, yaw: 0 },
    { kind: 'depot', x: -110, z: 50 }, { kind: 'depot', x: 150, z: 40 },
  ],
  // [x, z, half-w, half-d, height, kind, bottom]: the hangar is three walls and a roof (bottom 11.5 m) you
  // can walk under; the roof slides open when the shield drops.
  solids: [
    [H.x - 20, H.z, 1, 15, 12, 'hwall'], [H.x + 20, H.z, 1, 15, 12, 'hwall'], [H.x, H.z - 15, 20, 1, 12, 'hwall'],
    [H.x, H.z, 20, 15, 13, 'roof', 11.5],
    [-62, -20, 11, 8, 8.5, 'hangar'], [-36, -20, 11, 8, 8.5, 'hangar'], [104, 0, 3, 3, 12, 'tower'],
    [334, 60, 12, 46, 9, 'carrier'],
  ],
  squads: [
    [-92, -56, 4, 1, 12], [142, -48, 4, 1, 12], [112, 40, 4, 1, 12],
    [H.x - 6, H.z + 2, 3, 0, 5], [H.x + 6, H.z - 6, 2, 0, 5], // inside the hangar
    [H.x, H.z + 24, 3, 1, 8], [-130, 0, 4, 1, 14], [160, -30, 4, 1, 14], [0, 90, 3, 1, 14], [-150, 120, 3, 0, 14],
  ],
  tanks: [{ x: -100, z: -84, path: apron, at: 0 }, { x: 140, z: 62, path: apron, at: 2 }, { x: -80, z: -70 }, { x: 128, z: -64 }, { x: 98, z: 56 }],
  technicals: [{ path: [[-180, 120], [-120, 70], [-60, 90], [-120, 130]], at: 0 }],
  drones: [],
  saucers: [[-92, -68, 2], [142, -60, 2], [112, 52, 2]],
  gunships: { patrol: [[-120, -120], [160, -120], [180, 80], [-140, 90]], pads: [[-62, -40], [-36, -40]], initial: 1, alien: false },
  civCars: [],
  pickups: [['fuel', -150, 100], ['ammo', -170, 60], ['armor', -60, 110], ['fuel', 180, -110], ['ammo', 60, 110], ['armor', 200, 20]],
  boats: { loop: true, list: [{ at: 3 }, { at: 16 }] },
  decor: { runway: { x0: -110, x1: 40, z: 46, w: 16 }, palms: 'desert', carrier: { x: 334, z: 60 } },
};
