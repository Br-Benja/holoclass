// =====================================================================
//  HoloClass · Modelos 3D (unidades: mm)
//  Ejes locales: X derecha, Y arriba, Z hacia el observador (sale de la tarjeta).
//  - Modelos procedurales (corazón, sistema solar, planetas, moléculas, átomos)
//  - Modelos GLB subidos por el docente (GLTFLoader + meshopt)
// =====================================================================
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const HIGHLIGHT = new THREE.Color(0x22d3ee);
const matsOf = m => (Array.isArray(m.material) ? m.material : [m.material]);
const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.05, ...extra });

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
    if (this.parts[key]) part.meshes.push(...meshes); else part.meshes = meshes.slice();
    this.parts[key] = part;
    return g;
  }
  get pickables() { return Object.values(this.parts).flatMap(p => p.meshes).filter(m => m.visible !== false); }
  setHighlight(key) {
    this.highlighted = key;
    for (const [k, p] of Object.entries(this.parts)) for (const m of p.meshes) for (const mat of matsOf(m)) {
      if (mat.emissive) {
        if (k === key) { mat.emissive.copy(HIGHLIGHT); mat.emissiveIntensity = 0.55; }
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

// ------------------------------------------------------------------ Corazón (10 partes)
function blob(rx, ry, rz, { taperBottom = 0, taperTop = 0, wobble = 0.03 } = {}, seg = 56) {
  const g = new THREE.SphereGeometry(1, seg, Math.round(seg * 0.75));
  const p = g.attributes.position, v = V3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const t = (v.y + 1) / 2;
    let s = 1;
    if (taperBottom) s *= 1 - taperBottom * Math.pow(1 - t, 2.2);
    if (taperTop) s *= 1 - taperTop * Math.pow(t, 2);
    v.set(v.x * s * rx, v.y * ry, v.z * s * rz);
    v.multiplyScalar(1 + wobble * Math.sin(v.x * 0.45 + v.y * 0.3) * Math.cos(v.z * 0.4));
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}
const curve = pts => new THREE.CatmullRomCurve3(pts.map(p => V3(...p)));
const tube = (pts, r, color, seg = 64) => { const c = curve(pts); const m = new THREE.Mesh(new THREE.TubeGeometry(c, seg, r, 18, false), std(color)); m.userData.curve = c; return m; };

function buildHeart() {
  const c = new Content3D('heart');
  c.clippable = true;
  const mk = (geo, color, pos, rz = 0) => { const m = new THREE.Mesh(geo, std(color, { roughness: 0.5 })); m.position.set(...pos); m.rotation.z = rz; return m; };
  const lv = mk(blob(15, 24, 15, { taperBottom: 0.78 }), 0xc0392b, [6, -9, -2], 0.42);
  const rv = mk(blob(13, 16, 11, { taperBottom: 0.62 }), 0x4a5fc1, [-6, -9, 7], 0.28);
  const la = mk(blob(10, 8, 10), 0xd64541, [11, 10, -7]);
  const ra = mk(blob(10, 10, 10), 0x5468c8, [-16, 9, 3]);
  c.addPart('ventriculo_izq', [lv]); c.addPart('ventriculo_der', [rv]);
  c.addPart('auricula_izq', [la]); c.addPart('auricula_der', [ra]);

  const aorta = tube([[2, 5, -2], [1, 21, 0], [5, 31, -3], [13, 32, -7], [19, 22, -10], [19, 2, -12], [18, -18, -12]], 3.7, 0xe74c3c, 96);
  const br = [[[4, 30, -2], [3, 42, -2]], [[9, 32.5, -4], [9, 44, -4]], [[14, 31, -7], [15.5, 42, -7]]].map(p => tube(p, 1.7, 0xe74c3c, 12));
  c.addPart('aorta', [aorta, ...br], { labelPos: V3(9, 33, -5), center: V3(10, 26, -5) });

  const trunk = tube([[-4, 5, 9], [-3, 17, 10], [0, 23, 8]], 3.1, 0x3b6fd8, 32);
  const lpa = tube([[0, 23, 8], [8, 25, 3], [16, 24, -2]], 2.4, 0x3b6fd8, 24);
  const rpa = tube([[0, 23, 8], [-8, 26, 4], [-17, 24, -1]], 2.4, 0x3b6fd8, 24);
  c.addPart('arteria_pulm', [trunk, lpa, rpa], { labelPos: V3(-3, 17, 10), center: V3(-3, 20, 8) });

  const svc = tube([[-16, 33, 0], [-16, 22, 1], [-15, 14, 1]], 3.3, 0x2c4fa3, 16);
  const ivc = tube([[-12, -3, -3], [-12, -12, -4], [-12, -20, -4]], 3.5, 0x2c4fa3, 16);
  c.addPart('vena_cava', [svc, ivc], { labelPos: V3(-16, 30, 0), labelMesh: svc, center: V3(-16, 12, -2) });

  const pv = [[[23, 14, -11], [17, 12, -9]], [[23, 7, -11], [17, 8, -9]], [[2, 15, -15], [7, 12, -10]], [[2, 7, -15], [7, 8, -10]]].map(p => tube(p, 1.8, 0xd1495b, 10));
  c.addPart('venas_pulm', pv, { labelPos: V3(23, 14, -11), labelMesh: pv[0], center: V3(14, 10, -12) });

  const torus = (pos, rot, r = 3.6) => { const m = new THREE.Mesh(new THREE.TorusGeometry(r, 0.9, 10, 28), std(0xf1e2c4, { roughness: 0.4 })); m.position.set(...pos); m.rotation.set(...rot); return m; };
  const valves = [torus([-10, 3, 4], [1.2, 0, 0.3]), torus([9, 2, -5], [1.2, 0, -0.3]), torus([-3.6, 8, 9], [1.45, 0, 0], 2.8), torus([1.8, 8, -1.5], [1.45, 0, 0], 3.0)];
  c.addPart('valvulas', valves, { labelPos: V3(), labelMesh: valves[0], center: V3(0, 2, 6) });

  // Arterias coronarias: se trazan sobre la superficie real de los ventrículos (raycasting)
  c.group.updateMatrixWorld(true);
  const ray = new THREE.Raycaster();
  const surf = (from, dir) => { ray.set(V3(...from), V3(...dir).normalize()); const h = ray.intersectObjects([lv, rv], false)[0]; return h ? h.point.add(h.face.normal.clone().transformDirection(h.object.matrixWorld).multiplyScalar(0.8)) : null; };
  const lad = [], rca = [], cx = [];
  for (let i = 0; i <= 8; i++) { const y = 6 - i * 4; const p = surf([1 + i * 0.9, y, 80], [0, 0, -1]); if (p) lad.push(p); }
  for (let i = 0; i <= 6; i++) { const y = 4 - i * 3.2; const p = surf([-60, y, 6 - i], [1, 0, -0.15]); if (p) rca.push(p); }
  for (let i = 0; i <= 6; i++) { const y = 4 - i * 3; const p = surf([80, y, 4 - i * 2.5], [-1, 0, 0]); if (p) cx.push(p); }
  const cor = [lad, rca, cx].filter(a => a.length > 2).map(pts => { const cc = new THREE.CatmullRomCurve3(pts); return new THREE.Mesh(new THREE.TubeGeometry(cc, 48, 1.05, 8, false), std(0xff7a5c, { roughness: 0.4 })); });
  if (cor.length) c.addPart('coronarias', cor, { labelPos: V3(), labelMesh: cor[0], center: V3(2, -4, 14) });
  // la etiqueta de cada tubo coronario va a la mitad de su trayecto
  if (cor.length) { const mid = lad[Math.floor(lad.length / 2)] || V3(); c.parts.coronarias.labelPos = mid.clone(); }

  // Flujo sanguíneo (partículas): azul cuerpo→pulmones, rojo pulmones→cuerpo
  const blue = curve([[-16, 34, 0], [-15, 16, 1], [-14, 8, 1], [-9, -2, 5], [-6, -14, 8], [-4, -2, 9], [-3, 14, 10], [0, 23, 8], [8, 25, 3], [16, 24, -2]]);
  const red = curve([[23, 14, -11], [13, 11, -8], [9, 2, -4], [8, -14, -2], [4, -6, -2], [2, 8, -2], [1, 21, 0], [5, 31, -3], [13, 32, -7], [19, 22, -10], [19, 0, -12], [18, -18, -12]]);
  const flow = new THREE.Group(); flow.visible = false; c.group.add(flow);
  const pGeo = new THREE.SphereGeometry(1.15, 8, 6), particles = [];
  for (const [cv, color, n] of [[blue, 0x7aa2ff, 26], [red, 0xff3b30, 32]]) {
    const mat = new THREE.MeshBasicMaterial({ color }); mat.clippingPlanes = [c.clipWorld];
    for (let i = 0; i < n; i++) { const p = new THREE.Mesh(pGeo, mat); p.userData = { cv, t: i / n }; flow.add(p); particles.push(p); }
  }

  const beat = [[ra, 0], [la, 0], [rv, 0.16], [lv, 0.16]];
  c.update = (t, dt, st) => {
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

// ------------------------------------------------------------------ Texturas procedurales
function canvasTex(draw, w = 512, h = 256) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
function bands(colors, spot) {
  return canvasTex((g, w, h) => {
    for (let y = 0; y < h; y++) {
      const k = (Math.sin(y * 0.12) + Math.sin(y * 0.047 + 1.3)) * 0.5 + 0.5;
      g.fillStyle = colors[Math.floor(k * colors.length) % colors.length]; g.fillRect(0, y, w, 1);
      g.fillStyle = `rgba(0,0,0,${rnd() * 0.08})`; g.fillRect(0, y, w, 1);
    }
    if (spot) { g.fillStyle = spot; g.beginPath(); g.ellipse(w * 0.62, h * 0.64, 26, 14, 0, 0, 7); g.fill(); }
  });
}
function speckled(base, spots, n = 160, rmax = 10) {
  return canvasTex((g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < n; i++) { g.fillStyle = spots[i % spots.length]; g.globalAlpha = 0.35 + rnd() * 0.4; g.beginPath(); g.arc(rnd() * w, rnd() * h, 1 + rnd() * rmax, 0, 7); g.fill(); }
    g.globalAlpha = 1;
  });
}
function earthTex() {
  return canvasTex((g, w, h) => {
    g.fillStyle = '#1f5fbf'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#3e9b4f';
    for (let i = 0; i < 30; i++) { g.beginPath(); g.ellipse(rnd() * w, 40 + rnd() * (h - 80), 14 + rnd() * 40, 8 + rnd() * 26, rnd() * 3, 0, 7); g.fill(); }
    g.fillStyle = '#c8b27a';
    for (let i = 0; i < 8; i++) { g.beginPath(); g.ellipse(rnd() * w, 70 + rnd() * (h - 140), 8 + rnd() * 18, 5 + rnd() * 10, rnd() * 3, 0, 7); g.fill(); }
    g.fillStyle = '#f2f6ff'; g.fillRect(0, 0, w, 14); g.fillRect(0, h - 14, w, 14);
  });
}
function cloudsTex() {
  return canvasTex((g, w, h) => {
    g.clearRect(0, 0, w, h); g.fillStyle = '#fff';
    for (let i = 0; i < 70; i++) { g.globalAlpha = 0.25 + rnd() * 0.35; g.beginPath(); g.ellipse(rnd() * w, rnd() * h, 10 + rnd() * 30, 3 + rnd() * 6, 0, 0, 7); g.fill(); }
  });
}
const TEX = {};
function planetMat(key) {
  const T = TEX[key] ||= ({
    mercurio: () => speckled('#8f8f8f', ['#6d6d6d', '#a9a9a9']),
    venus: () => bands(['#e8c27a', '#dcb36a', '#f0d59a']),
    tierra: () => earthTex(),
    marte: () => speckled('#c1440e', ['#8a2f0a', '#d9772f', '#5e2106'], 220, 14),
    jupiter: () => bands(['#d8b48a', '#a97b50', '#efe0c8', '#b8865b', '#e3c9a3'], '#b5482e'),
    saturno: () => bands(['#e6d29a', '#c9ad6a', '#f1e4bd', '#d8bf84']),
    urano: () => bands(['#9fe3e8', '#a9e8ec', '#93d8de']),
    neptuno: () => bands(['#3f6fe0', '#365fc8', '#4b7cf0']),
  })[key]?.();
  return std(0xffffff, { map: T });
}
function makeRing(inner, outer) {
  const geo = new THREE.RingGeometry(inner, outer, 96);
  const tex = canvasTex((g, w) => { for (let x = 0; x < w; x++) { const a = 0.35 + 0.5 * Math.abs(Math.sin(x * 0.09) * Math.cos(x * 0.031)); g.fillStyle = `rgba(222,201,150,${a})`; g.fillRect(x, 0, 1, 4); } }, 256, 4);
  const pos = geo.attributes.position, uv = geo.attributes.uv, v = V3();
  for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i); uv.setXY(i, (v.length() - inner) / (outer - inner), 0.5); }
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }));
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
  const sun = new THREE.Mesh(new THREE.SphereGeometry(13, 48, 32), new THREE.MeshStandardMaterial({ color: 0xffc94a, emissive: 0xff9d00, emissiveIntensity: 1.1,
    map: speckled('#ffcf4a', ['#ffb000', '#fff0a0'], 300, 6) }));
  c.addPart('sol', [sun], { parent: tilt });
  const glow = new THREE.Mesh(new THREE.SphereGeometry(16, 32, 16), new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.18 }));
  tilt.add(glow);
  const planets = [];
  for (const [key, r, d, period] of PLANETS) {
    const orbit = new THREE.Mesh(new THREE.RingGeometry(d - 0.25, d + 0.25, 128), new THREE.MeshBasicMaterial({ color: 0x8fa3ff, transparent: true, opacity: 0.28, side: THREE.DoubleSide }));
    orbit.rotation.x = -Math.PI / 2; tilt.add(orbit);
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 20), planetMat(key));
    if (key === 'saturno') m.add(makeRing(r * 1.3, r * 2.2));
    c.addPart(key, [m], { parent: tilt, center: V3(1, 0, 0) });
    planets.push({ m, d, period, a: rnd() * Math.PI * 2 });
  }
  c.applyExplode = () => {};
  c.update = (t, dt, st) => {
    const sp = (st.animate ? 1 : 0) * (st.quiz ? 0.15 : 1) * (st.speed || 1);
    for (const p of planets) { p.a += (dt * sp * 0.9) / Math.sqrt(p.period); p.m.position.set(Math.cos(p.a) * p.d, 0, -Math.sin(p.a) * p.d); p.m.rotation.y += dt * 0.8 * sp; }
    sun.rotation.y += dt * 0.1;
  };
  c.group.scale.setScalar(0.62);
  return c;
}

function buildPlanet(key) {
  const c = new Content3D(key);
  const def = PLANETS.find(p => p[0] === key), realR = def[4];
  const DIDACTIC = 22, JUPITER_REAL = 40;
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 40), planetMat(key));
  c.addPart(key, [m]);
  let ring = null, moon = null, clouds = null;
  if (key === 'saturno') { ring = makeRing(1.3, 2.2); c.addPart('anillos', [ring], { center: V3(0, -1, 0) }); }
  if (key === 'tierra') {
    moon = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), std(0xffffff, { map: speckled('#bdbdbd', ['#9a9a9a', '#d4d4d4'], 120, 8) }));
    c.addPart('luna', [moon], { center: V3(1, 0, 0) });
    clouds = new THREE.Mesh(new THREE.SphereGeometry(1.015, 48, 32), new THREE.MeshStandardMaterial({ map: cloudsTex(), transparent: true, depthWrite: false }));
    m.add(clouds);
  }
  let r = DIDACTIC, a = 0;
  c.update = (t, dt, st) => {
    const target = st.realScale ? (realR / 11.2) * JUPITER_REAL : DIDACTIC;
    r += (target - r) * Math.min(1, dt * 4);
    m.scale.setScalar(r);
    const sp = (st.animate ? 1 : 0) * (st.speed || 1);
    m.rotation.y += dt * 0.6 * sp; if (clouds) clouds.rotation.y += dt * 0.15 * sp;
    if (ring) ring.scale.setScalar(r);
    if (moon) { a += dt * 0.7 * sp; moon.scale.setScalar(r * 0.27); moon.position.set(Math.cos(a) * r * 2.2, r * 0.3, Math.sin(a) * r * 2.2); }
  };
  c.applyExplode = () => {};
  return c;
}

// ------------------------------------------------------------------ Moléculas (coordenadas en Å)
export const ELEMENT_STYLE = { H: { color: 0xf5f5f5, r: 0.55 }, C: { color: 0x404040, r: 0.85 }, O: { color: 0xe53935, r: 0.8 }, N: { color: 0x3050f8, r: 0.8 } };
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
    const m = new THREE.Mesh(new THREE.SphereGeometry(e.r * S * 0.42, 40, 28), std(e.color, { roughness: 0.3 }));
    m.position.copy(pos[i]); (byEl[el] ||= []).push(m);
  });
  const bonds = [], bondMat = std(0xb0b7c3, { roughness: 0.35 });
  for (const [a, b, order] of data.bonds) {
    const pa = pos[a], pb = pos[b], dir = pb.clone().sub(pa).normalize(), len = pa.distanceTo(pb);
    let perp = dir.clone().cross(V3(0, 0, 1)); if (perp.lengthSq() < 1e-3) perp = dir.clone().cross(V3(1, 0, 0)); perp.normalize();
    const offs = order === 2 ? [-3.6, 3.6] : order === 3 ? [-4.5, 0, 4.5] : [0];
    for (const o of offs) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(order > 1 ? 2.0 : 2.6, order > 1 ? 2.0 : 2.6, len, 16), bondMat);
      m.position.copy(pa).add(pb).multiplyScalar(0.5).addScaledVector(perp, o);
      m.quaternion.setFromUnitVectors(V3(0, 1, 0), dir);
      bonds.push(m);
    }
  }
  if (data.aromatic) {
    const t = new THREE.Mesh(new THREE.TorusGeometry(data.aromatic * S, 1.4, 12, 64), std(0x9ad0ff, { roughness: 0.3, transparent: true, opacity: 0.8 }));
    bonds.push(t);
  }
  for (const [el, meshes] of Object.entries(byEl)) {
    const center = meshes.reduce((s, m) => s.add(m.position), V3()).divideScalar(meshes.length);
    c.addPart(el, meshes, { parent: spin, center: center.lengthSq() < 4 ? V3(0, -1, 0) : center });
  }
  if (data.lonePair) {
    const lp = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), std(0x7f9cff, { transparent: true, opacity: 0.35, roughness: 0.2 }));
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
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true })); s.scale.setScalar(size); s.renderOrder = 10;
  return s;
}

// ------------------------------------------------------------------ Tarjetas de átomos (para reacciones)
const VALENCE = { H: 1, O: 6, C: 4, N: 5 };
function buildAtomCard(sym) {
  const c = new Content3D('atom_' + sym);
  const e = ELEMENT_STYLE[sym];
  const m = new THREE.Mesh(new THREE.SphereGeometry(e.r * 26, 48, 32), std(e.color, { roughness: 0.3 }));
  c.addPart('atomo', [m]);
  const label = textSprite(sym, sym === 'H' ? '#111' : '#fff', 18); label.position.set(0, 0, e.r * 26 + 2); c.group.add(label);
  const els = [];
  const n = VALENCE[sym];
  for (let i = 0; i < n; i++) { const el = new THREE.Mesh(new THREE.SphereGeometry(2.2, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffe066 })); c.group.add(el); els.push(el); }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(e.r * 26 + 10, 0.5, 8, 64), new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.35 }));
  c.group.add(ring);
  c.applyExplode = () => {};
  c.update = (t, dt, st) => { const R = e.r * 26 + 10; els.forEach((el, i) => { const a = t * (st.animate ? 1.2 : 0) + i * Math.PI * 2 / n; el.position.set(Math.cos(a) * R, Math.sin(a) * R, 0); }); };
  return c;
}

// ------------------------------------------------------------------ Átomo de Bohr
function buildBohr(elements) {
  const c = new Content3D('bohr');
  const tilt = new THREE.Group(); tilt.rotation.x = 0.35; c.group.add(tilt);
  const MAX = 10;
  const pGeo = new THREE.SphereGeometry(2.6, 20, 14);
  const protons = new THREE.InstancedMesh(pGeo, std(0xe74c3c, { roughness: 0.35 }), MAX);
  const neutrons = new THREE.InstancedMesh(pGeo, std(0x9aa3b2, { roughness: 0.35 }), MAX);
  const electrons = new THREE.InstancedMesh(new THREE.SphereGeometry(2.2, 16, 12), std(0xffd54a, { emissive: 0x6b5300, roughness: 0.3 }), MAX);
  const shell1 = new THREE.Mesh(new THREE.TorusGeometry(24, 0.8, 10, 96), std(0x8fa3ff, { transparent: true, opacity: 0.6 }));
  const shell2 = new THREE.Mesh(new THREE.TorusGeometry(40, 0.8, 10, 128), std(0x8fa3ff, { transparent: true, opacity: 0.6 }));
  c.addPart('nucleo', [protons, neutrons], { parent: tilt, center: V3(0, -1, 0) });
  c.addPart('capa_1', [shell1], { parent: tilt, labelPos: V3(0, 24, 0), center: V3(-1, 0, 0) });
  c.addPart('capa_2', [shell2], { parent: tilt, labelPos: V3(0, -40, 0), center: V3(1, 0, 0) });
  c.addPart('electrones', [electrons], { parent: tilt, labelPos: V3(24, 0, 0), center: V3(0, 1, 0) });
  c.explodeDistance = 0;
  const tmp = new THREE.Object3D();
  let current = null;
  c.element = null;
  c.setElement = z => {
    const el = elements.find(e => e.Z === z) || elements[5];
    current = el; c.element = el;
    const A = el.Z + el.N, R = 2.6 * Math.cbrt(A) * 1.25;
    const pts = [];
    for (let i = 0; i < A; i++) { // empaquetado en espiral de Fibonacci
      const y = A === 1 ? 0 : 1 - (i / (A - 1)) * 2, rr = Math.sqrt(1 - y * y), th = i * 2.399963;
      pts.push(V3(Math.cos(th) * rr, y, Math.sin(th) * rr).multiplyScalar(A === 1 ? 0 : R * 0.75));
    }
    const order = pts.map((p, i) => i);
    let pi = 0, ni = 0;
    order.forEach((i, k) => {
      tmp.position.copy(pts[i]); tmp.updateMatrix();
      if ((k % 2 === 0 && pi < el.Z) || ni >= el.N) protons.setMatrixAt(pi++, tmp.matrix); else neutrons.setMatrixAt(ni++, tmp.matrix);
    });
    protons.count = el.Z; neutrons.count = el.N;
    protons.instanceMatrix.needsUpdate = neutrons.instanceMatrix.needsUpdate = true;
    electrons.count = el.Z;
    shell2.visible = el.Z > 2;
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
