// =====================================================================
//  HoloClass · HoloHands (opcional, beta) — MediaPipe Hand Landmarker
//  Funciona con el modelo FIJADO en pantalla para no competir con el seguimiento de la tarjeta.
//   • Pellizco (pulgar + índice) y mover  -> girar el modelo
//   • Pellizco con las dos manos          -> acercar / alejar
//   • Señalar con el índice 1 s           -> seleccionar la parte
//   • Mano abierta y deslizar rápido      -> parte siguiente / anterior
// =====================================================================
const MP_VERSION = '0.10.21';
const MP_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}`;
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

const d2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export class HoloHands {
  constructor({ ar, video, cursor, onSelect, onNav, onStatus }) {
    Object.assign(this, { ar, video, cursor, onSelect, onNav, onStatus });
    this.active = false; this.landmarker = null; this.lastT = 0; this.prev = null; this.dwell = null; this.lastSwipe = 0; this.lowSince = null;
  }
  async start() {
    if (this.active) return;
    if (!this.video.srcObject) throw new Error('Activa la cámara para usar los gestos.');
    this.onStatus?.('Cargando detector de manos…');
    if (!this.landmarker) {
      const { FilesetResolver, HandLandmarker } = await import(`${MP_URL}/vision_bundle.mjs`);
      const fileset = await FilesetResolver.forVisionTasks(`${MP_URL}/wasm`);
      const opts = { baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' }, runningMode: 'VIDEO', numHands: 2, minHandDetectionConfidence: 0.6, minTrackingConfidence: 0.5 };
      try { this.landmarker = await HandLandmarker.createFromOptions(fileset, opts); }
      catch { opts.baseOptions.delegate = 'CPU'; this.landmarker = await HandLandmarker.createFromOptions(fileset, opts); }
    }
    this.active = true; this.cursor.hidden = false;
    this.onStatus?.('Gestos activos: pellizca para girar, señala 1 s para seleccionar');
    const tick = () => { if (!this.active) return; this.step(); requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }
  stop() { this.active = false; this.cursor.hidden = true; this.prev = null; this.dwell = null; }

  classify(lm) {
    const wrist = lm[0], scale = d2(lm[0], lm[9]) || 1;
    const ext = (tip, pip) => d2(lm[tip], wrist) > d2(lm[pip], wrist) * 1.12;
    const index = ext(8, 6), middle = ext(12, 10), ring = ext(16, 14), pinky = ext(20, 18);
    const pinch = d2(lm[4], lm[8]) / scale < 0.33;
    const point = index && !middle && !ring && !pinky && !pinch;
    const open = index && middle && ring && pinky && !pinch;
    // coordenadas de pantalla (con la cámara frontal el video se muestra en espejo)
    const P = (p) => ({ x: this.ar.mirror ? 1 - p.x : p.x, y: p.y });
    return { pinch, point, open, pinchPt: P({ x: (lm[4].x + lm[8].x) / 2, y: (lm[4].y + lm[8].y) / 2 }), tip: P(lm[8]), palm: P(lm[9]) };
  }

  step() {
    const now = performance.now();
    if (now - this.lastT < 66) return; // ~15 Hz
    this.lastT = now;
    // protección de rendimiento
    if (this.ar.fps < 22) { this.lowSince ??= now; if (now - this.lowSince > 3000) { this.stop(); this.onStatus?.('Gestos desactivados: la computadora va lenta (FPS bajos).', true); return; } } else this.lowSince = null;
    if (!this.ar.pinned || this.video.readyState < 2) { this.cursor.hidden = true; return; }
    const res = this.landmarker.detectForVideo(this.video, now);
    const hands = (res.landmarks || []).map(lm => this.classify(lm));
    const prev = this.prev; this.prev = { hands, t: now };
    if (!hands.length) { this.cursor.hidden = true; this.dwell = null; return; }

    const pinching = hands.filter(h => h.pinch);
    if (pinching.length === 2) {                                  // zoom con dos manos
      const dist = d2(pinching[0].pinchPt, pinching[1].pinchPt);
      const pd = prev?.zoomDist; if (pd) this.ar.zoomPinned(Math.max(0.9, Math.min(1.1, dist / pd)));
      this.prev.zoomDist = dist; this.cursor.hidden = true; return;
    }
    const h = hands[0];
    if (h.pinch) {                                                // girar
      const pp = prev?.hands?.[0];
      if (pp?.pinch) this.ar.rotatePinned((h.pinchPt.x - pp.pinchPt.x) * 5, (h.pinchPt.y - pp.pinchPt.y) * 4);
      this.showCursor(h.pinchPt, 'grab', 0); this.dwell = null; return;
    }
    if (h.open && prev?.hands?.[0]?.open) {                       // deslizar
      const vx = (h.palm.x - prev.hands[0].palm.x) / ((now - prev.t) / 1000);
      if (Math.abs(vx) > 1.4 && now - this.lastSwipe > 900) { this.lastSwipe = now; this.onNav?.(vx > 0 ? 1 : -1); }
    }
    if (h.point) {                                                // señalar y esperar
      const ndc = this.toNDC(h.tip);
      const hit = this.ar.pickAt(ndc.x, ndc.y, false);
      const key = hit ? hit.content.contentKey + ':' + hit.key : null;
      if (!this.dwell || this.dwell.key !== key) this.dwell = { key, t0: now, hit };
      const k = key ? Math.min(1, (now - this.dwell.t0) / 1000) : 0;
      this.showCursor(h.tip, 'point', k);
      if (key && k >= 1 && !this.dwell.done) { this.dwell.done = true; this.onSelect?.(hit); }
      return;
    }
    this.dwell = null; this.showCursor(h.tip, 'idle', 0);
  }
  toNDC(p) {
    // el lienzo 3D ocupa el mismo rectángulo que el video
    return { x: p.x * 2 - 1, y: -(p.y * 2 - 1) };
  }
  showCursor(p, mode, progress) {
    const r = this.ar.stage.getBoundingClientRect();
    this.cursor.hidden = false; this.cursor.className = 'hand-cursor ' + mode;
    this.cursor.style.transform = `translate(${p.x * r.width}px, ${p.y * r.height}px) translate(-50%, -50%)`;
    this.cursor.style.setProperty('--p', Math.round(progress * 100));
  }
}
