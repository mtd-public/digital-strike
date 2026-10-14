# Digital Strike: Game Design Document

> *Soviet Strike* / *Nuclear Strike* on a toy diorama: an isometric attack-helicopter campaign where you fly
> dr-mow's Apache against data centers, an enemy strait, an alien base, Area 51 and the Las Vegas Strip, and
> halfway through you get out on foot and steal an alien helicopter.

Play: `python3 -m http.server 8080` → `http://localhost:8080` · Built from: `mstr-gme-dsgn-tmpt/starters/vanilla-three-toy`
plus kits `input/floating-stick-and-hold-buttons`, `audio/sfx-synth`, `touch-zoom-guard`, `three/gltf-assets-and-bake`,
the template's GLB library, and models lifted from dr-mow, Vertical-Vantage and cosmic-calamity (§11).

## 1. Pillars
1. **A gunship, not a plane.** You hover, strafe, circle and pick targets; the chopper climbs over roofs on its own,
   so the only altitude decision is where to be.
2. **Every mission is a different verb.** Destroy (data centers), protect (a tanker), infiltrate (land, walk, steal),
   hold (waves at Area 51), and control (the Vegas airspace meter).
3. **Strike-series logistics.** Armor, fuel and ammo all run out; the LZ pad and winched crates are the rhythm
   between fights.
4. **Readable at a glance.** Red = danger (SAM lock beams, the lock-on reticle when locked, enemy tracers), green =
   good (crates, friendly blips, the LZ), yellow / gold = reward and the primary action (the GUN button, the objective,
   the reticle while acquiring).

## 2. Core loop
```
 ┌── fuel ticking, armor wearing, ammo spending ──────────────────────────────┐
 │  fly toward the nav compass → auto-aim locks the nearest threat             │
 │  hold GUN to strafe (the nose swings onto the target) → MSL once locked →   │
 │  MINE straight down on buildings → winch crates, hover the LZ to rearm       │
 └── mission verb satisfied → extraction / survive / escort done → results ───┘
```

## 3. Controls
| Input | Action |
|---|---|
| Touch: left 60 % of the screen | floating stick; the chopper flies the way you push **on screen** (absolute steering) |
| Touch: GUN (big, bottom-right) | hold: chain gun (12 rounds/s); holding fire swings the nose to the nearest target |
| Touch: MSL / MINE | Hellfires (homing once the reticle is red) / drop an explosive mine |
| Touch: EXIT / ENTER (appears) | get out on the hangar pad; board a craft on foot |
| Keyboard | WASD / arrows fly · Space or J gun · K missile · L mine · E exit/enter · C camera · P pause · M mute |
| Gamepad | left stick fly · right stick point the nose · RT gun · RB/A missile · LB/B mine · X exit/enter · Y camera · Start pause |
| STRIKE camera (C / ◈) | the camera sits behind you and the stick turns the nose (Soviet Strike tank controls); Z/X strafe |

Scheme: docs/04 "Floating stick + hold buttons" (gig-ambulance). The primary verb (GUN) is the biggest button, under
the right thumb in both orientations.

## 4. Numbers (js/tuning.js holds them all, each with its why)
| Parameter | Value | Why |
|---|---|---|
| Apache speed / accel / turn | 24 m/s · 34 m/s² · 3.0 rad/s | crosses a 500 m island in ~21 s; still drifts like a helicopter |
| Cruise | 9.5 m over the ground, 4.5 m over any roof | soldiers read as targets below you; tanks can still reach you |
| Armor / fuel / lives | 100 · 100 (0.42/s ≈ 4 min) · 3 | fuel forces the LZ rhythm without being a chore |
| Chain gun | 12/s, 6 dmg, 115 m/s, 62 m, ×0.35 on hardened buildings | shreds infantry and light vehicles; data centers need missiles and mines |
| Hellfire | 80 + 32 splash, homing after a 0.35 s lock | two kill a tank; ten a data center |
| Mine | 170 dmg, 8.5 m blast, arms 0.6 s, 9 s fuse, ground units trigger it at 4.6 m | the biggest single hit: drop it on the target |
| XH-0 prototype | 30 m/s, 150 armor (regenerates), no fuel; plasma / seeker orbs / gravity bomb recharge | the reward for mission 3 |
| Enemy fire vs a moving chopper | +0.0025 rad spread per m/s of your speed | moving is defence; hovering in a base is not |
| Data center | 1000 hp (city core 1200) | ~4–6 min of a good run for mission 1 |
| Tanker | 1400 hp, 4.6 m/s, ~200 s run | one missed mine (130) or ignored shore gun hurts but doesn't end it |
| Casinos | 1100 hp each; lose three, lose Vegas | jets (2 × 16 per pass) and saucer beams (3.5 dps) wear them down |

Difficulty is per mission (the level file), never per zone. `tools/sim-check.mjs` proves each mission winnable.

## 5. Cast
| Actor | Behaviour | Telegraph | Counter |
|---|---|---|---|
| Player Apache | flies, auto-aims, three weapons, winch | — | — |
| XH-0 prototype | the stolen alien helicopter (plasma, seeker orbs, gravity bomb) | — | — |
| Pilot (on foot) | runs, sidearm, 40 hp | — | — |
| Soldier / RPG team | patrol a leash, close to range, fire | RPG kneels (0.6 s wind-up) | gun, mines |
| Tank / hover tank | path or guard, turret tracks | barrel glows 0.55 s before firing | missiles, mines |
| Technical | pickup with an MG, road loops, bursts | — | gun |
| Flak | 3-round proximity bursts | the gun swings to you | fly fast, missiles |
| SAM site | locks for 1.6 s (3.2 s once the radar is down), homing missile | red beam to you + rising beeps + MISSILE LOCK | break range, shoot the missile down, kill the radar |
| Gunship / alien gunship | patrol, then circle you at 30 m, rocket salvos | nose turns on you | missiles |
| Gunboat | coast loop, or hunts the tanker | — | missiles |
| Drone / saucer | orbit a point, close in, bolts; saucers beam buildings | beam visible | gun |
| Raider jet | bombing runs on casinos, strafing runs on you | straight approach | missiles (it's fast) |
| Mothership | crawls over Hangar 18, charges and burns it | core flashes white 3 s before the beam | everything you have |
| Shore battery | shells the tanker | 1.2 s muzzle flash | missiles |
| Naval mine | floats in the strait, blows on the tanker | blinking light | gun |
| Civilian cars | drive the city loops | — | don't (−250) |
| Crates | fuel / armor / ammo, winched up | light beacons | fly over |

## 6. HUD
Top-left: armor (pulses under 30 %), fuel (hidden for the prototype), lives and score, the radar (screen-aligned;
red ground, orange air, gold objectives, green friends and crates). Top-centre: objective text and goal line, a
progress bar when the mission has one (tanker hp, Hangar 18 hp, airspace control), the nav compass (angle measured
on screen) with label and distance. Top-right: pause, camera, mute. Bottom-right: GUN / MSL / MINE with live ammo
and the weapon names of the current craft, and the contextual EXIT / ENTER. Diegetic: the lock reticle under the
target (yellow → red), SAM lock beams, winch lines, crate beacons. Overlay: the locked target's name and bar,
floating score text, the stick. Warnings: MISSILE LOCK / MISSILE INBOUND / LOW FUEL, red vignette when hurt.

## 7. Art direction
Retro **PS1** by default (dr-mow's retro.js: ~300 lines, vertex snap, 15-bit dither, flat shading, hard shadows,
fog); Smooth adds dr-mow's ink outlines. The town is the gig-ambulance pastel toy kit, toned per mission
(tintMaterials). Palettes per mission in `js/render/terrain-view.js` THEMES: tropic day, overcast strait, desert
dusk, Area 51 night, Vegas night (neon carries it). Emissive budget: lights, LEDs and neon are unlit vertex-colour
'glow' (no per-projectile lights).

## 8. Progression
| # | Mission | Verb | Theme |
|---|---|---|---|
| 1 | OPERATION FIREWALL | destroy 4 data centers, extract | tropical island city, airbase, harbour |
| 2 | OPERATION NARROWS | escort a tanker through a strait | overcast channel between two coasts |
| 3 | OPERATION SKYJACK | sabotage, land, walk, steal the XH-0, escape to the carrier | desert dusk alien base |
| 4 | OPERATION DREAMLAND | hold Area 51 through five waves and the mothership | desert night |
| 5 | OPERATION NEON SKY | control the airspace over Las Vegas | night Strip |

All missions are open; winning mission 3 unlocks the XH-0 for every mission (title screen › CRAFT). Ranks S–D
against each mission's `par`.

## 9. Juice
Shake scaled by blast size; screen flash on big explosions; debris, scorch decals, shock rings; muzzle flash and a
swivelling chin gun; Hellfire pod kick; exhaust puffs and rotor dust / spray when low; buildings fall to burning
rubble that smokes for 30 s; aircraft spin down trailing fire; synth rotor bed, chain-gun rattle, SAM lock beeps.

## 10. Performance budget
| Budget | Target | Now (desktop, busiest view) |
|---|---|---|
| Draw calls | ≤ 180 | ~90–180 (the town bakes per material look; models compact per material) |
| Triangles | ≤ 200k | ~70–190k (the GLB town is the bulk) |
| DPR | ≤ 2; Retro renders ~300 lines | |
| Old devices | `?lite=1` (auto on low memory): no shadows, 1× pixels | |

## 11. Reuse plan (what came from where)
| File | Source | Action |
|---|---|---|
| index.html, css, js/input.js, js/sfx-synth.js, js/utils.js, touch-zoom-guard/, .github/workflows/pages.yml, tools/smoke.mjs | mstr-gme-dsgn-tmpt starters/vanilla-three-toy + kits | copied, then extended (weapons pad, gamepad, rotor loop, military SFX, more profiles) |
| assets/models/*.glb + manifest | mstr-gme-dsgn-tmpt assets/models-3d (built for gig-ambulance) | 30 of the 61 GLBs |
| js/render/assets.js, city.js road fitting, FOOTPRINTS | gig-ambulance js/assets.js, js/town.js | ported |
| createApache, createMissile, createLauncher, createSaucer, retro.js, kit.js toy materials and outlines, fx pool pattern | dr-mow js/scene.js, js/models.js, js/retro.js, js/fx.js | ported; the Apache got liveries, compaction and a player |
| kit.js vertex-colour Kit, data halls, cooling towers, chillers, lattice mast, data-haven tower, radar, crane / ship / pier | Vertical-Vantage js/render/geo.js, packs/ocean-styles.js, fortress-backdrops.js, level-view.js | ported to ground-standing pieces |
| humanParts (troopers, alien grunt / heavy, the pilot), createDrone | cosmic-calamity js/render3d.js makeHuman / makeDrone | ported, merged per part for instancing |
| createBoat silhouette | sub-sinkers src/sprites.js boat | reference |
| GAME_DESIGN.md | mstr-gme-dsgn-tmpt templates/GAME_DESIGN.template.md | filled in |

## 12. Open questions
- Should missions unlock in order? Default chosen: all open (a test build), progress and ranks saved.
- Proper on-foot animation and a winch line for the pilot? Default: chibi trooper walk cycle, instant boarding.
- Mobile performance of the GLB town at 170k triangles. Default: lite mode drops shadows; a low-poly town is the next step.

---

## Since the initial build (delta log)

### claude/clever-pasteur-hwb9c9 (initial build)
- The Apache from dr-mow made player-controllable, with the new chain gun, Hellfires and explosive mines; the
  test level (mission 1) on a gig-ambulance city / island with enemy craft, tanks and soldiers; data centers to destroy.
- Added on request mid-build: the tanker escort (mission 2), the alien-copter heist with on-foot stealing
  (mission 3), the Area 51 defense (mission 4) and Vegas airspace control (mission 5).
- Balance from headless runs (`tools/sim-check.mjs`): flak 4.5 → 2.6 dmg with a 2.4 m proximity fuse, soldier fire
  1.4 → 1.2, tank 9 → 7, a speed-based miss factor for enemy fire; player bullets no longer inherit the chopper's
  velocity (strafing missed every round); the lock cone widens to 2.4 rad while firing; data centers 600 → 1000 hp;
  jets drop 2 × 16 instead of 4 × 34; casinos 520 → 1100 hp.
- Verified: sim-check ALL PASS (every mission won by the autopilot, with and without god mode); smoke test at
  desktop, iPhone 13, iPhone landscape and iPad: 0 console errors, 0 page scroll.
