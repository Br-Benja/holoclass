// =====================================================================
//  HoloClass · Prototipo funcional
//  Cámara -> js-aruco2 (detección ArUco + POSIT) -> Three.js (RA sobre el video)
// =====================================================================
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MARKERS, MODULES, CONTENT, QUIZZES } from './content.js';
import { buildContent } from './models.js';

const MARKER_MM = 50;          // tamaño real del marcador impreso (lado, mm)
const DETECT_W = 640;          // ancho del frame de detección
const KEEP_MS = 600;           // retención tras perder el marcador
const FADE_MS = 1500;          // desvanecido completo
const $ = s => document.querySelector(s);

// ------------------------------------------------------------------ Estado
const state = {
  view: 'home', module: null, source: 'none',   // 'camera' | 'sim' | 'none'
  pinned: false, beat: true, flow: false, realScale: false, labels: true,
  explode: 0, explodeTarget: 0, active: null, quiz: null, explored: new Set(),
  simIds: [],
};

// ------------------------------------------------------------------ DOM
const stage = $('#stage'), video = $('#video'), simCanvas = $('#sim');
const glHost = $('#gl'), labelsEl = $('#labels');
const detectCanvas = document.createElement('canvas');
const detectCtx = detectCanvas.getContext('2d', { willReadFrequently: true });
const simCtx = simCanvas.getContext('2d');

// ------------------------------------------------------------------ Three.js
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.outputColorSpace = THREE.SRGBColorSpace;
glHost.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight(0xffffff, 0x334466, 1.1));
const sunLight = new THREE.DirectionalLight(0xffffff, 1.6); sunLight.position.set(0.5, 1, 1.2); scene.add(sunLight);

const arCamera = new THREE.PerspectiveCamera(41, 4 / 3, 1, 8000);   // en el origen, mirando a -Z
const arRoot = new THREE.Group(); scene.add(arRoot);

const pinCamera = new THREE.PerspectiveCamera(42, 4 / 3, 1, 8000);
pinCamera.position.set(0, 20, 230);
const controls = new OrbitControls(pinCamera, renderer.domElement);
controls.enableDamping = true; controls.minDistance = 60; controls.maxDistance = 600; controls.enabled = false;
const pinRoot = new THREE.Group(); scene.add(pinRoot);
let pinnedContent = null;

// ------------------------------------------------------------------ Detector ArUco
const detector = new AR.Detector({ dictionaryName: 'ARUCO_MIP_36h12', maxHammingDistance: 5 });
let posit = null, detectH = 480;

function configureSize(vw, vh) {
  detectH = Math.round(DETECT_W * vh / vw);
  detectCanvas.width = DETECT_W; detectCanvas.height = detectH;
  posit = new POS.Posit(MARKER_MM, DETECT_W);
  arCamera.fov = THREE.MathUtils.radToDeg(2 * Math.atan((detectH / 2) / DETECT_W));
  arCamera.aspect = DETECT_W / detectH; arCamera.updateProjectionMatrix();
  stage.style.aspectRatio = `${vw} / ${vh}`;
  resize();
}
function resize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h);
  pinCamera.aspect = w / h; pinCamera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(stage);

// Pose POSIT (x der, y arriba, z hacia la escena) -> Three.js (z hacia el observador),
// con espejo horizontal F para coincidir con el video espejado: M = F·S·R·S·F
const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
function poseToTarget(pose, anchor) {
  const r = pose.bestRotation, t = pose.bestTranslation;
  _m.set(
     r[0][0], -r[0][1],  r[0][2], -t[0],
    -r[1][0],  r[1][1], -r[1][2],  t[1],
     r[2][0], -r[2][1],  r[2][2], -t[2],
     0, 0, 0, 1);
  _m.decompose(_p, _q, _s);
  anchor.targetPos.copy(_p); anchor.targetQuat.copy(_q).normalize();
}

// ------------------------------------------------------------------ Anclas (una por marcador)
const anchors = new Map();
function getAnchor(id) {
  if (anchors.has(id)) return anchors.get(id);
  const group = new THREE.Group(); group.visible = false;
  const holder = new THREE.Group(); holder.position.z = 38; group.add(holder);
  const content = buildContent(MARKERS[id].content);
  holder.add(content.group);
  arRoot.add(group);
  const a = { id, group, holder, content, lastSeen: -1e9, streak: 0, confirmed: false, appear: 0, initialized: false,
              targetPos: new THREE.Vector3(), targetQuat: new THREE.Quaternion() };
  anchors.set(id, a);
  return a;
}

let lastDetectMs = 0, lastSeenAny = performance.now(), brightness = 128;
function detect(now) {
  const src = state.source === 'sim' ? simCanvas : video;
  if (state.source === 'camera' && video.readyState < 2) return;
  const t0 = performance.now();
  detectCtx.drawImage(src, 0, 0, DETECT_W, detectH);
  const img = detectCtx.getImageData(0, 0, DETECT_W, detectH);
  let sum = 0, n = 0;
  for (let i = 0; i < img.data.length; i += 4 * 97) { sum += img.data[i] * 0.3 + img.data[i + 1] * 0.59 + img.data[i + 2] * 0.11; n++; }
  brightness = sum / n;
  const markers = detector.detect(img);
  const seen = new Set();
  for (const mk of markers) {
    if (!MARKERS[mk.id]) continue;
    const corners = mk.corners.map(c => ({ x: c.x - DETECT_W / 2, y: detectH / 2 - c.y }));
    const pose = posit.pose(corners);
    const a = getAnchor(mk.id);
    poseToTarget(pose, a);
    a.lastSeen = now; a.streak++; seen.add(mk.id);
    if (!a.confirmed && a.streak >= 2) { a.confirmed = true; onMarkerConfirmed(a); }
  }
  for (const a of anchors.values()) if (!seen.has(a.id)) a.streak = 0;
  if (seen.size) lastSeenAny = now;
  lastDetectMs = performance.now() - t0;
}

function onMarkerConfirmed(a) {
  if (!state.active || !isContentVisible(state.active)) setActive(a.content);
  toast(`✔ ${MARKERS[a.id].title}`);
  if (anchors.get(3)?.confirmed && anchors.get(4)?.confirmed && !state.realScale)
    toast('Tip: activa 🔭 Escala real para comparar la Tierra con Júpiter');
}

function updateAnchors(now, dt) {
  for (const a of anchors.values()) {
    if (!a.confirmed) continue;
    const since = now - a.lastSeen;
    if (since > FADE_MS) { a.confirmed = false; a.initialized = false; a.group.visible = false; a.appear = 0; continue; }
    const targetAppear = since < KEEP_MS ? 1 : 1 - (since - KEEP_MS) / (FADE_MS - KEEP_MS);
    a.appear += (targetAppear - a.appear) * Math.min(1, dt * (targetAppear > a.appear ? 7 : 12));
    if (!a.initialized) { a.group.position.copy(a.targetPos); a.group.quaternion.copy(a.targetQuat); a.initialized = true; }
    // Suavizado adaptativo (tipo One-Euro): más rápido cuando la tarjeta se mueve mucho
    const speed = a.group.position.distanceTo(a.targetPos);
    const k = Math.min(45, 10 + speed * 0.9);
    const alpha = 1 - Math.exp(-dt * k);
    a.group.position.lerp(a.targetPos, alpha);
    a.group.quaternion.slerp(a.targetQuat, alpha);
    a.group.visible = a.appear > 0.02;
    a.holder.scale.setScalar(Math.max(0.001, easeOutBack(a.appear)));
  }
}
const easeOutBack = x => { const c1 = 1.4, c3 = c1 + 1; return x >= 1 ? 1 : 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };

function isContentVisible(c) {
  if (c === pinnedContent) return state.pinned;
  for (const a of anchors.values()) if (a.content === c) return a.group.visible && !state.pinned;
  return false;
}
function visibleContents() {
  if (state.pinned) return pinnedContent ? [pinnedContent] : [];
  return [...anchors.values()].filter(a => a.group.visible).map(a => a.content);
}

// ------------------------------------------------------------------ Fuentes de video
async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }, audio: false });
    video.srcObject = stream; await video.play();
    state.source = 'camera';
    video.hidden = false; simCanvas.hidden = true;
    configureSize(video.videoWidth || 640, video.videoHeight || 480);
    setStatus('Buscando tarjeta…', 'search');
    return true;
  } catch (e) {
    console.warn(e);
    toast('No se pudo abrir la cámara. Usa el modo 🧪 Simulación o “Explorar sin cámara”.', 5000);
    return false;
  }
}
function stopCamera() {
  const s = video.srcObject; if (s) s.getTracks().forEach(t => t.stop());
  video.srcObject = null;
}
const markerImages = {};
function markerImage(id) {
  if (!markerImages[id]) {
    const svg = new AR.Dictionary('ARUCO_MIP_36h12').generateSVG(id);
    const img = new Image(); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    markerImages[id] = img;
  }
  return markerImages[id];
}
function startSim(ids) {
  stopCamera();
  state.source = 'sim'; state.simIds = ids;
  simCanvas.width = 640; simCanvas.height = 480;
  video.hidden = true; simCanvas.hidden = false;
  configureSize(640, 480);
  setStatus('Simulación: tarjeta virtual', 'search');
}
function drawSim(t) {
  const g = simCtx, W = simCanvas.width, H = simCanvas.height;
  const grd = g.createLinearGradient(0, 0, 0, H); grd.addColorStop(0, '#8d97a8'); grd.addColorStop(1, '#5b6474');
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  const n = state.simIds.length;
  state.simIds.forEach((id, i) => {
    const img = markerImage(id); if (!img.complete) return;
    const cx = W * (i + 1) / (n + 1) + Math.sin(t * 0.6 + i) * (n > 1 ? 25 : 70);
    const cy = H / 2 + Math.sin(t * 0.9 + i * 2) * 35;
    const size = (n > 1 ? 120 : 150) * (1 + 0.12 * Math.sin(t * 0.7 + i));
    g.save(); g.translate(cx, cy); g.rotate(0.35 * Math.sin(t * 0.45 + i));
    g.transform(1, 0.08 * Math.sin(t * 0.8), 0.05 * Math.sin(t * 0.6), 1, 0, 0);
    g.fillStyle = '#fff'; g.shadowColor = 'rgba(0,0,0,.35)'; g.shadowBlur = 14;
    g.fillRect(-size * 0.72, -size * 0.72, size * 1.44, size * 1.44);
    g.shadowBlur = 0; g.imageSmoothingEnabled = false;
    g.drawImage(img, -size / 2, -size / 2, size, size);
    g.restore();
  });
}

// ------------------------------------------------------------------ Modo fijado (soltar la tarjeta)
function enterPinned(key) {
  key = key || state.active?.contentKey || MODULES[state.module].main;
  if (pinnedContent) pinRoot.remove(pinnedContent.group);
  pinnedContent = buildContent(key);
  pinRoot.add(pinnedContent.group);
  state.pinned = true; arRoot.visible = false; controls.enabled = true;
  controls.target.set(0, 0, 0); pinCamera.position.set(0, 25, 230); controls.update();
  stage.classList.add('pinned');
  setActive(pinnedContent);
  $('#btnPin').textContent = '🎯 Volver a la tarjeta';
  setStatus('Modelo fijado: arrastra para girar, rueda para zoom', 'ok');
}
function exitPinned() {
  state.pinned = false; arRoot.visible = true; controls.enabled = false;
  if (pinnedContent) { pinRoot.remove(pinnedContent.group); pinnedContent = null; }
  stage.classList.remove('pinned');
  state.active = null;
  const vis = visibleContents(); if (vis[0]) setActive(vis[0]); else renderPanel();
  $('#btnPin').textContent = '📌 Fijar en pantalla';
}

// ------------------------------------------------------------------ Selección de partes (raycasting)
const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2();
let downXY = null;
renderer.domElement.addEventListener('pointerdown', e => { downXY = [e.clientX, e.clientY]; });
renderer.domElement.addEventListener('pointerup', e => {
  if (!downXY || Math.hypot(e.clientX - downXY[0], e.clientY - downXY[1]) > 6) return;
  const rect = renderer.domElement.getBoundingClientRect();
  ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(ndc, state.pinned ? pinCamera : arCamera);
  const pickables = visibleContents().flatMap(c => c.pickables);
  const hit = raycaster.intersectObjects(pickables, false).find(h => h.object.material.opacity > 0.3 || state.quiz) || raycaster.intersectObjects(pickables, false)[0];
  if (hit) selectPart(hit.object.userData.content, hit.object.userData.partKey);
  else if (state.active?.highlighted && !state.quiz) { state.active.setHighlight(null); renderPanel(); }
});

function setActive(content) {
  if (state.active && state.active !== content) state.active.setHighlight(null);
  state.active = content;
  buildLabels();
  renderPanel();
}
function selectPart(content, key) {
  if (state.active !== content) setActive(content);
  content.setHighlight(key);
  state.explored.add(content.contentKey + ':' + key);
  if (state.quiz && state.quiz.awaitingPick) { state.quiz.pick = key; renderQuiz(); return; }
  renderPanel();
  if ($('#autoSpeak').checked) speakPart(content.contentKey, key);
}

// ------------------------------------------------------------------ Etiquetas 3D (HTML proyectado)
let labelEls = [];
function buildLabels() {
  labelsEl.innerHTML = ''; labelEls = [];
  const c = state.active; if (!c) return;
  const info = CONTENT[c.contentKey];
  for (const key of Object.keys(c.parts)) {
    if (!info.parts[key]) continue;
    const el = document.createElement('div');
    el.className = 'label'; el.textContent = info.parts[key].name;
    el.onclick = () => selectPart(c, key);
    labelsEl.appendChild(el); labelEls.push({ el, key });
  }
}
const _v = new THREE.Vector3();
function updateLabels() {
  const c = state.active;
  const show = state.labels && !state.quiz && c && isContentVisible(c);   // en el cuestionario no se muestran (darían la respuesta)
  labelsEl.style.display = show ? '' : 'none';
  if (!show) return;
  const cam = state.pinned ? pinCamera : arCamera;
  const w = stage.clientWidth, h = stage.clientHeight;
  for (const { el, key } of labelEls) {
    c.labelWorldPos(key, _v).project(cam);
    const visible = _v.z < 1 && Math.abs(_v.x) < 1.1 && Math.abs(_v.y) < 1.1;
    el.style.display = visible ? '' : 'none';
    el.style.transform = `translate(${(_v.x * 0.5 + 0.5) * w}px, ${(-_v.y * 0.5 + 0.5) * h}px) translate(-50%, -130%)`;
    el.classList.toggle('sel', c.highlighted === key);
  }
}

// ------------------------------------------------------------------ Narración (Web Speech API)
let esVoice = null;
function pickVoice() { const vs = speechSynthesis.getVoices(); esVoice = vs.find(v => v.lang === 'es-MX') || vs.find(v => v.lang.startsWith('es')) || null; }
if ('speechSynthesis' in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
function speak(text) {
  if (!('speechSynthesis' in window)) return toast('Este navegador no soporta narración.');
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text); u.lang = 'es-MX'; if (esVoice) u.voice = esVoice; u.rate = 1.02;
  speechSynthesis.speak(u);
}
function speakPart(ck, key) { const p = CONTENT[ck].parts[key]; if (p) speak(`${p.name}. ${p.text}`); }

// ------------------------------------------------------------------ Panel de información
function renderPanel() {
  if (state.quiz) return renderQuiz();
  const el = $('#panelBody');
  const c = state.active;
  if (!c) {
    const mod = MODULES[state.module];
    el.innerHTML = `<div class="empty"><div class="big">${mod.icon}</div>
      <p>Muestra una tarjeta de <b>${mod.subject}</b> frente a la cámara.</p>
      <p class="muted">Tarjetas: ${mod.markers.map(id => `#${id} ${MARKERS[id].title}`).join(' · ')}</p>
      <p class="muted">¿Sin tarjetas? Usa <b>🧪 Simulación</b> o <b>📌 Fijar</b>.</p></div>`;
    return;
  }
  const info = CONTENT[c.contentKey];
  const keys = Object.keys(c.parts).filter(k => info.parts[k]);
  const done = keys.filter(k => state.explored.has(c.contentKey + ':' + k)).length;
  const sel = c.highlighted && info.parts[c.highlighted];
  el.innerHTML = `
    <h2>${info.title}</h2>
    <div class="progress"><div style="width:${(done / keys.length) * 100}%"></div></div>
    <p class="muted small">${done} / ${keys.length} partes exploradas</p>
    ${sel ? `<div class="part-card">
        <h3>${sel.name}</h3><p>${sel.text}</p>
        <p class="fact">💡 ${sel.fact}</p>
        <button class="btn ghost" id="btnSpeak">🔊 Escuchar</button>
      </div>` : `<p>${info.intro}</p><p class="muted">Toca una parte del modelo o una etiqueta para ver su explicación.</p>`}
    <div class="chips">${keys.map(k => `<button class="chip ${state.explored.has(c.contentKey + ':' + k) ? 'done' : ''} ${c.highlighted === k ? 'sel' : ''}" data-k="${k}">${info.parts[k].name}</button>`).join('')}</div>`;
  el.querySelectorAll('.chip').forEach(b => b.onclick = () => selectPart(c, b.dataset.k));
  const bs = $('#btnSpeak'); if (bs) bs.onclick = () => speakPart(c.contentKey, c.highlighted);
}

// ------------------------------------------------------------------ HoloQuiz
function startQuiz() {
  const mod = MODULES[state.module];
  enterPinned(mod.main);
  state.quiz = { i: 0, answers: [], pick: null, awaitingPick: false, feedback: null, started: Date.now() };
  showTab('quiz');
  renderQuiz();
}
function renderQuiz() {
  const el = $('#quizBody');
  const qz = state.quiz;
  if (!qz) {
    el.innerHTML = `<h2>Cuestionario</h2><p>Responde ${QUIZZES[state.module].length} preguntas. Algunas se contestan <b>tocando el modelo 3D</b>.</p>
      <button class="btn primary" id="btnStartQuiz">Comenzar</button>`;
    $('#btnStartQuiz').onclick = startQuiz; return;
  }
  const qs = QUIZZES[state.module];
  if (qz.i >= qs.length) return renderResults();
  const q = qs[qz.i];
  const info = CONTENT[pinnedContent.contentKey];
  let body = `<div class="q-head">Pregunta ${qz.i + 1} de ${qs.length} <span class="tag">${q.type === 'pick' ? '🎯 En el modelo' : 'Opción múltiple'}</span></div>
    <h3 class="q">${q.q}</h3>`;
  if (q.type === 'mc') {
    body += `<div class="options">${q.options.map((o, i) => {
      let cls = '';
      if (qz.feedback) cls = i === q.answer ? 'right' : (i === qz.feedback.chosen ? 'wrong' : '');
      return `<button class="opt ${cls}" data-i="${i}" ${qz.feedback ? 'disabled' : ''}>${o}</button>`; }).join('')}</div>`;
  } else {
    qz.awaitingPick = !qz.feedback;
    const pickName = qz.pick ? (info.parts[qz.pick]?.name || qz.pick) : null;
    body += qz.feedback ? '' : `<p class="pick-hint">${pickName ? `Seleccionaste: <b>${pickName}</b>` : '👆 Toca la parte en el modelo 3D'}</p>
      <button class="btn primary" id="btnConfirm" ${pickName ? '' : 'disabled'}>Confirmar</button>`;
  }
  if (qz.feedback) {
    body += `<div class="feedback ${qz.feedback.ok ? 'ok' : 'bad'}">${qz.feedback.ok ? '✔ ¡Correcto!' : '✖ Incorrecto'} — ${q.explain}</div>
      <button class="btn primary" id="btnNext">${qz.i + 1 < qs.length ? 'Siguiente' : 'Ver resultados'}</button>`;
  }
  el.innerHTML = body;
  el.querySelectorAll('.opt').forEach(b => b.onclick = () => answer(Number(b.dataset.i)));
  const bc = $('#btnConfirm'); if (bc) bc.onclick = () => answer(qz.pick);
  const bn = $('#btnNext'); if (bn) bn.onclick = () => { qz.i++; qz.pick = null; qz.feedback = null; pinnedContent.setHighlight(null); renderQuiz(); };
}
function answer(val) {
  const qz = state.quiz, q = QUIZZES[state.module][qz.i];
  const ok = val === q.answer;
  qz.answers.push({ q: qz.i, ok, concept: q.concept });
  qz.feedback = { ok, chosen: val }; qz.awaitingPick = false;
  if (q.type === 'pick') pinnedContent.setHighlight(q.answer);   // muestra la parte correcta
  renderQuiz();
}
function renderResults() {
  const qz = state.quiz, qs = QUIZZES[state.module];
  const correct = qz.answers.filter(a => a.ok).length;
  const score = Math.round((correct / qs.length) * 100);
  if (!qz.saved) {
    const all = loadResults();
    all.push({ module: state.module, score, date: new Date().toISOString(), seconds: Math.round((Date.now() - qz.started) / 1000),
               answers: qz.answers, explored: state.explored.size });
    localStorage.setItem('holoclass_results', JSON.stringify(all)); qz.saved = true;
  }
  const byConcept = {};
  qz.answers.forEach(a => { (byConcept[a.concept] ||= [0, 0]); byConcept[a.concept][1]++; if (a.ok) byConcept[a.concept][0]++; });
  const stars = score >= 90 ? '⭐⭐⭐' : score >= 60 ? '⭐⭐' : '⭐';
  $('#quizBody').innerHTML = `<div class="result"><div class="score">${score}%</div><div class="stars">${stars}</div>
    <p>${correct} de ${qs.length} correctas</p></div>
    <h4>Por concepto</h4>
    ${Object.entries(byConcept).map(([k, [ok, n]]) => `<div class="bar-row"><span>${k}</span><div class="bar"><div style="width:${ok / n * 100}%"></div></div><b>${Math.round(ok / n * 100)}%</b></div>`).join('')}
    <div class="row"><button class="btn primary" id="btnRetry">Intentar de nuevo</button><button class="btn ghost" id="btnTeacherFromQuiz">Panel docente</button></div>`;
  if (score >= 80) confetti();
  $('#btnRetry').onclick = startQuiz;
  $('#btnTeacherFromQuiz').onclick = () => { endQuiz(); go('teacher'); };
}
function endQuiz() { state.quiz = null; if (pinnedContent) pinnedContent.setHighlight(null); }
const loadResults = () => { try { return JSON.parse(localStorage.getItem('holoclass_results') || '[]'); } catch { return []; } };

// ------------------------------------------------------------------ Panel docente (demo con datos locales)
function renderTeacher() {
  const all = loadResults();
  const el = $('#teacherBody');
  if (!all.length) { el.innerHTML = `<p class="muted">Aún no hay resultados. Completa un cuestionario para ver estadísticas.</p>`; return; }
  let html = `<div class="kpis">
    <div class="kpi"><b>${all.length}</b><span>Intentos</span></div>
    <div class="kpi"><b>${Math.round(all.reduce((s, r) => s + r.score, 0) / all.length)}%</b><span>Promedio general</span></div>
    <div class="kpi"><b>${Math.round(all.reduce((s, r) => s + r.seconds, 0) / all.length)} s</b><span>Tiempo medio</span></div></div>`;
  for (const [mk, mod] of Object.entries(MODULES)) {
    const rs = all.filter(r => r.module === mk); if (!rs.length) continue;
    const qs = QUIZZES[mk];
    const stats = qs.map((q, i) => { const ans = rs.flatMap(r => r.answers.filter(a => a.q === i)); return { q, pct: ans.length ? Math.round(ans.filter(a => a.ok).length / ans.length * 100) : null }; });
    const hardest = stats.filter(s => s.pct !== null).sort((a, b) => a.pct - b.pct)[0];
    html += `<div class="t-card"><h3>${mod.icon} ${mod.title}</h3><p class="muted">${rs.length} intentos · promedio ${Math.round(rs.reduce((s, r) => s + r.score, 0) / rs.length)}%</p>
      ${hardest ? `<p class="hard">⚠ Concepto más difícil: <b>${hardest.q.concept}</b> — “${hardest.q.q}” (${hardest.pct}% de aciertos)</p>` : ''}
      <table><tr><th>Pregunta</th><th>Tipo</th><th>% aciertos</th></tr>
      ${stats.map(s => `<tr><td>${s.q.q}</td><td>${s.q.type === 'pick' ? '🎯 Espacial' : 'Opción múltiple'}</td><td>${s.pct ?? '—'}${s.pct !== null ? '%' : ''}</td></tr>`).join('')}</table></div>`;
  }
  html += `<button class="btn ghost" id="btnClear">Borrar resultados de prueba</button>`;
  el.innerHTML = html;
  $('#btnClear').onclick = () => { localStorage.removeItem('holoclass_results'); renderTeacher(); };
}

// ------------------------------------------------------------------ UI general
function setStatus(text, kind) { const s = $('#status'); s.textContent = text; s.className = 'pill ' + kind; }
let toastTimer;
function toast(msg, ms = 2600) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), ms); }
function showTab(tab) {
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  $('#panelBody').hidden = tab !== 'info'; $('#quizBody').hidden = tab !== 'quiz';
  if (tab === 'quiz') renderQuiz(); else { endQuiz(); renderPanel(); }
}
function confetti() {
  for (let i = 0; i < 60; i++) {
    const d = document.createElement('i'); d.className = 'confetti';
    d.style.left = Math.random() * 100 + 'vw'; d.style.background = `hsl(${Math.random() * 360},90%,60%)`;
    d.style.animationDelay = Math.random() * 0.5 + 's'; document.body.appendChild(d); setTimeout(() => d.remove(), 2500);
  }
}

function go(view, opts = {}) {
  state.view = view;
  document.querySelectorAll('[data-view]').forEach(s => s.hidden = s.dataset.view !== view);
  if (view !== 'viewer') { stopCamera(); state.source = 'none'; endQuiz(); }
  if (view === 'teacher') renderTeacher();
}
async function openModule(mk, mode) {
  state.module = mk; state.active = null; state.explored.clear();
  for (const a of anchors.values()) arRoot.remove(a.group);
  anchors.clear();
  const mod = MODULES[mk];
  $('#modTitle').textContent = `${mod.icon} ${mod.title}`;
  $('#btnBeat').hidden = $('#btnFlow').hidden = mk !== 'anatomia';
  $('#btnScale').hidden = mk !== 'astronomia';
  go('viewer');
  showTab('info');
  configureSize(640, 480);
  if (mode === 'camera') { const ok = await startCamera(); if (!ok) enterPinned(mod.main); else if (state.pinned) exitPinned(); }
  else if (mode === 'sim') { if (state.pinned) exitPinned(); startSim([mod.markers[0]]); }
  else { enterPinned(mod.main); setStatus('Exploración sin cámara', 'ok'); }
  renderSimButtons();
}
function renderSimButtons() {
  const mod = MODULES[state.module];
  const opts = mod.markers.map(id => ({ ids: [id], label: `#${id} ${MARKERS[id].title}` }));
  if (state.module === 'astronomia') opts.push({ ids: [3, 4], label: 'Tierra + Júpiter (comparar)' });
  if (state.module === 'quimica') opts.push({ ids: [5, 6], label: 'H₂O + CO₂' });
  $('#simButtons').innerHTML = opts.map((o, i) => `<button class="chip" data-i="${i}">${o.label}</button>`).join('');
  $('#simButtons').querySelectorAll('button').forEach(b => b.onclick = () => { if (state.pinned) exitPinned(); startSim(opts[b.dataset.i].ids); });
}

// Inicio: tarjetas de módulos
$('#modules').innerHTML = Object.entries(MODULES).map(([k, m]) => `
  <article class="mod" style="--c:${m.color}">
    <div class="mod-icon">${m.icon}</div>
    <div class="mod-subject">${m.subject}</div>
    <h3>${m.title}</h3><p>${m.desc}</p>
    <p class="muted small">Tarjetas: ${m.markers.map(id => '#' + id).join(', ')}</p>
    <div class="row">
      <button class="btn primary" data-open="${k}" data-mode="camera">📷 Explorar con cámara</button>
      <button class="btn ghost" data-open="${k}" data-mode="sim">🧪 Simulación</button>
      <button class="btn ghost" data-open="${k}" data-mode="none">🖱 Sin cámara</button>
    </div>
  </article>`).join('');
document.querySelectorAll('[data-open]').forEach(b => b.onclick = () => openModule(b.dataset.open, b.dataset.mode));
document.querySelectorAll('[data-go]').forEach(b => b.onclick = () => go(b.dataset.go));
document.querySelectorAll('.tab').forEach(b => b.onclick = () => showTab(b.dataset.tab));

$('#btnPin').onclick = () => {
  if (!state.pinned) return enterPinned();
  if (state.source === 'none') return toast('Activa 📷 Cámara o 🧪 Simulación para volver a la tarjeta.');
  endQuiz(); showTab('info'); exitPinned();
};
$('#btnBeat').onclick = e => { state.beat = !state.beat; e.currentTarget.classList.toggle('on', state.beat); };
$('#btnFlow').onclick = e => { state.flow = !state.flow; e.currentTarget.classList.toggle('on', state.flow); };
$('#btnExplode').onclick = e => { state.explodeTarget = state.explodeTarget ? 0 : 1; e.currentTarget.classList.toggle('on', !!state.explodeTarget); };
$('#btnLabels').onclick = e => { state.labels = !state.labels; e.currentTarget.classList.toggle('on', state.labels); };
$('#btnScale').onclick = e => { state.realScale = !state.realScale; e.currentTarget.classList.toggle('on', state.realScale); toast(state.realScale ? 'Escala real de tamaños (Júpiter ≈ 11 × Tierra)' : 'Escala didáctica'); };
$('#btnCam').onclick = async () => { if (await startCamera() && state.pinned) { endQuiz(); showTab('info'); exitPinned(); } };
$('#btnSim').onclick = () => { $('#simButtons').classList.toggle('open'); };
$('#btnQuiz').onclick = () => { showTab('quiz'); startQuiz(); };
$('#btnBeat').classList.add('on'); $('#btnLabels').classList.add('on');

// ------------------------------------------------------------------ Bucle principal
let last = performance.now(), frames = 0, fpsT = last, fps = 0;
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  const t = now / 1000;
  if (state.view === 'viewer') {
    if (state.source === 'sim') drawSim(t);
    if (state.source !== 'none' && !state.pinned) {
      detect(now);
      if (now - lastSeenAny > 3000) $('#hint').textContent = brightness < 60 ? '💡 Hay poca luz: acércate a una lámpara' : '🪪 Muestra una tarjeta a 30–60 cm de la cámara';
      else $('#hint').textContent = '';
      const tracked = [...anchors.values()].filter(a => a.confirmed && now - a.lastSeen < KEEP_MS).length;
      if (state.source === 'camera' || state.source === 'sim') setStatus(tracked ? `● Seguimiento estable (${tracked})` : '◌ Buscando tarjeta…', tracked ? 'ok' : 'search');
    } else $('#hint').textContent = '';
    updateAnchors(now, dt);
    state.explode += (state.explodeTarget - state.explode) * Math.min(1, dt * 5);
    const st = { ...state, pinned: state.pinned };
    for (const c of visibleContents()) { c.update(t, dt, st); c.applyExplode(state.explode); }
    if (state.pinned) controls.update();
    renderer.render(scene, state.pinned ? pinCamera : arCamera);
    updateLabels();
    frames++;
    if (now - fpsT > 500) { fps = Math.round(frames * 1000 / (now - fpsT)); frames = 0; fpsT = now; $('#fps').textContent = `${fps} FPS · detección ${lastDetectMs.toFixed(0)} ms`; }
  }
}
requestAnimationFrame(loop);
go('home');

// Exponer para pruebas/depuración desde la consola
window.holo = { state, anchors, openModule, startSim, enterPinned, exitPinned, selectPart };
