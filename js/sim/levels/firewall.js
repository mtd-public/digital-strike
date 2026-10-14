// MISSION 1 · OPERATION FIREWALL: destroy four rogue data centers on a tropical island city, then
// return to the LZ for extraction.
//
// Map (north is -Z, east is +X, 1 unit = 1 m, sea level y = 0):
//            radar hill (-110,-115)      north hills
//   AIRBASE     DC2 HILL VAULT (-60,-96) on a terrace
//   runway, hangars, DC1 (-150,8)        CITY (x 16..176, z -56..56) on gig-ambulance road tiles,
//   gunship pads                         DC4 CITY CORE in the middle-north block       HARBOUR quay (x 178..240)
//      village (-40,40)
//   DC3 COAST COOLING (-139,117)               LZ (40,140): start, rearm, extract
import { cityX as cx, cityZ as cz } from './common.js';

const flat = (x0, x1, z0, z1, h, edge, paved = false) => ({ x0, x1, z0, z1, h, edge, paved });
const island = {
  half: 340,
  blobs: [{ x: 0, z: 0, rx: 232, rz: 182, pow: 4 }],
  sea: -9, land: 2.4,
  hills: [[-110, -118, 26, 54], [-20, -142, 19, 44], [70, -132, 13, 40], [-205, -105, 12, 35], [-30, 165, 5, 22]],
  flats: [
    flat(10, 182, -58, 58, 2.0, 16), // the city
    flat(178, 241, -46, 40, 2.0, 1.5, true), // harbour quay (a hard edge: a wall into the sea)
    flat(-206, -94, -34, 58, 2.5, 16, true), // airbase apron and runway
    flat(-120, -100, -125, -105, 27.5, 12), // radar hilltop
    flat(-80, -40, -112, -80, 12, 14), // hill vault terrace
    flat(-162, -116, 98, 136, 2.2, 12), // coast cooling compound
    flat(-72, -8, 22, 62, 2.2, 12), // village
    flat(28, 54, 128, 152, 1.6, 9, true), // the LZ
  ],
};

// The city: tile (c, r) centre x = x0 + c·16, z = z0 + r·16; roads on the listed rows / cols, 2 × 2-lot
// blocks between them, every lot facing a road. Lots: [c, r, model, facing, span].
const city = {
  x0: 24, z0: -48, cols: 10, rows: 7, roadRows: [0, 3, 6], roadCols: [0, 3, 6, 9], y: 2.0,
  lots: [
    [1, 1, 'bld_apartment', 'N'], [2, 1, 'bld_office', 'N'], [1, 2, 'bld_house_lilac', 'S'], [2, 2, 'bld_cafe', 'S'],
    [7, 1, 'bld_office', 'N'], [8, 1, 'bld_apartment', 'N'], [7, 2, 'bld_pharmacy', 'S'], [8, 2, 'bld_pizzeria', 'S'],
    [1, 4, 'bld_hospital', 'N', 2], [1, 5, 'bld_house_peach', 'S'], [2, 5, 'bld_apartment', 'S'],
    [4, 4, 'lot_park', 'N'], [5, 4, 'lot_park', 'N'], [4, 5, 'lot_park', 'S'], [5, 5, 'lot_park', 'S'],
    [7, 4, 'bld_cafe', 'N'], [8, 4, 'bld_house_lilac', 'N'], [7, 5, 'bld_office', 'S'], [8, 5, 'bld_apartment', 'S'],
  ],
};
const X = (c) => cx(city, c), Z = (r) => cz(city, r);
const ringRoad = [[X(0), Z(0)], [X(9), Z(0)], [X(9), Z(6)], [X(0), Z(6)]];
const innerLoop = [[X(3), Z(0)], [X(3), Z(6)], [X(6), Z(6)], [X(6), Z(0)]];
const runwayLoop = [[-198, 26], [-102, 26], [-102, 50], [-198, 50]];

export default {
  id: 'firewall', code: 'MISSION 1', name: 'OPERATION FIREWALL', theme: 'tropic',
  brief: 'Four rogue data centers run the enemy network on this island. Take all four down, then return to the LZ for extraction.',
  tips: ['Hellfires and mines wreck data centers; the chain gun only scratches them', 'Hover on the LZ pad to rearm and refuel'],
  par: 33000, // a strong run's score: ranks are measured against it
  island, city,
  objective: { kind: 'destroy' },
  start: { x: 40, z: 146, yaw: Math.PI }, // nose north, toward the island
  lz: { x: 40, z: 140, r: 9 },
  houses: [[-56, 30, 'bld_house_peach', 'S'], [-40, 30, 'bld_house_lilac', 'S'], [-24, 30, 'bld_cafe', 'S'], [-48, 52, 'bld_pharmacy', 'N'], [-28, 52, 'bld_house_peach', 'N']],
  datacenters: [
    { id: 'DC1', name: 'AIRBASE NODE', style: 'hall', x: -150, z: 8, yaw: 0, hp: 1000, tint: 0 },
    { id: 'DC2', name: 'HILL VAULT', style: 'hall', x: -60, z: -96, yaw: Math.PI / 2, hp: 1000, tint: 2 },
    { id: 'DC3', name: 'COAST COOLING', style: 'hall', x: -139, z: 117, yaw: 0, hp: 1000, tint: 3 },
    { id: 'DC4', name: 'CITY CORE', style: 'core', x: X(4.5), z: Z(1.5), yaw: 0, hp: 1200, tint: 1 },
  ],
  structures: [
    { kind: 'radar', x: -110, z: -115 },
    { kind: 'barracks', x: -108, z: -20, yaw: 0 }, { kind: 'barracks', x: -28, z: -100, yaw: Math.PI / 2 }, { kind: 'barracks', x: -118, z: 138, yaw: 0 },
    { kind: 'depot', x: -194, z: 12 }, { kind: 'depot', x: 214, z: -30 }, { kind: 'depot', x: -160, z: 102 },
    { kind: 'flak', x: -170, z: -6 }, { kind: 'flak', x: -118, z: 52 }, { kind: 'flak', x: X(4.5), z: Z(4.5) },
    { kind: 'flak', x: 205, z: 4 }, { kind: 'flak', x: -48, z: -78 }, { kind: 'flak', x: -124, z: 104 },
    { kind: 'sam', x: -138, z: -14 }, { kind: 'sam', x: -74, z: -110 }, { kind: 'sam', x: -152, z: 132 },
    { kind: 'sam', x: X(3), z: Z(1.5) }, { kind: 'sam', x: 222, z: 22 },
  ],
  // Indestructible solids: [x, z, half-w, half-d, height, kind, bottom]. They block bullets and units; the
  // chopper climbs over them.
  solids: [
    [-185, -14, 11, 8, 8.5, 'hangar'], [-160, -14, 11, 8, 8.5, 'hangar'],
    [-125, -32, 3, 3, 10, 'tower'],
    [214, 30, 3.2, 7, 5.4, 'containers'], [222, 30, 3.2, 7, 2.7, 'containers'], [198, -14, 3.2, 7, 5.4, 'containers'], [190, 30, 3.2, 7, 2.7, 'containers'],
    [232, -6, 2, 9, 16, 'crane'],
    [258, 4, 6, 28, 7, 'ship'],
    [40, 128.5, 3, 2, 3.2, 'tent'],
  ],
  // Squads: [x, z, soldiers, of which RPG, leash radius]
  squads: [
    [62, 104, 3, 0, 14], // first contact on the way north from the LZ
    [-40, 42, 4, 1, 16], [-150, 40, 5, 1, 20], [-176, -28, 4, 1, 18], [-105, -108, 4, 1, 14], [-58, -82, 4, 1, 14],
    [X(3), Z(2), 4, 1, 12], [X(6), Z(5), 4, 1, 12], [X(4.5), Z(3), 4, 1, 14],
    [-140, 98, 4, 1, 16], [-128, 140, 3, 1, 14], [206, 14, 4, 1, 16], [-20, -112, 3, 0, 12],
  ],
  tanks: [
    { x: -190, z: 26, path: runwayLoop, at: 0 }, { x: -102, z: 50, path: runwayLoop, at: 2 },
    { x: -132, z: 22 }, { x: X(0), z: Z(3), path: ringRoad, at: 0.5 }, { x: X(9), z: Z(3), path: ringRoad, at: 2.5 },
    { x: -36, z: -84 }, { x: -126, z: 124 }, { x: -60, z: 120, path: [[-100, 120], [-20, 120], [-20, 96], [-100, 96]], at: 1 },
  ],
  technicals: [{ path: innerLoop, at: 0 }, { path: innerLoop, at: 2 }, { path: [[X(0), 2], [-10, 10], [-60, 14], [-98, 18], [-60, 14], [-10, 10]], at: 0 }],
  drones: [[-60, -96, 3], [X(4.5), Z(1.5), 3]], // [x, z, count] circling a point
  gunships: { patrol: [[-150, -60], [-60, -150], [20, -100], [-40, -40], [-120, -40]], pads: [[-128, -14], [-112, -14]], initial: 1, reinforce: 'perTarget' },
  civCars: [
    { path: ringRoad, at: 0.2, model: 'veh_car_blue' }, { path: ringRoad, at: 1.3, model: 'veh_taxi' }, { path: ringRoad, at: 2.2, model: 'veh_car_pink' },
    { path: ringRoad, at: 3.4, model: 'veh_bus' }, { path: innerLoop, at: 1.1, model: 'veh_car_pink' }, { path: innerLoop, at: 3.0, model: 'veh_car_blue' },
  ],
  pickups: [
    ['fuel', 70, 96], ['ammo', -10, 84], ['armor', 6, -56], ['fuel', -76, -58], ['ammo', -102, -56], ['fuel', 186, 62],
    ['armor', -176, 86], ['ammo', 140, 70], ['fuel', -96, 152], ['armor', 156, -74], ['fuel', -212, -60], ['ammo', 22, 24],
  ],
  boats: { loop: true, list: [{ at: 1 }, { at: 9 }, { at: 19 }] },
  decor: { runway: { x0: -200, x1: -100, z: 38, w: 16 }, harbour: true, palms: 'tropic' },
};
