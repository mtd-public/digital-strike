// GLB loading and static baking: gig-ambulance's js/assets.js (as kept in mstr-gme-dsgn-tmpt
// kits/vanilla-js/three/gltf-assets-and-bake.js). The models are the template's 61-piece chibi library
// (assets/manifest.json lists the 30 this game ships).
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/addons/GLTFLoader.js';
import { mergeGeometries } from '../vendor/addons/BufferGeometryUtils.js';
import { RETRO } from '../retro.js';

const models = {};
let manifest = null;

export async function loadAssets(names, onProgress) {
  manifest = await (await fetch('assets/manifest.json')).json();
  const byName = Object.fromEntries(manifest.assets.map((a) => [a.name, a]));
  const loader = new GLTFLoader();
  let done = 0;
  await Promise.all(names.map(async (n) => {
    if (models[n]) { onProgress?.(++done, names.length); return; }
    if (!byName[n]) throw new Error(`asset ${n} missing from manifest`);
    const gltf = await loader.loadAsync(`assets/${byName[n].file}`);
    gltf.scene.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true; o.receiveShadow = true;
        const m = o.material;
        if (RETRO) m.flatShading = true;
        if (m.transparent) { m.depthWrite = false; o.castShadow = false; }
      }
    });
    models[n] = gltf.scene;
    onProgress?.(++done, names.length);
  }));
}
export const hasModel = (n) => !!models[n];

// Shallow clone: shares geometry + materials (cheap).
export function spawn(name) {
  const src = models[name];
  if (!src) throw new Error(`asset ${name} not loaded`);
  return src.clone(true);
}
export function cloneMaterials(obj) {
  obj.traverse((o) => { if (o.isMesh) o.material = o.material.clone(); });
  return obj;
}
// Recolour named materials across every loaded model (the gig pastels, toned for a war zone).
export function tintMaterials(map) {
  const seen = new Set();
  for (const k in models) models[k].traverse((o) => {
    if (!o.isMesh || seen.has(o.material)) return;
    seen.add(o.material);
    const c = map[o.material.name];
    if (c != null) o.material.color.set(c);
  });
}

// Merge every static mesh under `root` into one mesh per material, so a whole town is a few dozen draw calls.
export function bakeStatic(root) {
  root.updateMatrixWorld(true);
  const buckets = new Map();
  root.traverse((o) => {
    if (!o.isMesh) return;
    const m = o.material, key = `${m.name}|${m.color?.getHex()}|${m.emissive?.getHex()}|${m.transparent}`; // same-looking materials from different GLBs share one mesh
    if (!buckets.has(key)) buckets.set(key, { material: o.material, geos: [], shadow: o.castShadow });
    const g = o.geometry.clone().applyMatrix4(o.matrixWorld);
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    buckets.get(key).geos.push(g.index ? g.toNonIndexed() : g);
  });
  const out = new THREE.Group();
  for (const { material, geos, shadow } of buckets.values()) {
    const merged = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = shadow; mesh.receiveShadow = true;
    out.add(mesh);
  }
  return out;
}
