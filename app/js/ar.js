// =====================================================================
//  HoloClass · Motor de realidad aumentada (HoloScan + render)
//  Cámara -> Web Worker (js-aruco2: detección + POSIT) -> filtro One-Euro -> Three.js
// =====================================================================
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildContent } from './models.js';

export const MARKER_MM = 50;        // lado del marcador impreso (mm)
const DETECT_W = 640;               // ancho del frame que se analiza
const CONFIRM_FRAMES = 2;           // frames seguidos para confirmar un marcador
const KEEP_MS = 600, FADE_MS = 1500; // retención y desvanecido al perder la tarjeta
const REACT_ON = 110, REACT_OFF = 145; // distancia (mm) para “reaccionar” dos tarjetas de átomos

// ------------------------------------------------------------------ Filtro One-Euro (Casiez et al., 2012)
class OneEuro {
  constructor(minCutoff, beta, dCutoff = 1) { Object.assign(this, { minCutoff, beta, dCutoff }); this.reset(); }
  reset() { this.x = null; this.dx = 0; this.t = null; }
  static alpha(cutoff, dt) { const tau = 1 / (2 * Math.PI * cutoff); return 1 / (1 + tau / dt); }
  filter(v, t) {
    if (this.x === null) { this.x = v; this.t = t; return v; }
    const dt = Math.max(1e-3, t - this.t); this.t = t;
    const dv = (v - this.x) / dt;
    this.dx += OneEuro.alpha(this.dCutoff, dt) * (dv - this.dx);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    this.x += OneEuro.alpha(cutoff, dt) * (v - this.x);
    return this.x;
  }
}
class PoseFilter {
  constructor() { this.p = [0, 1, 2].map(() => new OneEuro(1.2, 0.012)); this.q = [0, 1, 2, 3].map(() => new OneEuro(1.5, 0.9)); this.lastQ = null; }
  reset() { [...this.p, ...this.q].forEach(f => f.reset()); this.lastQ = null; }
  apply(pos, quat, t) {
    if (this.lastQ && this.lastQ.dot(quat) < 0) quat.set(-quat.x, -quat.y, -quat.z, -quat.w);
    pos.set(this.p[0].filter(pos.x, t), this.p[1].filter(pos.y, t), this.p[2].filter(pos.z, t));
    quat.set(this.q[0].filter(quat.x, t), this.q[1].filter(quat.y, t), this.q[2].filter(quat.z, t), this.q[3].filter(quat.w, t)).normalize();
    this.lastQ = quat.clone();
  }
}

// Pose POSIT (x der, y arriba, z hacia la escena) -> Three.js (z hacia el observador),
// con espejo horizontal F para coincidir con el video espejado:  M = F·S·R·S·F
const _m = new THREE.Matrix4(), _s = new THREE.Vector3();
function poseToThree(r, t, pos, quat) {
  _m.set(
     r[0][0], -r[0][1],  r[0][2], -t[0],
    -r[1][0],  r[1][1], -r[1][2],  t[1],
     r[2][0], -r[2][1],  r[2][2], -t[2],
     0, 0, 0, 1);
  _m.decompose(pos, quat, _s);
}
const easeOutBack = x => { const c1 = 1.4, c3 = c1 + 1; return x >= 1 ? 1 : 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };

export class ARView {
  constructor({ stage, glHost, labels, video, sim, catalog, store }) {
    Object.assign(this, { stage, glHost, labelsEl: labels, video, simCanvas: sim, catalog, store });
    this.on = {};                      // callbacks: confirmed, lost, reaction, pick, status, frame
    this.st = { animate: true, flow: false, explode: 0, cut: 0, speed: 1, realScale: false, element: 6, quiz: false, pinned: false, labels: true };
    this.source = 'none'; this.simIds = []; this.pinned = false; this.active = null;
    this.anchors = new Map(); this.reaction = null;
    this.focal = DETECT_W; this.detectH = 480; this.busy = false; this.lastDetectMs = 0; this.brightness = 128; this.lastSeenAny = performance.now();
    this.fps = 0; this.fpsSamples = []; this.lowFpsSince = null;
    this.detectCanvas = document.createElement('canvas');
    this.detectCtx = this.detectCanvas.getContext('2d', { willReadFrequently: true });
    this.simCtx = sim.getContext('2d');

    const r = this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    r.setPixelRatio(Math.min(devicePixelRatio, 1.5)); r.outputColorSpace = THREE.SRGBColorSpace; r.localClippingEnabled = true;
    glHost.appendChild(r.domElement);
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x334466, 1.1));
    const dl = new THREE.DirectionalLight(0xffffff, 1.7); dl.position.set(0.5, 1, 1.2); this.scene.add(dl);
    this.arCamera = new THREE.PerspectiveCamera(41, 4 / 3, 1, 8000);
    this.arRoot = new THREE.Group(); this.scene.add(this.arRoot);
    this.pinCamera = new THREE.PerspectiveCamera(42, 4 / 3, 1, 8000); this.pinCamera.position.set(0, 25, 230);
    this.controls = new OrbitControls(this.pinCamera, r.domElement);
    Object.assign(this.controls, { enableDamping: true, minDistance: 50, maxDistance: 650, enabled: false });
    this.pinRoot = new THREE.Group(); this.scene.add(this.pinRoot);
    this.pinnedContent = null; this.camTween = null;

    new ResizeObserver(() => this.resize()).observe(stage);
    this.setupPicking();
    this.loadCalibration().then(() => this.configureSize(640, 480));
    this.initWorker();
    this.last = performance.now();
    this.running = true;
    requestAnimationFrame(t => this.loop(t));
  }

  // ---------------------------------------------------------------- Detección (Worker con respaldo en el hilo principal)
  initWorker() {
    try {
      this.worker = new Worker(new URL('./aruco-worker.js', import.meta.url));
      this.worker.onmessage = e => this.onWorker(e.data);
      this.worker.onerror = err => { console.warn('Worker no disponible, se usa el hilo principal', err); this.worker = null; this.busy = false; };
    } catch (e) { this.worker = null; }
    if (!this.worker) this.initMainThreadDetector();
  }
  initMainThreadDetector() {
    this.mainDetector = new AR.Detector({ dictionaryName: 'ARUCO_MIP_36h12', maxHammingDistance: 5 });
    this.mainPosit = new POS.Posit(MARKER_MM, this.focal);
  }
  async loadCalibration() {
    try {
      const c = await (await fetch('./camera.json', { cache: 'no-store' })).json();
      if (c.calibrated && c.fx && c.width) this.calibration = c;
    } catch { /* sin calibración: se usa un campo de visión típico */ }
  }
  configureSize(vw, vh) {
    this.detectH = Math.round(DETECT_W * vh / vw);
    this.detectCanvas.width = DETECT_W; this.detectCanvas.height = this.detectH;
    const cal = this.calibration;
    this.focal = cal && Math.abs(cal.width / cal.height - vw / vh) < 0.05 ? cal.fx * DETECT_W / cal.width : DETECT_W * (this.fovFactor || 1);
    this.arCamera.fov = THREE.MathUtils.radToDeg(2 * Math.atan((this.detectH / 2) / this.focal));
    this.arCamera.aspect = DETECT_W / this.detectH; this.arCamera.updateProjectionMatrix();
    this.stage.style.aspectRatio = `${vw} / ${vh}`;
    if (this.worker) this.worker.postMessage({ type: 'init', focal: this.focal, markerMM: MARKER_MM });
    if (this.mainDetector) this.mainPosit = new POS.Posit(MARKER_MM, this.focal);
    this.resize();
  }
  resize() {
    const w = this.stage.clientWidth, h = this.stage.clientHeight; if (!w || !h) return;
    this.renderer.setSize(w, h); this.pinCamera.aspect = w / h; this.pinCamera.updateProjectionMatrix();
  }
  grabFrame() {
    const src = this.source === 'sim' ? this.simCanvas : this.video;
    if (this.source === 'camera' && this.video.readyState < 2) return null;
    this.detectCtx.drawImage(src, 0, 0, DETECT_W, this.detectH);
    return this.detectCtx.getImageData(0, 0, DETECT_W, this.detectH);
  }
  detect(now) {
    if (this.busy) return;
    const img = this.grabFrame(); if (!img) return;
    if (this.worker) {
      this.busy = true; this.sentAt = now;
      this.worker.postMessage({ type: 'frame', width: img.width, height: img.height, buffer: img.data.buffer }, [img.data.buffer]);
      if (now - (this.workerWatch || now) > 3000) { /* noop */ }
    } else {
      const t0 = performance.now();
      const found = this.mainDetector.detect(img);
      const markers = found.map(mk => {
        const corners = mk.corners.map(c => ({ x: c.x - img.width / 2, y: img.height / 2 - c.y }));
        const pose = this.mainPosit.pose(corners);
        return { id: mk.id, rotation: pose.bestRotation, translation: pose.bestTranslation };
      });
      let sum = 0, n = 0; for (let i = 0; i < img.data.length; i += 4 * 97) { sum += img.data[i]; n++; }
      this.onWorker({ type: 'result', markers, ms: performance.now() - t0, brightness: sum / n });
    }
  }
  onWorker(msg) {
    if (msg.type !== 'result') return;
    this.busy = false; this.lastDetectMs = msg.ms; this.brightness = msg.brightness;
    if (this.pinned || this.source === 'none') return;
    const now = performance.now(), t = now / 1000, seen = new Set();
    for (const mk of msg.markers) {
      if (!this.catalog.markers[mk.id]) continue;
      const a = this.getAnchor(mk.id);
      poseToThree(mk.rotation, mk.translation, a.targetPos, a.targetQuat);
      a.filter.apply(a.targetPos, a.targetQuat, t);
      a.lastSeen = now; a.streak++; seen.add(mk.id);
      if (a.lostReported) a.lostReported = false;
      if (!a.confirmed && a.streak >= CONFIRM_FRAMES) { a.confirmed = true; this.on.confirmed?.(a); }
    }
    for (const a of this.anchors.values()) if (!seen.has(a.id)) a.streak = 0;
    if (seen.size) this.lastSeenAny = now;
  }

  // ---------------------------------------------------------------- Anclas
  getAnchor(id) {
    if (this.anchors.has(id)) return this.anchors.get(id);
    const group = new THREE.Group(); group.visible = false;
    const holder = new THREE.Group(); holder.position.z = 38; group.add(holder);
    const content = buildContent(this.catalog.markers[id].model, this.catalog, this.store);
    holder.add(content.group); this.arRoot.add(group);
    const a = { id, group, holder, content, lastSeen: -1e9, streak: 0, confirmed: false, appear: 0, initialized: false, lostReported: false,
      targetPos: new THREE.Vector3(), targetQuat: new THREE.Quaternion(), filter: new PoseFilter() };
    this.anchors.set(id, a);
    return a;
  }
  clearAnchors() {
    for (const a of this.anchors.values()) this.arRoot.remove(a.group);
    this.anchors.clear();
    if (this.reaction) { this.arRoot.remove(this.reaction.group); this.reaction = null; }
  }
  updateAnchors(now, dt) {
    for (const a of this.anchors.values()) {
      if (!a.confirmed) continue;
      const since = now - a.lastSeen;
      if (since > KEEP_MS && !a.lostReported) { a.lostReported = true; this.on.lost?.(a); }
      if (since > FADE_MS) { a.confirmed = false; a.initialized = false; a.group.visible = false; a.appear = 0; a.filter.reset(); continue; }
      const target = since < KEEP_MS ? 1 : 1 - (since - KEEP_MS) / (FADE_MS - KEEP_MS);
      a.appear += (target - a.appear) * Math.min(1, dt * (target > a.appear ? 7 : 12));
      if (!a.initialized) { a.group.position.copy(a.targetPos); a.group.quaternion.copy(a.targetQuat); a.initialized = true; }
      const k = 1 - Math.exp(-dt * 25);
      a.group.position.lerp(a.targetPos, k); a.group.quaternion.slerp(a.targetQuat, k);
      a.group.visible = a.appear > 0.02;
      const inReaction = this.reaction?.active && (this.reaction.a === a || this.reaction.b === a);
      a.holder.scale.setScalar(Math.max(0.001, easeOutBack(a.appear) * (inReaction ? 0.35 : 1)));
    }
    this.updateReactions(dt);
  }
  // ---------------------------------------------------------------- Reacciones entre tarjetas de átomos
  updateReactions(dt) {
    const atoms = [...this.anchors.values()].filter(a => a.group.visible && a.content.contentKey.startsWith('atom_'));
    let best = null;
    for (let i = 0; i < atoms.length; i++) for (let j = i + 1; j < atoms.length; j++) {
      const A = atoms[i], B = atoms[j], sa = A.content.contentKey.slice(5), sb = B.content.contentKey.slice(5);
      const r = this.catalog.reactions.find(x => (x.a === sa && x.b === sb) || (x.a === sb && x.b === sa));
      if (!r) continue;
      const d = A.group.position.distanceTo(B.group.position);
      if (!best || d < best.d) best = { A, B, r, d };
    }
    const R = this.reaction;
    if (best && (best.d < REACT_ON || (R?.active && R.key === best.r.result && best.d < REACT_OFF))) {
      if (!R || R.key !== best.r.result) {
        if (R) this.arRoot.remove(R.group);
        const g = new THREE.Group(); const content = buildContent(best.r.result, this.catalog, this.store); g.add(content.group); this.arRoot.add(g);
        this.reaction = { key: best.r.result, group: g, content, a: best.A, b: best.B, active: true, appear: 0, info: best.r };
        this.on.reaction?.(best.r, content);
      }
      const X = this.reaction; X.a = best.A; X.b = best.B; X.active = true;
      X.group.position.copy(best.A.group.position).add(best.B.group.position).multiplyScalar(0.5).add(new THREE.Vector3(0, 0, 45));
      X.group.quaternion.copy(best.A.group.quaternion);
      X.appear = Math.min(1, X.appear + dt * 3); X.group.scale.setScalar(easeOutBack(X.appear)); X.group.visible = true;
    } else if (R) {
      R.active = false; R.appear = Math.max(0, R.appear - dt * 4); R.group.scale.setScalar(Math.max(0.001, R.appear));
      if (R.appear <= 0) { this.arRoot.remove(R.group); this.reaction = null; this.on.reaction?.(null); }
    }
  }

  visibleContents() {
    if (this.pinned) return this.pinnedContent ? [this.pinnedContent] : [];
    const out = [...this.anchors.values()].filter(a => a.group.visible).map(a => a.content);
    if (this.reaction?.group.visible) out.push(this.reaction.content);
    return out;
  }
  isVisible(c) { return this.visibleContents().includes(c); }

  // ---------------------------------------------------------------- Fuentes de video
  async listCameras() {
    try { return (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput'); } catch { return []; }
  }
  async startCamera(deviceId) {
    this.stopCamera();
    const constraints = { video: deviceId ? { deviceId: { exact: deviceId }, width: { ideal: 640 }, height: { ideal: 480 } } : { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }, audio: false };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    this.video.srcObject = stream; await this.video.play();
    this.source = 'camera'; this.video.hidden = false; this.simCanvas.hidden = true;
    this.configureSize(this.video.videoWidth || 640, this.video.videoHeight || 480);
    return stream;
  }
  stopCamera() { const s = this.video.srcObject; if (s) s.getTracks().forEach(t => t.stop()); this.video.srcObject = null; if (this.source === 'camera') this.source = 'none'; }
  startSim(ids) {
    this.stopCamera(); this.source = 'sim'; this.simIds = ids;
    this.simCanvas.width = 640; this.simCanvas.height = 480;
    this.video.hidden = true; this.simCanvas.hidden = false;
    this.configureSize(640, 480);
  }
  stopSources() { this.stopCamera(); this.source = 'none'; this.simIds = []; this.simCanvas.hidden = true; this.video.hidden = true; }
  markerImage(id) {
    this.markerImages ||= {};
    if (!this.markerImages[id]) {
      const svg = new AR.Dictionary('ARUCO_MIP_36h12').generateSVG(id);
      const img = new Image(); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); this.markerImages[id] = img;
    }
    return this.markerImages[id];
  }
  drawSim(t) {
    const g = this.simCtx, W = this.simCanvas.width, H = this.simCanvas.height;
    const grd = g.createLinearGradient(0, 0, 0, H); grd.addColorStop(0, '#8d97a8'); grd.addColorStop(1, '#5b6474');
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    const n = this.simIds.length, spacing = n > 1 ? 150 + 180 * (0.5 + 0.5 * Math.sin(t * 0.5)) : 0;
    this.simIds.forEach((id, i) => {
      const img = this.markerImage(id); if (!img.complete) return;
      const cx = W / 2 + (i - (n - 1) / 2) * spacing + (n > 1 ? 0 : Math.sin(t * 0.6) * 70);
      const cy = H / 2 + Math.sin(t * 0.9 + i * 2) * (n > 1 ? 15 : 35);
      const size = (n > 1 ? 110 : 150) * (1 + 0.1 * Math.sin(t * 0.7 + i));
      g.save(); g.translate(cx, cy); g.rotate(0.3 * Math.sin(t * 0.45 + i));
      g.transform(1, 0.08 * Math.sin(t * 0.8), 0.05 * Math.sin(t * 0.6), 1, 0, 0);
      g.fillStyle = '#fff'; g.shadowColor = 'rgba(0,0,0,.35)'; g.shadowBlur = 14;
      g.fillRect(-size * 0.7, -size * 0.7, size * 1.4, size * 1.4);
      g.shadowBlur = 0; g.imageSmoothingEnabled = false; g.drawImage(img, -size / 2, -size / 2, size, size); g.restore();
    });
  }

  // ---------------------------------------------------------------- Modo fijado
  enterPinned(key) {
    if (this.pinnedContent) this.pinRoot.remove(this.pinnedContent.group);
    this.pinnedContent = buildContent(key, this.catalog, this.store);
    this.pinRoot.add(this.pinnedContent.group);
    this.pinned = true; this.st.pinned = true; this.arRoot.visible = false; this.controls.enabled = true;
    this.resetView();
    this.stage.classList.add('pinned');
    return this.pinnedContent;
  }
  exitPinned() {
    this.pinned = false; this.st.pinned = false; this.arRoot.visible = true; this.controls.enabled = false;
    if (this.pinnedContent) { this.pinRoot.remove(this.pinnedContent.group); this.pinnedContent = null; }
    this.stage.classList.remove('pinned');
  }
  resetView() { this.controls.target.set(0, 0, 0); this.pinCamera.position.set(0, 20, 195); this.pinRoot.rotation.set(0, 0, 0); this.pinRoot.scale.setScalar(1); this.camTween = null; this.controls.update(); }
  focusPart(content, key) {
    if (!this.pinned || !content.parts[key]) return;
    const center = content.partWorldCenter(key);
    const dir = this.pinCamera.position.clone().sub(this.controls.target).normalize();
    const dist = Math.min(200, Math.max(120, this.pinCamera.position.distanceTo(this.controls.target) * 0.8));
    this.camTween = { t0: performance.now(), dur: 900, fromT: this.controls.target.clone(), toT: center, fromP: this.pinCamera.position.clone(), toP: center.clone().addScaledVector(dir, dist) };
  }
  rotatePinned(dx, dy) { this.pinRoot.rotation.y += dx; this.pinRoot.rotation.x = Math.max(-1.3, Math.min(1.3, this.pinRoot.rotation.x + dy)); }
  zoomPinned(f) { const s = Math.max(0.4, Math.min(3, this.pinRoot.scale.x * f)); this.pinRoot.scale.setScalar(s); }

  // ---------------------------------------------------------------- Selección (raycasting)
  setupPicking() {
    this.raycaster = new THREE.Raycaster(); let down = null;
    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; });
    el.addEventListener('pointerup', e => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return;
      const rect = el.getBoundingClientRect();
      this.pickAt(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1, true);
    });
  }
  /** Selecciona en coordenadas normalizadas (-1..1). Devuelve {content, key} o null. */
  pickAt(x, y, emit = false) {
    this.raycaster.setFromCamera(new THREE.Vector2(x, y), this.pinned ? this.pinCamera : this.arCamera);
    const pickables = this.visibleContents().flatMap(c => c.pickables);
    const hits = this.raycaster.intersectObjects(pickables, false);
    const hit = hits.find(h => this.st.quiz || [].concat(h.object.material).some(m => m.opacity > 0.3)) || hits[0];
    const res = hit ? { content: hit.object.userData.content, key: hit.object.userData.partKey } : null;
    if (emit) this.on.pick?.(res);
    return res;
  }

  // ---------------------------------------------------------------- Etiquetas
  buildLabels(content, names, onClick) {
    this.labelsEl.innerHTML = ''; this.labelEls = [];
    if (!content) return;
    for (const key of Object.keys(content.parts)) {
      if (!names[key]) continue;
      const el = document.createElement('div'); el.className = 'label'; el.textContent = names[key];
      el.onclick = () => onClick(key); this.labelsEl.appendChild(el); this.labelEls.push({ el, key });
    }
  }
  updateLabels() {
    const c = this.active, show = this.st.labels && !this.st.quiz && c && c.ready && this.isVisible(c);
    this.labelsEl.style.display = show ? '' : 'none'; if (!show) return;
    const cam = this.pinned ? this.pinCamera : this.arCamera, w = this.stage.clientWidth, h = this.stage.clientHeight, v = new THREE.Vector3();
    for (const { el, key } of this.labelEls || []) {
      if (!c.parts[key]) { el.style.display = 'none'; continue; }
      c.labelWorldPos(key, v).project(cam);
      const vis = v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1;
      el.style.display = vis ? '' : 'none';
      el.style.transform = `translate(${(v.x * 0.5 + 0.5) * w}px, ${(-v.y * 0.5 + 0.5) * h}px) translate(-50%, -130%)`;
      el.classList.toggle('sel', c.highlighted === key);
    }
  }

  // ---------------------------------------------------------------- Bucle
  loop(now) {
    if (!this.running) return;
    requestAnimationFrame(t => this.loop(t));
    const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
    const t = now / 1000;
    if (this.source === 'sim') this.drawSim(t);
    if (this.source !== 'none' && !this.pinned) this.detect(now);
    if (this.worker && this.busy && now - this.sentAt > 4000) { console.warn('El worker no responde; se usa el hilo principal'); this.worker.terminate(); this.worker = null; this.busy = false; this.initMainThreadDetector(); }
    this.updateAnchors(now, dt);
    this.st.explode += ((this.st.explodeTarget || 0) - this.st.explode) * Math.min(1, dt * 5);
    for (const c of this.visibleContents()) { if (!c.ready) continue; c.update(t, dt, this.st); c.applyExplode(this.st.explode); }
    if (this.camTween) {
      const k = Math.min(1, (now - this.camTween.t0) / this.camTween.dur), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      this.controls.target.lerpVectors(this.camTween.fromT, this.camTween.toT, e); this.pinCamera.position.lerpVectors(this.camTween.fromP, this.camTween.toP, e);
      if (k >= 1) this.camTween = null;
    }
    if (this.pinned) this.controls.update();
    this.renderer.render(this.scene, this.pinned ? this.pinCamera : this.arCamera);
    this.updateLabels();
    // rendimiento
    this.fpsSamples.push(now); while (this.fpsSamples.length && now - this.fpsSamples[0] > 1000) this.fpsSamples.shift();
    this.fps = this.fpsSamples.length;
    if (this.fps < 24 && document.visibilityState === 'visible') {
      this.lowFpsSince ??= now;
      if (now - this.lowFpsSince > 3000 && this.renderer.getPixelRatio() > 1) { this.renderer.setPixelRatio(1); this.resize(); this.on.status?.('Calidad gráfica reducida para mantener la fluidez', 'warn'); }
    } else this.lowFpsSince = null;
    this.on.frame?.(now, dt);
  }
  tracked(now = performance.now()) { return [...this.anchors.values()].filter(a => a.confirmed && now - a.lastSeen < KEEP_MS); }
}
