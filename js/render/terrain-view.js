// The island mesh (from the sim's sampled heights, so what you see is what the bullets hit), the sea, and
// each mission's palette and light. Vertex colours by height, slope and pad type, flat-shaded and
// noise-dithered like a PS1 ground texture.
import * as THREE from 'three';
import { fbm } from '../sim/terrain.js';
import { canvasTex } from './kit.js';

// sky, fog, sun, hemisphere, water, ground colours, and how dark it is (night: neon and window glow carry it)
export const THEMES = {
  tropic: { sky: 0x86c8f0, fog: 0x9fd2f0, fogNear: 170, fogFar: 430, sun: 0xfff1dc, sunI: 2.5, sunDir: [-0.45, 0.85, 0.35], hemiSky: 0xe0f0ff, hemiGround: 0x6a8a5a, hemiI: 1.35,
    water: 0x1f86c8, waterOp: 0.78, deep: 0x16507a, shallow: 0x58d0c8, sand: 0xe6d6a0, grass: 0x5aa83a, grass2: 0x46902e, rock: 0x8a8070, paved: 0x9a9890, lake: 0xc8c0b0, dirt: 0xa08a60 },
  strait: { sky: 0x9fb0c2, fog: 0xa8b6c4, fogNear: 160, fogFar: 420, sun: 0xf0f0ff, sunI: 2.0, sunDir: [-0.3, 0.8, -0.5], hemiSky: 0xd8e0ea, hemiGround: 0x4a5a48, hemiI: 1.25,
    water: 0x24546e, waterOp: 0.82, deep: 0x1a3a50, shallow: 0x4a8a90, sand: 0xb8b098, grass: 0x4a7a3a, grass2: 0x3a6a30, rock: 0x6e6c68, paved: 0x8a8a88, lake: 0xb0aaa0, dirt: 0x7a6a50 },
  dusk: { sky: 0xc88a78, fog: 0xc09080, fogNear: 150, fogFar: 400, sun: 0xffb070, sunI: 2.1, sunDir: [0.8, 0.45, 0.3], hemiSky: 0xffd8c0, hemiGround: 0x5a4a44, hemiI: 1.2,
    water: 0x2a4a7a, waterOp: 0.8, deep: 0x1a2a50, shallow: 0x4a7a8a, sand: 0xcfae80, grass: 0xa89a6a, grass2: 0x8e8458, rock: 0x8a5a48, paved: 0x8a827a, lake: 0xc8b8a0, dirt: 0xb08a62 },
  night: { sky: 0x101830, fog: 0x18223e, fogNear: 140, fogFar: 380, sun: 0xb0c4ff, sunI: 1.5, sunDir: [-0.4, 0.8, 0.45], hemiSky: 0x8090c0, hemiGround: 0x3a3a48, hemiI: 1.15, night: true,
    water: 0x1a2a4a, waterOp: 0.85, deep: 0x0a1428, shallow: 0x2a3a5a, sand: 0xa89884, grass: 0x8a8670, grass2: 0x7a7660, rock: 0x6a5a54, paved: 0x5a5a62, lake: 0xc0bab0, dirt: 0x8a7a68 },
  vegas: { sky: 0x1c1038, fog: 0x34204c, fogNear: 150, fogFar: 380, sun: 0xc8b8ff, sunI: 1.4, sunDir: [0.35, 0.8, -0.4], hemiSky: 0xa080c8, hemiGround: 0x3a2a40, hemiI: 1.2, night: true,
    water: 0x1a2a4a, waterOp: 0.85, deep: 0x0a1428, shallow: 0x2a3a5a, sand: 0xb09a7a, grass: 0x8a8a6a, grass2: 0x7a7a5c, rock: 0x7a5a50, paved: 0x4a4a54, lake: 0x9a948c, dirt: 0x907a60 },
};

const _a = new THREE.Color(), _b = new THREE.Color();
export function buildTerrain(terrain, level, theme) {
  const I = level.island, T = THEMES[theme], half = I.half;
  const step = Math.max(half > 380 ? 6 : 5, terrain.step * 2), n = Math.round((half * 2) / step); // PS1-coarse: ~40k triangles
  const geo = new THREE.PlaneGeometry(half * 2, half * 2, n, n);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
  const inFlat = (x, z) => { for (const f of I.flats) if (x >= f.x0 - 1 && x <= f.x1 + 1 && z >= f.z0 - 1 && z <= f.z1 + 1) return f; return null; };
  let minH = Infinity;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), h = terrain.height(x, z);
    pos.setY(i, h);
    minH = Math.min(minH, h);
    const slope = terrain.slope(x, z), nz = fbm(x / 9, z / 9, 2), f = inFlat(x, z);
    let c;
    if (h < -0.4) c = _a.set(T.shallow).lerp(_b.set(T.deep), Math.min(1, -h / 8));
    else if (h < 1.3 && !f) c = _a.set(T.sand);
    else if (f && f.paved) c = _a.set(T.paved);
    else if (f && f.lake) c = _a.set(T.lake);
    else if (slope > 0.55 || h > 22) c = _a.set(T.rock).lerp(_b.set(T.grass2), Math.max(0, 0.6 - slope) * 0.6);
    else c = _a.set(T.grass).lerp(_b.set(T.grass2), nz).lerp(_b.set(T.dirt), Math.max(0, fbm(x / 60, z / 60, 2) - 0.62) * 2);
    const k = 0.92 + nz * 0.16; // dither
    col[i * 3] = c.r * k; col[i * 3 + 1] = c.g * k; col[i * 3 + 2] = c.b * k;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  mesh.receiveShadow = true;
  mesh.userData.minH = minH;
  return mesh;
}

// The sea: a wide translucent plane with a scrolling, point-sampled wave texture.
export function buildWater(theme) {
  const T = THEMES[theme];
  const tex = canvasTex(64, 64, (c, w, h) => {
    c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(0,0,0,0.12)';
    for (let i = 0; i < 26; i++) { const x = (i * 37) % w, y = (i * 23) % h; c.fillRect(x, y, 10 + (i % 4) * 3, 2); }
    c.fillStyle = 'rgba(255,255,255,0.0)';
  }, [90, 90]);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), new THREE.MeshLambertMaterial({ color: T.water, map: tex, transparent: true, opacity: T.waterOp, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0;
  m.receiveShadow = true;
  m.userData.tex = tex;
  return m;
}
