# Digital Strike

An isometric attack-helicopter campaign in the spirit of *Soviet Strike* and *Nuclear Strike*. You fly the
Apache from [dr-mow](https://github.com/mtd-public/dr-mow), now player-controlled, with a new chain gun, Hellfire
missiles and explosive mines, and it can fold its rotor and stand up on six legs as a **spider tank**. You take on
tanks, soldiers, gunboats, SAM sites and enemy gunships across six missions, and partway through you get out on
foot and steal an alien helicopter.

It is built from [mstr-gme-dsgn-tmpt](https://github.com/mtd-public/mstr-gme-dsgn-tmpt)'s no-build three.js
starter and models from several other mtd-public games (see [Lineage](#lineage)).

## Run

```
python3 -m http.server 8080      # then open http://localhost:8080
```

It needs a server, not `file://`, because ES modules and the import map don't load from disk. There is no build
step and no npm install. three.js r160 is vendored.

URL switches:
- `?art=smooth` gives ink outlines instead of the PS1 look.
- `?lite=1` turns off shadows and draws at 1× pixels.
- `?unlock=1` unlocks the XH-0 prototype without beating mission 3.

## Missions

| # | Mission | What you do |
|---|---|---|
| 1 | **OPERATION FIREWALL** (the test level) | Destroy four rogue **data centers** on a tropical island, then hover on the LZ to extract. The island has a gig-ambulance city, an airbase, a harbour and hills, defended by tanks, soldiers, SAMs, flak, gunboats and gunships. |
| 2 | **OPERATION NARROWS** | **Escort a tanker** up an enemy strait. Shore batteries shell it, gunboats hunt it and naval mines float in the channel. A chain boom stops it until you destroy both boom towers. You rearm on the tanker's helipad. |
| 3 | **OPERATION SKYJACK** | An enemy base is testing an **experimental alien-technology helicopter**. First destroy the three generators that power the hangar shield. Then land on the pad, **get out on foot** and run into the hangar. **Steal the XH-0** and fly it to the carrier. It is yours from then on. |
| 4 | **OPERATION DREAMLAND** | A **defense mission** outside Area 51 at night. Hold the base through five waves of alien troopers, hover tanks, saucers and alien gunships, then bring down the mothership. You lose if Hangar 18 is destroyed. |
| 5 | **OPERATION NEON SKY** | **Las Vegas is under attack.** Take control of the airspace: every aircraft you shoot down fills the control meter, and every one left flying drains it. Fill the meter before raiders destroy three casinos on the Strip. |
| 6 | **OPERATION IRON WEB** | A **blizzard** grounds every rotor in the north. Fly into the compound, land and **transform into the spider tank**, then **defend three allied data centers** on legs through six waves of infantry, tanks, technicals, **crawler bombs** and finally the enemy's own **WIDOW walkers**. You lose if two data centers fall. |

### Spider mode

Press **WALK** over open ground (any mission) and the rotor spins down, its blades telescope in, and six legs
unfold from a ring under the belly. On legs the craft:
- walks at 10 m/s (the chopper does 24) and can't cross water or walk through buildings;
- turns its whole fuselage like a turret, so it can face anything while it walks;
- is invisible to flak and SAMs (they're anti-air) and takes 30 % less damage, but ground fire finds a slow target;
- fires a steadier chain gun, burns a third of the fuel, and scoops up crates underfoot.

Press **FLY** to fold the legs and take off again (mission 6 locks the rotor once the blizzard sets in).

## Controls

| | Touch | Keyboard | Gamepad |
|---|---|---|---|
| Fly / walk | Drag anywhere on the left 60 % (a floating stick) | WASD / arrows | Left stick |
| Point the nose | Automatic (holding fire swings it onto the nearest target) | — | Right stick |
| Chain gun | Hold anywhere on the **right side** of the screen (off the buttons; there's no gun button) | Space / J, or click on the right side | RT |
| Hellfire | **HELLFIRE** (homes once the reticle turns red) | K | RB / A |
| Mine | **MINES** (drops straight down) | L | LB / B |
| Spider mode | **WALK / FLY** | T | L3 / D-pad down |
| Exit / enter | **EXIT / ENTER** (appears when you can) | E | X |
| Camera | ◈ | C | Y |
| Pause / mute | II / ♪ | P or Esc / M | Start / Back |

The camera has two modes:
- **ISO** (default): a fixed isometric view, and the stick points the way you fly on screen.
- **STRIKE**: the camera swings behind the chopper, and the stick turns the nose like the PS1 games. Z and X strafe.

Fuel, armor and ammo all run out. To restock, hover (or stand) on the **LZ** pad, or fly over a crate to winch it up.

## Code map

```
index.html, css/style.css     page shell and HUD (layout rules from the template: 100dvh, no scroll, safe areas)
js/main.js                    boot, screens, fixed-step loop, input → sim, events → view / HUD / audio, attract mode
js/tuning.js                  every gameplay number, each with a why
js/sim/                       the simulation: no three.js, no DOM (tools/sim-check.mjs runs it in node)
  world.js                    createWorld / step: the player (flight, on foot, weapons, winch, LZ), projectiles, damage
  craft.js                    the Apache, the XH-0 prototype (both also walk: spider mode, TUNING.SPIDER), the pilot on foot
  ai.js                       soldiers, tanks, technicals, traffic, boats, drones, saucers, gunships, jets, mothership, crawlers, walkers, flak, SAMs, batteries
  objectives.js               destroy / escort / heist / defend (one building or several, optional deploy stage) / airspace scripts, waves, the nav target
  autopilot.js                the bot that flies the attract mode and proves every mission can be won
  terrain.js                  island heights (blobs, channels, hills, pads), sampled to a grid
  levels/                     the six missions as plain data (+ common.js: footprints, hit volumes)
js/render/                    three.js only
  view.js                     the scene, entity visuals, projectiles, reticle, beams, camera
  models.js                   Apache, XH-0, tanks, boats, drones, saucers, jets, tanker, missiles, troopers, WIDOW walker, crawler
  legs.js                     the six-legged rig (two-bone IK, feet planted in the world, tripod gait) for spider mode and the walkers
  structures.js               data centers, radar, barracks, depots, generators, casinos, Hangar 18, pads, piers
  city.js, assets.js          gig-ambulance GLB town: road fitting, lots, greenery, static baking
  terrain-view.js             terrain mesh (grain texture, beach / rock blends), the sea shader (depth, waves, shore foam), palettes
  decor.js                    grass tufts that sway in the wind, boulders, dirt tracks along the vehicle routes
  atmos.js                    cloud shadows, glow points (beacons, floodlights, lamps), gulls, desert dust
  fx.js, kit.js               pooled instanced particles, billboard fire / smoke, glows, wakes, pooled explosion lights;
                              the model kit (toy materials, outlines, vertex-colour Kit)
js/hud.js, js/input.js, js/sfx-synth.js, js/retro.js
tools/sim-check.mjs           headless checks: spawns, every mission won by the autopilot, every weapon does damage, spider-mode rules
tools/smoke.mjs               Playwright: phone (touch-hold fire, WALK), phone landscape, tablet, desktop; 0 console errors, 0 page scroll
```

## Verify

```
node tools/sim-check.mjs                                   # ALL PASS
python3 -m http.server 8080 &
CHROMIUM=/opt/pw-browsers/chromium node tools/smoke.mjs    # SMOKE PASS
```

## Lineage

| From | What |
|---|---|
| [dr-mow](https://github.com/mtd-public/dr-mow) | The Apache (`createHeli`), the homing missile, the SAM launcher, the UFO (saucers and mothership), the PS1 retro renderer, the toy material and ink-outline kit, the particle-pool pattern |
| [mstr-gme-dsgn-tmpt](https://github.com/mtd-public/mstr-gme-dsgn-tmpt) | The vanilla three.js starter (shell, stick and hold buttons, synth audio, utils), the touch-zoom guard, the GLB model library and manifest, the smoke test, the design-doc template and house rules |
| [gig-ambulance](https://github.com/mtd-public/gig-ambulance) | The city: road tiles and their rotation fitting, buildings and their collision footprints, cars, bus, pickup (the technicals), palms and trees; the asset loader and static baking |
| [Vertical-Vantage](https://github.com/mtd-public/Vertical-Vantage) | The vertex-colour geometry kit; the data hall, cooling towers, chillers, comms mast and data-haven tower (OCEAN CORE); the radar; the crane, cargo ship and pier (HARBOR 9) |
| [cosmic-calamity](https://github.com/mtd-public/cosmic-calamity) | Troopers (`makeHuman`): soldiers, the reptilian alien grunt and heavy, the pilot. Also the drone |
| [sub-sinkers](https://github.com/mtd-public/sub-sinkers) | Silhouette reference for the gunboat |

Design doc: [GAME_DESIGN.md](GAME_DESIGN.md).
