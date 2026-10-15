// Pooled particles (house rule: pools, not churn; no per-projectile lights). The pattern is gig-ambulance's
// and dr-mow's fx.js (a fixed pool, a kind per particle, update(dt), a shake value), drawn as one
// InstancedMesh per look so a big explosion is a handful of draw calls, not hundreds.
import * as THREE from 'three';
import { LITE } from '../retro.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _c = new THREE.Color();
const FIRE = [0xfff6b0, 0xffd23a, 0xff8a2a, 0xe84a1a, 0x5a2a1a];

class Pool {
  constructor(scene, geo, material, n) {
    this.mesh = new THREE.InstancedMesh(geo, material, n);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, _c.set(0xffffff));
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
    this.n = n; this.list = []; this.next = 0; this.tint = 1; this.roll = false;
    for (let i = 0; i < n; i++) this.list.push({ on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, size: 1, grow: 0, spin: 0, rot: 0, g: 0, drag: 0, color: 0xffffff, ramp: null });
  }
  get() { const p = this.list[this.next]; this.next = (this.next + 1) % this.n; p.on = true; p.life = 0; p.rot = Math.random() * 6; p.ramp = null; p.g = 0; p.drag = 0; p.grow = 0; p.spin = 0; p.floor = null; p.sx = p.sy = p.sz = 1; p.trail = false; return p; }
  update(dt, look, faceQ) {
    let k = 0;
    for (const p of this.list) {
      if (!p.on) continue;
      p.life += dt;
      const t = p.life / p.max;
      if (t >= 1) { p.on = false; continue; }
      p.vy -= p.g * dt; const dr = Math.exp(-p.drag * dt); p.vx *= dr; p.vy *= dr; p.vz *= dr;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.rot += p.spin * dt;
      if (p.floor != null && p.y < p.floor) { p.y = p.floor; p.vy *= -0.3; p.vx *= 0.6; p.vz *= 0.6; p.spin *= 0.5; }
      const sc = look(p, t);
      if (faceQ) { _q.copy(faceQ); if (this.roll) { _e.set(0, 0, p.rot); _q2.setFromEuler(_e); _q.multiply(_q2); } } else { _e.set(p.rot, p.rot * 0.7, 0); _q.setFromEuler(_e); }
      _s.set(sc * (p.sx || 1), sc * (p.sy || 1), sc * (p.sz || 1)); _p.set(p.x, p.y, p.z);
      _m.compose(_p, _q, _s);
      this.mesh.setMatrixAt(k, _m);
      if (p.ramp) { const i = Math.min(p.ramp.length - 1, Math.floor(t * p.ramp.length)); _c.set(p.ramp[i]); } else _c.set(p.color);
      if (this.tint !== 1) _c.multiplyScalar(this.tint);
      this.mesh.setColorAt(k, _c);
      k++;
    }
    this.mesh.count = k;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

export class FX {
  constructor(scene) {
    this.scene = scene;
    const ico = new THREE.IcosahedronGeometry(1, 0), cube = new THREE.BoxGeometry(1, 1, 1);
    // fire and smoke are camera-facing puffs (PS1-style sprite smoke): a lumpy soft blob, rolled at random
    const puffTex = (core) => {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const x = c.getContext('2d');
      let sd = core ? 3 : 11; const r = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < 7; i++) {
        const cx = 32 + (r() - 0.5) * 22, cy = 32 + (r() - 0.5) * 22, rad = 12 + r() * 12, g = x.createRadialGradient(cx, cy, 0, cx, cy, rad);
        g.addColorStop(0, `rgba(255,255,255,${core ? 0.9 : 0.75})`); g.addColorStop(0.6, `rgba(255,255,255,${core ? 0.45 : 0.4})`); g.addColorStop(1, 'rgba(255,255,255,0)');
        x.fillStyle = g; x.fillRect(0, 0, 64, 64);
      }
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
      return t;
    };
    const quad = new THREE.PlaneGeometry(2.2, 2.2);
    this.fire = new Pool(scene, quad, new THREE.MeshBasicMaterial({ map: puffTex(true), transparent: true, depthWrite: false }), 360);
    this.smokeP = new Pool(scene, quad, new THREE.MeshBasicMaterial({ map: puffTex(false), transparent: true, depthWrite: false }), 420);
    this.fire.roll = this.smokeP.roll = true;
    this.fire.mesh.renderOrder = 4; this.smokeP.mesh.renderOrder = 3;
    this.spark = new Pool(scene, cube, new THREE.MeshBasicMaterial({ color: 0xffffff }), 300);
    this.debris = new Pool(scene, cube, new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), 200);
    this.debris.mesh.castShadow = true;
    const disc = new THREE.CircleGeometry(1, 10); disc.rotateX(-Math.PI / 2);
    this.scorchP = new Pool(scene, disc, new THREE.MeshBasicMaterial({ color: 0xffffff, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4, depthWrite: false }), 120);
    this.scorchP.mesh.renderOrder = 1;
    this.rings = [];
    const ringGeo = new THREE.RingGeometry(0.8, 1, 24); ringGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xfff0c0, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
      m.visible = false; m.userData = { life: 0, max: 0.5, r: 6 }; scene.add(m); this.rings.push(m);
    }
    // additive glow billboards (flashes, muzzle flare, engines): a soft radial sprite, faded by darkening
    const gc = document.createElement('canvas'); gc.width = gc.height = 64;
    const gx = gc.getContext('2d'), grd = gx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.25, 'rgba(255,255,255,0.75)'); grd.addColorStop(0.6, 'rgba(255,255,255,0.18)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    gx.fillStyle = grd; gx.fillRect(0, 0, 64, 64);
    this.glowTex = new THREE.CanvasTexture(gc); this.glowTex.colorSpace = THREE.SRGBColorSpace;
    this.glowP = new Pool(scene, new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: this.glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }), 160);
    this.glowP.mesh.renderOrder = 5;
    // foam left on the water by hulls and splashes: additive white discs that spread and fade
    const wd2 = new THREE.PlaneGeometry(2, 2); wd2.rotateX(-Math.PI / 2);
    this.wakeP = new Pool(scene, wd2, new THREE.MeshBasicMaterial({ map: this.glowTex, color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), 220);
    this.wakeP.mesh.renderOrder = 2;
    // explosions light their surroundings: a few pooled point lights (always in the scene, dark when idle,
    // so no shader recompiles; never one per projectile; none at all on LITE devices)
    this.lights = Array.from({ length: LITE ? 0 : 3 }, () => { const l = new THREE.PointLight(0xff9a40, 0, 20, 1.3); l.userData = { life: 1, max: 1, peak: 0 }; scene.add(l); return l; });
    this.lightI = 0; this.dustColor = 0xc8b898;
    this.shake = 0;
    this.flashK = 0; // whole-screen flash from big explosions (the view adds it to the light)
  }
  clear() { for (const P of [this.fire, this.smokeP, this.spark, this.debris, this.scorchP, this.glowP, this.wakeP]) for (const p of P.list) p.on = false; for (const r of this.rings) r.visible = false; for (const l of this.lights) l.intensity = 0; this.shake = 0; }

  // ---------------------------------------------------------------- emitters
  explosion(x, y, z, size = 3, ground = null) {
    const n = Math.min(26, 6 + size * 3);
    for (let i = 0; i < n; i++) {
      const p = this.fire.get(), a = Math.random() * 6.28, u = Math.random() * 2 - 1, sp = (2 + Math.random() * 4) * size * 0.55;
      p.x = x; p.y = y; p.z = z; p.vx = Math.cos(a) * Math.sqrt(1 - u * u) * sp; p.vy = Math.abs(u) * sp * 0.8 + 1; p.vz = Math.sin(a) * Math.sqrt(1 - u * u) * sp;
      p.max = 0.35 + Math.random() * 0.35; p.size = (0.5 + Math.random() * 0.6) * size * 0.45; p.drag = 3; p.ramp = FIRE;
    }
    const big = size >= 4;
    for (let i = 0; i < Math.min(16, (big ? 4 : 1) + size * (big ? 2 : 1)); i++) this.smoke(x + (Math.random() - 0.5) * size, y + Math.random() * size * 0.5, z + (Math.random() - 0.5) * size, size * (big ? 0.45 : 0.3), Math.random() < (big ? 0.5 : 0.25));
    this.sparks(x, y, z, Math.min(30, 6 + size * 3), 0xffe27a, size * 4);
    if (size >= 2.5) for (let i = 0; i < Math.min(14, size * 2); i++) {
      const p = this.debris.get(), a = Math.random() * 6.28, sp = 4 + Math.random() * size * 2;
      p.x = x; p.y = y; p.z = z; p.vx = Math.cos(a) * sp; p.vy = 6 + Math.random() * size * 2.5; p.vz = Math.sin(a) * sp; p.g = 22; p.spin = (Math.random() - 0.5) * 14;
      p.max = 1.6 + Math.random(); p.size = 0.25 + Math.random() * 0.25 * size * 0.4; p.color = [0x2a2622, 0x4a4440, 0x6a5a40][i % 3]; p.floor = ground ?? -100;
      p.sx = 1 + Math.random(); p.sy = 0.5; p.sz = 1 + Math.random(); p.trail = i % 3 === 0; // some pieces trail smoke
    }
    // the flash: a big white-hot glow, a warm halo, and light thrown on everything around
    this.glow(x, y, z, size * 3.2, 0xfff2c0, 0.22);
    this.glow(x, y + size * 0.3, z, size * 5, 0xff8a30, 0.5);
    this.light(x, y + 1.5, z, size);
    for (let i = 0; i < Math.min(16, size * 2); i++) { // embers drifting up
      const p = this.spark.get(), a = Math.random() * 6.28, sp = 1 + Math.random() * size;
      p.x = x; p.y = y; p.z = z; p.vx = Math.cos(a) * sp; p.vy = 2 + Math.random() * 4; p.vz = Math.sin(a) * sp; p.g = -1.5; p.drag = 1.2;
      p.max = 1.2 + Math.random() * 1.4; p.size = 0.09; p.ramp = [0xffe27a, 0xffa040, 0xff6a20, 0x8a2a10];
    }
    this.ring(x, ground != null && y - ground < 3 ? ground + 0.2 : y, z, size * 2.2);
    if (ground != null && y - ground < size) this.scorch(x, ground, z, size * 0.9);
    this.shake = Math.max(this.shake, Math.min(1.2, size * 0.09));
    this.flashK = Math.max(this.flashK, Math.min(1, size * 0.08));
  }
  smoke(x, y, z, size = 1, dark = false, rise = 2.5, life = 1.8) {
    const p = this.smokeP.get();
    p.x = x; p.y = y; p.z = z; p.vx = (Math.random() - 0.5) * 1.2; p.vy = rise * (0.6 + Math.random() * 0.6); p.vz = (Math.random() - 0.5) * 1.2;
    p.max = life * (0.7 + Math.random() * 0.6); p.size = size * (0.6 + Math.random() * 0.5); p.grow = 1.6; p.drag = 0.6;
    p.color = dark ? 0x2a2624 : 0x8a8480; p.ramp = dark ? [0x4a3e38, 0x352e2a, 0x3e3a38, 0x5a5654] : [0xd2ccc4, 0xbab4ac, 0xa8a29a, 0x96908a];
  }
  puff(x, y, z, vx = 0, vz = 0, size = 0.4) { // exhaust / missile trails: small, quick
    const p = this.smokeP.get();
    p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = 0.4; p.vz = vz; p.max = 0.6 + Math.random() * 0.4; p.size = size; p.grow = 1.5; p.drag = 2;
    p.ramp = [0xd8d2cc, 0xb8b2ac, 0xa8a29c];
  }
  flame(x, y, z, size = 0.35) {
    const p = this.fire.get();
    p.x = x; p.y = y; p.z = z; p.vx = (Math.random() - 0.5); p.vy = Math.random(); p.vz = (Math.random() - 0.5); p.max = 0.12 + Math.random() * 0.1; p.size = size; p.ramp = FIRE;
  }
  glowPuff(x, y, z, color, size = 0.4) {
    const p = this.fire.get();
    p.x = x; p.y = y; p.z = z; p.vx = p.vy = p.vz = 0; p.max = 0.15; p.size = size; p.color = color;
    this.glow(x, y, z, size * 6, color, 0.1);
  }
  sparks(x, y, z, n = 6, color = 0xffe27a, speed = 8) {
    for (let i = 0; i < n; i++) {
      const p = this.spark.get(), a = Math.random() * 6.28, u = Math.random();
      p.x = x; p.y = y; p.z = z; p.vx = Math.cos(a) * speed * (0.3 + Math.random() * 0.7); p.vy = speed * (0.2 + u * 0.8); p.vz = Math.sin(a) * speed * (0.3 + Math.random() * 0.7);
      p.g = 20; p.max = 0.25 + Math.random() * 0.35; p.size = 0.12; p.color = color; p.sx = 1; p.sy = 1; p.sz = 2.5;
    }
  }
  dust(x, y, z, n = 4, size = 0.8, color = this.dustColor) {
    for (let i = 0; i < n; i++) {
      const p = this.smokeP.get(), a = Math.random() * 6.28;
      p.x = x; p.y = y; p.z = z; p.vx = Math.cos(a) * 3; p.vy = 0.8 + Math.random(); p.vz = Math.sin(a) * 3; p.max = 0.8 + Math.random() * 0.5; p.size = size; p.grow = 1.4; p.drag = 2.5; p.color = color;
    }
  }
  splash(x, z, size = 2) {
    for (let i = 0; i < 6 + size * 3; i++) {
      const p = this.spark.get(), a = Math.random() * 6.28, sp = 2 + Math.random() * size * 2;
      p.x = x; p.y = 0.2; p.z = z; p.vx = Math.cos(a) * sp; p.vy = 4 + Math.random() * size * 4; p.vz = Math.sin(a) * sp; p.g = 18; p.max = 0.7 + Math.random() * 0.4; p.size = 0.22 + size * 0.05; p.color = 0xe8f8ff; p.sx = p.sy = p.sz = 1;
    }
    this.ring(x, 0.15, z, size * 2.2, 0xe8f8ff);
    this.wake(x, z, size * 1.6, 2.2);
  }
  glow(x, y, z, size, color = 0xffd080, life = 0.15) {
    const p = this.glowP.get();
    p.x = x; p.y = y; p.z = z; p.vx = p.vy = p.vz = 0; p.max = life; p.size = size; p.color = color;
    p.ramp = null; p.base = color;
  }
  wake(x, z, size = 1.5, life = 1.6) {
    const p = this.wakeP.get();
    p.x = x; p.y = 0.08; p.z = z; p.vx = p.vy = p.vz = 0; p.max = life * (0.8 + Math.random() * 0.4); p.size = size; p.rot = 0; p.color = 0xffffff;
  }
  light(x, y, z, size) {
    if (!this.lights.length) return;
    const l = this.lights[this.lightI = (this.lightI + 1) % this.lights.length];
    l.position.set(x, y, z); l.distance = 8 + size * 5; l.userData.life = 0; l.userData.max = 0.25 + size * 0.06; l.userData.peak = 60 + size * 70;
  }
  scorch(x, y, z, r) {
    const p = this.scorchP.get();
    p.x = x; p.y = y + 0.06; p.z = z; p.vx = p.vy = p.vz = 0; p.max = 30; p.size = r; p.color = 0x161210; p.rot = 0;
  }
  ring(x, y, z, r, color = 0xfff0c0) {
    const m = this.rings.find((q) => !q.visible) || this.rings[0];
    m.position.set(x, y, z); m.visible = true; m.material.color.set(color);
    m.userData.life = 0; m.userData.max = 0.45; m.userData.r = r;
  }

  setNight(on) { this.smokeP.tint = on ? 0.42 : 1; this.debris.tint = on ? 0.6 : 1; }
  setDust(color = 0xc8b898) { this.dustColor = color; } // kicked-up ground: sand, or snow in mission 6
  update(dt, camQ) {
    this.fire.update(dt, (p, t) => p.size * (t < 0.2 ? 0.5 + t * 2.5 : 1 - (t - 0.2) * 0.9), camQ);
    for (const p of this.debris.list) if (p.on && p.trail && Math.random() < 0.5) { this.puff(p.x, p.y, p.z, 0, 0, 0.35); if (Math.random() < 0.4) this.flame(p.x, p.y, p.z, 0.22); }
    this.glowP.update(dt, (p, t) => { const k = 1 - t; _c.set(p.base).multiplyScalar(k * k); p.color = _c.getHex(); return p.size * (0.7 + 0.3 * t); }, camQ);
    this.wakeP.update(dt, (p, t) => { const k = (1 - t) * 0.42; _c.setRGB(k, k, k); p.color = _c.getHex(); return p.size * (0.6 + t * 1.4); });
    for (const l of this.lights) { const u = l.userData; if (u.life < u.max) { u.life += dt; const k = 1 - u.life / u.max; l.intensity = u.peak * k * k; } else l.intensity = 0; }
    this.smokeP.update(dt, (p, t) => p.size * (1 + p.grow * t) * (t > 0.75 ? (1 - t) * 4 : 1), camQ);
    this.spark.update(dt, (p, t) => p.size * (1 - t * 0.6));
    this.debris.update(dt, (p, t) => p.size * (t > 0.85 ? (1 - t) / 0.15 : 1));
    this.scorchP.update(dt, (p, t) => p.size * (t > 0.85 ? (1 - t) / 0.15 : 1));
    for (const m of this.rings) {
      if (!m.visible) continue;
      const u = m.userData, t = (u.life += dt) / u.max;
      if (t >= 1) { m.visible = false; continue; }
      m.scale.setScalar(0.3 + t * u.r); m.material.opacity = 0.7 * (1 - t);
    }
    this.shake = Math.max(0, this.shake - dt * 2.2);
    this.flashK = Math.max(0, this.flashK - dt * 3);
  }
}
