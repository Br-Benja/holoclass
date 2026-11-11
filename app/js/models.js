// =====================================================================
//  HoloClass · Modelos 3D (unidades: mm)
//  Ejes locales: X derecha, Y arriba, Z hacia el observador (sale de la tarjeta).
//  - Modelos procedurales (corazón, sistema solar, planetas, moléculas, átomos)
//  - Materiales físicos (PBR) + texturas generadas con ruido fractal para un aspecto realista
//  - Modelos GLB subidos por el docente (GLTFLoader + meshopt)
// =====================================================================
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const HIGHLIGHT = new THREE.Color(0x22d3ee);
const matsOf = m => (Array.isArray(m.material) ? m.material : [m.material]);
const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.05, ...extra });
const phys = (color, extra = {}) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.4, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.25, ...extra });

// ------------------------------------------------------------------ Ruido de Perlin 3D + fBm (texturas procedurales)
const PERM = new Uint8Array(512);
(() => { const p = [...Array(256).keys()]; let s = 1337; for (let i = 255; i > 0; i--) { s = (s * 16807) % 2147483647; const j = s % (i + 1); [p[i], p[j]] = [p[j], p[i]]; } for (let i = 0; i < 512; i++) PERM[i] = p[i & 255]; })();
const fade = t => t * t * t * (t * (t * 6 - 15) + 10), lerp = (a, b, t) => a + t * (b - a);
const grad = (h, x, y, z) => { const u = h < 8 ? x : y, v = h < 4 ? y : (h === 12 || h === 14 ? x : z); return ((h & 1) ? -u : u) + ((h & 2) ? -v : v); };
export function perlin(x, y, z) {
  const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
  x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
  const u = fade(x), v = fade(y), w = fade(z), P = PERM;
  const A = P[X] + Y, AA = P[A] + Z, AB = P[A + 1] + Z, B = P[X + 1] + Y, BA = P[B] + Z, BB = P[B + 1] + Z;
  return lerp(lerp(lerp(grad(P[AA] & 15, x, y, z), grad(P[BA] & 15, x - 1, y, z), u), lerp(grad(P[AB] & 15, x, y - 1, z), grad(P[BB] & 15, x - 1, y - 1, z), u), v),
    lerp(lerp(grad(P[AA + 1] & 15, x, y, z - 1), grad(P[BA + 1] & 15, x - 1, y, z - 1), u), lerp(grad(P[AB + 1] & 15, x, y - 1, z - 1), grad(P[BB + 1] & 15, x - 1, y - 1, z - 1), u), v), w);
}
const fbm = (x, y, z, oct = 5) => { let s = 0, a = 0.5, f = 1; for (let i = 0; i < oct; i++) { s += a * perlin(x * f, y * f, z * f); f *= 2.03; a *= 0.5; } return s; };
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const mix = (c1, c2, t) => [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
const hex = h => [(h >> 16) & 255, (h >> 8) & 255, h & 255];

/** Textura equirectangular sin costuras: fn(x, y, z, lat) devuelve [r, g, b] o [r, g, b, a] para un punto de la esfera. */
function sphereTex(w, h, fn, { alpha = false } = {}) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const g = cv.getContext('2d'), img = g.createImageData(w, h), d = img.data;
  for (let j = 0; j < h; j++) {
    const lat = (0.5 - (j + 0.5) / h) * Math.PI, cl = Math.cos(lat), y = Math.sin(lat);
    for (let i = 0; i < w; i++) {
      const lon = ((i + 0.5) / w) * Math.PI * 2, c = fn(cl * Math.cos(lon), y, cl * Math.sin(lon), lat), k = (j * w + i) * 4;
      d[k] = c[0]; d[k + 1] = c[1]; d[k + 2] = c[2]; d[k + 3] = alpha ? c[3] : 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function canvasTex(draw, w = 512, h = 256, srgb = true) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

function shadeBackfaces(mat) {
  mat.side = THREE.DoubleSide;
  mat.onBeforeCompile = sh => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <dithering_fragment>',
      '#include <dithering_fragment>\n  if (!gl_FrontFacing) gl_FragColor.rgb *= 0.42;');
  };
  mat.customProgramCacheKey = () => 'hc-backshade';
}

// ------------------------------------------------------------------ Contenedor común
export class Content3D {
  constructor(key) {
    this.key = key;
    this.group = new THREE.Group();
    this.parts = {};
    this.highlighted = null;
    this.ready = true;
    this.clippable = false;
    this.clipLocal = new THREE.Plane(V3(0, 0, -1), 60);
    this.clipWorld = new THREE.Plane();
    this.cut = 0;
    this.explodeDistance = 18;
  }
  addPart(key, meshes, { labelMesh = null, labelPos = V3(), center = null, parent = this.group, adopt = false } = {}) {
    let g = null;
    if (!adopt) { g = new THREE.Group(); g.name = key; parent.add(g); }
    for (const m of meshes) {
      m.userData.partKey = key; m.userData.content = this;
      m.userData.baseScale = m.scale.clone(); m.userData.home = m.position.clone();
      m.material = Array.isArray(m.material) ? m.material.map(x => x.clone()) : m.material.clone();
      for (const mat of matsOf(m)) {
        mat.userData.baseOpacity = mat.opacity; mat.userData.baseTransparent = mat.transparent;
        mat.userData.baseEmissive = mat.emissive ? mat.emissive.clone() : null;
        mat.userData.baseEmissiveIntensity = mat.emissiveIntensity ?? 1;
        if (this.clippable) { shadeBackfaces(mat); mat.clippingPlanes = [this.clipWorld]; }
      }
      if (g) g.add(m);
    }
    const c = center || (meshes[0] ? meshes[0].position.clone() : V3());
    const dir = c.lengthSq() > 1e-6 ? c.clone().normalize() : V3(0, 1, 0);
    const part = this.parts[key] || { group: g, meshes: [], labelMesh: labelMesh || meshes[0], labelPos, home: g ? g.position.clone() : null, dir, adopt };
    part.meshes.push(...meshes);
    this.parts[key] = part;
    return g;
  }
  get pickables() { return Object.values(this.parts).flatMap(p => p.meshes).filter(m => m.visible !== false); }
  setHighlight(key) {
    this.highlighted = key;
    for (const [k, p] of Object.entries(this.parts)) for (const m of p.meshes) for (const mat of matsOf(m)) {
      if (mat.emissive) {
        if (k === key) { mat.emissive.copy(HIGHLIGHT); mat.emissiveIntensity = 0.45; }
        else { mat.emissive.copy(mat.userData.baseEmissive); mat.emissiveIntensity = mat.userData.baseEmissiveIntensity; }
      }
      const dim = key && k !== key;
      mat.transparent = dim || mat.userData.baseTransparent;
      mat.opacity = dim ? Math.min(0.25, mat.userData.baseOpacity) : mat.userData.baseOpacity;
      mat.depthWrite = !dim;
    }
  }
  labelWorldPos(key, out) { const p = this.parts[key]; return p.labelMesh.localToWorld(out.copy(p.labelPos)); }
  partWorldCenter(key, out = V3()) {
    const box = new THREE.Box3(); for (const m of this.parts[key].meshes) box.expandByObject(m);
    return box.isEmpty() ? this.labelWorldPos(key, out) : box.getCenter(out);
  }
  applyExplode(amount) {
    for (const p of Object.values(this.parts)) {
      if (p.group) p.group.position.copy(p.home).addScaledVector(p.dir, amount * this.explodeDistance);
      else for (const m of p.meshes) if (m.userData.explodeDir) m.position.copy(m.userData.home).addScaledVector(m.userData.explodeDir, amount * m.userData.explodeDist);
    }
  }
  setCut(v) { this.cut = v; }
  updateClip() {
    if (!this.clippable) return;
    this.group.updateWorldMatrix(true, false);
    const local = this.clipLocal.clone(); local.constant = 60 - this.cut * 66;
    this.clipWorld.copy(local).applyMatrix4(this.group.matrixWorld);
  }
  update() {}
}

// ------------------------------------------------------------------ Corazón (10 partes, aspecto anatómico)
const HEART_PALETTES = {
  real: { auricula_der: 0x8f3a40, auricula_izq: 0x963f3f, ventriculo_der: 0x7f2c2c, ventriculo_izq: 0x782525, aorta: 0xc99a8c,
          arteria_pulm: 0xc08a80, vena_cava: 0x52364f, venas_pulm: 0x9a4a50, valvulas: 0xeadbc4, coronarias: 0xb3342d },
  didactic: { auricula_der: 0x5468c8, auricula_izq: 0xd64541, ventriculo_der: 0x4a5fc1, ventriculo_izq: 0xc0392b, aorta: 0xe74c3c,
              arteria_pulm: 0x3b6fd8, vena_cava: 0x2c4fa3, venas_pulm: 0xd1495b, valvulas: 0xf1e2c4, coronarias: 0xff7a5c },
};
let _fiber = null;
/** Textura de fibras musculares (relieve) para el miocardio. */
function fiberTexture() {
  if (_fiber) return _fiber;
  _fiber = canvasTex((g, w, h) => {
    const img = g.createImageData(w, h), d = img.data;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const u = i / w, v = j / h;
      // fibras alargadas en dirección v + ruido fino
      const n = 0.55 * Math.sin((u * 60 + 3 * perlin(u * 6, v * 2, 0.3)) * Math.PI) * 0.5 + 0.5 * (0.5 + 0.5 * perlin(u * 40, v * 9, 1.7)) + 0.25 * perlin(u * 90, v * 90, 4.2);
      const c = Math.max(0, Math.min(255, 128 + n * 90)); const k = (j * w + i) * 4;
      d[k] = d[k + 1] = d[k + 2] = c; d[k + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }, 256, 256, false);
  _fiber.wrapS = _fiber.wrapT = THREE.RepeatWrapping; _fiber.repeat.set(3, 2);
  return _fiber;
}
const tissue = (color, extra = {}) => phys(color, { roughness: 0.5, clearcoat: 0.55, clearcoatRoughness: 0.32, sheen: 0.35, sheenRoughness: 0.6, sheenColor: new THREE.Color(0xff9c9c),
  bumpMap: fiberTexture(), bumpScale: 1.4, ...extra });
const vessel = (color, extra = {}) => phys(color, { roughness: 0.42, clearcoat: 0.5, clearcoatRoughness: 0.3, sheen: 0.2, sheenColor: new THREE.Color(0xffd0d0), ...extra });

const BLOBS = new Map();
function blob(rx, ry, rz, { taperBottom = 0, taperTop = 0, wobble = 0.05 } = {}, seg = 64) {
  const key = [rx, ry, rz, taperBottom, taperTop, wobble, seg].join(",");
  if (BLOBS.has(key)) return BLOBS.get(key);     // la geometría orgánica se calcula una sola vez
  const g = new THREE.SphereGeometry(1, seg, Math.round(seg * 0.75));
  const p = g.attributes.position, v = V3(), colors = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const t = (v.y + 1) / 2;
    let s = 1;
    if (taperBottom) s *= 1 - taperBottom * Math.pow(1 - t, 2.2);
    if (taperTop) s *= 1 - taperTop * Math.pow(t, 2);
    v.set(v.x * s * rx, v.y * ry, v.z * s * rz);
    v.multiplyScalar(1 + wobble * fbm(v.x * 0.09, v.y * 0.09, v.z * 0.09, 3));
    p.setXYZ(i, v.x, v.y, v.z);
    const shade = 0.82 + 0.3 * (0.5 + 0.5 * fbm(v.x * 0.07 + 5, v.y * 0.07, v.z * 0.07, 3));   // manchas sutiles del tejido
    colors[i * 3] = shade; colors[i * 3 + 1] = shade * 0.97; colors[i * 3 + 2] = shade * 0.97;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.computeVertexNormals();
  BLOBS.set(key, g);
  return g;
}
const curve = pts => new THREE.CatmullRomCurve3(pts.map(p => V3(...p)));
const tube = (pts, r, mat, seg = 64) => { const c = curve(pts); const m = new THREE.Mesh(new THREE.TubeGeometry(c, seg, r, 20, false), mat); m.userData.curve = c; return m; };

function buildHeart() {
  const c = new Content3D('heart');
  c.clippable = true;
  const P = HEART_PALETTES.real;
  const mk = (geo, key, pos, rz = 0) => { const m = new THREE.Mesh(geo, tissue(P[key], { vertexColors: true })); m.position.set(...pos); m.rotation.z = rz; return m; };
  const lv = mk(blob(15, 24, 15, { taperBottom: 0.78 }), 'ventriculo_izq', [6, -9, -2], 0.42);
  const rv = mk(blob(13, 16, 11, { taperBottom: 0.62 }), 'ventriculo_der', [-6, -9, 7], 0.28);
  const la = mk(blob(10, 8, 10), 'auricula_izq', [11, 10, -7]);
  const ra = mk(blob(10, 10, 10), 'auricula_der', [-16, 9, 3]);
  // orejuelas (apéndices auriculares)
  const raApp = mk(blob(6, 4.4, 3.4, { wobble: 0.12 }), 'auricula_der', [-11, 17, 9], 0.55);
  const laApp = mk(blob(5.5, 3.8, 3.2, { wobble: 0.12 }), 'auricula_izq', [9, 15, 5], -0.6);
  c.addPart('ventriculo_izq', [lv]); c.addPart('ventriculo_der', [rv]);
  c.addPart('auricula_izq', [la, laApp]); c.addPart('auricula_der', [ra, raApp]);

  const aorta = tube([[2, 5, -2], [1, 21, 0], [5, 31, -3], [13, 32, -7], [19, 22, -10], [19, 2, -12], [18, -18, -12]], 3.7, vessel(P.aorta), 96);
  const br = [[[4, 30, -2], [3, 42, -2]], [[9, 32.5, -4], [9, 44, -4]], [[14, 31, -7], [15.5, 42, -7]]].map(p => tube(p, 1.7, vessel(P.aorta), 12));
  c.addPart('aorta', [aorta, ...br], { labelPos: V3(9, 33, -5), center: V3(10, 26, -5) });

  const trunk = tube([[-4, 5, 9], [-3, 17, 10], [0, 23, 8]], 3.1, vessel(P.arteria_pulm), 32);
  const lpa = tube([[0, 23, 8], [8, 25, 3], [16, 24, -2]], 2.4, vessel(P.arteria_pulm), 24);
  const rpa = tube([[0, 23, 8], [-8, 26, 4], [-17, 24, -1]], 2.4, vessel(P.arteria_pulm), 24);
  c.addPart('arteria_pulm', [trunk, lpa, rpa], { labelPos: V3(-3, 17, 10), center: V3(-3, 20, 8) });

  const svc = tube([[-16, 33, 0], [-16, 22, 1], [-15, 14, 1]], 3.3, vessel(P.vena_cava, { clearcoat: 0.3 }), 16);
  const ivc = tube([[-12, -3, -3], [-12, -12, -4], [-12, -20, -4]], 3.5, vessel(P.vena_cava, { clearcoat: 0.3 }), 16);
  c.addPart('vena_cava', [svc, ivc], { labelPos: V3(-16, 30, 0), labelMesh: svc, center: V3(-16, 12, -2) });

  const pv = [[[23, 14, -11], [17, 12, -9]], [[23, 7, -11], [17, 8, -9]], [[2, 15, -15], [7, 12, -10]], [[2, 7, -15], [7, 8, -10]]].map(p => tube(p, 1.8, vessel(P.venas_pulm), 10));
  c.addPart('venas_pulm', pv, { labelPos: V3(23, 14, -11), labelMesh: pv[0], center: V3(14, 10, -12) });

  const torus = (pos, rot, r = 3.6) => { const m = new THREE.Mesh(new THREE.TorusGeometry(r, 0.9, 12, 32), phys(P.valvulas, { roughness: 0.35, clearcoat: 0.8 })); m.position.set(...pos); m.rotation.set(...rot); return m; };
  const valves = [torus([-10, 3, 4], [1.2, 0, 0.3]), torus([9, 2, -5], [1.2, 0, -0.3]), torus([-3.6, 8, 9], [1.45, 0, 0], 2.8), torus([1.8, 8, -1.5], [1.45, 0, 0], 3.0)];
  c.addPart('valvulas', valves, { labelPos: V3(), labelMesh: valves[0], center: V3(0, 2, 6) });

  // Arterias coronarias trazadas sobre la superficie real de los ventrículos (raycasting) + grasa epicárdica
  c.group.updateMatrixWorld(true);
  const ray = new THREE.Raycaster();
  const surf = (from, dir, lift) => { ray.set(V3(...from), V3(...dir).normalize()); const h = ray.intersectObjects([lv, rv], false)[0]; return h ? h.point.add(h.face.normal.clone().transformDirection(h.object.matrixWorld).multiplyScalar(lift)) : null; };
  const paths = { lad: [], rca: [], cx: [] }, fats = { lad: [], rca: [], cx: [] };
  for (let i = 0; i <= 8; i++) { const y = 6 - i * 4, f = [1 + i * 0.9, y, 80], d = [0, 0, -1]; const a = surf(f, d, 1.4), b = surf(f, d, 0.1); if (a) paths.lad.push(a); if (b) fats.lad.push(b); }
  for (let i = 0; i <= 6; i++) { const y = 4 - i * 3.2, f = [-60, y, 6 - i], d = [1, 0, -0.15]; const a = surf(f, d, 1.4), b = surf(f, d, 0.1); if (a) paths.rca.push(a); if (b) fats.rca.push(b); }
  for (let i = 0; i <= 6; i++) { const y = 4 - i * 3, f = [80, y, 4 - i * 2.5], d = [-1, 0, 0]; const a = surf(f, d, 1.4), b = surf(f, d, 0.1); if (a) paths.cx.push(a); if (b) fats.cx.push(b); }
  const cor = Object.values(paths).filter(a => a.length > 2).map(pts => new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 64, 1.0, 10, false), vessel(P.coronarias)));
  if (cor.length) { c.addPart('coronarias', cor, { labelPos: (paths.lad[Math.floor(paths.lad.length / 2)] || V3()).clone(), labelMesh: cor[0], center: V3(2, -4, 14) }); }
  const fatMat = phys(0xc9a85e, { roughness: 0.7, clearcoat: 0.25, sheen: 0.25, sheenColor: new THREE.Color(0xf5e2a8) });
  fatMat.clippingPlanes = [c.clipWorld]; shadeBackfaces(fatMat);
  const fat = new THREE.Group(); c.group.add(fat);
  for (const pts of Object.values(fats)) if (pts.length > 2) fat.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, 1.6, 10, false), fatMat));

  // Flujo sanguíneo (partículas): azul cuerpo→pulmones, rojo pulmones→cuerpo
  const blue = curve([[-16, 34, 0], [-15, 16, 1], [-14, 8, 1], [-9, -2, 5], [-6, -14, 8], [-4, -2, 9], [-3, 14, 10], [0, 23, 8], [8, 25, 3], [16, 24, -2]]);
  const red = curve([[23, 14, -11], [13, 11, -8], [9, 2, -4], [8, -14, -2], [4, -6, -2], [2, 8, -2], [1, 21, 0], [5, 31, -3], [13, 32, -7], [19, 22, -10], [19, 0, -12], [18, -18, -12]]);
  const flow = new THREE.Group(); flow.visible = false; c.group.add(flow);
  const pGeo = new THREE.SphereGeometry(1.15, 10, 8), particles = [];
  for (const [cv, color, n] of [[blue, 0x7aa2ff, 26], [red, 0xff3b30, 32]]) {
    const mat = new THREE.MeshBasicMaterial({ color }); mat.clippingPlanes = [c.clipWorld];
    for (let i = 0; i < n; i++) { const p = new THREE.Mesh(pGeo, mat); p.userData = { cv, t: i / n }; flow.add(p); particles.push(p); }
  }

  c.palette = 'real';
  c.setPalette = mode => {
    const pal = HEART_PALETTES[mode] || HEART_PALETTES.real;
    for (const [k, p] of Object.entries(c.parts)) for (const m of p.meshes) for (const mat of matsOf(m)) if (pal[k] != null) mat.color.setHex(pal[k]);
    fat.visible = mode === 'real';
    c.palette = mode;
  };

  const beat = [[ra, 0], [la, 0], [raApp, 0], [laApp, 0], [rv, 0.16], [lv, 0.16]];
  c.update = (t, dt, st) => {
    if ((st.palette || 'real') !== c.palette) c.setPalette(st.palette || 'real');
    const speed = st.speed || 1;
    if (st.animate) {
      const period = 60 / (70 * speed);
      for (const [m, ph] of beat) {
        const x = ((t / period - ph) % 1 + 1) % 1;
        const pulse = x < 0.28 ? Math.sin((x / 0.28) * Math.PI) : 0;
        m.scale.copy(m.userData.baseScale).multiplyScalar(1 - 0.075 * pulse);
      }
    }
    flow.visible = !!st.flow && st.explode < 0.05;
    fat.visible = c.palette === 'real' && st.explode < 0.05;
    if (flow.visible) for (const p of particles) {
      p.userData.t = (p.userData.t + dt * 0.16 * speed) % 1;
      p.position.copy(p.userData.cv.getPointAt(p.userData.t));
    }
    c.cut = st.cut || 0;
    c.updateClip();
  };
  c.group.scale.setScalar(1.12);
  return c;
}

// ------------------------------------------------------------------ Planetas: texturas realistas con ruido fractal
const TEX = {};
const W = 512, H = 256;
const PLANET_TEX = {
  mercurio: (w = W, h = H) => sphereTex(w, h, (x, y, z) => {
    const n = fbm(x * 3, y * 3, z * 3), cr = smooth(0.25, 0.4, fbm(x * 9 + 7, y * 9, z * 9, 3));
    const c = mix(hex(0x6f6a66), hex(0xb0aaa1), 0.5 + 0.6 * n); return mix(c, hex(0x5a5652), cr * 0.6);
  }),
  venus: (w = W, h = H) => sphereTex(w, h, (x, y, z) => {
    const n = fbm(x * 1.5 + fbm(x * 3, y * 3, z * 3) * 1.4, y * 5, z * 1.5);
    return mix(hex(0xc29a5b), hex(0xf2dcaa), 0.5 + 0.8 * n);
  }),
  tierra: (w = 640, h = 320) => sphereTex(w, h, (x, y, z, lat) => {
    const hgt = fbm(x * 1.7, y * 1.7, z * 1.7, 5) + 0.08, ice = Math.abs(lat) > 1.2 + 0.08 * perlin(x * 6, y * 6, z * 6);
    if (ice) return hex(0xf2f6fb);
    if (hgt > 0.06) {
      const dry = smooth(0.0, 0.35, 0.5 - Math.abs(lat) + 0.4 * fbm(x * 4 + 3, y * 4, z * 4, 3));
      const veg = mix(hex(0x2f6b30), hex(0x5b8f3e), smooth(0.06, 0.3, hgt));
      const land = mix(veg, hex(0xb59a62), dry * 0.75);
      return mix(land, hex(0x8a7a6a), smooth(0.35, 0.55, hgt));          // montañas
    }
    return mix(hex(0x072a5c), hex(0x1f6fb3), smooth(-0.35, 0.06, hgt));   // océano profundo → costa
  }),
  nubes: (w = 512, h = 256) => sphereTex(w, h, (x, y, z) => {
    const n = fbm(x * 2.6 + 11, y * 5.2, z * 2.6, 4); const a = smooth(0.05, 0.45, n);
    return [255, 255, 255, Math.round(a * 230)];
  }, { alpha: true }),
  marte: (w = W, h = H) => sphereTex(w, h, (x, y, z, lat) => {
    if (Math.abs(lat) > 1.38) return hex(0xf0e8e0);
    const n = fbm(x * 2.2, y * 2.2, z * 2.2, 6), d = smooth(0.1, 0.4, fbm(x * 1.2 + 4, y * 1.2, z * 1.2, 3));
    return mix(mix(hex(0xc1602f), hex(0xe08a4a), 0.5 + 0.6 * n), hex(0x6b2a17), d * 0.7);
  }),
  jupiter: (w = W, h = H) => sphereTex(w, h, (x, y, z, lat) => {
    const turb = fbm(x * 3, y * 3, z * 3, 4);
    const b = 0.5 + 0.5 * Math.sin(lat * 22 + turb * 3);
    let c = mix(mix(hex(0xb0835a), hex(0xefe0c6), b), hex(0xc99a6c), 0.5 + 0.5 * Math.sin(lat * 9 + turb));
    const lon = Math.atan2(z, x), dl = (lat + 0.38) / 0.09, dn = (lon - 1.0) / 0.22, spot = dl * dl + dn * dn;   // Gran Mancha Roja
    if (spot < 1) c = mix(c, hex(0xb5482e), (1 - spot) * (0.75 + 0.25 * perlin(x * 20, y * 20, z * 20)));
    return c;
  }),
  saturno: (w = W, h = H) => sphereTex(w, h, (x, y, z, lat) => {
    const b = 0.5 + 0.5 * Math.sin(lat * 16 + fbm(x * 2, y * 2, z * 2, 3) * 1.4);
    return mix(hex(0xc9a868), hex(0xf1e3bc), b);
  }),
  urano: (w = W, h = H) => sphereTex(w, h, (x, y, z, lat) => mix(hex(0x86d0d8), hex(0xb4eef0), 0.5 + 0.25 * Math.sin(lat * 8) + 0.2 * fbm(x * 2, y * 4, z * 2, 3))),
  neptuno: (w = W, h = H) => sphereTex(w, h, (x, y, z, lat) => {
    let c = mix(hex(0x2c55c9), hex(0x5a86f0), 0.5 + 0.3 * Math.sin(lat * 10 + fbm(x * 2, y * 2, z * 2, 3) * 2));
    if (smooth(0.35, 0.5, fbm(x * 3 + 9, y * 3, z * 3, 3)) > 0.5) c = mix(c, hex(0x1b2f80), 0.6);
    return c;
  }),
  sol: (w = W, h = H) => sphereTex(w, h, (x, y, z) => mix(hex(0xff8a00), hex(0xfff2a8), 0.5 + 0.9 * fbm(x * 9, y * 9, z * 9, 4))),
  luna: (w = W, h = H) => sphereTex(w, h, (x, y, z) => {
    const maria = smooth(0.0, 0.25, fbm(x * 1.6 + 2, y * 1.6, z * 1.6, 4)), cr = smooth(0.3, 0.42, fbm(x * 10, y * 10, z * 10, 3));
    return mix(mix(hex(0xb9b9b5), hex(0x6e6e6b), maria), hex(0xdcdcd8), cr * 0.5);
  }),
};
/** lo = versión ligera (256x128) para el sistema solar completo, donde los planetas se ven pequeños */
/** Genera las texturas en segundo plano (una por pausa) para que los módulos abran al instante. */
export function warmTextures() {
  fiberTexture();
  const jobs = [['sol', true], ...PLANETS.map(p => [p[0], true]), ['tierra'], ['nubes'], ['luna'], ['jupiter'], ['saturno'], ['marte']];
  const idle = window.requestIdleCallback || (fn => setTimeout(fn, 120));
  const next = () => { const j = jobs.shift(); if (!j) return; tex(j[0], j[1]); idle(next, { timeout: 2000 }); };
  idle(next, { timeout: 2000 });
}
const tex = (k, lo = false) => (TEX[k + (lo ? '@lo' : '')] ||= PLANET_TEX[k](...(lo ? [256, 128] : [])));
function planetMat(key, lo = false) {
  const map = tex(key, lo);
  const rocky = ['mercurio', 'marte', 'luna'].includes(key);
  return std(0xffffff, { map, roughness: key === 'tierra' ? 0.6 : 0.85, metalness: 0, ...(rocky ? { bumpMap: map, bumpScale: 2 } : {}) });
}
function atmosphere(color = 0x5fa8ff, power = 3.2) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { c: { value: new THREE.Color(color) }, p: { value: power } },
    vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }',
    fragmentShader: 'uniform vec3 c; uniform float p; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - max(dot(vN, vV), 0.0), p); gl_FragColor = vec4(c * f * 1.6, f); }',
  });
}
function glowSprite(color = 'rgba(255,190,90,', size = 1) {
  const t = canvasTex((g, w) => { const grd = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); grd.addColorStop(0, color + '0.9)'); grd.addColorStop(0.25, color + '0.45)'); grd.addColorStop(1, color + '0)'); g.fillStyle = grd; g.fillRect(0, 0, w, w); }, 128, 128);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); s.scale.setScalar(size); return s;
}
function makeRing(inner, outer) {
  const geo = new THREE.RingGeometry(inner, outer, 128);
  const t = canvasTex((g, w) => {
    for (let x = 0; x < w; x++) {
      const u = x / w, gap = u > 0.62 && u < 0.67 ? 0.15 : 1;                 // división de Cassini
      const a = gap * (0.3 + 0.55 * (0.5 + 0.5 * perlin(u * 40, 0.5, 0.5)) * (0.6 + 0.4 * Math.sin(u * 90)));
      const col = mix(hex(0xb89a6a), hex(0xeadbb4), 0.5 + 0.5 * perlin(u * 25, 1.5, 0));
      g.fillStyle = `rgba(${col.map(Math.round).join(',')},${a})`; g.fillRect(x, 0, 1, 4);
    }
  }, 512, 4);
  const pos = geo.attributes.position, uv = geo.attributes.uv, v = V3();
  for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i); uv.setXY(i, (v.length() - inner) / (outer - inner), 0.5); }
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: t, side: THREE.DoubleSide, transparent: true, roughness: 0.9, depthWrite: false }));
  m.rotation.x = -Math.PI / 2 + 0.38;
  return m;
}

const PLANETS = [ // clave, radio didáctico, distancia, periodo (años), radio real (Tierra = 1)
  ['mercurio', 1.6, 24, 0.24, 0.38], ['venus', 2.6, 32, 0.62, 0.95], ['tierra', 2.8, 41, 1.0, 1.0], ['marte', 2.1, 50, 1.88, 0.53],
  ['jupiter', 7.0, 64, 11.9, 11.2], ['saturno', 6.0, 81, 29.5, 9.45], ['urano', 4.0, 95, 84, 4.0], ['neptuno', 3.9, 107, 165, 3.88],
];

function buildSolar() {
  const c = new Content3D('solar');
  const tilt = new THREE.Group(); tilt.rotation.x = 0.5; c.group.add(tilt);
  const sunTex = tex('sol', true);
  const sun = new THREE.Mesh(new THREE.SphereGeometry(13, 64, 40), new THREE.MeshStandardMaterial({ color: 0xffffff, map: sunTex, emissive: 0xffffff, emissiveMap: sunTex, emissiveIntensity: 1.5 }));
  sun.material.userData.baseEmissiveIntensity = 1.5;
  c.addPart('sol', [sun], { parent: tilt });
  tilt.add(glowSprite('rgba(255,180,80,', 52));
  const planets = [];
  for (const [key, r, d, period] of PLANETS) {
    const orbit = new THREE.Mesh(new THREE.RingGeometry(d - 0.2, d + 0.2, 160), new THREE.MeshBasicMaterial({ color: 0x8fa3ff, transparent: true, opacity: 0.22, side: THREE.DoubleSide }));
    orbit.rotation.x = -Math.PI / 2; tilt.add(orbit);
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 40, 24), planetMat(key, true));
    if (key === 'saturno') m.add(makeRing(r * 1.3, r * 2.25));
    if (key === 'tierra') { const atm = new THREE.Mesh(new THREE.SphereGeometry(r * 1.08, 32, 20), atmosphere()); m.add(atm); }
    c.addPart(key, [m], { parent: tilt, center: V3(1, 0, 0) });
    planets.push({ m, d, period, a: (key.length * 1.7) % (Math.PI * 2) });
  }
  c.applyExplode = () => {};
  c.update = (t, dt, st) => {
    const sp = (st.animate ? 1 : 0) * (st.quiz ? 0.15 : 1) * (st.speed || 1);
    for (const p of planets) { p.a += (dt * sp * 0.9) / Math.sqrt(p.period); p.m.position.set(Math.cos(p.a) * p.d, 0, -Math.sin(p.a) * p.d); p.m.rotation.y += dt * 0.8 * sp; }
    sun.rotation.y += dt * 0.08;
  };
  c.group.scale.setScalar(0.62);
  return c;
}

function buildPlanet(key) {
  const c = new Content3D(key);
  const def = PLANETS.find(p => p[0] === key), realR = def[4];
  const DIDACTIC = 22, JUPITER_REAL = 40;
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), planetMat(key));
  m.rotation.z = key === 'tierra' ? 0.41 : key === 'urano' ? 1.7 : 0.05;     // inclinación del eje
  c.addPart(key, [m]);
  let ring = null, moon = null, clouds = null;
  if (key === 'saturno') { ring = makeRing(1.3, 2.25); c.addPart('anillos', [ring], { center: V3(0, -1, 0) }); }
  if (key === 'tierra') {
    moon = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), planetMat('luna'));
    c.addPart('luna', [moon], { center: V3(1, 0, 0) });
    clouds = new THREE.Mesh(new THREE.SphereGeometry(1.012, 64, 48), new THREE.MeshStandardMaterial({ map: tex('nubes'), transparent: true, depthWrite: false, roughness: 1 }));
    m.add(clouds);
    m.add(new THREE.Mesh(new THREE.SphereGeometry(1.07, 48, 32), atmosphere()));
  }
  if (key === 'marte') m.add(new THREE.Mesh(new THREE.SphereGeometry(1.04, 48, 32), atmosphere(0xff9a6a, 4)));
  let r = DIDACTIC, a = 0;
  c.update = (t, dt, st) => {
    const target = st.realScale ? (realR / 11.2) * JUPITER_REAL : DIDACTIC;
    r += (target - r) * Math.min(1, dt * 4);
    m.scale.setScalar(r);
    const sp = (st.animate ? 1 : 0) * (st.speed || 1);
    m.rotation.y += dt * 0.4 * sp; if (clouds) clouds.rotation.y += dt * 0.06 * sp;
    if (ring) ring.scale.setScalar(r);
    if (moon) { a += dt * 0.5 * sp; moon.scale.setScalar(r * 0.27); moon.position.set(Math.cos(a) * r * 2.3, r * 0.3, Math.sin(a) * r * 2.3); moon.rotation.y = -a; }
  };
  c.applyExplode = () => {};
  return c;
}

// ------------------------------------------------------------------ Moléculas (coordenadas en Å)
export const ELEMENT_STYLE = { H: { color: 0xf2f2f2, r: 0.55 }, C: { color: 0x3a3a3a, r: 0.85 }, O: { color: 0xe0352f, r: 0.8 }, N: { color: 0x2f4fe0, r: 0.8 } };
const atomMat = color => phys(color, { roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.08 });
const ring6 = (r, el) => Array.from({ length: 6 }, (_, i) => [el, r * Math.cos(i * Math.PI / 3), r * Math.sin(i * Math.PI / 3), 0]);
const MOLECULES = {
  h2o: { atoms: [['O', 0, 0, 0], ['H', 0.757, 0.586, 0], ['H', -0.757, 0.586, 0]], bonds: [[0, 1, 1], [0, 2, 1]] },
  co2: { atoms: [['C', 0, 0, 0], ['O', 1.16, 0, 0], ['O', -1.16, 0, 0]], bonds: [[0, 1, 2], [0, 2, 2]] },
  ch4: { atoms: [['C', 0, 0, 0], ['H', 0.629, 0.629, 0.629], ['H', -0.629, -0.629, 0.629], ['H', -0.629, 0.629, -0.629], ['H', 0.629, -0.629, -0.629]], bonds: [[0, 1, 1], [0, 2, 1], [0, 3, 1], [0, 4, 1]] },
  nh3: { atoms: [['N', 0, 0.12, 0], ['H', 0.937, -0.256, 0], ['H', -0.469, -0.256, 0.812], ['H', -0.469, -0.256, -0.812]], bonds: [[0, 1, 1], [0, 2, 1], [0, 3, 1]], lonePair: [0, 0.75, 0] },
  o2: { atoms: [['O', 0.605, 0, 0], ['O', -0.605, 0, 0]], bonds: [[0, 1, 2]] },
  c2h4: { atoms: [['C', 0.667, 0, 0], ['C', -0.667, 0, 0], ['H', 1.232, 0.929, 0], ['H', 1.232, -0.929, 0], ['H', -1.232, 0.929, 0], ['H', -1.232, -0.929, 0]],
          bonds: [[0, 1, 2], [0, 2, 1], [0, 3, 1], [1, 4, 1], [1, 5, 1]] },
  c6h6: { atoms: [...ring6(1.39, 'C'), ...ring6(2.48, 'H')], bonds: [...Array.from({ length: 6 }, (_, i) => [i, (i + 1) % 6, 1]), ...Array.from({ length: 6 }, (_, i) => [i, i + 6, 1])], aromatic: 0.85 },
};
function buildMolecule(key) {
  const c = new Content3D(key);
  const S = 40, data = MOLECULES[key];
  const spin = new THREE.Group(); c.group.add(spin);
  const pos = data.atoms.map(([, x, y, z]) => V3(x, y, z).multiplyScalar(S));
  const centroid = pos.reduce((s, p) => s.add(p), V3()).divideScalar(pos.length); pos.forEach(p => p.sub(centroid));
  const byEl = {};
  data.atoms.forEach(([el], i) => {
    const e = ELEMENT_STYLE[el];
    const m = new THREE.Mesh(new THREE.SphereGeometry(e.r * S * 0.42, 48, 32), atomMat(e.color));
    m.position.copy(pos[i]); (byEl[el] ||= []).push(m);
  });
  const bonds = [], bondMat = phys(0xc4cad4, { roughness: 0.25, metalness: 0.3, clearcoat: 0.8 });
  for (const [a, b, order] of data.bonds) {
    const pa = pos[a], pb = pos[b], dir = pb.clone().sub(pa).normalize(), len = pa.distanceTo(pb);
    let perp = dir.clone().cross(V3(0, 0, 1)); if (perp.lengthSq() < 1e-3) perp = dir.clone().cross(V3(1, 0, 0)); perp.normalize();
    const offs = order === 2 ? [-3.6, 3.6] : order === 3 ? [-4.5, 0, 4.5] : [0];
    for (const o of offs) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(order > 1 ? 2.0 : 2.6, order > 1 ? 2.0 : 2.6, len, 20), bondMat);
      m.position.copy(pa).add(pb).multiplyScalar(0.5).addScaledVector(perp, o);
      m.quaternion.setFromUnitVectors(V3(0, 1, 0), dir);
      bonds.push(m);
    }
  }
  if (data.aromatic) bonds.push(new THREE.Mesh(new THREE.TorusGeometry(data.aromatic * S, 1.4, 16, 72), phys(0x9ad0ff, { roughness: 0.2, transparent: true, opacity: 0.8 })));
  for (const [el, meshes] of Object.entries(byEl)) {
    const center = meshes.reduce((s, m) => s.add(m.position), V3()).divideScalar(meshes.length);
    c.addPart(el, meshes, { parent: spin, center: center.lengthSq() < 4 ? V3(0, -1, 0) : center });
  }
  if (data.lonePair) {
    const lp = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), phys(0x7f9cff, { transparent: true, opacity: 0.35, roughness: 0.15, transmission: 0 }));
    lp.scale.set(7, 12, 7); lp.position.copy(V3(...data.lonePair).multiplyScalar(S).sub(centroid));
    c.addPart(Object.keys(byEl).find(e => e !== 'H'), [lp], { parent: spin });
  }
  c.addPart('enlaces', bonds, { parent: spin, center: V3(0, 0, 0.0001) });
  c.explodeDistance = 10;
  c.applyExplode = function (amount) { for (const [k, p] of Object.entries(this.parts)) if (k !== 'enlaces') p.group.position.copy(p.home).addScaledVector(p.dir, amount * 10); };
  c.update = (t, dt, st) => { if (!st.pinned && st.animate) spin.rotation.y += dt * 0.5 * (st.speed || 1); };
  return c;
}

// ------------------------------------------------------------------ Sprite de texto
function textSprite(text, color = '#ffffff', size = 18) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const g = cv.getContext('2d'); g.font = 'bold 84px "Space Grotesk", Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 8; g.strokeStyle = 'rgba(0,0,0,.65)'; g.strokeText(text, 64, 68); g.fillStyle = color; g.fillText(text, 64, 68);
  const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tx, depthTest: false, transparent: true })); s.scale.setScalar(size); s.renderOrder = 10;
  return s;
}

// ------------------------------------------------------------------ Tarjetas de átomos (para reacciones)
const VALENCE = { H: 1, O: 6, C: 4, N: 5 };
function buildAtomCard(sym) {
  const c = new Content3D('atom_' + sym);
  const e = ELEMENT_STYLE[sym];
  const m = new THREE.Mesh(new THREE.SphereGeometry(e.r * 26, 64, 48), atomMat(e.color));
  c.addPart('atomo', [m]);
  const label = textSprite(sym, sym === 'H' ? '#111' : '#fff', 18); label.position.set(0, 0, e.r * 26 + 2); c.group.add(label);
  const els = [], n = VALENCE[sym];
  for (let i = 0; i < n; i++) { const el = new THREE.Mesh(new THREE.SphereGeometry(2.2, 16, 12), new THREE.MeshStandardMaterial({ color: 0xffe066, emissive: 0xffc400, emissiveIntensity: 0.8 })); c.group.add(el); els.push(el); }
  c.group.add(new THREE.Mesh(new THREE.TorusGeometry(e.r * 26 + 10, 0.45, 8, 96), new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.35 })));
  c.applyExplode = () => {};
  c.update = (t, dt, st) => { const R = e.r * 26 + 10; els.forEach((el, i) => { const a = t * (st.animate ? 1.2 : 0) + i * Math.PI * 2 / n; el.position.set(Math.cos(a) * R, Math.sin(a) * R, 0); }); };
  return c;
}

// ------------------------------------------------------------------ Átomo de Bohr
function buildBohr(elements) {
  const c = new Content3D('bohr');
  const tilt = new THREE.Group(); tilt.rotation.x = 0.35; c.group.add(tilt);
  const MAX = 10, pGeo = new THREE.SphereGeometry(2.6, 24, 16);
  const protons = new THREE.InstancedMesh(pGeo, phys(0xd8392b, { roughness: 0.3, clearcoat: 1 }), MAX);
  const neutrons = new THREE.InstancedMesh(pGeo, phys(0x9aa3b2, { roughness: 0.3, clearcoat: 1 }), MAX);
  const electrons = new THREE.InstancedMesh(new THREE.SphereGeometry(2.2, 20, 14), std(0xffd54a, { emissive: 0xffb300, emissiveIntensity: 0.9, roughness: 0.3 }), MAX);
  const shellMat = new THREE.MeshStandardMaterial({ color: 0x8fa3ff, emissive: 0x3a4fd0, emissiveIntensity: 0.6, transparent: true, opacity: 0.55, roughness: 0.4 });
  const shell1 = new THREE.Mesh(new THREE.TorusGeometry(24, 0.7, 12, 128), shellMat);
  const shell2 = new THREE.Mesh(new THREE.TorusGeometry(40, 0.7, 12, 160), shellMat);
  c.addPart('nucleo', [protons, neutrons], { parent: tilt, center: V3(0, -1, 0) });
  c.addPart('capa_1', [shell1], { parent: tilt, labelPos: V3(0, 24, 0), center: V3(-1, 0, 0) });
  c.addPart('capa_2', [shell2], { parent: tilt, labelPos: V3(0, -40, 0), center: V3(1, 0, 0) });
  c.addPart('electrones', [electrons], { parent: tilt, labelPos: V3(24, 0, 0), center: V3(0, 1, 0) });
  tilt.add(glowSprite('rgba(255,120,90,', 26));
  c.explodeDistance = 0;
  const tmp = new THREE.Object3D();
  let current = null;
  c.element = null;
  c.setElement = z => {
    const el = elements.find(e => e.Z === z) || elements[5];
    current = el; c.element = el;
    const A = el.Z + el.N, R = 2.6 * Math.cbrt(A) * 1.25, pts = [];
    for (let i = 0; i < A; i++) { // empaquetado en espiral de Fibonacci
      const y = A === 1 ? 0 : 1 - (i / (A - 1)) * 2, rr = Math.sqrt(1 - y * y), th = i * 2.399963;
      pts.push(V3(Math.cos(th) * rr, y, Math.sin(th) * rr).multiplyScalar(A === 1 ? 0 : R * 0.75));
    }
    let pi = 0, ni = 0;
    pts.forEach((p, k) => {
      tmp.position.copy(p); tmp.updateMatrix();
      if ((k % 2 === 0 && pi < el.Z) || ni >= el.N) protons.setMatrixAt(pi++, tmp.matrix); else neutrons.setMatrixAt(ni++, tmp.matrix);
    });
    protons.count = el.Z; neutrons.count = el.N;
    protons.instanceMatrix.needsUpdate = neutrons.instanceMatrix.needsUpdate = true;
    electrons.count = el.Z; shell2.visible = el.Z > 2;
    for (const mesh of [protons, neutrons, electrons]) mesh.computeBoundingSphere?.();
  };
  c.config = () => { const z = current?.Z || 0; return z <= 2 ? `${z}` : `2, ${z - 2}`; };
  c.applyExplode = () => {};
  let a1 = 0, a2 = 0;
  c.update = (t, dt, st) => {
    if (st.element && st.element !== current?.Z) c.setElement(st.element);
    const sp = (st.animate ? 1 : 0) * (st.speed || 1);
    a1 += dt * 1.4 * sp; a2 += dt * 0.8 * sp;
    const z = current.Z, n1 = Math.min(2, z), n2 = Math.max(0, z - 2);
    for (let i = 0; i < z; i++) {
      const inFirst = i < n1, n = inFirst ? n1 : n2, k = inFirst ? i : i - n1, R = inFirst ? 24 : 40, a = (inFirst ? a1 : a2) + (k * Math.PI * 2) / n;
      tmp.position.set(Math.cos(a) * R, Math.sin(a) * R, 0); tmp.updateMatrix(); electrons.setMatrixAt(i, tmp.matrix);
    }
    electrons.instanceMatrix.needsUpdate = true; electrons.computeBoundingSphere();
  };
  c.setElement(6);
  c.group.scale.setScalar(0.95);
  return c;
}

// ------------------------------------------------------------------ GLB del docente
const gltfLoader = new GLTFLoader(); gltfLoader.setMeshoptDecoder(MeshoptDecoder);

/** Devuelve los nombres de malla de un GLB (para el asistente de nuevo módulo). */
export async function inspectGLB(url) {
  const gltf = await gltfLoader.loadAsync(url);
  const names = [];
  gltf.scene.traverse(o => { if (o.isMesh) names.push(o.name || o.parent?.name || `malla_${names.length + 1}`); });
  let tris = 0; gltf.scene.traverse(o => { if (o.isMesh) tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; });
  return { names: [...new Set(names)], triangles: Math.round(tris), animations: gltf.animations.length };
}

function buildGLB(model, urlPromise) {
  const c = new Content3D(model.key || 'glb');
  c.ready = false;
  const onReady = [];
  c.whenReady = fn => (c.ready ? fn(c) : onReady.push(fn));
  let mixer = null;
  urlPromise.then(url => gltfLoader.loadAsync(url)).then(gltf => {
    const root = gltf.scene;
    root.traverse(o => { if (o.isMesh && !o.name) o.name = o.parent?.name || 'malla'; });
    const box = new THREE.Box3().setFromObject(root), size = box.getSize(V3()).length() || 1, center = box.getCenter(V3());
    const wrap = new THREE.Group(); wrap.add(root); root.position.sub(center);
    wrap.scale.setScalar((80 / size) * (model.scale || 1)); c.group.add(wrap);
    c.group.updateMatrixWorld(true);
    const byKey = {};
    root.traverse(o => { if (!o.isMesh) return; let n = o; while (n && n !== root.parent) { if (model.parts[n.name]) { (byKey[n.name] ||= []).push(o); return; } n = n.parent; } });
    const modelCenter = new THREE.Box3().setFromObject(root).getCenter(V3());
    for (const [k, meshes] of Object.entries(byKey)) {
      for (const m of meshes) {
        m.geometry.computeBoundingBox();
        const wc = new THREE.Box3().setFromObject(m).getCenter(V3());
        const dirW = wc.sub(modelCenter); const len = dirW.length();
        const inv = new THREE.Matrix4().copy(m.parent.matrixWorld).invert();
        const dirL = dirW.lengthSq() > 1e-9 ? dirW.normalize().transformDirection(inv) : V3(0, 1, 0);
        m.userData.explodeDir = dirL; m.userData.explodeDist = (14 / m.parent.getWorldScale(V3()).x) * (len > 0 ? 1 : 0);
      }
      const lm = meshes[0]; const lp = lm.geometry.boundingBox.getCenter(V3());
      c.addPart(k, meshes, { adopt: true, labelMesh: lm, labelPos: lp });
    }
    if (gltf.animations.length) { mixer = new THREE.AnimationMixer(root); gltf.animations.forEach(a => mixer.clipAction(a).play()); }
    c.ready = true; onReady.splice(0).forEach(fn => fn(c));
  }).catch(err => { console.error('No se pudo cargar el GLB', err); c.error = err; onReady.splice(0).forEach(fn => fn(c)); });
  c.update = (t, dt, st) => { if (mixer && st.animate) mixer.update(dt * (st.speed || 1)); };
  return c;
}

// ------------------------------------------------------------------ Fábrica
export function buildContent(key, catalog, store) {
  const model = catalog.models[key];
  let c;
  if (model?.source === 'glb') c = buildGLB({ ...model, key }, store.modelFileURL(model));
  else if (key === 'heart') c = buildHeart();
  else if (key === 'solar') c = buildSolar();
  else if (key === 'earth') c = buildPlanet('tierra');
  else if (key === 'mars') c = buildPlanet('marte');
  else if (key === 'jupiter') c = buildPlanet('jupiter');
  else if (key === 'saturn') c = buildPlanet('saturno');
  else if (key === 'bohr') c = buildBohr(catalog.elements);
  else if (key.startsWith('atom_')) c = buildAtomCard(key.slice(5));
  else if (MOLECULES[key]) c = buildMolecule(key);
  else { c = new Content3D(key); const m = new THREE.Mesh(new THREE.BoxGeometry(30, 30, 30), std(0x888888)); c.group.add(m); }
  c.contentKey = key;
  if (!c.whenReady) c.whenReady = fn => fn(c);
  return c;
}
