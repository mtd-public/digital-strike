// The cast. Models face +Z, 1 unit = 1 m. Where each comes from:
//   createApache        dr-mow js/scene.js createHeli (the attack helicopter enemy), now player-flown; a livery
//                       parameter paints the enemy gunships
//   createMissile       dr-mow createMissile          createLauncher (SAM site)   dr-mow createLauncher
//   createSaucer        dr-mow js/models.js createUfo (scaled up for the alien raiders and the mothership)
//   createDrone         cosmic-calamity js/render3d.js makeDrone
//   humanParts          cosmic-calamity makeHuman (troopers, the reptilian grunt / heavy, Snake for the pilot)
//   createAlienCopter, createTank, createBoat, createJet, createTanker, createFlak, crates: new, in the same kit
import * as THREE from 'three';
import { mat, glowMat, inked, plain, OUTLINE, G, Kit, box, cyl, ball, cone, part, kitMeshes, compact } from './kit.js';
import { mergeGeometries } from '../vendor/addons/BufferGeometryUtils.js';

// A box running along Z from z0 (back) to z1 (front) whose width, height and centre height change along it.
export function heliSlab(z0, z1, wb, hb, yb, wf, hf, yf) {
  const geo = new THREE.BoxGeometry(1, 1, 1), p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = p.getZ(i) + 0.5;
    p.setXYZ(i, p.getX(i) * (wb + (wf - wb) * t), p.getY(i) * (hb + (hf - hb) * t) + yb + (yf - yb) * t, z0 + (z1 - z0) * t);
  }
  geo.computeVertexNormals();
  return geo;
}

// ------------------------------------------------------------------ the Apache (dr-mow)
// Attack helicopter, Apache style: a slim, slab-sided fuselage with a stepped two-seat canopy (gunner in front
// and low, pilot behind and high), a sensor turret on the nose and a chain gun under the chin, an engine pod
// either side, stub wings with a rocket pod and four Hellfires under each, the Longbow radar dome over a
// four-blade rotor, a swept fin with a scissor tail rotor and a tailplane, and wheels. userData.tilt banks it,
// rotor / tail spin, gun swivels, pod kicks on each launch.
export const LIVERY = {
  player: { body: 0x66703f, dark: 0x30332b, glass: 0x2e4a62, tan: 0x9a9470, red: 0xee3b4d },
  enemy: { body: 0x5b4d45, dark: 0x231e1c, glass: 0x4c2222, tan: 0x6e6252, red: 0xff2a2a },
};
export function createApache(livery = LIVERY.player) {
  const g = new THREE.Group(), tilt = new THREE.Group(); g.add(tilt);
  const exhausts = [];
  const olive = mat(livery.body), dark = mat(livery.dark), glass = mat(livery.glass, { roughness: 0.15, metalness: 0.4 }), red = mat(livery.red), tan = mat(livery.tan);
  // fuselage: cabin, tapering nose, and the long boom up to the fin
  tilt.add(inked(heliSlab(-1.3, 0.9, 0.95, 1.1, 0, 0.8, 1.0, -0.05), olive, OUTLINE.mid));
  tilt.add(inked(heliSlab(0.9, 1.95, 0.8, 0.85, -0.12, 0.42, 0.5, -0.28), olive, OUTLINE.mid));
  tilt.add(inked(heliSlab(-4.3, -1.3, 0.24, 0.34, 0.42, 0.62, 0.8, 0.12), olive, OUTLINE.thin));
  // stepped canopy: gunner low in front, pilot high behind, framed flat panes
  tilt.add(inked(heliSlab(0.95, 1.65, 0.62, 0.42, 0.42, 0.42, 0.12, 0.3), glass, OUTLINE.thin));
  tilt.add(inked(heliSlab(0.15, 0.95, 0.66, 0.58, 0.72, 0.6, 0.4, 0.6), glass, OUTLINE.thin));
  tilt.add(plain(new THREE.BoxGeometry(0.66, 0.06, 0.07), dark).translateY(0.62).translateZ(0.95));
  // nose sensor turret (two lenses) and the chin chain gun
  const tads = inked(G.cyl(0.26, 0.26, 0.5, 10), dark, OUTLINE.thin); tads.position.set(0, -0.3, 2.05); tilt.add(tads);
  for (const sx of [-1, 1]) { const lens = plain(new THREE.CircleGeometry(0.09, 8), glass); lens.position.set(sx * 0.12, -0.3, 2.31); tilt.add(lens); }
  const gun = new THREE.Group(); gun.position.set(0, -0.62, 1.25); tilt.add(gun);
  gun.add(inked(G.sphere(0.2, 10, 8), dark, OUTLINE.thin));
  const barrel = plain(G.cyl(0.05, 0.06, 1.0, 6), dark); barrel.rotation.x = Math.PI / 2; barrel.position.z = 0.5; gun.add(barrel);
  const flash = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0), glowMat(0xffe27a)); flash.position.z = 1.1; flash.visible = false; gun.add(flash);
  // engine pods either side of the rotor mast, exhausts turned outward at the back
  for (const sx of [-1, 1]) {
    const eng = inked(G.cyl(0.27, 0.25, 1.5, 12), olive, OUTLINE.thin); eng.rotation.x = Math.PI / 2; eng.position.set(sx * 0.66, 0.42, -0.35); tilt.add(eng);
    const intake = plain(G.cyl(0.2, 0.2, 0.04, 12), dark); intake.rotation.x = Math.PI / 2; intake.position.set(sx * 0.66, 0.42, 0.41); tilt.add(intake);
    const ex = plain(G.cyl(0.15, 0.2, 0.45, 8), dark); ex.rotation.z = sx * 1.1; ex.position.set(sx * 0.9, 0.48, -1.0); tilt.add(ex);
    const tip = new THREE.Object3D(); tip.position.set(sx * 1.12, 0.56, -1.05); tilt.add(tip); exhausts.push(tip);
    const wing = plain(new THREE.BoxGeometry(1.3, 0.08, 0.6), olive); wing.position.set(sx * 1.05, -0.05, -0.1); wing.rotation.z = sx * -0.06; tilt.add(wing);
    const strut = plain(new THREE.BoxGeometry(0.08, 0.5, 0.08), dark); strut.position.set(sx * 0.62, -0.7, 0.55); strut.rotation.z = sx * 0.25; tilt.add(strut);
    const wheel = inked(G.cyl(0.2, 0.2, 0.14, 12), dark, OUTLINE.thin); wheel.rotation.z = Math.PI / 2; wheel.position.set(sx * 0.72, -0.95, 0.55); tilt.add(wheel);
  }
  const tw = inked(G.cyl(0.13, 0.13, 0.1, 10), dark, OUTLINE.thin); tw.rotation.z = Math.PI / 2; tw.position.set(0, -0.12, -3.85); tilt.add(tw);
  const twStrut = plain(new THREE.BoxGeometry(0.06, 0.3, 0.06), dark); twStrut.position.set(0, 0.08, -3.85); tilt.add(twStrut);
  // swept fin, tailplane, and the scissor tail rotor on the left of the fin
  tilt.add(inked(heliSlab(-4.75, -3.95, 0.1, 0.9, 1.2, 0.1, 0.3, 0.55), olive, OUTLINE.thin));
  const stab = plain(new THREE.BoxGeometry(1.7, 0.06, 0.45), olive); stab.position.set(0, 0.25, -4.3); tilt.add(stab);
  const tail = new THREE.Group(); tail.position.set(0.14, 1.25, -4.45); tilt.add(tail);
  for (const a of [0, 1.0]) { const b = plain(new THREE.BoxGeometry(0.04, 1.1, 0.12), dark); b.rotation.x = a; tail.add(b); }
  // rotor mast with the Longbow radar dome on top, four broad blades below it
  const mast = plain(G.cyl(0.09, 0.13, 0.9, 8), dark); mast.position.y = 0.98; tilt.add(mast);
  const rotor = new THREE.Group(); rotor.position.y = 1.08; tilt.add(rotor);
  for (const a of [0, Math.PI / 2]) { const b = plain(new THREE.BoxGeometry(6.6, 0.05, 0.3), dark); b.rotation.y = a; rotor.add(b); }
  rotor.add(plain(G.cyl(0.22, 0.22, 0.14, 8), dark));
  const blur = new THREE.Mesh(new THREE.CircleGeometry(3.3, 20), new THREE.MeshBasicMaterial({ color: 0x1a1a1a, transparent: true, opacity: 0.13, depthWrite: false, side: THREE.DoubleSide }));
  blur.rotation.x = -Math.PI / 2; blur.position.y = 1.1; tilt.add(blur);
  const dome = inked(G.sphere(0.34, 12, 8), tan, OUTLINE.thin); dome.scale.set(1, 0.55, 1); dome.position.y = 1.42; tilt.add(dome);
  const beacon = plain(G.sphere(0.07, 6, 4), glowMat(livery.red)); beacon.position.set(0, 0.75, -4.05); tilt.add(beacon);
  // weapons (kick back on each launch): an inner rocket pod and four outer Hellfires under each wing
  const pod = new THREE.Group(); pod.position.y = -0.35; tilt.add(pod);
  const hellfires = [];
  for (const sx of [-1, 1]) {
    const rp = inked(G.cyl(0.21, 0.21, 0.95, 10), dark, OUTLINE.thin); rp.rotation.x = Math.PI / 2; rp.position.set(sx * 0.95, 0, -0.05); pod.add(rp);
    const face = plain(new THREE.CircleGeometry(0.17, 8), red); face.position.set(sx * 0.95, 0, 0.43); pod.add(face);
    const rack = plain(new THREE.BoxGeometry(0.42, 0.06, 0.8), dark); rack.position.set(sx * 1.55, 0.12, -0.05); pod.add(rack);
    for (const ox of [-0.11, 0.11]) for (const oy of [0, -0.17]) {
      const hf = new THREE.Group(); hf.position.set(sx * 1.55 + ox, oy, -0.05); pod.add(hf); hellfires.push(hf);
      const body = plain(G.cyl(0.07, 0.07, 0.75, 6), tan); body.rotation.x = Math.PI / 2; hf.add(body);
      const tip = plain(G.cone(0.07, 0.16, 6), red); tip.rotation.x = Math.PI / 2; tip.position.z = 0.45; hf.add(tip);
    }
  }
  g.userData = { tilt, rotor, tail, pod, podY: pod.position.y, gun, flash, exhausts, hellfires, blur, kick: 0 };
  compact(tilt, [rotor, tail, gun, pod, ...exhausts]); compact(pod);
  return g;
}

// ------------------------------------------------------------------ the alien prototype (new)
// XH-0: a black chrome blade of a fuselage under a glass blister, no tail rotor (nothing to counter: it
// floats on its field), a spinning ring of energy where a rotor should be, twin emitter pods, glyph lights.
export const ALIEN_LIVERY = {
  player: { body: 0x1d2230, trim: 0x6c7a92, glow: 0x3dfff0, glow2: 0x9a7bff, glass: 0x7af7ff },
  enemy: { body: 0x2a1830, trim: 0x7a5a8a, glow: 0xff3df0, glow2: 0xffb02b, glass: 0xff9af0 },
};
export function createAlienCopter(livery = ALIEN_LIVERY.player) {
  const g = new THREE.Group(), tilt = new THREE.Group(); g.add(tilt);
  const body = mat(livery.body, { metalness: 0.7, roughness: 0.25 }), trim = mat(livery.trim, { metalness: 0.6, roughness: 0.3 });
  const glow = glowMat(livery.glow), glow2 = glowMat(livery.glow2), glass = mat(livery.glass, { transparent: true, opacity: 0.55, emissive: livery.glass, emissiveIntensity: 0.35, roughness: 0.1 });
  tilt.add(inked(heliSlab(-1.6, 1.0, 1.25, 0.9, 0, 0.9, 0.8, -0.05), body, OUTLINE.mid)); // hull
  tilt.add(inked(heliSlab(1.0, 2.9, 0.9, 0.8, -0.05, 0.1, 0.18, -0.25), body, OUTLINE.mid)); // blade nose
  tilt.add(inked(heliSlab(-4.6, -1.6, 0.18, 0.2, 0.25, 0.7, 0.55, 0.1), body, OUTLINE.thin)); // tail spine
  const blister = inked(G.sphere(0.72, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), glass, OUTLINE.thin); blister.scale.set(0.95, 0.7, 1.6); blister.position.set(0, 0.35, 0.5); tilt.add(blister);
  for (const sx of [-1, 1]) { // swept fins and the emitter pods
    const fin = inked(heliSlab(-4.8, -3.6, 0.06, 0.2, 0.3, 0.06, 1.2, 0.9), trim, OUTLINE.thin); fin.rotation.z = sx * 0.7; fin.position.x = sx * 0.2; tilt.add(fin);
    const wing = inked(heliSlab(-1.2, 0.6, 0.12, 0.08, -0.1, 0.12, 0.08, -0.1), trim, OUTLINE.thin); wing.scale.x = 14; wing.position.x = sx * 0.95; tilt.add(wing);
    const podm = inked(G.cyl(0.26, 0.34, 1.5, 10), body, OUTLINE.thin); podm.rotation.x = Math.PI / 2; podm.position.set(sx * 1.85, -0.15, -0.3); tilt.add(podm);
    const em = plain(G.sphere(0.22, 8, 6), glow); em.position.set(sx * 1.85, -0.15, 0.48); tilt.add(em);
    for (let k = 0; k < 4; k++) { const gl = plain(new THREE.BoxGeometry(0.03, 0.06, 0.22), k % 2 ? glow2 : glow, false); gl.position.set(sx * 0.62, 0.05, -1.2 + k * 0.45); tilt.add(gl); } // glyph strip
  }
  const keel = plain(new THREE.BoxGeometry(0.05, 0.08, 3.8), glow, false); keel.position.set(0, -0.45, 0.2); tilt.add(keel);
  // the energy ring rotor: a glowing torus and four light-blades inside it
  const rotor = new THREE.Group(); rotor.position.y = 1.15; tilt.add(rotor);
  const ring = new THREE.Mesh(G.torus(2.9, 0.09, 4, 32), glow); ring.rotation.x = Math.PI / 2; rotor.add(ring);
  for (let i = 0; i < 4; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.03, 0.18), new THREE.MeshBasicMaterial({ color: livery.glow, transparent: true, opacity: 0.45, depthWrite: false })); b.rotation.y = (i * Math.PI) / 4; rotor.add(b); }
  const hub = inked(G.sphere(0.36, 10, 8), trim, OUTLINE.thin); hub.scale.y = 0.5; hub.position.y = 1.1; tilt.add(hub);
  const pylon = plain(G.cyl(0.08, 0.14, 0.7, 6), trim); pylon.position.y = 0.8; tilt.add(pylon);
  const gun = new THREE.Group(); gun.position.set(0, -0.45, 1.6); tilt.add(gun);
  gun.add(plain(G.sphere(0.16, 8, 6), glow2));
  const flash = new THREE.Mesh(new THREE.OctahedronGeometry(0.3, 0), glow); flash.position.z = 0.6; flash.visible = false; gun.add(flash);
  const pod = new THREE.Group(); tilt.add(pod);
  g.userData = { tilt, rotor, tail: null, pod, podY: 0, gun, flash, exhausts: [], hellfires: [], kick: 0, alien: true, ring };
  compact(tilt, [rotor, gun, pod]);
  return g;
}

// ------------------------------------------------------------------ missiles (dr-mow)
export function createMissile(white = 0xf2f2f6, nose = 0xee3b4d, s = 1) {
  const g = new THREE.Group(), body = mat(white), red = mat(nose), dark = mat(0x3a3448);
  const b = inked(G.cyl(0.18, 0.18, 1.1, 8), body, OUTLINE.thin); b.rotation.x = Math.PI / 2; g.add(b);
  const n = inked(G.cone(0.18, 0.38, 8), red, OUTLINE.thin); n.rotation.x = Math.PI / 2; n.position.z = 0.74; g.add(n);
  for (let i = 0; i < 4; i++) { const fin = plain(new THREE.BoxGeometry(0.03, 0.34, 0.3), red); const a = (i / 4) * Math.PI * 2; fin.position.set(Math.cos(a) * 0.2, Math.sin(a) * 0.2, -0.45); fin.rotation.z = a + Math.PI / 2; g.add(fin); }
  const band = plain(G.cyl(0.185, 0.185, 0.08, 8), dark); band.rotation.x = Math.PI / 2; band.position.z = 0.2; g.add(band);
  const light = new THREE.Mesh(G.sphere(0.08, 6, 4), new THREE.MeshBasicMaterial({ color: 0x661010 })); light.position.set(0, 0.2, 0.3); g.add(light);
  g.userData.light = light;
  g.scale.setScalar(s);
  return g;
}
// SAM site: a squat base with a swivelling head and twin launch tubes that recoil (dr-mow createLauncher,
// with a second tube).
export function createLauncher() {
  const g = new THREE.Group(), olive = mat(0x6f7a3a), dark = mat(0x3a3448), stripe = mat(0xffd23a);
  const base = inked(G.cyl(1.3, 1.5, 1.0, 12), olive, OUTLINE.mid); base.position.y = 0.5; g.add(base);
  const band = plain(G.cyl(1.32, 1.32, 0.16, 12), stripe); band.position.y = 0.85; g.add(band);
  const head = new THREE.Group(); head.position.y = 1.2; g.add(head);
  head.add(inked(G.sphere(0.9, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), olive, OUTLINE.mid));
  const tubeG = new THREE.Group(); tubeG.position.set(0, 0.5, 0); tubeG.rotation.x = -0.6; head.add(tubeG);
  for (const sx of [-0.36, 0.36]) {
    const tube = inked(G.cyl(0.28, 0.28, 1.8, 10), dark, OUTLINE.mid); tube.rotation.x = Math.PI / 2; tube.position.set(sx, 0, 0.6); tubeG.add(tube);
    const lip = plain(G.torus(0.28, 0.06, 4, 12), stripe); lip.position.set(sx, 0, 1.5); tubeG.add(lip);
  }
  g.userData = { head, tube: tubeG };
  g.scale.setScalar(1.2);
  return g;
}
// Flak gun: a sandbag ring round a twin-barrel mount (Vertical-Vantage fortress gunmount, rebuilt).
export function createFlak() {
  const g = new THREE.Group(), K = new Kit();
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; K.add('flat', box(1.1, 0.55, 0.6, { x: Math.cos(a) * 1.9, y: 0.28, z: Math.sin(a) * 1.9, ry: -a, color: 0xb8a878 }), box(1.0, 0.5, 0.55, { x: Math.cos(a + 0.3) * 1.9, y: 0.78, z: Math.sin(a + 0.3) * 1.9, ry: -a, color: 0xa89868 })); }
  K.add('flat', cyl(0.9, 1.1, 0.6, 8, { y: 0.3, color: 0x4a5040 }));
  kitMeshes(K, g);
  const head = new THREE.Group(); head.position.y = 0.8; g.add(head);
  head.add(inked(G.box(1.3, 0.8, 1.2), mat(0x5a6448), OUTLINE.thin));
  const tubes = new THREE.Group(); tubes.position.y = 0.2; tubes.rotation.x = -0.7; head.add(tubes);
  for (const sx of [-0.28, 0.28]) { const b = plain(G.cyl(0.08, 0.1, 2.4, 6), mat(0x2a2a2a)); b.rotation.x = Math.PI / 2; b.position.set(sx, 0, 1.2); tubes.add(b); }
  g.userData = { head, tube: tubes };
  return g;
}

// ------------------------------------------------------------------ tanks (new: heliSlab hull and turret)
export function createTank(alien = false) {
  const g = new THREE.Group(), hullG = new THREE.Group(); g.add(hullG);
  const body = mat(alien ? 0x3a2a4a : 0x6b6a3a), dark = mat(alien ? 0x1a1022 : 0x2e2e26), trim = mat(alien ? 0x7a5a9a : 0x8a8a5a);
  hullG.add(inked(heliSlab(-2.8, 2.8, 2.4, 0.9, 0.95, 2.2, 0.7, 0.9), body, OUTLINE.mid));
  hullG.add(inked(heliSlab(2.4, 3.3, 2.2, 0.7, 0.9, 2.0, 0.3, 0.75), body, OUTLINE.thin)); // glacis
  if (!alien) for (const sx of [-1, 1]) { // tracks with road wheels
    hullG.add(inked(G.box(0.7, 0.9, 6.2), dark, OUTLINE.thin).translateX(sx * 1.45).translateY(0.45));
    for (let k = 0; k < 5; k++) { const wh = plain(G.cyl(0.36, 0.36, 0.14, 8), trim); wh.rotation.z = Math.PI / 2; wh.position.set(sx * 1.84, 0.42, -2.2 + k * 1.1); hullG.add(wh); }
  } else for (const sx of [-1, 1]) for (const sz of [-1.8, 1.8]) { // hover pads that glow
    hullG.add(inked(G.cyl(0.6, 0.75, 0.4, 10), dark, OUTLINE.thin).translateX(sx * 1.3).translateZ(sz).translateY(0.35));
    const glo = plain(new THREE.CircleGeometry(0.55, 10), glowMat(0xb45cff)); glo.rotation.x = Math.PI / 2; glo.position.set(sx * 1.3, 0.14, sz); hullG.add(glo);
  }
  const turret = new THREE.Group(); turret.position.set(0, 1.4, -0.3); g.add(turret);
  turret.add(inked(heliSlab(-1.3, 1.2, 1.9, 0.8, 0.35, 1.5, 0.6, 0.3), body, OUTLINE.mid));
  const gun = new THREE.Group(); gun.position.set(0, 0.4, 1.1); turret.add(gun);
  const barrel = inked(G.cyl(0.12, 0.15, 3.2, 8), dark, OUTLINE.thin); barrel.rotation.x = Math.PI / 2; barrel.position.z = 1.6; gun.add(barrel);
  const tip = new THREE.Mesh(G.sphere(0.22, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff6a20 })); tip.position.z = 3.25; tip.visible = false; gun.add(tip);
  const hatch = plain(G.cyl(0.3, 0.3, 0.15, 8), trim); hatch.position.set(0.4, 0.75, -0.4); turret.add(hatch);
  g.userData = { turret, gun, tip, hull: hullG };
  compact(hullG); compact(turret, [gun]);
  return g;
}
// The technical: the gig-ambulance pickup with a machine gun on the bed (added in view.js once the GLB loads).
export function createMG() {
  const g = new THREE.Group(), dark = mat(0x2a2a2a);
  g.add(plain(G.cyl(0.08, 0.1, 0.8, 6), dark).translateY(0.4));
  const gun = new THREE.Group(); gun.position.y = 0.85; g.add(gun);
  const b = plain(G.cyl(0.05, 0.05, 1.3, 6), dark); b.rotation.x = Math.PI / 2; b.position.z = 0.5; gun.add(b);
  gun.add(plain(G.box(0.25, 0.25, 0.5), dark));
  g.userData.gun = gun;
  return g;
}

// ------------------------------------------------------------------ gunboat (new; sub-sinkers' boat sprite as the silhouette)
export function createBoat() {
  const g = new THREE.Group(), grey = mat(0x6e7680), dark = mat(0x2c3138), white = mat(0xd8dde2), red = mat(0x9a2a24);
  g.add(inked(heliSlab(-4.5, 3.5, 3.4, 1.6, 0.5, 2.6, 1.5, 0.6), grey, OUTLINE.mid));
  g.add(inked(heliSlab(3.5, 6, 2.6, 1.5, 0.6, 0.15, 1.2, 0.9), grey, OUTLINE.thin)); // bow
  g.add(plain(heliSlab(-4.5, 6, 3.45, 0.4, -0.15, 0.2, 0.3, 0.0), red));
  g.add(inked(G.box(2.2, 1.6, 2.6), white, OUTLINE.thin).translateY(2.0).translateZ(-1.5));
  g.add(plain(G.box(2.25, 0.4, 2.0), mat(0x22384c)).translateY(2.5).translateZ(-1.2));
  const mast = plain(G.cyl(0.07, 0.09, 2.6, 6), dark); mast.position.set(0, 4.0, -2.0); g.add(mast);
  const radar = plain(G.box(1.2, 0.12, 0.25), dark); radar.position.set(0, 5.0, -2.0); g.add(radar);
  const turret = new THREE.Group(); turret.position.set(0, 1.4, 2.6); g.add(turret);
  turret.add(inked(G.cyl(0.7, 0.8, 0.6, 8), grey, OUTLINE.thin));
  const b = plain(G.cyl(0.1, 0.12, 2.0, 6), dark); b.rotation.x = Math.PI / 2; b.position.set(0, 0.15, 1.1); turret.add(b);
  g.userData = { turret, radar };
  compact(g, [turret, radar]);
  return g;
}

// ------------------------------------------------------------------ aircraft
// Drone: a lavender sphere in a ring with a glowing eye and an antenna (cosmic-calamity makeDrone), with rotors.
export function createDrone() {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const shell = inked(G.sphere(0.55, 10, 8), mat(0x8a8fa0), OUTLINE.thin); shell.scale.set(1, 0.8, 1); body.add(shell);
  const ring = plain(G.torus(0.8, 0.07, 4, 16), mat(0x3a3f4a)); ring.rotation.x = Math.PI / 2; body.add(ring);
  const eye = plain(G.sphere(0.18, 6, 4), glowMat(0xff3030)); eye.position.set(0, -0.05, 0.48); body.add(eye);
  const ant = plain(G.cyl(0.03, 0.03, 0.4, 4), mat(0x888888)); ant.position.y = 0.6; body.add(ant);
  const rotors = [];
  for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + Math.PI / 4, r = new THREE.Mesh(new THREE.CircleGeometry(0.42, 10), new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false })); r.rotation.x = -Math.PI / 2; r.position.set(Math.cos(a) * 1.0, 0.18, Math.sin(a) * 1.0); body.add(r); rotors.push(r); }
  g.userData = { body, eye, rotors };
  g.scale.setScalar(1.3);
  return g;
}
// Saucer: a silver disc with a glass dome, a little green pilot, rim lights and a tractor beam (dr-mow createUfo).
export function createSaucer(scale = 1.3, hullColor = 0xc8cede) {
  const g = new THREE.Group();
  const disc = inked(G.sphere(2, 20, 8), mat(hullColor, { metalness: 0.6, roughness: 0.3 }), OUTLINE.mid); disc.scale.set(1, 0.28, 1);
  const dome = plain(G.sphere(0.9, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x9ff0ff, { transparent: true, opacity: 0.6, emissive: 0x3fb8c8, emissiveIntensity: 0.4 }));
  dome.position.y = 0.3;
  const pilot = plain(G.sphere(0.35, 8, 6), mat(0x7ce85a, { emissive: 0x3a8a2a, emissiveIntensity: 0.4 })); pilot.position.y = 0.55;
  const lights = new THREE.Group();
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2, l = new THREE.Mesh(G.sphere(0.14, 6, 4), glowMat(i % 2 ? 0xffe25a : 0xff5fa2)); l.position.set(Math.cos(a) * 1.85, -0.05, Math.sin(a) * 1.85); lights.add(l); }
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 2.6, 1, 14, 1, true), new THREE.MeshBasicMaterial({ color: 0x9dff7a, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide }));
  beam.visible = false;
  g.add(disc, dome, pilot, lights);
  g.scale.setScalar(scale);
  g.userData = { lights, beam };
  return g;
}
// The mothership: a saucer seven times over, with a ring of hangar lights and a big beam.
export function createMothership() {
  const g = createSaucer(7.5, 0x8a8fa8);
  const ring = new THREE.Mesh(G.torus(2.05, 0.08, 4, 40), glowMat(0x6aff4a)); ring.rotation.x = Math.PI / 2; ring.position.y = -0.18; g.add(ring);
  const core = new THREE.Mesh(G.sphere(0.6, 10, 6), glowMat(0x9dff7a)); core.position.y = -0.4; core.scale.y = 0.4; g.add(core);
  g.userData.core = core;
  return g;
}
// Raider jet: a delta with canards and a glowing intake (alien-built, so it glows).
export function createJet() {
  const g = new THREE.Group(), body = mat(0x3a3f4e, { metalness: 0.5, roughness: 0.35 }), dark = mat(0x16181e);
  g.add(inked(heliSlab(-3.2, 3.6, 0.9, 0.7, 0, 0.1, 0.12, -0.05), body, OUTLINE.mid));
  const wing = new THREE.Shape([new THREE.Vector2(0, 1.2), new THREE.Vector2(3.6, -2.4), new THREE.Vector2(-3.6, -2.4)]);
  const wg = new THREE.ExtrudeGeometry(wing, { depth: 0.12, bevelEnabled: false }); wg.rotateX(Math.PI / 2); wg.translate(0, 0.05, 0);
  g.add(inked(wg, body, OUTLINE.thin));
  for (const sx of [-1, 1]) { const fin = inked(heliSlab(-3.2, -1.8, 0.06, 1.3, 0.7, 0.06, 0.2, 0.3), dark, OUTLINE.thin); fin.rotation.z = sx * 0.35; fin.position.x = sx * 0.5; g.add(fin); }
  const can = inked(G.sphere(0.4, 8, 6), mat(0x7affc8, { emissive: 0x2a8a6a, emissiveIntensity: 0.6, transparent: true, opacity: 0.8 }), OUTLINE.thin); can.scale.set(0.8, 0.6, 1.6); can.position.set(0, 0.35, 1.6); g.add(can);
  const burner = plain(G.sphere(0.32, 6, 4), glowMat(0x6aff4a)); burner.position.z = -3.3; g.add(burner);
  g.userData = { burner };
  compact(g, [burner]);
  return g;
}

// ------------------------------------------------------------------ the tanker (Vertical-Vantage ship hull, stretched)
export function createTanker() {
  const g = new THREE.Group(), K = new Kit();
  const hullC = 0x8a2a22, deck = 0x5a6a5a, white = 0xf0f0ec;
  K.add('flat', box(11, 7, 50, { y: 2.5, color: hullC }), box(11.1, 2, 50.1, { y: 0.0, color: 0x1a1a22 }));
  K.add('flat', part(heliSlab(25, 33, 11, 7, 2.5, 1, 6, 3.5), { color: hullC })); // bow
  K.add('flat', box(10.4, 0.1, 56, { y: 6.05, z: 2, color: deck }));
  for (let z = -18; z < 28; z += 6) K.add('flat', cyl(1.4, 1.4, 1.2, 8, { x: -2.6, y: 6.6, z, color: 0xc8c0a8 }), cyl(1.4, 1.4, 1.2, 8, { x: 2.6, y: 6.6, z, color: 0xc8c0a8 }));
  K.add('flat', box(0.4, 0.4, 46, { x: 0, y: 6.5, z: 4, color: 0x8a8a8a }), box(0.3, 0.3, 46, { x: 0.8, y: 6.4, z: 4, color: 0xd8a020 }));
  // bridge at the stern and the helipad in front of it (the LZ follows the tanker)
  K.add('flat', box(9, 7, 6, { y: 9.5, z: -22, color: white }), box(9.1, 1.2, 6.1, { y: 11.6, z: -22, color: 0x22384c }), box(3, 0.3, 0.3, { y: 14, z: -21, color: 0x333333 }));
  K.add('flat', cyl(0.5, 0.6, 3, 6, { x: 2.5, y: 14.5, z: -24, color: 0xd8302a }));
  K.add('flat', box(9.4, 0.12, 9.4, { y: 6.12, z: -12, color: 0x3a3f46 }));
  for (const [x, z, w, d] of [[-1.6, -12, 0.6, 4.2], [1.6, -12, 0.6, 4.2], [0, -12, 3, 0.6]]) K.add('glow', box(w, 0.05, d, { x, y: 6.2, z, color: 0xffe25a }));
  for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; K.add('glow', box(0.25, 0.1, 0.25, { x: Math.cos(a) * 4.2, y: 6.22, z: -12 + Math.sin(a) * 4.2, color: k % 2 ? 0x3ddc84 : 0xffe25a })); }
  kitMeshes(K, g);
  return g;
}

// ------------------------------------------------------------------ small things
export function createNavMine() {
  const g = new THREE.Group(), K = new Kit();
  K.add('flat', ball(0.9, { color: 0x2a2c30 }, 1));
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2, b = i % 2 ? 0.5 : -0.3; K.add('flat', cyl(0.06, 0.12, 0.5, 4, { x: Math.cos(a) * 0.95, y: b, z: Math.sin(a) * 0.95, rz: -Math.cos(a) * 1.2, rx: Math.sin(a) * 1.2, color: 0x4a4c50 })); }
  K.add('glow', ball(0.15, { y: 0.9, color: 0xff2020 }));
  kitMeshes(K, g);
  return g;
}
export function createDroppedMine(grav = false) {
  const g = new THREE.Group(), K = new Kit();
  if (grav) { K.add('flat', ball(0.5, { color: 0x1d2230 }, 1)); K.add('glow', part(new THREE.TorusGeometry(0.62, 0.06, 4, 16), { rx: Math.PI / 2, color: 0x9a7bff })); }
  else { K.add('flat', cyl(0.5, 0.6, 0.35, 8, { color: 0x3a4030 }), cyl(0.25, 0.3, 0.2, 8, { y: 0.25, color: 0x4a5040 })); K.add('glow', ball(0.1, { y: 0.4, color: 0xff2020 })); }
  kitMeshes(K, g);
  g.userData.light = g.children.find((m) => m.userData.kitKey === 'glow');
  return g;
}
export function createCrate(kind) {
  const g = new THREE.Group(), K = new Kit();
  if (kind === 'fuel') { for (const [x, z] of [[-0.45, 0], [0.45, 0]]) K.add('flat', cyl(0.42, 0.42, 1.2, 10, { x, y: 0.6, z, color: 0xd8302a }), cyl(0.43, 0.43, 0.08, 10, { x, y: 0.9, z, color: 0x9a1a14 })); K.add('glow', box(0.5, 0.08, 0.08, { y: 1.25, color: 0xffd23a })); }
  else if (kind === 'armor') { K.add('flat', box(1.4, 0.9, 1.0, { y: 0.45, color: 0x2f8f4f })); K.add('glow', box(0.7, 0.12, 0.2, { y: 0.92, color: 0xffffff }), box(0.2, 0.12, 0.7, { y: 0.92, color: 0xffffff })); }
  else { K.add('flat', box(1.5, 0.8, 0.9, { y: 0.4, color: 0x5a6438 }), box(1.52, 0.12, 0.92, { y: 0.55, color: 0xffd23a })); K.add('glow', box(0.3, 0.06, 0.3, { y: 0.82, color: 0xffd23a })); }
  kitMeshes(K, g);
  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 30, 8, 1, true), new THREE.MeshBasicMaterial({ color: kind === 'fuel' ? 0xff6040 : kind === 'armor' ? 0x3ddc84 : 0xffd23a, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide }));
  beacon.position.y = 15; g.add(beacon);
  g.userData.beacon = beacon;
  return g;
}

// ------------------------------------------------------------------ people (cosmic-calamity makeHuman, merged per part)
// Returns merged, vertex-coloured geometries { body, legL, legR } plus the hip pivot heights, so all soldiers of
// one look draw as three InstancedMeshes (view.js). Proportions are cosmic-calamity's (big head), scaled to ~1.9 m.
const HUMAN = {
  soldier: { suit: 0x5a6a3a, suitD: 0x3a4628, skin: 0xe8b890, helm: 0x4a5630, gun: 0x22222a, glowEye: null },
  rpg: { suit: 0x6a5a3a, suitD: 0x463a28, skin: 0xd8a880, helm: 0x5a4a30, gun: 0x3a4a2a, tube: true },
  alien: { suit: 0xc8384a, suitD: 0x7a1e2c, skin: 0x6fd05a, gun: 0x22222a, glowEye: 0xffd23a, spikes: 0x3f9a3a },
  heavy: { suit: 0x6a58a0, suitD: 0x40346a, skin: 0x5fb04a, gun: 0x2a2a33, glowEye: 0xff4b5c, dome: 0x9aa0b4, big: 1.25 },
  pilot: { suit: 0x34507a, suitD: 0x243858, skin: 0xf5c9a4, helm: 0xe8e8e0, gun: 0x22222a, visor: 0x2a2a3a },
};
export function humanParts(kind) {
  const P = HUMAN[kind], S = 1.75 * (P.big || 1);
  const bodyK = [], legL = [], legR = [];
  const b = (list, w, h, d, x, y, z, color, o = {}) => list.push(box(w * S, h * S, d * S, { x: x * S, y: y * S, z: z * S, color, ...o }));
  for (const [list, sx] of [[legL, -1], [legR, 1]]) { b(list, 0.13, 0.34, 0.15, 0, -0.17, 0, P.suitD); b(list, 0.14, 0.06, 0.2, 0, -0.33, 0.03, 0x1a1a22); }
  for (const sx of [-1, 1]) { b(bodyK, 0.1, 0.3, 0.11, sx * 0.23, 0.51, 0, P.suit); b(bodyK, 0.09, 0.07, 0.1, sx * 0.23, 0.34, 0, P.skin); }
  b(bodyK, 0.36, 0.34, 0.22, 0, 0.52, 0, P.suit); b(bodyK, 0.37, 0.05, 0.23, 0, 0.38, 0, P.suitD);
  b(bodyK, 0.3, 0.28, 0.3, 0, 0.88, 0, P.skin);
  if (P.helm) { b(bodyK, 0.36, 0.13, 0.36, 0, 1.02, -0.01, P.helm); b(bodyK, 0.38, 0.03, 0.38, 0, 0.96, 0, P.helm); }
  if (P.visor) b(bodyK, 0.26, 0.08, 0.02, 0, 0.9, 0.152, P.visor);
  else if (!P.glowEye) { b(bodyK, 0.05, 0.05, 0.01, -0.07, 0.88, 0.152, 0x1a1a2a); b(bodyK, 0.05, 0.05, 0.01, 0.07, 0.88, 0.152, 0x1a1a2a); }
  if (P.glowEye) { b(bodyK, 0.2, 0.12, 0.14, 0, 0.83, 0.18, P.skin); b(bodyK, 0.3, 0.06, 0.01, 0, 0.91, 0.152, 0x111118); b(bodyK, 0.05, 0.035, 0.012, -0.08, 0.91, 0.158, P.glowEye); b(bodyK, 0.05, 0.035, 0.012, 0.08, 0.91, 0.158, P.glowEye); }
  if (P.spikes) for (const [x, h] of [[0, 0.16], [-0.09, 0.11], [0.09, 0.11]]) bodyK.push(cone(0.05 * S, h * S, 4, { x: x * S, y: (1.05 + h / 2) * S, z: -0.02 * S, color: P.spikes }));
  if (P.dome) bodyK.push(ball(0.2 * S, { x: 0, y: 0.98 * S, z: -0.02 * S, sy: 0.7, color: P.dome }));
  b(bodyK, 0.07, 0.08, 0.34, 0.23, 0.4, 0.22, P.gun); // the rifle
  if (P.tube) b(bodyK, 0.14, 0.14, 0.8, -0.18, 0.72, -0.05, 0x3a4a2a); // RPG tube on the shoulder
  const geo = (list) => { const g = mergeGeometries(list, false); g.computeBoundingSphere(); return g; };
  return { body: geo(bodyK), legL: geo(legL), legR: geo(legR), hipY: 0.36 * S, hipX: 0.09 * S, scale: S };
}
