// The cast. Models face +Z, 1 unit = 1 m. Where each comes from:
//   createApache        dr-mow js/scene.js createHeli (the attack helicopter enemy), now player-flown; a livery
//                       parameter paints the enemy gunships
//   createMissile       dr-mow createMissile          createLauncher (SAM site)   dr-mow createLauncher
//   createSaucer        dr-mow js/models.js createUfo (scaled up for the alien raiders and the mothership)
//   createDrone         cosmic-calamity js/render3d.js makeDrone
//   humanParts          cosmic-calamity makeHuman (troopers, the reptilian grunt / heavy, Snake for the pilot)
//   createAlienCopter, createTank, createBoat, createJet, createTanker, createFlak, crates: new, in the same kit
//   createWalker, createCrawler   mission 6's spider tanks and bomb bots (legs from render/legs.js)
import * as THREE from 'three';
import { mat, glowMat, inked, plain, OUTLINE, G, Kit, box, cyl, ball, cone, part, kitMeshes, compact, canvasTex } from './kit.js';
import { RETRO } from '../retro.js';
import { mergeGeometries } from '../vendor/addons/BufferGeometryUtils.js';
import { LegRig, LEG_STYLE } from './legs.js';

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
  // a sandbag ring and the fire-control radar on its post
  const K = new Kit();
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; if (i === 3) continue; K.add('flat', box(1.0, 0.5, 0.55, { x: Math.cos(a) * 2.5, y: 0.25, z: Math.sin(a) * 2.5, ry: -a, color: 0xb8a878 }), box(0.9, 0.45, 0.5, { x: Math.cos(a + 0.26) * 2.5, y: 0.7, z: Math.sin(a + 0.26) * 2.5, ry: -a, color: 0xa89868 })); }
  K.add('flat', cyl(0.06, 0.06, 2.2, 4, { x: -1.9, y: 1.1, z: -1.2, color: 0x6a6a6a }), part(new THREE.CylinderGeometry(0.55, 0.12, 0.25, 8, 1, true), { x: -1.9, y: 2.3, z: -1.2, rx: -1.0, color: 0xe4e8ec }));
  kitMeshes(K, g);
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

// ------------------------------------------------------------------ camouflage and tread textures (enemy vehicles)
const CAMO = { olive: ['#6b6a3a', '#4e5030', '#83794a', '#2e3024'], desert: ['#b09a68', '#8a7448', '#cbb88c', '#5a4a30'], grey: ['#7a7e82', '#5c6066', '#9aa0a4', '#3c4046'] };
const camoCache = {};
export function camoTex(kind = 'olive') {
  if (camoCache[kind]) return camoCache[kind];
  const P = CAMO[kind];
  let sd = kind.length * 977 + 13;
  const r = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
  return (camoCache[kind] = canvasTex(64, 64, (c, w, h) => {
    c.fillStyle = P[0]; c.fillRect(0, 0, w, h);
    for (const col of [P[1], P[2], P[3]]) for (let i = 0; i < 8; i++) {
      const x = r() * w, y = r() * h, rx = 4 + r() * 11, ry = 3 + r() * 6, a = r() * 3;
      c.fillStyle = col;
      for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) { c.beginPath(); c.ellipse(x + ox, y + oy, rx, ry, a, 0, 6.3); c.fill(); }
    }
  }));
}
const camoMats = {};
export function camoMat(kind = 'olive') {
  return (camoMats[kind] ||= new THREE.MeshStandardMaterial({ map: camoTex(kind), roughness: 0.85, metalness: 0.1, flatShading: RETRO }));
}
let treadBase = null;
function treadMat() { // one per tank, so each tank's tracks scroll at its own speed
  treadBase ||= canvasTex(8, 32, (c, w, h) => { c.fillStyle = '#26261f'; c.fillRect(0, 0, w, h); c.fillStyle = '#4a4a40'; for (let y = 0; y < h; y += 4) c.fillRect(0, y, w, 2); c.fillStyle = '#16160f'; c.fillRect(3, 0, 2, h); });
  const t = treadBase.clone(); t.repeat.set(1, 6); t.needsUpdate = true;
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.95, flatShading: RETRO });
}

// ------------------------------------------------------------------ the enemy gunship: a Hind-style assault helicopter (new)
// So enemies never look like you: a deep camouflaged cabin with a hump, tandem bubble canopies (gunner low in
// the nose, pilot above and behind), dust-filtered intakes, drooping stub wings carrying rocket pods and
// wingtip rails, a four-barrel chin gun, a five-blade rotor and a tail rotor on the right of the fin.
export function createHind(camo = 'desert') {
  const g = new THREE.Group(), tilt = new THREE.Group(); g.add(tilt);
  const exhausts = [];
  const body = camoMat(camo), dark = mat(0x26231f), glass = mat(0x4a6a7a, { roughness: 0.15, metalness: 0.5 }), red = mat(0xd8302a), rail = mat(0x9a9478);
  tilt.add(inked(heliSlab(-1.9, 1.2, 1.3, 1.45, 0.05, 1.2, 1.35, 0), body, OUTLINE.mid));
  tilt.add(inked(heliSlab(1.2, 2.6, 1.2, 1.35, 0, 0.62, 0.75, -0.32), body, OUTLINE.mid));
  tilt.add(inked(heliSlab(-1.3, 1.0, 1.0, 0.5, 0.92, 0.9, 0.45, 0.92), body, OUTLINE.thin));
  tilt.add(inked(heliSlab(-5.8, -1.9, 0.28, 0.32, 0.6, 0.8, 0.95, 0.2), body, OUTLINE.thin));
  const gb = inked(G.sphere(0.5, 10, 8), glass, OUTLINE.thin); gb.scale.set(0.95, 0.75, 1.15); gb.position.set(0, -0.05, 2.35); tilt.add(gb);
  const pb = inked(G.sphere(0.55, 10, 8), glass, OUTLINE.thin); pb.scale.set(1.0, 0.8, 1.2); pb.position.set(0, 0.62, 1.4); tilt.add(pb);
  const pod = new THREE.Group(); tilt.add(pod);
  for (const sx of [-1, 1]) {
    const nac = inked(G.cyl(0.32, 0.3, 1.9, 10), body, OUTLINE.thin); nac.rotation.x = Math.PI / 2; nac.position.set(sx * 0.55, 1.12, 0); tilt.add(nac);
    const filt = inked(G.sphere(0.34, 8, 6), dark, OUTLINE.thin); filt.scale.z = 0.7; filt.position.set(sx * 0.55, 1.12, 0.98); tilt.add(filt);
    const ex = plain(G.cyl(0.18, 0.24, 0.6, 8), dark); ex.rotation.z = sx * 1.2; ex.position.set(sx * 0.95, 1.12, -1.05); tilt.add(ex);
    const tip = new THREE.Object3D(); tip.position.set(sx * 1.25, 1.18, -1.1); tilt.add(tip); exhausts.push(tip);
    const wing = plain(new THREE.BoxGeometry(2.3, 0.1, 0.85), body); wing.position.set(sx * 1.75, -0.18, -0.25); wing.rotation.z = -sx * 0.17; tilt.add(wing);
    for (const [ox, oy] of [[1.0, -0.5], [1.85, -0.66]]) {
      const rp = inked(G.cyl(0.22, 0.22, 1.1, 10), dark, OUTLINE.thin); rp.rotation.x = Math.PI / 2; rp.position.set(sx * ox, oy, -0.2); pod.add(rp);
      const face = plain(new THREE.CircleGeometry(0.18, 8), red); face.position.set(sx * ox, oy, 0.36); pod.add(face);
    }
    for (const oy of [0, -0.22]) { const r = plain(G.cyl(0.07, 0.07, 1.0, 6), rail); r.rotation.x = Math.PI / 2; r.position.set(sx * 2.85, -0.52 + oy, -0.15); pod.add(r); }
    const strut = plain(new THREE.BoxGeometry(0.08, 0.5, 0.08), dark); strut.position.set(sx * 0.75, -0.75, -0.6); tilt.add(strut);
    const wh = inked(G.cyl(0.24, 0.24, 0.16, 10), dark, OUTLINE.thin); wh.rotation.z = Math.PI / 2; wh.position.set(sx * 0.82, -1.0, -0.6); tilt.add(wh);
    const mark = plain(new THREE.CircleGeometry(0.24, 10), red); mark.position.set(sx * 0.075, 1.05, -5.75); mark.rotation.y = sx * Math.PI / 2; tilt.add(mark);
  }
  const nw = inked(G.cyl(0.18, 0.18, 0.14, 10), dark, OUTLINE.thin); nw.rotation.z = Math.PI / 2; nw.position.set(0, -0.95, 1.9); tilt.add(nw);
  const gun = new THREE.Group(); gun.position.set(0, -0.62, 2.1); tilt.add(gun);
  gun.add(inked(G.sphere(0.24, 10, 8), dark, OUTLINE.thin));
  for (const [bx, by] of [[-0.05, 0.05], [0.05, 0.05], [-0.05, -0.05], [0.05, -0.05]]) { const b = plain(G.cyl(0.035, 0.035, 0.9, 5), dark); b.rotation.x = Math.PI / 2; b.position.set(bx, by, 0.5); gun.add(b); }
  const flash = new THREE.Mesh(new THREE.OctahedronGeometry(0.3, 0), glowMat(0xffe27a)); flash.position.z = 1.05; flash.visible = false; gun.add(flash);
  tilt.add(inked(heliSlab(-6.4, -5.4, 0.12, 1.3, 1.05, 0.12, 0.5, 0.75), body, OUTLINE.thin));
  const stab = plain(new THREE.BoxGeometry(1.9, 0.06, 0.5), body); stab.position.set(0, 0.6, -5.3); tilt.add(stab);
  const tail = new THREE.Group(); tail.position.set(0.24, 1.35, -6.05); tilt.add(tail);
  for (let i = 0; i < 3; i++) { const b = plain(new THREE.BoxGeometry(0.04, 1.2, 0.14), dark); b.rotation.x = (i * Math.PI * 2) / 3; tail.add(b); }
  const mast = plain(G.cyl(0.1, 0.14, 0.6, 8), dark); mast.position.y = 1.45; tilt.add(mast);
  const rotor = new THREE.Group(); rotor.position.y = 1.72; tilt.add(rotor);
  for (let i = 0; i < 5; i++) { const b = plain(new THREE.BoxGeometry(3.6, 0.05, 0.3), dark); b.geometry.translate(1.8, 0, 0); b.rotation.y = (i * Math.PI * 2) / 5; rotor.add(b); }
  rotor.add(plain(G.cyl(0.26, 0.26, 0.16, 8), dark));
  const blur = new THREE.Mesh(new THREE.CircleGeometry(3.6, 20), new THREE.MeshBasicMaterial({ color: 0x1a1a1a, transparent: true, opacity: 0.13, depthWrite: false, side: THREE.DoubleSide }));
  blur.rotation.x = -Math.PI / 2; blur.position.y = 1.74; tilt.add(blur);
  const beacon = plain(G.sphere(0.08, 6, 4), glowMat(0xff2a2a)); beacon.position.set(0, 0.85, -5.9); tilt.add(beacon);
  g.userData = { tilt, rotor, tail, pod, podY: 0, gun, flash, exhausts, hellfires: [], blur, kick: 0 };
  compact(tilt, [rotor, tail, gun, pod, blur, ...exhausts]); compact(pod);
  return g;
}

// ------------------------------------------------------------------ tanks (camouflaged, tracked, kitted out)
export function createTank(alien = false) {
  const g = new THREE.Group(), hullG = new THREE.Group(); g.add(hullG);
  const body = alien ? mat(0x3a2a4a, { metalness: 0.5, roughness: 0.4 }) : camoMat('olive'), dark = mat(alien ? 0x1a1022 : 0x2a2a24), trim = mat(alien ? 0x7a5a9a : 0x6e6e4a), steel = mat(0x55554c);
  hullG.add(inked(heliSlab(-2.9, 2.6, 2.3, 0.95, 0.95, 2.2, 0.8, 0.95), body, OUTLINE.mid));
  hullG.add(inked(heliSlab(2.6, 3.4, 2.2, 0.8, 0.95, 2.0, 0.25, 0.72), body, OUTLINE.thin)); // glacis
  hullG.add(inked(heliSlab(-3.2, -2.9, 2.2, 0.7, 0.85, 2.3, 0.95, 0.95), body, OUTLINE.thin)); // rear plate
  for (let k = 0; k < 5; k++) hullG.add(plain(G.box(1.5, 0.05, 0.14), dark).translateY(1.45).translateZ(-2.6 + k * 0.28)); // engine deck grille
  for (const sx of [-0.45, 0.45]) { const d = inked(G.cyl(0.28, 0.28, 0.85, 10), steel, OUTLINE.thin); d.rotation.z = Math.PI / 2; d.position.set(sx, 1.0, -3.4); hullG.add(d); }
  const tracks = [];
  if (!alien) {
    const tm = treadMat(); tracks.push(tm);
    for (const sx of [-1, 1]) {
      const belt = new THREE.Mesh(G.box(0.62, 0.85, 6.5), tm); belt.position.set(sx * 1.45, 0.45, 0); belt.castShadow = true; hullG.add(belt);
      hullG.add(inked(G.box(0.1, 0.42, 5.4), body, OUTLINE.thin).translateX(sx * 1.8).translateY(1.0));
      for (let k = 0; k < 6; k++) { const wh = plain(G.cyl(0.34, 0.34, 0.12, 8), trim); wh.rotation.z = Math.PI / 2; wh.position.set(sx * 1.79, 0.4, -2.4 + k * 0.96); hullG.add(wh); }
      for (const [z, r] of [[3.0, 0.38], [-3.0, 0.32]]) { const sp = plain(G.cyl(r, r, 0.14, 8), dark); sp.rotation.z = Math.PI / 2; sp.position.set(sx * 1.79, 0.55, z); hullG.add(sp); }
    }
  } else for (const sx of [-1, 1]) for (const sz of [-1.8, 1.8]) { // hover pads that glow
    hullG.add(inked(G.cyl(0.6, 0.75, 0.4, 10), dark, OUTLINE.thin).translateX(sx * 1.3).translateZ(sz).translateY(0.35));
    const glo = plain(new THREE.CircleGeometry(0.55, 10), glowMat(0xb45cff)); glo.rotation.x = Math.PI / 2; glo.position.set(sx * 1.3, 0.14, sz); hullG.add(glo);
    hullG.add(plain(G.box(0.05, 0.08, 4.8), glowMat(0xd08aff)).translateX(sx * 1.16).translateY(1.2));
  }
  const turret = new THREE.Group(); turret.position.set(0, 1.42, -0.3); g.add(turret);
  turret.add(inked(heliSlab(-1.4, 1.2, 1.95, 0.75, 0.35, 1.5, 0.6, 0.3), body, OUTLINE.mid));
  turret.add(inked(heliSlab(-2.05, -1.4, 1.45, 0.55, 0.38, 1.85, 0.7, 0.36), body, OUTLINE.thin)); // bustle
  turret.add(plain(G.box(0.8, 0.55, 0.4), dark).translateY(0.35).translateZ(1.25)); // mantlet
  const cup = inked(G.cyl(0.32, 0.36, 0.32, 10), trim, OUTLINE.thin); cup.position.set(0.45, 0.82, -0.5); turret.add(cup);
  const mg = plain(G.cyl(0.04, 0.04, 0.9, 5), dark); mg.rotation.x = Math.PI / 2; mg.position.set(0.45, 1.05, -0.1); turret.add(mg);
  for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) { const sd = plain(G.cyl(0.06, 0.06, 0.32, 5), dark); sd.rotation.x = 1.1; sd.position.set(sx * (0.62 + k * 0.12), 0.75, 0.75); turret.add(sd); }
  const ant = plain(G.cyl(0.02, 0.02, 2.6, 4), dark); ant.position.set(-0.6, 1.9, -1.7); turret.add(ant);
  for (const sx of [-1, 1]) turret.add(plain(G.box(0.18, 0.4, 0.9), trim).translateX(sx * 0.95).translateY(0.42).translateZ(-1.6));
  const gun = new THREE.Group(); gun.position.set(0, 0.4, 1.3); turret.add(gun);
  const barrel = inked(G.cyl(0.11, 0.14, 3.4, 8), dark, OUTLINE.thin); barrel.rotation.x = Math.PI / 2; barrel.position.z = 1.7; gun.add(barrel);
  const fume = plain(G.cyl(0.18, 0.18, 0.45, 8), dark); fume.rotation.x = Math.PI / 2; fume.position.z = 1.9; gun.add(fume);
  gun.add(plain(G.box(0.32, 0.25, 0.35), dark).translateZ(3.4));
  const tip = new THREE.Mesh(G.sphere(0.24, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff6a20 })); tip.position.z = 3.6; tip.visible = false; gun.add(tip);
  g.userData = { turret, gun, tip, hull: hullG, tracks };
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

// ------------------------------------------------------------------ gunboat (sub-sinkers' boat sprite as the silhouette, now detailed)
export function createBoat() {
  const g = new THREE.Group(), grey = camoMat('grey'), dark = mat(0x2c3138), white = mat(0xdde2e6), red = mat(0x8a2a24), glass = mat(0x22384c, { roughness: 0.2 }), orange = mat(0xff7a1a);
  g.add(inked(heliSlab(-4.8, 3.2, 3.4, 1.7, 0.5, 2.8, 1.8, 0.6), grey, OUTLINE.mid));
  g.add(inked(heliSlab(3.2, 6.3, 2.8, 1.8, 0.6, 0.15, 1.4, 1.0), grey, OUTLINE.thin)); // bow
  g.add(plain(heliSlab(-4.8, 6.3, 3.45, 0.35, -0.2, 0.2, 0.3, 0.1), red)); // boot-top
  g.add(plain(G.box(3.0, 0.06, 7.6), dark).translateY(1.42).translateZ(-0.6));
  g.add(inked(G.box(2.4, 1.5, 3.0), white, OUTLINE.thin).translateY(2.15).translateZ(-1.2));
  g.add(plain(G.box(2.45, 0.35, 2.6), glass).translateY(2.45).translateZ(-1.1));
  g.add(inked(G.box(2.0, 0.9, 1.8), white, OUTLINE.thin).translateY(3.35).translateZ(-0.9));
  g.add(plain(G.box(2.05, 0.35, 1.85), glass).translateY(3.4).translateZ(-0.9));
  for (const sx of [-1, 1]) { const lr = plain(G.torus(0.28, 0.08, 4, 12), orange); lr.rotation.y = Math.PI / 2; lr.position.set(sx * 1.22, 2.2, -1.6); g.add(lr); }
  for (const sx of [-1, 1]) for (let z = -4.2; z < 3; z += 1.2) g.add(plain(G.box(0.05, 0.5, 0.05), dark).translateX(sx * 1.6).translateY(1.7).translateZ(z)); // rail posts
  for (const sx of [-1, 1]) g.add(plain(G.box(0.04, 0.04, 7.2), dark).translateX(sx * 1.6).translateY(1.95).translateZ(-0.6));
  const mast = plain(G.cyl(0.07, 0.09, 2.6, 6), dark); mast.position.set(0, 4.9, -1.4); g.add(mast);
  g.add(plain(G.box(1.4, 0.06, 0.06), dark).translateY(5.6).translateZ(-1.4));
  const sl = plain(G.cyl(0.18, 0.2, 0.3, 8), white); sl.rotation.x = Math.PI / 2; sl.position.set(0.6, 3.95, -0.2); g.add(sl);
  g.add(plain(G.sphere(0.07, 5, 4), glowMat(0xff3030)).translateY(6.25).translateZ(-1.4));
  const radar = new THREE.Group(); radar.position.set(0, 6.0, -1.4); g.add(radar);
  radar.add(plain(G.box(1.3, 0.1, 0.22), dark));
  const turret = new THREE.Group(); turret.position.set(0, 1.45, 2.6); g.add(turret);
  turret.add(inked(G.cyl(0.7, 0.8, 0.55, 10), grey, OUTLINE.thin));
  turret.add(inked(G.box(1.1, 0.7, 0.2), grey, OUTLINE.thin).translateY(0.5).translateZ(0.4));
  for (const sx of [-0.15, 0.15]) { const b = plain(G.cyl(0.08, 0.1, 2.0, 6), dark); b.rotation.x = Math.PI / 2; b.position.set(sx, 0.45, 1.3); turret.add(b); }
  const mgm = plain(G.cyl(0.25, 0.3, 0.5, 8), dark); mgm.position.set(0, 1.7, -3.9); g.add(mgm);
  for (const sx of [-0.1, 0.1]) { const b = plain(G.cyl(0.04, 0.04, 1.0, 5), dark); b.rotation.x = Math.PI / 2; b.position.set(sx, 2.0, -3.5); g.add(b); }
  for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) { const dc = plain(G.cyl(0.22, 0.22, 0.5, 8), dark); dc.rotation.z = Math.PI / 2; dc.position.set(sx * 0.9, 1.65, -4.4 + k * 0.5); g.add(dc); }
  const fp = plain(G.cyl(0.03, 0.03, 1.4, 4), dark); fp.position.set(0, 2.2, -4.7); g.add(fp);
  g.add(plain(G.box(0.03, 0.4, 0.6), red).translateY(2.7).translateZ(-5.0));
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
  const band = plain(G.cyl(2.02, 2.02, 0.12, 20), mat(0x5a5f70, { metalness: 0.7, roughness: 0.3 })); band.position.y = -0.02;
  const under = new THREE.Mesh(G.torus(1.05, 0.11, 4, 20), glowMat(0x7aff5a)); under.rotation.x = Math.PI / 2; under.position.y = -0.42;
  const pod = plain(G.sphere(0.55, 10, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mat(0x3a3f4e, { metalness: 0.6 })); pod.position.y = -0.3;
  g.add(disc, band, dome, pilot, lights, under, pod);
  g.scale.setScalar(scale);
  g.userData = { lights, beam, under };
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
  for (const [sx, c] of [[-1, 0xff3030], [1, 0x30ff60]]) g.add(plain(G.box(0.2, 0.12, 0.3), glowMat(c), false).translateX(sx * 3.55).translateY(0.08).translateZ(-2.35));
  for (const sx of [-1, 1]) g.add(plain(G.box(0.08, 0.06, 2.2), glowMat(0x6aff4a), false).translateX(sx * 0.48).translateY(0.12).translateZ(0.3));
  g.userData = { burner };
  compact(g, [burner]);
  return g;
}

// ------------------------------------------------------------------ the tanker (Vertical-Vantage ship hull, now a proper crude carrier)
export function createTanker() {
  const g = new THREE.Group(), K = new Kit();
  const top = 0x1e2a3a, bottom = 0x8a2a22, boot = 0xe8e8e0, deck = 0x3f5f4a, white = 0xf0f0ec, pipe = 0xb8b8b0;
  K.add('flat', box(11, 4.4, 50, { y: 4.8, color: top }), box(11.06, 0.4, 50.06, { y: 2.5, color: boot }), box(11, 3.4, 50, { y: 0.6, color: bottom }));
  K.add('flat', part(heliSlab(25, 33, 11, 4.4, 4.8, 1, 4.0, 5.3), { color: top }), part(heliSlab(25, 33, 11, 3.6, 1.0, 1, 3.0, 2.0), { color: bottom }));
  K.add('flat', box(10.4, 0.1, 56, { y: 7.05, z: 2, color: deck }));
  K.add('flat', box(9.6, 1.2, 6, { y: 7.6, z: 28, color: top }), cyl(0.5, 0.5, 0.6, 8, { x: -2, y: 8.5, z: 29, color: 0x3a3a3a }), cyl(0.5, 0.5, 0.6, 8, { x: 2, y: 8.5, z: 29, color: 0x3a3a3a })); // forecastle and windlasses
  for (let z = -16; z < 26; z += 6) K.add('flat', cyl(1.3, 1.3, 0.8, 8, { x: -2.8, y: 7.5, z, color: 0xc8c0a8 }), cyl(1.3, 1.3, 0.8, 8, { x: 2.8, y: 7.5, z, color: 0xc8c0a8 }));
  K.add('flat', box(0.4, 0.4, 44, { x: -0.6, y: 7.4, z: 4, color: pipe }), box(0.3, 0.3, 44, { x: 0.3, y: 7.35, z: 4, color: 0xd8a020 }), box(0.3, 0.3, 44, { x: 0.9, y: 7.35, z: 4, color: 0xe8e8e0 }));
  K.add('flat', box(1.2, 0.12, 44, { x: 0, y: 8.6, z: 4, color: 0x8a8a8a }));
  for (let z = -16; z < 26; z += 4) K.add('flat', box(0.12, 1.4, 0.12, { x: 0, y: 7.9, z, color: 0x6a6a6a }));
  for (let x = -4.5; x <= 4.5; x += 1.5) K.add('flat', box(0.35, 0.35, 0.35, { x, y: 7.4, z: 5, color: 0xd8302a }), box(0.25, 0.25, 4, { x, y: 7.35, z: 5, color: pipe })); // the manifold
  for (const sx of [-1, 1]) K.add('flat', cyl(0.25, 0.3, 4, 6, { x: sx * 4, y: 9, z: 5, color: 0xf2c21a }), box(0.25, 0.25, 4.4, { x: sx * 4, y: 10.8, z: 6.8, rx: -0.4, color: 0xf2c21a })); // hose cranes
  // the accommodation block, bridge wings, funnel and mast at the stern
  K.add('flat', box(10, 9, 7, { y: 11.5, z: -22, color: white }));
  for (const y of [9, 11.4, 13.8]) K.add('flat', box(10.05, 0.6, 7.05, { y, z: -22, color: 0x22384c }));
  K.add('flat', box(14, 0.5, 2.6, { y: 15.7, z: -19.6, color: white }), box(14.05, 0.8, 0.2, { y: 15.2, z: -18.3, color: 0x22384c }));
  K.add('flat', box(3.4, 5, 3.4, { y: 18, z: -25, color: 0x2a2a2a }), box(3.45, 1.2, 3.45, { y: 17, z: -25, color: 0xf2c21a }), box(3.5, 0.6, 3.5, { y: 20.3, z: -25, color: 0x111111 }));
  K.add('flat', cyl(0.12, 0.15, 5, 6, { y: 18.5, z: -21, color: 0x3a3c46 }), box(3, 0.15, 0.3, { y: 20.5, z: -21, color: 0x3a3c46 }));
  for (const sx of [-1, 1]) K.add('flat', part(new THREE.CapsuleGeometry(0.9, 3.2, 2, 6), { x: sx * 5.9, y: 10.4, z: -21, rx: Math.PI / 2, color: 0xff7a1a }), box(0.2, 1.6, 0.2, { x: sx * 5.6, y: 11.4, z: -22.6, color: 0x6a6a6a }), box(0.2, 1.6, 0.2, { x: sx * 5.6, y: 11.4, z: -19.4, color: 0x6a6a6a }));
  // the helipad in front of the bridge (the LZ follows the tanker)
  K.add('flat', box(9.4, 0.12, 9.4, { y: 7.12, z: -12, color: 0x3a3f46 }));
  for (const [x, z, w, d] of [[-1.6, -12, 0.6, 4.2], [1.6, -12, 0.6, 4.2], [0, -12, 3, 0.6]]) K.add('glow', box(w, 0.05, d, { x, y: 7.2, z, color: 0xffe25a }));
  for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; K.add('glow', box(0.25, 0.1, 0.25, { x: Math.cos(a) * 4.2, y: 7.22, z: -12 + Math.sin(a) * 4.2, color: k % 2 ? 0x3ddc84 : 0xffe25a })); }
  K.add('glow', box(0.3, 0.3, 0.3, { y: 21.2, z: -21, color: 0xff2a2a }), box(0.25, 0.25, 0.25, { x: -5, y: 8, z: 29, color: 0xff2a2a }), box(0.25, 0.25, 0.25, { x: 5, y: 8, z: 29, color: 0x3ddc84 }));
  kitMeshes(K, g);
  g.position.y = -1; // (the hull sits a metre into the sea)
  const root = new THREE.Group(); root.add(g);
  return root;
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
  soldier: { suit: 0x5a6a3a, suitD: 0x3a4628, skin: 0xe8b890, helm: 0x4a5630, gun: 0x22222a, glowEye: null, pack: 0x4a5230 },
  rpg: { suit: 0x6a5a3a, suitD: 0x463a28, skin: 0xd8a880, helm: 0x5a4a30, gun: 0x3a4a2a, tube: true, pack: 0x5a4a30 },
  alien: { suit: 0xc8384a, suitD: 0x7a1e2c, skin: 0x6fd05a, gun: 0x22222a, glowEye: 0xffd23a, spikes: 0x3f9a3a },
  heavy: { suit: 0x6a58a0, suitD: 0x40346a, skin: 0x5fb04a, gun: 0x2a2a33, glowEye: 0xff4b5c, dome: 0x9aa0b4, big: 1.25 },
  pilot: { suit: 0x34507a, suitD: 0x243858, skin: 0xf5c9a4, helm: 0xe8e8e0, gun: 0x22222a, visor: 0x2a2a3a, vest: 0xff7a1a },
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
  if (P.pack) { b(bodyK, 0.26, 0.26, 0.1, 0, 0.56, -0.16, P.pack); b(bodyK, 0.2, 0.06, 0.08, 0, 0.42, -0.15, 0x2a2a20); } // pack and bedroll
  if (P.helm && !P.visor) b(bodyK, 0.31, 0.03, 0.02, 0, 0.82, 0.152, 0x2a2a20); // chin strap
  b(bodyK, 0.38, 0.045, 0.235, 0, 0.42, 0, 0x2a2a20); // belt
  if (P.vest) { b(bodyK, 0.375, 0.2, 0.235, 0, 0.6, 0, P.vest); b(bodyK, 0.06, 0.06, 0.01, 0.1, 0.62, 0.12, 0xe8e8e8); }
  if (P.glowEye && !P.dome) b(bodyK, 0.08, 0.08, 0.012, 0, 0.6, 0.116, P.glowEye); // alien chest light
  b(bodyK, 0.07, 0.08, 0.34, 0.23, 0.4, 0.22, P.gun); // the rifle
  if (P.tube) b(bodyK, 0.14, 0.14, 0.8, -0.18, 0.72, -0.05, 0x3a4a2a); // RPG tube on the shoulder
  const geo = (list) => { const g = mergeGeometries(list, false); g.computeBoundingSphere(); return g; };
  return { body: geo(bodyK), legL: geo(legL), legR: geo(legR), hipY: 0.36 * S, hipX: 0.09 * S, scale: S };
}

// ------------------------------------------------------------------ mission 6: the enemy's spider tanks (new)
// WIDOW walker: a flat armoured hull on six legs (render/legs.js), a turret with a long cannon whose muzzle
// glows before it fires, rocket pods either side, red sensor eyes. The leg rig lives in world space, so the
// renderer adds userData.rig.group to the scene beside the hull.
export function createWalker() {
  const g = new THREE.Group(), hull = new THREE.Group(); g.add(hull);
  const camo = camoMat('grey'), dark = mat(0x2a2624, { metalness: 0.3 }), plate = mat(0x6a5a48), red = mat(0xd8302a);
  hull.add(inked(heliSlab(-2.6, 2.4, 4.2, 1.3, 0, 3.4, 1.0, 0.1), camo, OUTLINE.mid));
  hull.add(inked(heliSlab(-2.8, -2.0, 3.6, 0.9, 0.1, 4.0, 1.1, 0.1), plate, OUTLINE.thin)); // rear engine deck
  const belly = plain(G.cyl(2.1, 1.7, 0.6, 10), dark); belly.position.y = -0.85; hull.add(belly);
  for (const sx of [-1, 1]) { const grille = plain(new THREE.BoxGeometry(0.9, 0.08, 1.6), dark); grille.position.set(sx * 1.0, 0.56, -2.0); hull.add(grille); }
  const eyes = glowMat(0xff2a1a);
  for (const sx of [-0.6, 0, 0.6]) { const e = plain(G.sphere(0.16, 8, 6), eyes, false); e.position.set(sx, 0.15, 2.45); hull.add(e); }
  const turret = new THREE.Group(); turret.position.y = 0.95; hull.add(turret);
  turret.add(inked(heliSlab(-1.6, 1.5, 2.6, 0.9, 0.35, 2.0, 0.7, 0.3), camo, OUTLINE.mid));
  const gun = new THREE.Group(); gun.position.set(0, 0.45, 1.4); turret.add(gun);
  const barrel = plain(G.cyl(0.17, 0.2, 4.6, 8), dark); barrel.rotation.x = Math.PI / 2; barrel.position.z = 2.3; gun.add(barrel);
  const brake = plain(new THREE.BoxGeometry(0.55, 0.42, 0.6), dark); brake.position.z = 4.6; gun.add(brake);
  const tip = new THREE.Mesh(G.sphere(0.42, 8, 6), glowMat(0xffa040)); tip.position.z = 5.1; tip.visible = false; gun.add(tip);
  const pods = [];
  for (const sx of [-1, 1]) {
    const pod = new THREE.Group(); pod.position.set(sx * 1.75, 0.6, 0); turret.add(pod); pods.push(pod);
    pod.add(inked(new THREE.BoxGeometry(0.8, 0.8, 1.6), plate, OUTLINE.thin));
    for (const ox of [-0.18, 0.18]) for (const oy of [-0.18, 0.18]) { const f = plain(new THREE.CircleGeometry(0.12, 6), red); f.position.set(ox, oy, 0.81); pod.add(f); }
  }
  const mast = plain(G.cyl(0.04, 0.04, 1.8, 4), dark); mast.position.set(-0.8, 1.3, -1.2); turret.add(mast);
  const beacon = plain(G.sphere(0.1, 6, 4), glowMat(0xff3030), false); beacon.position.set(-0.8, 2.2, -1.2); turret.add(beacon);
  const rig = new LegRig({ style: LEG_STYLE.widow, s: 1.6, hipY: -0.55, hipR: 1.5, footR: 3.7, L1: 2.1, L2: 2.9 });
  g.userData = { hull, turret, gun, tip, pods, rig, H: 4.6 };
  compact(hull, [turret]); compact(turret, [gun, ...pods]);
  return g;
}
// Crawler: a bomb on six legs. Two merged sets of legs scissor in turn so it scuttles; the eye blinks.
export function createCrawler() {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const shell = mat(0x3a3a3c, { metalness: 0.4, roughness: 0.45 }), dark = mat(0x1e1e20), hazard = mat(0xd8a020);
  const dome = inked(G.sphere(0.75, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), shell, OUTLINE.thin); dome.scale.set(1, 0.6, 1.2); dome.position.y = 0.45; body.add(dome);
  const skirt = plain(G.cyl(0.8, 0.7, 0.22, 10), hazard); skirt.scale.z = 1.2; skirt.position.y = 0.42; body.add(skirt);
  const eye = new THREE.Mesh(G.sphere(0.16, 8, 6), glowMat(0xff2a1a)); eye.position.set(0, 0.62, 0.8); body.add(eye);
  const sets = [new THREE.Group(), new THREE.Group()];
  [0.8, -0.8, 1.6, -1.6, 2.4, -2.4].forEach((a, i) => {
    const leg = new THREE.Group(); leg.rotation.y = a; sets[[0, 1, 1, 0, 0, 1][i]].add(leg);
    const thigh = plain(new THREE.BoxGeometry(0.1, 0.1, 0.8), dark); thigh.position.set(0, 0.62, 0.95); thigh.rotation.x = -0.5; leg.add(thigh);
    const shin = plain(new THREE.BoxGeometry(0.08, 0.08, 0.75), dark); shin.position.set(0, 0.3, 1.45); shin.rotation.x = 0.95; leg.add(shin);
  });
  for (const s of sets) { compact(s); body.add(s); }
  compact(body, [eye, ...sets]);
  g.userData = { body, sets, eye };
  return g;
}
