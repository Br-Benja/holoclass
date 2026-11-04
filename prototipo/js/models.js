// =====================================================================
//  HoloClass · Modelos 3D procedurales del prototipo (unidades: mm)
//  Ejes locales: X derecha, Y arriba, Z hacia el observador (sale de la tarjeta)
//  En la versión final el corazón será un GLB anatómico preparado en Blender.
// =====================================================================
import * as THREE from 'three';

const HIGHLIGHT = new THREE.Color(0x22d3ee);

/** Contenedor común: partes seleccionables, resaltado, explosión, etiquetas */
class Content3D {
  constructor(key) {
    this.key = key;
    this.group = new THREE.Group();
    this.parts = {};        // partKey -> { group, meshes[], labelMesh, labelPos, home, dir }
    this.highlighted = null;
  }
  addPart(key, meshes, { labelMesh = null, labelPos = new THREE.Vector3(), center = null, parent = this.group } = {}) {
    const g = new THREE.Group();
    g.name = key;
    meshes.forEach(m => {
      m.userData.partKey = key;
      m.userData.content = this;
      m.userData.baseScale = m.scale.clone();
      m.material = m.material.clone();
      m.material.userData.baseOpacity = m.material.opacity;
      m.material.userData.baseEmissive = m.material.emissive ? m.material.emissive.clone() : null;
      g.add(m);
    });
    parent.add(g);
    const c = center || (meshes[0] ? meshes[0].position.clone() : new THREE.Vector3());
    const dir = c.lengthSq() > 1e-6 ? c.clone().normalize() : new THREE.Vector3(0, 1, 0);
    this.parts[key] = { group: g, meshes, labelMesh: labelMesh || meshes[0], labelPos, home: g.position.clone(), dir };
    return g;
  }
  get pickables() { return Object.values(this.parts).flatMap(p => p.meshes); }
  setHighlight(key) {
    this.highlighted = key;
    for (const [k, p] of Object.entries(this.parts)) {
      for (const m of p.meshes) {
        const mat = m.material;
        if (mat.emissive) {
          if (k === key) { mat.emissive.copy(HIGHLIGHT); mat.emissiveIntensity = 0.55; }
          else { mat.emissive.copy(mat.userData.baseEmissive); mat.emissiveIntensity = mat.userData.baseEmissiveIntensity ?? 1; }
        }
        const dim = key && k !== key;
        mat.transparent = dim || mat.userData.baseOpacity < 1;
        mat.opacity = dim ? 0.28 : mat.userData.baseOpacity;
        mat.depthWrite = !dim;
      }
    }
  }
  labelWorldPos(key, out) {
    const p = this.parts[key];
    return p.labelMesh.localToWorld(out.copy(p.labelPos));
  }
  applyExplode(amount, distance = 18) {
    for (const p of Object.values(this.parts)) {
      p.group.position.copy(p.home).addScaledVector(p.dir, amount * distance);
    }
  }
  update() {}
}

const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.05, ...extra });

// ---------------------------------------------------------------- Corazón
function buildHeart() {
  const c = new Content3D('heart');
  const sphere = new THREE.SphereGeometry(1, 40, 28);
  const ell = (sx, sy, sz, x, y, z, color, rz = 0) => {
    const m = new THREE.Mesh(sphere, std(color));
    m.scale.set(sx, sy, sz); m.position.set(x, y, z); m.rotation.z = rz;
    return m;
  };
  // Lado izquierdo del corazón = +X (derecha del observador al ver el corazón de frente)
  const vi = ell(15, 22, 15, 7, -9, 0, 0xc0392b, 0.35);
  const vd = ell(13, 18, 12, -7, -6, 5, 0x4a5fc1, -0.15);
  const ai = ell(10, 8, 9, 12, 9, -5, 0xd64541);
  const ad = ell(10, 9, 9, -13, 9, 0, 0x5468c8);
  c.addPart('ventriculo_izq', [vi]);
  c.addPart('ventriculo_der', [vd]);
  c.addPart('auricula_izq', [ai]);
  c.addPart('auricula_der', [ad]);

  const tube = (pts, r, color) => {
    const curve = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p)));
    const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 64, r, 16, false), std(color));
    m.userData.curve = curve;
    return m;
  };
  const aorta = tube([[3, 4, 1], [2, 20, 1], [5, 31, -1], [13, 31, -4], [17, 20, -8], [17, 4, -10]], 3.6, 0xe74c3c);
  const pulm = tube([[-4, 2, 7], [-3, 15, 8], [1, 22, 7], [-8, 25, 4], [-16, 23, 2]], 3.0, 0x3b6fd8);
  c.addPart('aorta', [aorta], { labelPos: new THREE.Vector3(6, 32, -1), center: new THREE.Vector3(8, 25, -3) });
  c.addPart('arteria_pulm', [pulm], { labelPos: new THREE.Vector3(-8, 25, 5), center: new THREE.Vector3(-6, 20, 6) });

  const cyl = (h, r, x, y, z) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 20), std(0x2c4fa3));
    m.position.set(x, y, z); return m;
  };
  const vcs = cyl(20, 3.2, -17, 22, -2);
  const vci = cyl(12, 3.4, -13, -4, -9);
  c.addPart('vena_cava', [vcs, vci], { labelPos: new THREE.Vector3(0, 10, 0), labelMesh: vcs, center: new THREE.Vector3(-16, 14, -4) });

  // Partículas de flujo sanguíneo (sobre la aorta y la arteria pulmonar)
  const flow = new THREE.Group(); flow.visible = false; c.group.add(flow);
  const pGeo = new THREE.SphereGeometry(1.1, 8, 6);
  const particles = [];
  [[aorta, 0xff3b30], [pulm, 0x7aa2ff]].forEach(([mesh, color]) => {
    for (let i = 0; i < 14; i++) {
      const p = new THREE.Mesh(pGeo, new THREE.MeshBasicMaterial({ color }));
      p.userData = { curve: mesh.userData.curve, t: i / 14, owner: mesh };
      flow.add(p); particles.push(p);
    }
  });

  const beatParts = [[ad, 0], [ai, 0], [vd, 0.18], [vi, 0.18]];
  c.update = (t, dt, st) => {
    if (st.beat) {
      const period = 0.85; // ~70 latidos por minuto
      for (const [m, phase] of beatParts) {
        const x = ((t / period - phase) % 1 + 1) % 1;
        const pulse = x < 0.25 ? Math.sin((x / 0.25) * Math.PI) : 0;
        m.scale.copy(m.userData.baseScale).multiplyScalar(1 - 0.08 * pulse);
      }
    }
    flow.visible = !!st.flow;
    if (st.flow) for (const p of particles) {
      p.userData.t = (p.userData.t + dt * 0.35) % 1;
      p.position.copy(p.userData.curve.getPointAt(p.userData.t)).add(p.userData.owner.parent.position);
    }
  };
  c.group.scale.setScalar(1.15);
  return c;
}

// ---------------------------------------------------------------- Texturas procedurales simples
function bandTexture(colors, noise = 0.15) {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 128;
  const g = cv.getContext('2d');
  for (let y = 0; y < 128; y++) {
    const c = colors[Math.floor((y / 128) * colors.length * 3) % colors.length];
    g.fillStyle = c; g.fillRect(0, y, 256, 1);
    g.fillStyle = `rgba(0,0,0,${Math.random() * noise})`; g.fillRect(0, y, 256, 1);
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function earthTexture() {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 128;
  const g = cv.getContext('2d');
  g.fillStyle = '#1f5fbf'; g.fillRect(0, 0, 256, 128);
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  g.fillStyle = '#3e9b4f';
  for (let i = 0; i < 26; i++) { g.beginPath(); g.ellipse(rnd() * 256, 20 + rnd() * 88, 8 + rnd() * 22, 5 + rnd() * 14, rnd() * 3, 0, 7); g.fill(); }
  g.fillStyle = '#f2f6ff'; g.fillRect(0, 0, 256, 7); g.fillRect(0, 121, 256, 7);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}

const PLANETS = [
  // key, radio didáctico, distancia, periodo relativo, color/textura, radio real relativo (Tierra = 1)
  ['mercurio', 1.6, 24, 0.24, '#9e9e9e', 0.38],
  ['venus', 2.6, 32, 0.62, '#e8c27a', 0.95],
  ['tierra', 2.8, 41, 1.0, 'earth', 1.0],
  ['marte', 2.1, 50, 1.88, '#c1440e', 0.53],
  ['jupiter', 7.0, 64, 11.9, ['#d8b48a', '#a97b50', '#efe0c8', '#b8865b'], 11.2],
  ['saturno', 6.0, 81, 29.5, ['#e6d29a', '#c9ad6a', '#f1e4bd'], 9.45],
  ['urano', 4.0, 95, 84, '#9fe3e8', 4.0],
  ['neptuno', 3.9, 107, 165, '#3f6fe0', 3.88],
];
function planetMaterial(spec) {
  if (spec === 'earth') return std(0xffffff, { map: earthTexture() });
  if (Array.isArray(spec)) return std(0xffffff, { map: bandTexture(spec) });
  return std(spec);
}
function makeRing(inner, outer) {
  const m = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 64),
    new THREE.MeshStandardMaterial({ color: 0xd9c38f, side: THREE.DoubleSide, transparent: true, opacity: 0.75 }));
  m.rotation.x = -Math.PI / 2 + 0.35;
  return m;
}

// ---------------------------------------------------------------- Sistema solar
function buildSolar() {
  const c = new Content3D('solar');
  const tilt = new THREE.Group(); tilt.rotation.x = 0.5; c.group.add(tilt);
  const sun = new THREE.Mesh(new THREE.SphereGeometry(13, 40, 24),
    new THREE.MeshStandardMaterial({ color: 0xffc94a, emissive: 0xff9d00, emissiveIntensity: 1.1 }));
  sun.material.userData.baseEmissiveIntensity = 1.1;
  c.addPart('sol', [sun], { parent: tilt });
  const planets = [];
  for (const [key, r, d, period, spec] of PLANETS) {
    const orbit = new THREE.Mesh(new THREE.RingGeometry(d - 0.25, d + 0.25, 96),
      new THREE.MeshBasicMaterial({ color: 0x8fa3ff, transparent: true, opacity: 0.25, side: THREE.DoubleSide }));
    orbit.rotation.x = -Math.PI / 2; tilt.add(orbit);
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 28, 18), planetMaterial(spec));
    const meshes = [m];
    if (key === 'saturno') { const ring = makeRing(r * 1.3, r * 2.1); m.add(ring); }
    const pg = c.addPart(key, meshes, { parent: tilt, center: new THREE.Vector3(1, 0, 0) });
    const angle0 = Math.random() * Math.PI * 2;
    planets.push({ pg, m, d, period, angle: angle0 });
  }
  c.applyExplode = () => {}; // sin vista explosionada en el sistema solar
  c.update = (t, dt, st) => {
    const speed = st.quiz ? 0.15 : 1;
    for (const p of planets) {
      p.angle += (dt * speed * 0.9) / Math.sqrt(p.period);
      p.m.position.set(Math.cos(p.angle) * p.d, 0, -Math.sin(p.angle) * p.d);
      p.m.rotation.y += dt * 0.8;
    }
    sun.rotation.y += dt * 0.1;
  };
  c.group.scale.setScalar(0.62);
  return c;
}

// ---------------------------------------------------------------- Planeta individual (comparación a escala)
function buildPlanet(key) {
  const c = new Content3D(key);
  const def = PLANETS.find(p => p[0] === key);
  const realR = def[5];
  const DIDACTIC = 22, JUPITER_REAL = 40; // en escala real Júpiter mide 40 mm de radio
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), planetMaterial(def[4]));
  m.position.set(0, 0, 0);
  c.addPart(key, [m]);
  let ring = null, moon = null;
  if (key === 'saturno') {
    ring = makeRing(1.3, 2.2);
    c.addPart('anillos', [ring], { center: new THREE.Vector3(0, -1, 0) });
  }
  if (key === 'tierra') {
    moon = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), std(0xbdbdbd));
    c.addPart('luna', [moon], { center: new THREE.Vector3(1, 0, 0) });
  }
  let r = DIDACTIC, a = 0;
  c.update = (t, dt, st) => {
    const target = st.realScale ? (realR / 11.2) * JUPITER_REAL : DIDACTIC;
    r += (target - r) * Math.min(1, dt * 4);
    m.scale.setScalar(r);
    m.rotation.y += dt * 0.6;
    if (ring) ring.scale.setScalar(r);
    if (moon) { a += dt * 0.7; moon.scale.setScalar(r * 0.27); moon.position.set(Math.cos(a) * r * 2.2, r * 0.3, Math.sin(a) * r * 2.2); }
  };
  c.applyExplode = () => {};
  return c;
}

// ---------------------------------------------------------------- Moléculas (desde coordenadas en Å)
const ELEMENTS = { H: { color: 0xf5f5f5, r: 0.55 }, C: { color: 0x404040, r: 0.85 }, O: { color: 0xe53935, r: 0.8 }, N: { color: 0x3050f8, r: 0.8 } };
const MOLECULES = {
  h2o: { atoms: [['O', 0, -0.2, 0], ['H', 0.757, 0.386, 0], ['H', -0.757, 0.386, 0]], bonds: [[0, 1, 1], [0, 2, 1]] },
  co2: { atoms: [['C', 0, 0, 0], ['O', 1.16, 0, 0], ['O', -1.16, 0, 0]], bonds: [[0, 1, 2], [0, 2, 2]] },
  ch4: { atoms: [['C', 0, 0, 0], ['H', 0.629, 0.629, 0.629], ['H', -0.629, -0.629, 0.629], ['H', -0.629, 0.629, -0.629], ['H', 0.629, -0.629, -0.629]],
         bonds: [[0, 1, 1], [0, 2, 1], [0, 3, 1], [0, 4, 1]] },
};
function buildMolecule(key) {
  const c = new Content3D(key);
  const S = 40; // mm por Å (escala didáctica)
  const data = MOLECULES[key];
  const spin = new THREE.Group(); c.group.add(spin);
  const byEl = {};
  const pos = data.atoms.map(([el, x, y, z]) => new THREE.Vector3(x, y, z).multiplyScalar(S));
  data.atoms.forEach(([el], i) => {
    const e = ELEMENTS[el];
    const m = new THREE.Mesh(new THREE.SphereGeometry(e.r * S * 0.45, 32, 20), std(e.color, { roughness: 0.35 }));
    m.position.copy(pos[i]);
    (byEl[el] ||= []).push(m);
  });
  const bonds = [];
  const bondMat = std(0xb0b7c3, { roughness: 0.4 });
  for (const [a, b, order] of data.bonds) {
    const pa = pos[a], pb = pos[b];
    const len = pa.distanceTo(pb);
    const offsets = order === 2 ? [-3.8, 3.8] : [0];
    for (const off of offsets) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, len, 14), bondMat);
      m.position.copy(pa).add(pb).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), pb.clone().sub(pa).normalize());
      m.translateX(off);
      bonds.push(m);
    }
  }
  for (const [el, meshes] of Object.entries(byEl)) {
    const center = meshes.reduce((s, m) => s.add(m.position), new THREE.Vector3()).divideScalar(meshes.length);
    c.addPart(el, meshes, { parent: spin, center: center.lengthSq() < 1 ? new THREE.Vector3(0, -1, 0) : center });
  }
  c.addPart('enlaces', bonds, { parent: spin, center: new THREE.Vector3(0, 0, 0.0001) });
  c.applyExplode = function (amount) { // separa átomos del centro, manteniendo enlaces
    for (const [k, p] of Object.entries(this.parts)) if (k !== 'enlaces') p.group.position.copy(p.home).addScaledVector(p.dir, amount * 10);
  };
  c.update = (t, dt, st) => { if (!st.pinned) spin.rotation.y += dt * 0.5; };
  return c;
}

export function buildContent(key) {
  let c;
  switch (key) {
    case 'heart': c = buildHeart(); break;
    case 'solar': c = buildSolar(); break;
    case 'earth': c = buildPlanet('tierra'); break;
    case 'jupiter': c = buildPlanet('jupiter'); break;
    case 'saturn': c = buildPlanet('saturno'); break;
    default: c = buildMolecule(key);
  }
  c.contentKey = key;
  return c;
}
