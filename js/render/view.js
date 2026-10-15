// The renderer: builds a mission's diorama from the world and poses it every frame. It owns no game state
// (house rule): it reads `w`, plays the events it is handed, and keeps only visual state (smoothing, pools,
// particles, the camera). Camera: dr-mow's narrow perspective from the isometric diagonal ("iso"), or the
// Soviet Strike chase view that swings round behind the chopper ("strike").
import * as THREE from 'three';
import { RETRO, RETRO_LINES, LITE } from '../retro.js';
import { THEMES, buildTerrain, buildWater } from './terrain-view.js';
import { FX } from './fx.js';
import * as M from './models.js';
import * as S from './structures.js';
import { buildTown, CITY_ASSETS } from './city.js';
import { buildDecor } from './decor.js';
import { buildAtmos, updateAtmos } from './atmos.js';
import { LegRig, LEG_STYLE } from './legs.js';
import { loadAssets, spawn, hasModel, tintMaterials, cloneMaterials } from './assets.js';
import { mat } from './kit.js';
import { playerPos, lzPos } from '../sim/world.js';
import { TUNING as T } from '../tuning.js';
import { clamp, damp, wrapAngle } from '../utils.js';

const FOV = 32, PITCH = { iso: 52, strike: 44 }, SPAN = { fly: 52, spider: 42, foot: 28 }; // SPAN: metres across the short side of the screen
const TRACER = { bullet: [0xffe27a, 2.4, 0.13], pistol: [0xfff0b0, 1.3, 0.1], plasma: [0x3dfff0, 3.0, 0.24], ebullet: [0xff5a30, 1.8, 0.13], bolt: [0x7aff4a, 1.6, 0.3], flak: [0x2a2a2a, 0.6, 0.5], shell: [0xffa040, 1.0, 0.36] };
const INF = ['soldier', 'rpg', 'alien', 'heavy', 'pilot'];
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _c = new THREE.Color();
const BURNT = mat(0x1e1a18, { roughness: 1 }), _m3 = new THREE.Matrix4();

export class View {
  constructor(canvas) {
    const r = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !RETRO && !LITE, powerPreference: 'high-performance' }));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.shadowMap.enabled = !LITE;
    r.shadowMap.type = RETRO ? THREE.BasicShadowMap : THREE.PCFSoftShadowMap;
    if (RETRO) canvas.classList.add('retro');
    const scene = (this.scene = new THREE.Scene());
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x666666, 1.3); scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.2);
    this.sun.castShadow = !LITE;
    this.sun.shadow.mapSize.set(RETRO ? 1024 : 2048, RETRO ? 1024 : 2048);
    Object.assign(this.sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 300 });
    this.sun.shadow.bias = -0.0008; this.sun.shadow.normalBias = 0.05;
    scene.add(this.sun, this.sun.target);
    this.camera = new THREE.PerspectiveCamera(FOV, 1, 1, 900);
    this.fx = new FX(scene);
    this.root = new THREE.Group(); scene.add(this.root);
    this.camMode = 'iso'; this.camYaw = Math.PI / 4; this.focus = new THREE.Vector3(); this.focusY = 10; this.span = SPAN.fly;
    this.screenRight = new THREE.Vector2(); this.screenUp = new THREE.Vector2(); this.pitch = PITCH.iso;
    // the player's craft (both built; one shows), the pilot on foot
    this.apache = M.createApache(M.LIVERY.player); this.alien = M.createAlienCopter(M.ALIEN_LIVERY.player);
    scene.add(this.apache, this.alien);
    // spider mode: six legs that unfold from a ring under the belly (one rig per craft; the fuselage turns on top)
    this.legs = { apache: new LegRig({ style: LEG_STYLE.apache, s: 1.3 }), alien: new LegRig({ style: LEG_STYLE.alien, s: 1.3 }) };
    this.legYaw = 0; this.steps = 0; this.stomps = 0;
    for (const r of Object.values(this.legs)) { scene.add(r.group); r.onStep = (x, y, z) => { this.steps++; this.fx.dust(x, y, z, 1, 0.45); }; }
    // troops: three InstancedMeshes per look (body, left leg, right leg)
    this.troops = {};
    const tm = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    for (const k of INF) {
      const P = M.humanParts(k), n = k === 'pilot' ? 1 : 140, mk = (geo) => { const im = new THREE.InstancedMesh(geo, tm, n); im.castShadow = true; im.frustumCulled = false; im.count = 0; scene.add(im); return im; };
      this.troops[k] = { P, body: mk(P.body), legL: mk(P.legL), legR: mk(P.legR), n: 0, cap: n };
    }
    // tracers: one InstancedMesh for every bullet-like round
    this.tracers = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), 500); // glowing tracers
    this.tracers.setColorAt(0, _c.set(0xffffff)); this.tracers.frustumCulled = false; this.tracers.count = 0; scene.add(this.tracers);
    this.shotVis = new WeakMap(); this.shotPool = {}; this.mineVis = new WeakMap(); this.minePool = [];
    // the lock-on reticle (dr-mow's: a ring with four ticks, closing in as the lock builds)
    const rm = new THREE.MeshBasicMaterial({ color: 0xffd23a, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false, depthTest: false });
    this.reticle = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 24), rm); ring.rotation.x = -Math.PI / 2; this.reticle.add(ring);
    for (let i = 0; i < 4; i++) { const tick = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.55), rm); tick.rotation.x = -Math.PI / 2; tick.rotation.z = (i * Math.PI) / 2; tick.position.set(Math.sin((i * Math.PI) / 2) * 1.12, 0, Math.cos((i * Math.PI) / 2) * 1.12); this.reticle.add(tick); }
    this.reticle.renderOrder = 10; this.reticle.visible = false; scene.add(this.reticle);
    this.reticleMat = rm;
    // lock beams (SAMs locking on to you) and winch lines
    this.beams = Array.from({ length: 6 }, () => { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1, 5), new THREE.MeshBasicMaterial({ color: 0xff2a2a, transparent: true, opacity: 0.6, depthWrite: false })); b.visible = false; scene.add(b); return b; });
    this.winch = Array.from({ length: 3 }, () => { const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0x222222 })); l.visible = false; l.frustumCulled = false; scene.add(l); return l; });
    this.vis = new Map(); this.pickVis = new Map();
    this.t = 0;
  }

  async load(onProgress) {
    await loadAssets(CITY_ASSETS, onProgress);
  }

  // ---------------------------------------------------------------- build a mission
  build(w) {
    for (const v of this.vis.values()) v.obj?.removeFromParent();
    this.vis.clear(); this.pickVis.forEach((o) => o.removeFromParent()); this.pickVis.clear();
    this.root.clear(); this.fx.clear();
    const L = w.level, theme = (this.theme = L.theme), TH = THEMES[theme];
    this.scene.background = new THREE.Color(TH.sky);
    this.scene.fog = new THREE.Fog(TH.fog, TH.fogNear, TH.fogFar);
    this.fx.setNight(!!TH.night); this.fx.setDust(TH.dust);
    this.hemi.color.set(TH.hemiSky); this.hemi.groundColor.set(TH.hemiGround); this.hemi.intensity = this.hemiI = TH.hemiI;
    this.sun.color.set(TH.sun); this.sun.intensity = TH.sunI; this.sunDir = new THREE.Vector3(...TH.sunDir).normalize();
    // the gig pastels, toned to each mission
    tintMaterials(TH.night ? { grass: 0x2a4a2a, grass2: 0x22401f, sidewalk: 0x4a4a58 } : TH.snow ? { grass: 0xdfe6ee, grass2: 0xd0d8e2, sidewalk: 0x9aa0a8 } : theme === 'dusk' ? { grass: 0x9a8a50, grass2: 0x8a7a44, sidewalk: 0xa89a8a } : { grass: 0x4a9a3a, grass2: 0x3a8a30, sidewalk: 0xb8b4c0 });
    const terr = buildTerrain(w.terrain, L, theme); this.root.add(terr);
    if (terr.userData.minH < -0.5) { this.water = buildWater(theme, w.terrain); this.root.add(this.water); } else this.water = null;
    const town = buildTown(w, theme); this.root.add(town);
    this.decor = buildDecor(w); this.root.add(this.decor);
    this.atmos = buildAtmos(w, this.fx.glowTex, town.userData.lamps); this.root.add(this.atmos.group);
    // solids
    for (const b of w.solids) {
      if (b.kind.startsWith('bld_') || b.kind === 'lot_park') continue; // drawn by the town
      const o = S.solid(b.kind, b.hw, b.hd, b.y1 - b.y0);
      o.position.set(b.x, b.y0, b.z); o.rotation.y = Math.atan2(b.s, b.c);
      if (b.kind === 'roof') { this.roof = o; o.userData.solid = b; }
      this.root.add(o);
    }
    // pads and runways
    if (L.lz && !L.lz.follow) { const p = S.lzPad(L.lz.r); p.position.set(L.lz.x, w.terrain.surface(L.lz.x, L.lz.z) + 0.02, L.lz.z); this.root.add(p); }
    if (L.heist) { const p = S.lzPad(L.heist.pad.r); p.position.set(L.heist.pad.x, w.terrain.surface(L.heist.pad.x, L.heist.pad.z) + 0.02, L.heist.pad.z); this.root.add(p);
      this.shieldDome = S.shieldDome(L.heist.shield.r); this.shieldDome.position.set(L.heist.shield.x, w.terrain.surface(L.heist.shield.x, L.heist.shield.z), L.heist.shield.z); this.root.add(this.shieldDome); } else this.shieldDome = null;
    const R = L.decor?.runway;
    if (R) { const rw = S.runway(R.x0, R.x1, R.w); rw.position.set((R.x0 + R.x1) / 2, w.terrain.surface((R.x0 + R.x1) / 2, R.z) + 0.06, R.z); this.root.add(rw); }
    if (L.decor?.harbour) for (const z of [-24, 16]) { const p = S.pier(36, 7); p.position.set(258, 0, z); this.root.add(p); }
    if (L.decor?.searchlights) { this.searchlights = []; for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2, s = S.searchlight(); s.position.set(Math.cos(a) * 120, w.terrain.surface(Math.cos(a) * 120, Math.sin(a) * 100), Math.sin(a) * 100); this.root.add(s); this.searchlights.push(s); } } else this.searchlights = null;
    this.boom = null;
    if (L.decor?.boom) { const [[ax, az], [bx, bz]] = L.decor.boom.towers; this.boom = S.boomChain(ax, az, bx, bz); this.root.add(this.boom); }
    // snap the camera
    this.snap = true;
  }

  resize(cw, ch) {
    const pr = RETRO ? Math.min(1, RETRO_LINES / Math.min(cw, ch)) : Math.min(window.devicePixelRatio || 1, LITE ? 1 : 2);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(cw, ch, true);
    this.camera.aspect = cw / ch;
    this.camera.updateProjectionMatrix();
    this.aspect = cw / ch;
  }

  // ---------------------------------------------------------------- entity visuals
  makeVis(e) {
    let obj = null;
    const k = e.kind;
    if (k === 'struct') {
      const t = e.type;
      obj = t === 'datacenter' ? (e.style === 'core' ? S.dataCore(e.tint) : S.dataHall(e.tint)) : t === 'radar' ? S.radar() : t === 'barracks' ? S.barracks() : t === 'depot' ? S.depot()
        : t === 'flak' ? M.createFlak() : t === 'sam' ? M.createLauncher() : t === 'battery' ? S.battery() : t === 'boomtower' ? S.boomTower() : t === 'generator' ? S.generator()
          : t === 'vault' ? S.vault() : t === 'dome' ? S.dome() : t === 'ctower' ? S.ctower() : t === 'fuelfarm' ? S.depot(true) : t === 'casino' ? S.casino(e.style, e.name, e.tint) : new THREE.Group();
      const b = e.boxes[0];
      const rub = S.rubble(Math.max(6, b.hw * 2), Math.max(6, b.hd * 2), e.id); rub.visible = false; rub.position.set(e.x, e.y, e.z); rub.rotation.y = e.yaw; this.root.add(rub);
      obj.userData.rubble = rub;
      if (!['flak', 'sam', 'casino', 'generator', 'boomtower'].includes(t)) { // a concrete footing under the whole footprint
        const c = Math.cos(e.yaw), sn = Math.sin(e.yaw);
        let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
        for (const q of e.boxes) { const dx = q.x - e.x, dz = q.z - e.z, lx = dx * c - dz * sn, lz = dx * sn + dz * c; x0 = Math.min(x0, lx - q.hw); x1 = Math.max(x1, lx + q.hw); z0 = Math.min(z0, lz - q.hd); z1 = Math.max(z1, lz + q.hd); }
        const pad = t === 'datacenter' && e.style === 'hall' ? 5 : 2.6, f = S.foundation(x1 - x0 + pad * 2, z1 - z0 + pad * 2);
        f.position.set(e.x + ((x0 + x1) / 2) * c + ((z0 + z1) / 2) * sn, e.y, e.z - ((x0 + x1) / 2) * sn + ((z0 + z1) / 2) * c); f.rotation.y = e.yaw;
        this.root.add(f);
      }
    } else if (k === 'tank' || k === 'hovertank') obj = M.createTank(k === 'hovertank');
    else if (k === 'tech') { obj = new THREE.Group(); if (hasModel('veh_pickup')) { const p = cloneMaterials(spawn('veh_pickup')); p.traverse((o) => { if (o.isMesh && (o.material.name === 'white' || o.material.name === 'orange')) o.material.color.set(o.material.name === 'white' ? 0xa8986a : 0x6a6a3a); }); obj.add(p); } const mg = M.createMG(); mg.position.set(0, 1.2, -1); obj.add(mg); obj.userData.gun = mg.userData.gun; }
    else if (k === 'civ') { obj = new THREE.Group(); if (hasModel(e.model)) obj.add(spawn(e.model)); }
    else if (k === 'boat') obj = M.createBoat();
    else if (k === 'drone') obj = M.createDrone();
    else if (k === 'saucer') { obj = M.createSaucer(1.4); this.root.add(obj.userData.beam); }
    else if (k === 'mothership') { obj = M.createMothership(); this.root.add(obj.userData.beam); obj.userData.beam.scale.set(4, 1, 4); }
    else if (k === 'gunship') obj = M.createHind('desert');
    else if (k === 'agunship') obj = M.createAlienCopter(M.ALIEN_LIVERY.enemy);
    else if (k === 'jet') obj = M.createJet();
    else if (k === 'navmine') obj = M.createNavMine();
    else if (k === 'tanker') obj = M.createTanker();
    else if (k === 'walker') { obj = M.createWalker(); this.root.add(obj.userData.rig.group); obj.userData.rig.onStep = (x, y, z) => { this.stomps++; this.fx.dust(x, y, z, 1, 0.75); }; }
    else if (k === 'crawler') obj = M.createCrawler();
    else if (k === 'parked') obj = e.craft === 'alien' ? M.createAlienCopter(M.ALIEN_LIVERY.player) : M.createApache(M.LIVERY.player);
    else if (INF.includes(k)) return { troop: k };
    if (!obj) return { none: true };
    obj.position.set(e.x, e.y, e.z); obj.rotation.y = e.yaw;
    this.root.add(obj);
    return { obj, kind: k, bank: 0, burnt: false, smokeT: 0 };
  }

  poseVis(e, v, dt, t, w) {
    const o = v.obj, u = o.userData, k = e.kind;
    if (k === 'struct') {
      if (!e.alive) {
        if (o.visible) { o.visible = false; u.rubble.visible = true; v.deadAt = t; }
        if (t - v.deadAt < 30 && (v.smokeT -= dt) <= 0) { v.smokeT = 0.18; this.fx.smoke(e.x + (Math.random() - 0.5) * 6, e.y + 2, e.z + (Math.random() - 0.5) * 6, 2.2, true, 4, 3); if (Math.random() < 0.4) this.fx.flame(e.x + (Math.random() - 0.5) * 5, e.y + 1, e.z + (Math.random() - 0.5) * 5, 1); }
        return;
      }
      if (u.head && e.tyaw != null) u.head.rotation.y = damp(u.head.rotation.y, wrapAngle(e.tyaw - e.yaw), 6, dt);
      if (u.tube) u.tube.position.z = -(e.recoil = Math.max(0, (e.recoil || 0) - dt * 3)) * 0.4;
      if (u.tip) u.tip.visible = e.aimT > 0 && Math.floor(t * 12) % 2 === 0;
      if (u.spin) u.spin.rotation.y = t * 1.4;
      if (u.rings) {
        u.rings.forEach((r, i) => { r.position.y = 4 + i * 1.1 + Math.sin(t * 3 + i) * 0.15; }); u.glow.color.setHSL(0.85 + Math.sin(t * 7) * 0.03, 1, 0.55 + Math.random() * 0.1); u.orb.scale.setScalar(0.9 + Math.random() * 0.3);
        if ((v.arcT = (v.arcT || 0) - dt) <= 0) {
          v.arcT = 0.06 + Math.random() * 0.08;
          const a = u.arcs.geometry.attributes.position;
          for (let k = 0; k < 3; k++) {
            const ang = Math.floor(Math.random() * 8) * (Math.PI / 4), ex = Math.cos(ang) * 3.4, ez = Math.sin(ang) * 3.4;
            let px = 0, py = 8.6, pz = 0;
            for (let j = 0; j < 7; j++) {
              const f = (j + 1) / 7, nx = ex * f + (j < 6 ? (Math.random() - 0.5) * 0.9 : 0), ny = 8.6 + (3.7 - 8.6) * f + (j < 6 ? (Math.random() - 0.5) * 0.6 : 0), nz = ez * f + (j < 6 ? (Math.random() - 0.5) * 0.9 : 0);
              const o = (k * 7 + j) * 2;
              a.setXYZ(o, px, py, pz); a.setXYZ(o + 1, nx, ny, nz);
              px = nx; py = ny; pz = nz;
            }
          }
          a.needsUpdate = true;
          if (Math.random() < 0.3) this.fx.glow(e.x, e.y + 8.6, e.z, 6, 0xff60ff, 0.1);
        }
      }
      if (u.beam) u.beam.material.opacity = 0.25 + Math.sin(t * 2) * 0.08;
      return;
    }
    if (k === 'tanker') {
      o.position.set(e.x, Math.sin(t * 0.8) * 0.15, e.z); o.rotation.y = e.yaw; o.rotation.z = Math.sin(t * 0.6) * 0.012;
      if (e.alive && Math.random() < 0.6) { // bow wave and a wake down both sides
        const fx = Math.sin(e.yaw), fz = Math.cos(e.yaw), side = Math.random() < 0.5 ? -1 : 1, along = -28 + Math.random() * 56;
        this.fx.wake(e.x + fx * 31, e.z + fz * 31, 2.2, 1.4);
        this.fx.wake(e.x + fx * along + fz * side * 6.2, e.z + fz * along - fx * side * 6.2, 1.6, 2.6);
        this.fx.wake(e.x - fx * (30 + Math.random() * 10) + (Math.random() - 0.5) * 6, e.z - fz * (30 + Math.random() * 10), 3, 4);
      }
      if (!e.alive && !v.sunk) { v.sunk = true; }
      if (v.sunk) o.position.y -= 1;
      return;
    }
    if (k === 'walker') return this.poseWalker(e, v, dt, t, w);
    if (k === 'crawler') {
      o.position.set(e.x, e.y, e.z); o.rotation.y = e.yaw; o.visible = e.alive;
      const sc = Math.sin(t * 24 + e.id) * 0.35; u.sets[0].rotation.y = sc; u.sets[1].rotation.y = -sc; u.body.position.y = Math.abs(sc) * 0.12;
      u.eye.visible = Math.floor(t * 9 + e.id) % 2 === 0;
      return;
    }
    if (k === 'parked') { o.position.set(e.x, e.y + 1.0, e.z); o.rotation.y = e.yaw; o.visible = e.alive; if (u.rotor) u.rotor.rotation.y += dt * (v.spin = Math.max(0, (v.spin ?? 20) - dt * 5)); if (u.ring) u.ring.material.color.set(e.locked ? 0x3a3a4a : 0x3dfff0); return; }
    // moving things
    const air = e.air;
    if (!e.alive && !e.falling && e.crashed) { o.visible = false; if (u.beam) u.beam.visible = false; return; }
    const prevX = o.position.x, prevZ = o.position.z;
    o.position.set(e.x, e.y + (k === 'hovertank' ? 0.6 + Math.sin(t * 3 + e.id) * 0.12 : 0) + (k === 'boat' ? Math.sin(t * 1.4 + e.id) * 0.2 : 0) + (k === 'navmine' ? e.y : 0) * 0, e.z);
    if (k === 'boat' && !e.alive) { v.sink = (v.sink || 0) + dt; o.position.y = -v.sink * 1.2; o.rotation.z = v.sink * 0.2; if (v.sink > 4) o.visible = false; }
    o.rotation.y = e.yaw;
    if (air) {
      const vx = (e.x - prevX) / Math.max(dt, 1e-3), vz = (e.z - prevZ) / Math.max(dt, 1e-3);
      const fwd = vx * Math.sin(e.yaw) + vz * Math.cos(e.yaw), side = vx * Math.cos(e.yaw) - vz * Math.sin(e.yaw);
      const tilt = u.tilt || o;
      if (u.tilt) { u.tilt.rotation.x = damp(u.tilt.rotation.x, clamp(fwd * 0.03, -0.35, 0.35), 4, dt); u.tilt.rotation.z = damp(u.tilt.rotation.z, clamp(-side * 0.04, -0.4, 0.4), 4, dt); }
      if (k === 'jet') o.rotation.z = damp(o.rotation.z, clamp(-side * 0.05, -0.9, 0.9), 3, dt);
      if (u.rotor) u.rotor.rotation.y += dt * 26;
      if (u.tail) u.tail.rotation.x += dt * 34;
      if (u.lights) u.lights.rotation.y += dt * 2;
      if (u.under) u.under.material.color.setHSL(0.3, 1, 0.45 + Math.sin(t * 5 + e.id) * 0.15);
      if (u.rotors) for (const r of u.rotors) r.rotation.z += dt * 30;
      if (u.beam) {
        u.beam.visible = !!e.beam && e.alive;
        if (u.beam.visible) { const gy = this.ground(w, e.x, e.z), h = Math.max(1, e.y - gy); u.beam.position.set(e.x, gy + h / 2, e.z); u.beam.scale.y = h; u.beam.material.opacity = k === 'mothership' ? 0.5 + Math.random() * 0.2 : 0.3; }
      }
      if (k === 'mothership' && u.core) { u.core.scale.setScalar(e.charging ? 1 + Math.sin(t * 20) * 0.3 + 0.5 : 1); u.core.material.color.set(e.charging ? 0xffffff : 0x9dff7a); }
      if (e.falling) { o.rotation.z += dt * 4; if (Math.random() < 0.7) this.fx.smoke(e.x, e.y, e.z, 1.2, true, 1, 1.2); this.fx.flame(e.x, e.y, e.z, 0.8); }
      if (k === 'gunship' && e.alive && Math.random() < 0.3 && u.exhausts?.length) { u.exhausts[0].getWorldPosition(_v); this.fx.puff(_v.x, _v.y, _v.z, -Math.sin(e.yaw) * 3, -Math.cos(e.yaw) * 3, 0.3); }
      return;
    }
    if (u.turret) {
      u.turret.rotation.y = damp(u.turret.rotation.y, e.tyaw || 0, 8, dt);
      if (u.tip) u.tip.visible = e.aimT > 0 && Math.floor(t * 14) % 2 === 0;
      if (u.gun && e.recoil) { e.recoil = Math.max(0, e.recoil - dt * 3); u.gun.position.z = 1.1 - e.recoil * 0.5; }
    }
    if (k === 'tech' && u.gun && e.tyaw != null) u.gun.rotation.y = e.tyaw;
    if (u.tracks && e.alive) { const sp = Math.hypot(e.vx || 0, e.vz || 0); for (const m of u.tracks) m.map.offset.y = (m.map.offset.y - sp * dt * 0.18) % 1; if (sp > 1 && Math.random() < 0.25) this.fx.dust(e.x - Math.sin(e.yaw) * 3, e.y + 0.3, e.z - Math.cos(e.yaw) * 3, 1, 0.9); }
    if (u.radar) u.radar.rotation.y += dt * 2.5;
    if (k === 'navmine') { o.position.y = e.y; o.rotation.y = t * 0.3; }
    if (k === 'boat' && e.alive && Math.random() < 0.7) { const sp = Math.hypot(e.vx || 0, e.vz || 0); this.fx.wake(e.x - Math.sin(e.yaw) * 5 + (Math.random() - 0.5) * 2, e.z - Math.cos(e.yaw) * 5, 1.2 + sp * 0.12, 2.6); if (sp > 2) this.fx.wake(e.x + Math.sin(e.yaw) * 6, e.z + Math.cos(e.yaw) * 6, 1, 0.8); }
    if (!e.alive && !v.burnt && k !== 'boat') {
      v.burnt = true;
      o.traverse((m) => { if (m.isMesh && !m.userData.hull) m.material = BURNT; });
      if (u.turret) { u.turret.position.y += 0.6; u.turret.rotation.z = 0.5; }
    }
    if (!e.alive && k !== 'boat' && (v.smokeT -= dt) <= 0 && e.deadT < 12) { v.smokeT = 0.2; this.fx.smoke(e.x, e.y + 1.5, e.z, 1.2, true, 3, 2); if (e.deadT < 7 && !INF.includes(k)) { this.fx.flame(e.x + (Math.random() - 0.5) * 2, e.y + 1.4, e.z + (Math.random() - 0.5) * 2, 0.7); this.fx.glow(e.x, e.y + 2, e.z, 5, 0xff7a30, 0.25); } }
  }

  // WIDOW walkers: legs on the ground, hull at H, turret and cannon; dead ones fold up and sink to the snow
  poseWalker(e, v, dt, t, w) {
    const o = v.obj, u = o.userData, gnd = (x, z) => this.ground(w, x, z);
    if (e.alive) {
      const sp = Math.hypot(e.vx || 0, e.vz || 0), bob = Math.sin(t * 7 + e.id) * 0.08 * Math.min(1, sp / 2);
      o.position.set(e.x, e.y + u.H + bob, e.z); o.rotation.y = e.yaw;
      u.rig.update(dt, e.x, e.y + u.H + bob, e.z, e.yaw, e.vx || 0, e.vz || 0, 1, gnd);
      u.turret.rotation.y = damp(u.turret.rotation.y, e.tyaw || 0, 6, dt);
      u.tip.visible = e.aimT > 0 && Math.floor(t * 14) % 2 === 0;
      e.recoil = Math.max(0, (e.recoil || 0) - dt * 2.5); u.gun.position.z = 1.4 - e.recoil * 0.7;
      return;
    }
    v.fall = Math.min(1, (v.fall || 0) + dt * 1.2);
    const k = v.fall * v.fall;
    o.position.set(e.x, e.y + u.H - (u.H - 1.4) * k, e.z); o.rotation.z = k * 0.25;
    u.rig.update(dt, e.x, o.position.y, e.z, e.yaw, 0, 0, 1 - k * 0.85, gnd);
    if (!v.burnt) { v.burnt = true; u.tip.visible = false; for (const g of [o, u.rig.group]) g.traverse((m) => { if (m.isMesh && !m.userData.hull) m.material = BURNT; }); }
    if ((v.smokeT -= dt) <= 0 && e.deadT < 14) { v.smokeT = 0.15; this.fx.smoke(e.x, e.y + 2.5, e.z, 1.8, true, 3, 2.4); if (e.deadT < 9) { this.fx.flame(e.x + (Math.random() - 0.5) * 3, e.y + 2, e.z + (Math.random() - 0.5) * 3, 1); this.fx.glow(e.x, e.y + 3, e.z, 7, 0xff7a30, 0.25); } }
  }

  ground(w, x, z) { return w.terrain.surface(x, z); }

  // ---------------------------------------------------------------- per-frame
  update(w, dt, t, events = []) {
    this.t = t;
    const P = w.P, p = playerPos(w);
    for (const ev of events) this.event(w, ev);
    // entities
    const seen = new Set();
    for (const tr of Object.values(this.troops)) tr.n = 0;
    for (const e of w.ents) {
      let v = this.vis.get(e.id);
      if (!v) { v = this.makeVis(e); this.vis.set(e.id, v); }
      seen.add(e.id);
      if (v.troop) this.poseTroop(e, v.troop, t);
      else if (v.obj) this.poseVis(e, v, dt, t, w);
    }
    for (const [id, v] of this.vis) if (!seen.has(id)) { v.obj?.removeFromParent(); v.obj?.userData.rubble?.removeFromParent(); v.obj?.userData.beam?.removeFromParent(); v.obj?.userData.rig?.group.removeFromParent(); this.vis.delete(id); }
    // the player
    this.posePlayer(w, dt, t);
    for (const k in this.troops) { const tr = this.troops[k]; for (const im of [tr.body, tr.legL, tr.legR]) { im.count = tr.n; im.instanceMatrix.needsUpdate = true; } }
    this.poseShots(w, dt);
    this.posePickups(w, dt, t);
    this.poseReticle(w, dt, t);
    // shield, roof, boom, searchlights
    if (this.shieldDome) { this.shieldDome.visible = w.shield; this.shieldDome.material.opacity = 0.14 + (this.shieldFlash = Math.max(0, (this.shieldFlash || 0) - dt * 2)) * 0.4 + Math.sin(t * 2) * 0.03; }
    if (this.roof) { const u = this.roof.userData, open = (u.open = damp(u.open, w.shield ? 0 : 1, 1.2, dt)); for (const h of u.halves) h.g.position.x = h.s * open * u.hw; }
    if (this.boom) { const towers = w.ents.filter((e) => e.type === 'boomtower'), down = towers.filter((e) => !e.alive).length; this.boom.visible = down < towers.length; this.boom.position.y = down ? -0.8 : 0; }
    if (this.searchlights) this.searchlights.forEach((s, i) => { s.userData.pivot.rotation.z = Math.sin(t * 0.4 + i * 1.7) * 0.6; s.userData.pivot.rotation.x = Math.cos(t * 0.33 + i) * 0.5; });
    if (this.water) this.water.userData.uniforms.uTime.value = t;
    if (this.decor) this.decor.userData.wind.uTime.value = t;
    updateAtmos(this.atmos, w, this.fx, this.focus, dt, t);
    this.fx.update(dt, this.camera.quaternion);
    this.hemi.intensity = this.hemiI + this.fx.flashK * 0.8;
    this.updateCamera(w, dt);
    this.renderer.render(this.scene, this.camera);
  }

  poseTroop(e, kind, t) {
    const tr = this.troops[kind];
    if (tr.n >= tr.cap) return;
    const P = tr.P, i = tr.n++;
    const moving = Math.hypot(e.vx || 0, e.vz || 0) > 0.3;
    const sw = e.alive && moving ? Math.sin(t * 9 + e.id) * 0.7 : 0;
    const fall = e.alive ? 0 : Math.min(1, e.deadT * 4) * (Math.PI / 2);
    const sink = e.alive ? 0 : Math.max(0, e.deadT - 8) * 0.3;
    const bob = moving && e.alive ? Math.abs(Math.cos(t * 9 + e.id)) * 0.06 : 0;
    const aiming = e.aimT > 0 ? 0.25 : 0;
    _e.set(-fall - aiming * 0.4, e.yaw, 0, 'YXZ'); _q.setFromEuler(_e);
    _m.compose(_v.set(e.x, e.y + bob - sink, e.z), _q, _s.set(1, 1, 1));
    tr.body.setMatrixAt(i, _m);
    for (const [im, sx, a] of [[tr.legL, -1, sw], [tr.legR, 1, -sw]]) {
      _m2.makeRotationX(a); _m2.setPosition(sx * P.hipX, P.hipY, 0);
      im.setMatrixAt(i, _m3.multiplyMatrices(_m, _m2));
    }
  }

  posePlayer(w, dt, t) {
    const P = w.P, flying = P.mode === 'fly';
    const craft = P.craft === 'alien' ? this.alien : this.apache, other = P.craft === 'alien' ? this.apache : this.alien;
    const rig = P.craft === 'alien' ? this.legs.alien : this.legs.apache, otherRig = P.craft === 'alien' ? this.legs.apache : this.legs.alien;
    other.visible = false; otherRig.group.visible = false;
    craft.visible = flying && !(P.invT > 0 && Math.floor(t * 12) % 2 === 0);
    const u = craft.userData, lk = flying ? P.legK : 0;
    if (flying) {
      const vx = P.vx, vz = P.vz, sp = Math.hypot(vx, vz);
      // on legs: the leg ring swings round to the way it walks; the fuselage on top is the turret (P.yaw)
      if (lk > 0 && sp > 1) this.legYaw += wrapAngle(Math.atan2(vx, vz) - this.legYaw) * (1 - Math.exp(-2.5 * dt));
      if (lk <= 0) this.legYaw = P.yaw;
      const bob = lk > 0 ? Math.abs(Math.sin(t * 8.5)) * 0.07 * Math.min(1, sp / 4) * lk : 0;
      craft.position.set(P.x, P.y + bob + Math.sin(t * 1.7) * 0.12 * (1 - lk), P.z);
      craft.rotation.y = P.yaw;
      rig.update(dt, P.x, P.y + bob, P.z, this.legYaw, vx, vz, lk, (x, z) => this.ground(w, x, z));
      rig.group.visible = rig.group.visible && craft.visible;
      const fwd = vx * Math.sin(P.yaw) + vz * Math.cos(P.yaw), side = vx * Math.cos(P.yaw) - vz * Math.sin(P.yaw), air = 1 - lk;
      u.tilt.rotation.x = damp(u.tilt.rotation.x, clamp(fwd * 0.016 * air, -0.32, 0.32), 4, dt);
      u.tilt.rotation.z = damp(u.tilt.rotation.z, clamp(-side * 0.022 * air, -0.4, 0.4), 4, dt);
      // the rotor spins down and its blades telescope in as the legs come out
      u.rotor.rotation.y += dt * (P.landT > 0 ? 14 : 28) * Math.max(0, 1 - lk * 1.4);
      const fold = 1 - 0.62 * lk; u.rotor.scale.set(fold, 1, fold);
      if (u.blur) u.blur.visible = lk < 0.4;
      if (u.tail) u.tail.rotation.x += dt * 34 * air;
      u.kick = Math.max(0, u.kick - dt * 4); u.pod.position.y = u.podY + u.kick * 0.15;
      // the chin gun swivels toward the target
      const tg = P.target != null && this.vis.get(P.target) ? w.ents.find((e) => e.id === P.target) : null;
      const want = tg ? wrapAngle(Math.atan2(tg.x - P.x, tg.z - P.z) - P.yaw) : 0;
      u.gun.rotation.y = damp(u.gun.rotation.y, clamp(want, -1.2, 1.2), 10, dt);
      u.gun.rotation.x = damp(u.gun.rotation.x, tg ? (lk > 0.5 ? 0.12 : 0.35) : 0.1, 8, dt);
      u.flash.visible = (this.gunFlash = Math.max(0, (this.gunFlash || 0) - dt)) > 0 && Math.random() < 0.8;
      if (u.ring) u.ring.material.color.setHSL(0.48 + Math.sin(t * 4) * 0.03, 1, 0.55);
      if (u.exhausts.length && Math.random() < 0.5 - lk * 0.3) { u.exhausts[Math.random() < 0.5 ? 0 : 1].getWorldPosition(_v); this.fx.puff(_v.x, _v.y, _v.z, -Math.sin(P.yaw) * 3, -Math.cos(P.yaw) * 3, 0.25); }
      if (lk < 0.2 && P.y - this.ground(w, P.x, P.z) < 4 && Math.random() < 0.6) { const gy = this.ground(w, P.x, P.z); if (w.terrain.height(P.x, P.z) < 0) this.fx.splash(P.x + (Math.random() - 0.5) * 6, P.z + (Math.random() - 0.5) * 6, 0.3); else this.fx.dust(P.x + (Math.random() - 0.5) * 6, gy, P.z + (Math.random() - 0.5) * 6, 1, 1.2); }
      if (P.xform && Math.random() < 0.5) { this.fx.sparks(P.x + (Math.random() - 0.5) * 2, P.y - 0.9, P.z + (Math.random() - 0.5) * 2, 1, 0xffd080, 3); if (Math.random() < 0.3) this.fx.puff(P.x, P.y - 0.8, P.z, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, 0.5); }
    } else rig.group.visible = false;
    if (P.mode === 'foot') this.poseTroop({ x: P.foot.x, y: P.foot.y, z: P.foot.z, yaw: P.foot.yaw, vx: P.foot.vx, vz: P.foot.vz, alive: true, id: 0, aimT: 0 }, 'pilot', t);
  }

  poseShots(w, dt) {
    let n = 0;
    const used = new Set();
    for (const s of w.shots) {
      const tr = TRACER[s.kind];
      if (tr) {
        if (n >= 500) continue;
        const sp = Math.hypot(s.vx, s.vy, s.vz) || 1;
        _v.set(s.vx / sp, s.vy / sp, s.vz / sp); _q.setFromUnitVectors(_w.set(0, 0, 1), _v);
        const len = s.kind === 'flak' ? tr[1] : tr[1];
        _m.compose(_w.set(s.x - _v.x * len * 0.5, s.y - _v.y * len * 0.5, s.z - _v.z * len * 0.5), _q, _s.set(tr[2], tr[2], len));
        this.tracers.setMatrixAt(n, _m); this.tracers.setColorAt(n, _c.set(tr[0])); n++;
        continue;
      }
      let m = this.shotVis.get(s);
      if (!m) { m = this.takeShotMesh(s.kind); this.shotVis.set(s, m); }
      used.add(m);
      m.position.set(s.x, s.y, s.z);
      _v.set(s.vx, s.vy, s.vz).normalize(); m.quaternion.setFromUnitVectors(_w.set(0, 0, 1), _v);
      if (s.kind === 'orb') { this.fx.glowPuff(s.x, s.y, s.z, 0x3dfff0, 0.35); this.fx.glow(s.x, s.y, s.z, 3, 0x3dfff0, 0.05); }
      else if (s.kind === 'bomb') { /* falls */ }
      else { this.fx.flame(s.x - _v.x, s.y - _v.y, s.z - _v.z, s.kind === 'sam' ? 0.45 : 0.3); this.fx.glow(s.x - _v.x, s.y - _v.y, s.z - _v.z, s.kind === 'sam' ? 3.2 : 2.2, 0xffb050, 0.06); if (Math.random() < 0.8) this.fx.puff(s.x - _v.x * 1.5, s.y - _v.y * 1.5, s.z - _v.z * 1.5, 0, 0, s.kind === 'sam' ? 0.5 : 0.32); }
      if (m.userData.light) m.userData.light.material.color.set(Math.floor(this.t * 14) % 2 ? 0xff2020 : 0x661010);
    }
    this.tracers.count = n; this.tracers.instanceMatrix.needsUpdate = true; if (this.tracers.instanceColor) this.tracers.instanceColor.needsUpdate = true;
    for (const kind in this.shotPool) for (const m of this.shotPool[kind]) if (m.visible && !used.has(m)) m.visible = false;
    // dropped mines
    const usedM = new Set();
    for (const mine of w.mines) {
      let m = this.mineVis.get(mine);
      if (!m) { m = this.minePool.find((q) => !q.visible && q.userData.grav === (mine.kind === 'grav')) || this.newMine(mine.kind === 'grav'); m.visible = true; this.mineVis.set(mine, m); }
      usedM.add(m);
      m.position.set(mine.x, mine.y, mine.z);
      const blink = mine.state === 'armed' ? Math.floor(this.t * (4 + mine.t * 2)) % 2 : 0;
      if (m.userData.light) m.userData.light.visible = !!blink || mine.state === 'fall';
      if (mine.kind === 'grav') m.rotation.y += dt * 4;
    }
    for (const m of this.minePool) if (!usedM.has(m)) m.visible = false;
  }
  takeShotMesh(kind) {
    const pool = (this.shotPool[kind] ||= []);
    let m = pool.find((q) => !q.visible);
    if (!m) {
      m = kind === 'missile' ? M.createMissile(0x9a9478, 0xee3b4d, 0.8) : kind === 'sam' ? M.createMissile(0xf2f2f6, 0xee3b4d, 1.2) : kind === 'rocket' ? M.createMissile(0x5a5a52, 0xd8302a, 0.6)
        : kind === 'orb' ? new THREE.Mesh(new THREE.IcosahedronGeometry(0.45, 1), new THREE.MeshBasicMaterial({ color: 0xbafff8 })) : new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.8, 2, 6), new THREE.MeshLambertMaterial({ color: 0x2a2a2a }));
      if (kind === 'bomb') m.rotation.x = Math.PI / 2;
      this.scene.add(m); pool.push(m);
    }
    m.visible = true;
    return m;
  }
  newMine(grav) { const m = M.createDroppedMine(grav); m.userData.grav = grav; this.scene.add(m); this.minePool.push(m); return m; }

  posePickups(w, dt, t) {
    const seen = new Set();
    let li = 0;
    for (const k of w.pickups) {
      let o = this.pickVis.get(k.id);
      if (!o) { o = M.createCrate(k.kind); this.root.add(o); this.pickVis.set(k.id, o); }
      seen.add(k.id);
      o.position.set(k.x, k.y + (k.state === 'idle' ? 0.3 + Math.sin(t * 2 + k.id) * 0.15 : 0), k.z);
      o.rotation.y = k.state === 'idle' ? t * 0.8 : o.rotation.y + dt * 6;
      o.userData.beacon.visible = k.state === 'idle';
      if (k.state === 'winch' && li < this.winch.length && w.P.mode === 'fly') {
        const l = this.winch[li++], pos = l.geometry.attributes.position;
        pos.setXYZ(0, w.P.x, w.P.y - 0.8, w.P.z); pos.setXYZ(1, k.x, k.y + 1, k.z); pos.needsUpdate = true; l.visible = true;
      }
    }
    for (let i = li; i < this.winch.length; i++) this.winch[i].visible = false;
    for (const [id, o] of this.pickVis) if (!seen.has(id)) { o.removeFromParent(); this.pickVis.delete(id); this.fx.sparks(o.position.x, o.position.y, o.position.z, 10, 0x7aff9a, 5); }
  }

  poseReticle(w, dt, t) {
    const P = w.P, tg = P.target != null ? w.ents.find((e) => e.id === P.target && e.alive) : null;
    this.reticle.visible = !!tg && (P.mode === 'fly' || P.mode === 'foot');
    if (this.reticle.visible) {
      const locked = P.lockT >= T.LOCK_TIME, k = Math.min(1, P.lockT / T.LOCK_TIME);
      const b = tg.boxes ? tg.boxes[0] : null, r = tg.boxes ? Math.min(6, Math.max(b.hw, b.hd) * 0.55) : Math.max(1.2, tg.r * 1.4);
      const y = tg.boxes ? b.y0 + 0.4 : tg.air ? tg.y : tg.y + 0.15;
      this.reticle.position.set(tg.x, y, tg.z);
      this.reticle.scale.setScalar(r * (2.2 - 1.2 * k));
      this.reticle.rotation.y = t * (locked ? 4 : 1.5);
      this.reticleMat.color.set(locked ? 0xff2a2a : 0xffd23a);
    }
    // SAM lock beams: a red line from the launcher to you, blinking faster as it closes
    let bi = 0;
    if (P.mode === 'fly') for (const e of w.ents) {
      if (e.type !== 'sam' || !e.alive || !(e.lockT > 0) || bi >= this.beams.length) continue;
      const b = this.beams[bi++], ax = e.x, ay = e.y + 3, az = e.z, dx = P.x - ax, dy = P.y - ay, dz = P.z - az, len = Math.hypot(dx, dy, dz);
      b.position.set(ax + dx / 2, ay + dy / 2, az + dz / 2); b.scale.set(1, len, 1); b.quaternion.setFromUnitVectors(_up, _v.set(dx / len, dy / len, dz / len));
      const kk = 1 - e.lockT / (e.lockMax || 1.6);
      b.visible = Math.floor(t * (5 + 16 * kk)) % 2 === 0;
    }
    for (let i = bi; i < this.beams.length; i++) this.beams[i].visible = false;
  }

  // ---------------------------------------------------------------- events → effects
  event(w, ev) {
    const fx = this.fx;
    switch (ev.type) {
      case 'explode': fx.explosion(ev.x, ev.y, ev.z, ev.size, this.ground(w, ev.x, ev.z)); if (w.terrain.height(ev.x, ev.z) < 0 && ev.y < 2) fx.splash(ev.x, ev.z, ev.size); break;
      case 'bigBoom': fx.ring(ev.x, ev.y + 0.3, ev.z, ev.size * 2.5, ev.kind === 'grav' ? 0xb08aff : 0xffc080); if (ev.kind === 'grav') fx.sparks(ev.x, ev.y + 1, ev.z, 30, 0xb08aff, 12); break;
      case 'impact':
        if (ev.what === 'water') fx.splash(ev.x, ev.z, 0.4);
        else if (ev.what === 'ground') fx.dust(ev.x, ev.y, ev.z, 1, 0.5);
        else fx.sparks(ev.x, ev.y, ev.z, 3, ev.team === 'player' ? (ev.kind === 'plasma' ? 0x7afff8 : 0xffe27a) : 0xff8a5a, 5);
        break;
      case 'shot': {
        const craft = w.P.craft === 'alien' ? this.alien : this.apache;
        if (ev.kind === 'bullet' || ev.kind === 'plasma') { this.gunFlash = 0.05; }
        else if (ev.kind === 'missile' || ev.kind === 'orb') { craft.userData.kick = 1; fx.puff(ev.x, ev.y, ev.z, 0, 0, 0.6); }
        else if (ev.kind === 'pistol') fx.glowPuff(ev.x, ev.y, ev.z, 0xfff0b0, 0.2);
        break;
      }
      case 'eshot': if (ev.kind === 'shell' || ev.kind === 'rocket') fx.puff(ev.x, ev.y, ev.z, 0, 0, 0.7); fx.glowPuff(ev.x, ev.y, ev.z, ev.kind === 'bolt' ? 0x7aff4a : 0xffb060, ev.kind === 'shell' ? 0.6 : 0.3); break;
      case 'mineLand': if (ev.water) fx.splash(ev.x, ev.z, 0.8); else fx.dust(ev.x, ev.y, ev.z, 3, 0.7); break;
      case 'hurt': fx.sparks(w.P.mode === 'foot' ? w.P.foot.x : w.P.x, (w.P.mode === 'foot' ? w.P.foot.y + 1 : w.P.y), w.P.mode === 'foot' ? w.P.foot.z : w.P.z, 5, 0xffb060, 6); fx.shake = Math.max(fx.shake, 0.25 + ev.amount * 0.02); break;
      case 'playerDown': fx.explosion(ev.x, ev.y, ev.z, ev.foot ? 2 : 7, this.ground(w, ev.x, ev.z)); fx.shake = 1.2; break;
      case 'shieldHit': this.shieldFlash = 1; fx.sparks(ev.x, ev.y, ev.z, 6, 0xd08aff, 6); break;
      case 'shieldDown': this.shieldFlash = 1; break;
      case 'crash': fx.explosion(ev.x, ev.y, ev.z, 5, ev.y); break;
      case 'kill': if (ev.kind === 'struct' && (ev.type === 'datacenter' || ev.type === 'casino' || ev.type === 'vault')) fx.shake = 1.4; break;
      case 'pickup': fx.sparks(ev.x, ev.y + 1, ev.z, 12, 0x7aff9a, 5); break;
      case 'xform': fx.sparks(ev.x, ev.y, ev.z, 14, 0xffd080, 6); fx.puff(ev.x, ev.y - 0.5, ev.z, 0, 0, 0.9); break;
      case 'xformDone': if (ev.to === 'spider') { const P = w.P; fx.ring(P.x, this.ground(w, P.x, P.z) + 0.2, P.z, 7, 0xd8e4f0); fx.dust(P.x, this.ground(w, P.x, P.z), P.z, 8, 1.5); fx.shake = Math.max(fx.shake, 0.35); } break;
    }
  }

  // ---------------------------------------------------------------- camera
  setCamMode(m) { this.camMode = m; }
  updateCamera(w, dt) {
    const P = w.P, p = playerPos(w), foot = P.mode === 'foot';
    const strike = this.camMode === 'strike';
    const yawWant = strike ? (foot ? P.foot.yaw : P.yaw) + Math.PI : Math.PI / 4;
    this.camYaw = this.snap ? yawWant : this.camYaw + wrapAngle(yawWant - this.camYaw) * (1 - Math.exp(-dt * (strike ? 2.2 : 4)));
    this.pitch = damp(this.pitch, strike ? PITCH.strike : PITCH.iso, 3, dt);
    this.span = damp(this.span, foot ? SPAN.foot : SPAN.fly + (SPAN.spider - SPAN.fly) * (P.mode === 'fly' ? P.legK : 0), 2, dt);
    const look = foot ? 0.3 : 0.55;
    const fx = p.x + (p.vx || 0) * look, fz = p.z + (p.vz || 0) * look;
    const gy = this.ground(w, p.x, p.z);
    const fy = foot ? gy + 1 : Math.max(gy, p.y - 5);
    if (this.snap) { this.focus.set(fx, fy, fz); this.focusY = fy; this.snap = false; }
    this.focus.x = damp(this.focus.x, fx, 6, dt); this.focus.z = damp(this.focus.z, fz, 6, dt);
    this.focusY = damp(this.focusY, fy, 2.5, dt); this.focus.y = this.focusY;
    const pitch = THREE.MathUtils.degToRad(this.pitch), half = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    const vspan = this.aspect >= 1 ? this.span : this.span / this.aspect;
    const dist = vspan / (2 * half);
    const dir = _v.set(Math.sin(this.camYaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(this.camYaw) * Math.cos(pitch));
    const sh = this.fx.shake;
    this.camera.position.copy(this.focus).addScaledVector(dir, dist).add(_w.set((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh));
    this.camera.lookAt(this.focus);
    this.camera.far = dist + 520; this.camera.near = Math.max(1, dist - 120); this.camera.updateProjectionMatrix();
    this.screenRight.set(Math.cos(this.camYaw), -Math.sin(this.camYaw));
    this.screenUp.set(-Math.sin(this.camYaw), -Math.cos(this.camYaw));
    this.screenUpK = 1 / Math.sin(pitch); // a pitched camera foreshortens screen-up on the ground
    // the sun's shadow box follows the focus
    this.sun.position.copy(this.focus).addScaledVector(this.sunDir, 140);
    this.sun.target.position.copy(this.focus);
  }
  // world point → screen pixels (for the HUD)
  project(x, y, z, cw, ch) {
    _v.set(x, y, z).project(this.camera);
    return { x: (_v.x * 0.5 + 0.5) * cw, y: (-_v.y * 0.5 + 0.5) * ch, behind: _v.z > 1 };
  }
}
export { lzPos };
