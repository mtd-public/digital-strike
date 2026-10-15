// MISSION 6 · OPERATION IRON WEB: a blizzard over our northern data-center compound. Every rotor in the
// region is iced up and the enemy is marching on the servers. Fly in, land inside the compound, stand the
// Apache up on its six legs (spider mode), and hold the line through six waves of infantry, tanks,
// technicals, crawler bombs and finally the enemy's own WIDOW walkers. Lose two of the three data centers
// and it's over.
//
// Map (north is -Z): the compound fills the middle of a snowfield; NORTH HALL and FJORD CORE along its
// north side, SOUTH HALL and the LZ to the south; a frozen lake to the east; hills ring the horizon.
const ring = (n, r, h, rad, a0 = 0) => Array.from({ length: n }, (_, i) => { const a = a0 + (i / n) * Math.PI * 2; return [Math.cos(a) * r, Math.sin(a) * r, h * (0.75 + 0.5 * ((i * 37) % 10) / 10), rad]; });
const island = {
  half: 320,
  blobs: [{ x: 0, z: 0, rx: 2000, rz: 2000, pow: 2 }], // snow to the horizon
  sea: -9, land: 3, rough: 4,
  hills: [...ring(10, 270, 42, 64, 0.4), [-140, -112, 14, 40], [146, 128, 12, 36], [-152, 120, 16, 40], [40, -170, 12, 36]],
  flats: [
    { x0: -82, x1: 82, z0: -70, z1: 70, h: 3, edge: 18 }, // the compound
    { x0: 24, x1: 44, z0: 24, z1: 44, h: 3, edge: 4, paved: true }, // the LZ pad
    { x0: 112, x1: 196, z0: -40, z1: 46, h: 1.6, edge: 26, lake: true }, // the frozen lake
  ],
};
// Wave spawns come from a bearing (0 = east, π/2 = south) at the edge of the snowfield.
const W = (kind, n, bearing) => ({ kind, n, bearing });
const N = -Math.PI / 2, S = Math.PI / 2, E = 0, Wst = Math.PI;
export default {
  id: 'ironweb', code: 'MISSION 6', name: 'OPERATION IRON WEB', theme: 'snow',
  brief: 'A blizzard has grounded every rotor in the north and the enemy is marching on our data centers. Land in the compound, stand the Apache up on its six legs and hold the line through six waves.',
  tips: ['Press WALK (T) over open ground: the rotor folds and six legs unfold', 'On legs, flak and SAMs can’t touch you and the armor soaks 30 % more', 'Crawlers are walking bombs: stop them before they reach a data center', 'Stand on the LZ pad to rearm and repair'],
  par: 34000, // a strong run's score: ranks are measured against it
  island,
  objective: {
    kind: 'defend', protect: 'datacenter', loseAt: 2, breakT: 9, spawnR: 160,
    deploy: { x: 0, z: 0, r: 76, done: 'SPIDER MODE · THE BLIZZARD GROUNDS THE ROTOR' },
    noFly: true, noFlyWhy: 'ROTOR ICED · the blizzard grounds all flights',
    goal: 'Defend the data centers', barLabel: 'DATA CENTERS', navLabel: 'DC', loseWhy: 'The data centers fell',
    finalText: 'FINAL WAVE · WIDOW WALKERS', winWhy: 'The compound held',
  },
  start: { x: 0, z: 150, yaw: Math.PI },
  lz: { x: 34, z: 34, r: 9 },
  datacenters: [
    { id: 'NH', name: 'NORTH HALL', style: 'hall', x: -36, z: -30, yaw: 0, hp: 900, tint: 2, team: 'friend' },
    { id: 'FC', name: 'FJORD CORE', style: 'core', x: 38, z: -26, yaw: 0, hp: 1100, tint: 0, team: 'friend' },
    { id: 'SH', name: 'SOUTH HALL', style: 'hall', x: -32, z: 38, yaw: Math.PI, hp: 900, tint: 2, team: 'friend' },
  ],
  structures: [],
  solids: [[66, -54, 8, 6, 6, 'hangar'], [0, -58, 1.6, 9, 5.2, 'containers'], [64, 6, 1.6, 9, 5.2, 'containers'], [-66, 4, 1.6, 9, 2.6, 'containers']],
  squads: [], tanks: [], technicals: [], drones: [], civCars: [],
  gunships: { patrol: null, pads: [], initial: 0 },
  pickups: [['ammo', -62, -2], ['armor', 30, 8], ['ammo', 0, 56], ['armor', 0, -40], ['fuel', -60, 62], ['ammo', 62, -30]],
  waves: [
    [W('soldier', 8, N), W('rpg', 3, N), W('crawler', 4, E + 0.3)],
    [W('tank', 2, Wst), W('soldier', 8, Wst), W('tech', 2, Wst + 0.5), W('crawler', 6, -Math.PI / 4)],
    [W('crawler', 10, S + 0.4), W('tank', 3, N), W('rpg', 5, N), W('gunship', 1, E)],
    [W('tank', 4, E), W('tech', 3, Wst), W('soldier', 12, Wst), W('crawler', 8, -Math.PI * 0.75), W('rpg', 4, E)],
    [W('walker', 1, N), W('crawler', 8, N), W('tank', 3, Math.PI * 0.75), W('soldier', 10, Math.PI / 4)],
    [W('walker', 1, E), W('walker', 1, Wst), W('crawler', 12, N), W('tank', 4, S), W('gunship', 2, Wst), W('rpg', 6, E)],
  ],
  decor: { palms: 'snow' },
};
