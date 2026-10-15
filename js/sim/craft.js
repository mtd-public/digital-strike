// What you can fly (and walk as). Both craft fold their rotors and stand up on six legs (spider mode,
// TUNING.SPIDER): slower, tougher, invisible to flak and SAMs, same three weapons. Weapon slots are always
// gun / msl / mine, so the HUD, input and autopilot don't care which craft you're in.
import { TUNING as T } from '../tuning.js';

export const CRAFT = {
  // The Apache: dr-mow's attack helicopter (js/scene.js createHeli), now yours.
  apache: {
    name: 'AH-64 APACHE', spiderName: 'AH-64 · SPIDER', speed: T.HELI_SPEED, strafe: T.HELI_STRAFE, accel: T.HELI_ACCEL, turn: T.HELI_TURN,
    armor: T.ARMOR, armorRegen: 0, fuelBurn: T.FUEL_BURN, hitR: 2.6,
    weapons: {
      gun: { name: 'CHAIN GUN', kind: 'bullet', rate: T.GUN_RATE, dmg: T.GUN_DMG, speed: T.GUN_SPEED, spread: T.GUN_SPREAD, range: T.GUN_RANGE, ammo: T.GUN_AMMO, max: T.GUN_MAX, regen: 0, refill: T.LZ_GUN, pick: T.PICK_GUN },
      msl: { name: 'HELLFIRE', kind: 'missile', rate: T.MSL_RATE, dmg: T.MSL_DMG, splash: T.MSL_SPLASH, radius: T.MSL_RADIUS, speed0: T.MSL_SPEED0, speed: T.MSL_SPEED, accel: T.MSL_ACCEL, turn: T.MSL_TURN, life: T.MSL_LIFE, ammo: T.MSL_AMMO, max: T.MSL_MAX, regen: 0, refill: T.LZ_MSL, pick: T.PICK_MSL },
      mine: { name: 'MINES', kind: 'mine', rate: T.MINE_RATE, dmg: T.MINE_DMG, radius: T.MINE_RADIUS, ammo: T.MINE_AMMO, max: T.MINE_MAX, regen: 0, refill: T.LZ_MINE, pick: T.PICK_MINE },
    },
  },
  // The XH-0 prototype stolen in OPERATION SKYJACK: faster, tougher, no fuel, and its alien weapons recharge
  // on their own (energy, not ammo), so it never needs the LZ for anything but repairs.
  alien: {
    name: 'XH-0 PROTOTYPE', spiderName: 'XH-0 · STRIDER', speed: 30, strafe: 22, accel: 46, turn: 3.8,
    armor: 150, armorRegen: 1.5, fuelBurn: 0, hitR: 2.6,
    weapons: {
      gun: { name: 'PLASMA', kind: 'plasma', rate: 9, dmg: 11, speed: 140, spread: 0.02, range: 72, ammo: 120, max: 120, regen: 26, refill: 120, pick: 120 },
      msl: { name: 'SEEKER ORBS', kind: 'orb', rate: 0.3, dmg: 92, splash: 40, radius: 5.5, speed0: 18, speed: 52, accel: 85, turn: 6.5, life: 3.8, ammo: 8, max: 8, regen: 0.55, refill: 8, pick: 8 },
      mine: { name: 'GRAVITY BOMB', kind: 'grav', rate: 0.8, dmg: 240, radius: 12, ammo: 3, max: 3, regen: 0.12, refill: 3, pick: 3 },
    },
  },
};

// The pilot on foot (getting out to steal the prototype): one sidearm, no armor to speak of.
export const FOOT = { name: 'PILOT', speed: 6.4, hp: 40, hitR: 0.6, gun: { name: 'SIDEARM', kind: 'pistol', rate: 4, dmg: 7, speed: 95, spread: 0.035, range: 34 } };
