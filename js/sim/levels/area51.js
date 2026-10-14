// MISSION 4 · OPERATION DREAMLAND: a defense mission outside Area 51 at night. The aliens want their
// technology back. Hold the base through five waves of alien troopers, hover tanks, saucers and alien
// gunships, then bring down the mothership. Lose Hangar 18 and it's over.
const ring = (n, r, h, rad, a0 = 0) => Array.from({ length: n }, (_, i) => { const a = a0 + (i / n) * Math.PI * 2; return [Math.cos(a) * r, Math.sin(a) * r, h * (0.75 + 0.5 * ((i * 37) % 10) / 10), rad]; });
const island = {
  half: 330,
  blobs: [{ x: 0, z: 0, rx: 2000, rz: 2000, pow: 2 }], // land to the horizon: the Nevada desert
  sea: -9, land: 4, rough: 3,
  hills: [...ring(11, 290, 46, 70, 0.2), [-210, 120, 18, 50], [200, -170, 20, 55]],
  flats: [
    { x0: -132, x1: 132, z0: -104, z1: 104, h: 4, edge: 18, paved: true }, // the base
    { x0: -250, x1: -150, z0: -200, z1: -110, h: 3.2, edge: 30, lake: true }, // Groom Lake's dry bed
  ],
};
// Wave spawns come from a bearing (0 = east, π/2 = south) at the desert's edge.
const W = (kind, n, bearing, extra) => ({ kind, n, bearing, ...extra });
export default {
  id: 'area51', code: 'MISSION 4', name: 'OPERATION DREAMLAND', theme: 'night',
  brief: 'The aliens have come for the technology we took. Defend the base outside Area 51 through five waves, and keep Hangar 18 standing.',
  tips: ['Hangar 18 is the one that matters: watch its bar', 'Saucers drain buildings with tractor beams; shoot them first'],
  par: 31000, // a strong run's score: ranks are measured against it
  island,
  objective: { kind: 'defend', protect: 'vault', breakT: 8 },
  start: { x: 40, z: 22, yaw: Math.PI },
  lz: { x: 40, z: 22, r: 9 },
  structures: [
    { kind: 'vault', x: 0, z: -30, team: 'friend', name: 'HANGAR 18' },
    { kind: 'dome', x: 74, z: -64, team: 'friend', name: 'RADAR DOME' },
    { kind: 'ctower', x: -74, z: -56, team: 'friend', name: 'CONTROL TOWER' },
    { kind: 'fuelfarm', x: -92, z: 22, team: 'friend', name: 'FUEL FARM' },
  ],
  solids: [[-40, 40, 11, 8, 8.5, 'hangar'], [-14, 40, 11, 8, 8.5, 'hangar'], [96, 30, 9, 7, 7, 'hangar']],
  squads: [], tanks: [], technicals: [], drones: [], civCars: [],
  gunships: { patrol: null, pads: [], initial: 0 },
  pickups: [['fuel', -60, 80], ['ammo', 90, 80], ['armor', -110, -90], ['ammo', 110, -90], ['fuel', 0, 95], ['armor', -120, 40]],
  waves: [
    [W('alien', 10, -Math.PI / 2), W('alien', 6, 0.3), W('saucer', 3, -Math.PI / 2)],
    [W('alien', 12, 0), W('heavy', 3, 0), W('hovertank', 2, 0), W('alien', 8, Math.PI * 0.8), W('saucer', 3, Math.PI)],
    [W('saucer', 7, Math.PI / 2), W('agunship', 1, Math.PI / 2), W('alien', 10, Math.PI / 2), W('heavy', 3, -Math.PI / 3), W('hovertank', 2, -Math.PI / 3)],
    [W('hovertank', 4, Math.PI), W('alien', 14, Math.PI), W('heavy', 4, Math.PI), W('saucer', 5, -Math.PI / 4), W('alien', 10, Math.PI / 4), W('agunship', 1, 0)],
    [W('mothership', 1, -Math.PI / 2), W('saucer', 6, -Math.PI / 2), W('agunship', 2, Math.PI / 4), W('alien', 12, Math.PI * 0.75), W('hovertank', 3, 0.2), W('heavy', 4, Math.PI * 0.75)],
  ],
  decor: { runway: { x0: -120, x1: 120, z: 74, w: 18 }, palms: 'desert', searchlights: true },
};
