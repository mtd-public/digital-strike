// TUNING: every number the game plays by, with why (house rule: mstr-gme-dsgn-tmpt AGENTS.md).
// The sim reads these; nothing here touches three.js or the DOM, so tools/sim-check.mjs can load it in node.
export const TUNING = {
  // ---------------------------------------------------------------- the Apache (player)
  HELI_SPEED: 24, // m/s flat out. Crosses the 500 m island in ~21 s: big enough to feel like a campaign, short enough to never be a chore
  HELI_STRAFE: 17, // m/s sideways/back in Strike-cam (tank) controls; slower than forward like the PS1 Strike games
  HELI_ACCEL: 34, // m/s² toward the wanted velocity: snappy enough to dodge a SAM, still has a little drift to read as a helicopter
  HELI_TURN: 3.0, // rad/s nose turn. A full circle in ~2 s keeps auto-strafe readable
  CRUISE: 9.5, // m above the ground: high enough that soldiers read as targets below you, low enough for tanks to reach you
  ROOF_CLEAR: 4.5, // m kept over any roof under or just ahead of you (the chopper climbs over buildings on its own)
  CLIMB_RATE: 3.2, // 1/s altitude spring
  ARMOR: 100,
  FUEL: 100,
  FUEL_BURN: 0.42, // per second → ~4 minutes on a tank. Fuel drums and the LZ top it up; running dry is a crash (Strike rule)
  LIVES: 3,
  RESPAWN_T: 2.6, // s from going down to flying again at the LZ
  INVULN_T: 3, // s of blink after a respawn
  LOW_FUEL: 25, LOW_ARMOR: 30, // warning thresholds (pulse + beep)

  // ---------------------------------------------------------------- spider mode: the craft folds its rotor and walks
  SPIDER: {
    speed: 10, // m/s: twice a tank, well under half the chopper; you choose it for staying power, not to travel
    accel: 32, // m/s²: six legs grip, so it starts and stops sharper than the chopper drifts
    turret: 5, // rad/s the fuselage swings on its leg ring (a turret now: it can face anything while walking)
    H: 3.5, // m: belly over the ground on its legs
    r: 2.2, // m: footprint against walls and buildings
    wade: -1.2, // m: walks out into the shallows, never the sea
    armorMul: 0.7, // damage taken: the leg ring and belly plate soak 30 %
    spreadMul: 0.55, // a planted chain gun is steadier than a hovering one
    fuelMul: 0.3, // walking sips fuel
    slopeSlow: 0.6, // steep ground slows it (up to half speed)
    pickR: 3.2, // m: crates are scooped up underfoot (no winch on legs)
  },
  XFORM_T: 1.3, // s to fold the rotor and unfold the legs, or back: long enough to read and to be a risk, short enough to use in a fight

  // ---------------------------------------------------------------- targeting (Strike-style auto-aim)
  LOCK_RANGE: 66, // m: a bit past the longest enemy gun (SAM 70 m excepted, so a SAM can shoot first: telegraphed)
  LOCK_CONE: 1.05, // rad either side of the nose a new target can be picked in
  LOCK_CONE_FIRING: 2.4, // …and while a fire button is held: the nose swings round to whatever is nearest
  LOCK_KEEP: 1.7, // rad: once locked, the lock holds this far round (auto-strafe keeps it anyway)
  LOCK_TIME: 0.35, // s for the reticle to close: Hellfires fired before then fly dumb
  GROUND_AIM: 24, // m ahead on the ground that unlocked fire lands

  // ---------------------------------------------------------------- weapons
  GUN_RATE: 12, // rounds/s (the new chain gun)
  GUN_DMG: 6, // soldier 10 hp → 2 rounds; tank 140 → ~2 s of fire
  GUN_SPEED: 115, // m/s: near hitscan, but tracers still visible
  GUN_SPREAD: 0.03, // rad
  GUN_RANGE: 62,
  GUN_AMMO: 800, GUN_MAX: 1200,
  STRUCT_GUN_MUL: 0.35, // hardened buildings shrug off half of the chain gun: bring missiles and mines for data centers

  MSL_RATE: 0.38, // s between Hellfires (pylons alternate)
  MSL_DMG: 80, MSL_SPLASH: 32, MSL_RADIUS: 4.5,
  MSL_SPEED0: 22, MSL_SPEED: 58, MSL_ACCEL: 70, MSL_TURN: 4.2, MSL_LIFE: 3.2,
  MSL_AMMO: 12, MSL_MAX: 16,

  MINE_RATE: 0.55, // s between drops
  MINE_DMG: 170, MINE_RADIUS: 8.5, // a direct drop on a data center is the single biggest hit in the game
  MINE_ARM: 0.6, MINE_FUSE: 9, MINE_TRIGGER: 4.6, // armed after landing; blows on its own after the fuse; ground units this close set it off
  MINE_AMMO: 6, MINE_MAX: 8,

  // ---------------------------------------------------------------- landing zone and pickups
  LZ_R: 9, // m: hover inside this to rearm (and to extract at the end)
  LZ_ARMOR: 14, LZ_FUEL: 16, LZ_GUN: 160, LZ_MSL: 3, LZ_MINE: 1.5, // per second refill on the pad
  EXTRACT_T: 1.6, // s hovering on the pad to finish
  WINCH_R: 6.5, // m (horizontal) the winch grabs a crate from
  WINCH_T: 0.7, // s to reel it in
  PICK_ARMOR: 35, PICK_FUEL: 40, PICK_GUN: 300, PICK_MSL: 6, PICK_MINE: 3,

  // ---------------------------------------------------------------- enemies
  SOLDIER: { hp: 10, speed: 3.2, range: 34, rate: [1.6, 2.6], dmg: 1.2, shot: 40, spread: 0.07, see: 48 },
  RPG: { hp: 12, range: 40, rate: [4.2, 5.4], windup: 0.6, dmg: 7, shot: 24 },
  TANK: { hp: 140, speed: 4.6, turret: 1.5, range: 48, rate: 3.4, aim: 0.6, dmg: 7, shot: 50, see: 60 },
  TECH: { hp: 50, speed: 9, range: 38, burst: 5, gap: 0.12, rate: 2.6, dmg: 1.3, shot: 44 },
  FLAK: { hp: 90, range: 58, burst: 3, gap: 0.18, rate: 3.4, dmg: 2.6, shot: 46, blast: 3.0, prox: 2.4, spread: 0.07 },
  SAM: { hp: 110, range: 72, lock: 1.6, lockBlind: 3.2, rangeBlind: 52, cool: 7, speed: 30, turn: 1.6, dmg: 16, life: 7 },
  GUNSHIP: { hp: 160, speed: 15, orbit: 30, see: 85, salvo: 3, gap: 0.16, rate: 4.4, dmg: 5.5, shot: 36, max: 3 },
  BOAT: { hp: 120, speed: 6, range: 56, rate: 2.4, dmg: 7, shot: 46 },
  DRONE: { hp: 18, speed: 9, see: 42, range: 30, rate: 1.4, dmg: 2.2, shot: 50, alt: 5.5 },
  CIV: { hp: 20, speed: 7 },
  // the alien side (missions 4–5) and the strait (mission 2)
  ALIEN: { hp: 12, speed: 4.6, range: 36, rate: [1.2, 2.0], dmg: 1.6, shot: 44, spread: 0.06, see: 60 },
  HEAVY: { hp: 34, speed: 2.4, range: 38, rate: [2.4, 3.2], windup: 0.5, dmg: 5, shot: 32, see: 60 },
  HOVERTANK: { hp: 160, speed: 6, turret: 1.8, range: 50, rate: 2.8, aim: 0.5, dmg: 10, shot: 60, see: 64 },
  SAUCER: { hp: 26, speed: 11, see: 70, range: 34, rate: 1.5, dmg: 2.4, shot: 46, alt: 13, beam: 9, beamDps: 3.5 }, // beam: reach and dps of the tractor beam on a building it hovers over
  AGUNSHIP: { hp: 210, speed: 18, orbit: 28, see: 90, salvo: 3, gap: 0.14, rate: 3.8, dmg: 6.5, shot: 44 },
  JET: { hp: 40, speed: 40, alt: 24, range: 46, dmg: 1.6, shot: 80, bomb: 16, bombs: 2, away: 5, turn: 1.0 },
  MOTHERSHIP: { hp: 2400, speed: 3.5, alt: 34, charge: 3, beam: 2.4, beamDps: 60, cycle: 11, spawn: 22 },
  CRAWLER: { hp: 24, speed: 8, see: 22, dmg: 75, blast: 5.5 }, // six-legged bomb bots (mission 6): fast, fragile, they blow up on whatever they reach
  WALKER: { hp: 900, speed: 3.4, turret: 1.3, range: 58, rate: 3, aim: 0.8, dmg: 14, shot: 52, see: 72, salvo: 4, gap: 0.2, salvoRate: 7.5, rdmg: 5 }, // WIDOW: the enemy's own spider tank, cannon + rocket pods
  NAVMINE: { hp: 6, dmg: 130, blast: 9 }, // floating in the strait: shoot them before the tanker reaches them
  BATTERY: { range: 150, rate: 6, aim: 1.2, dmg: 30, shot: 48, blast: 5 }, // shore guns: they shell the tanker
  BARRACKS_SPAWN: 16, BARRACKS_CAP: 5, // s between reinforcements while you're near; soldiers alive per barracks
  ALERT_R: 95, // m: structures and squads wake when you're this close

  // ---------------------------------------------------------------- scoring
  SCORE: { soldier: 50, rpg: 75, tank: 400, tech: 250, flak: 300, sam: 500, gunship: 800, boat: 600, drone: 150,
    radar: 1000, barracks: 600, depot: 400, datacenter: 5000, civ: -250,
    alien: 60, heavy: 120, hovertank: 450, saucer: 200, agunship: 900, jet: 400, mothership: 5000,
    navmine: 100, battery: 600, boomtower: 800, generator: 1500, crawler: 150, walker: 3000 },
  RANKS: [[30000, 'S'], [24000, 'A'], [18000, 'B'], [12000, 'C'], [0, 'D']],
};
