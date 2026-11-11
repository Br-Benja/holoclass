// =====================================================================
//  HoloClass · Visor de RA + HoloLearn (explorar, recorrido guiado, evaluación)
// =====================================================================
import { ARView } from './ar.js';
import { QuizRunner } from './quiz.js';
import { HoloHands } from './hands.js';
import { $, $$, esc, fill, speak, stopSpeak, toast, sleep } from './util.js';

export class Viewer {
  constructor(app) {
    this.app = app; this.ar = null; this.events = []; this.sid = null; this.explored = new Set();
    this.quiz = null; this.tour = null; this.hands = null; this.tab = 'info';
    this.bindToolbar();
  }
  get store() { return this.app.store; }
  get catalog() { return this.app.catalog; }
  get module() { return this.catalog.modules.find(m => m.key === this.moduleKey); }

  ensureAR() {
    if (!this.ar) {
      this.ar = new ARView({ stage: $('#stage'), glHost: $('#gl'), labels: $('#labels'), video: $('#video'), sim: $('#sim'), catalog: this.catalog, store: this.store });
      const ar = this.ar;
      ar.on.confirmed = a => {
        this.log('marcador_detectado', { marker: a.id, model: a.content.contentKey });
        if (!this.active || !ar.isVisible(this.active)) this.setActive(a.content);
        toast(`✔ ${this.catalog.markers[a.id].title}`);
        if (ar.anchors.get(3)?.confirmed && ar.anchors.get(4)?.confirmed && !ar.st.realScale) toast('Tip: activa 🔭 Escala real para comparar la Tierra con Júpiter', 4000);
      };
      ar.on.lost = a => this.log('seguimiento_perdido', { marker: a.id });
      ar.on.reaction = (r, content) => {
        if (!r) { const first = [...ar.anchors.values()].find(a => a.group.visible); if (first) this.setActive(first.content); return; }
        this.setActive(content); this.log('reaccion', { payload: { result: r.result } });
        toast(`⚗️ ¡Reacción! ${r.equation}`, 4000); if ($('#autoSpeak').checked) speak(`${r.equation}. ${r.text}`);
      };
      ar.on.pick = res => {
        if (this.quiz?.awaitingPick) { if (res) this.quiz.onPick(res.key); return; }
        if (res) this.selectPart(res.content, res.key);
        else if (this.active?.highlighted) { this.active.setHighlight(null); this.renderInfo(); }
      };
      ar.on.status = (t, kind) => toast(t);
      let lastUi = 0;
      ar.on.frame = now => {
        if (now - lastUi < 400) return; lastUi = now;
        $('#fps').textContent = `${ar.fps} FPS · detección ${ar.lastDetectMs.toFixed(0)} ms${ar.worker ? ' · worker' : ''}`;
        this.fpsLog = (this.fpsLog || []).concat(ar.fps).slice(-300);
        if (ar.pinned) { $('#hint').textContent = ''; return; }
        if (ar.source === 'none') { this.setStatus('Sin cámara', 'search'); return; }
        const tr = ar.tracked(now).length;
        this.setStatus(tr ? `● Seguimiento estable (${tr})` : '◌ Buscando tarjeta…', tr ? 'ok' : 'search');
        $('#hint').textContent = now - ar.lastSeenAny > 3000 ? (ar.brightness < 60 ? '💡 Hay poca luz: acércate a una lámpara' : '🪪 Muestra una tarjeta a 30–60 cm de la cámara') : '';
      };
    }
    this.ar.catalog = this.catalog;
    return this.ar;
  }

  // ---------------------------------------------------------------- Abrir / cerrar módulo
  async open(moduleKey, mode) {
    await this.close();
    this.moduleKey = moduleKey; this.explored = new Set(); this.active = null; this.tab = 'info';
    const ar = this.ensureAR(); const mod = this.module;
    ar.clearAnchors(); ar.exitPinned(); $('#tPin').textContent = '📌 Fijar en pantalla';
    $('#cutWrap').hidden = true; this.hands?.stop(); $('#tHands').classList.remove('on');
    Object.assign(ar.st, { animate: true, flow: false, explodeTarget: 0, cut: 0, realScale: false, quiz: false, element: 6 });
    $('#vTitle').textContent = `${this.app.subjectOf(mod).icon} ${mod.title}`;
    const keys = this.moduleModels();
    $('#tFlow').hidden = $('#tCut').hidden = !keys.includes('heart');
    $('#tScale').hidden = !keys.some(k => ['earth', 'jupiter', 'saturn', 'mars'].includes(k));
    this.syncToolbar();
    this.renderSimButtons(); this.showTab('info');
    this.sid = await this.store.startSession(moduleKey).catch(() => null);
    this.flushTimer = setInterval(() => this.flush(), 8000);
    if (mode === 'camera') {
      try { await ar.startCamera($('#camSelect').value || undefined); this.fillCameras(); }
      catch (e) { console.warn(e); toast('No se pudo abrir la cámara. Usa 🧪 Simulación o explora sin cámara.', 5000); this.pin(mod.main); }
    } else if (mode === 'sim') ar.startSim([mod.markers[0]]);
    else { ar.stopSources(); this.pin(mod.main); this.setStatus('Exploración sin cámara', 'ok'); }
    this.renderInfo();
  }
  async close() {
    if (!this.moduleKey) return;
    this.stopTour(); this.hands?.stop(); stopSpeak();
    clearInterval(this.flushTimer); await this.flush();
    if (this.sid) await this.store.endSession(this.sid, { explored: this.exploredPct(), avgFps: this.fpsLog?.length ? Math.round(this.fpsLog.reduce((a, b) => a + b, 0) / this.fpsLog.length) : null }).catch(() => {});
    this.sid = null; this.fpsLog = []; this.quiz = null;
    this.ar?.stopSources(); this.ar?.exitPinned(); this.ar?.clearAnchors();
    this.moduleKey = null;
  }
  moduleModels() {
    const mod = this.module; return [...new Set([mod.main, ...mod.markers.map(id => this.catalog.markers[id]?.model).filter(Boolean)])];
  }
  exploredPct() {
    const total = this.moduleModels().reduce((t, k) => t + Object.keys(this.catalog.models[k]?.parts || {}).length, 0);
    return total ? Math.round((100 * this.explored.size) / total) : 0;
  }

  // ---------------------------------------------------------------- Registro de interacción
  log(kind, data = {}) { this.events.push({ kind, model: data.model || null, part: data.part || null, marker: data.marker || null, payload: data.payload || null, t: new Date().toISOString() }); }
  async flush() { if (!this.sid || !this.events.length) return; const ev = this.events.splice(0); try { await this.store.logEvents(this.sid, ev); } catch { this.events.unshift(...ev); } }

  // ---------------------------------------------------------------- Selección
  setActive(content) {
    if (this.active && this.active !== content) this.active.setHighlight(null);
    this.active = content; this.ar.active = content;
    content.whenReady(() => {
      const model = this.catalog.models[content.contentKey];
      const names = Object.fromEntries(Object.entries(model?.parts || {}).map(([k, p]) => [k, p.name]));
      this.ar.buildLabels(content, names, key => this.selectPart(content, key));
      if (this.active === content) this.renderInfo();
    });
    this.syncToolbar(); this.renderInfo();
  }
  selectPart(content, key, { speakIt } = {}) {
    if (this.active !== content) this.setActive(content);
    content.setHighlight(key);
    this.explored.add(content.contentKey + ':' + key);
    this.log('parte_seleccionada', { model: content.contentKey, part: key });
    this.renderInfo();
    if (speakIt ?? $('#autoSpeak').checked) this.speakPart(content, key);
  }
  vars(content) {
    if (content?.contentKey !== 'bohr' || !content.element) return {};
    const e = content.element; return { name: e.name, sym: e.sym, Z: e.Z, N: e.N, config: content.config() };
  }
  speakPart(content, key) {
    const p = this.catalog.models[content.contentKey]?.parts[key]; if (!p) return Promise.resolve();
    this.log('narracion', { model: content.contentKey, part: key });
    return speak(fill(`${p.name}. ${p.text}`, this.vars(content)));
  }

  // ---------------------------------------------------------------- Modo fijado
  pin(key) {
    const c = this.ar.enterPinned(key || this.active?.contentKey || this.module.main);
    this.log('anclado', { model: c.contentKey }); this.setActive(c);
    $('#tPin').textContent = '🎯 Volver a la tarjeta';
    this.setStatus('Modelo fijado: arrastra para girar, rueda para zoom', 'ok');
    return c;
  }
  unpin() {
    if (this.ar.source === 'none') { toast('Activa 📷 Cámara o 🧪 Simulación para volver a la tarjeta.'); return; }
    this.stopTour(); this.hands?.stop(); $('#tHands').classList.remove('on');
    this.ar.exitPinned(); this.active = null; this.ar.active = null; this.ar.buildLabels(null);
    const vis = this.ar.visibleContents(); if (vis[0]) this.setActive(vis[0]); else this.renderInfo();
    $('#tPin').textContent = '📌 Fijar en pantalla';
  }

  // ---------------------------------------------------------------- Barra de herramientas
  bindToolbar() {
    const on = (id, fn) => $(id).addEventListener('click', fn);
    on('#tPin', () => (this.ar.pinned ? this.unpin() : this.pin()));
    on('#tAnim', () => { this.ar.st.animate = !this.ar.st.animate; this.log('animacion', { payload: { anim: 'animacion', on: this.ar.st.animate } }); this.syncToolbar(); });
    on('#tFlow', () => { this.ar.st.flow = !this.ar.st.flow; if (this.ar.st.flow) this.log('animacion', { payload: { anim: 'flujo' } }); this.syncToolbar(); });
    on('#tCut', () => { const show = $('#cutWrap').hidden; $('#cutWrap').hidden = !show; if (!show) { this.ar.st.cut = 0; $('#cutRange').value = 0; } else this.log('animacion', { payload: { anim: 'corte' } }); this.syncToolbar(); });
    $('#cutRange').addEventListener('input', e => { this.ar.st.cut = +e.target.value; });
    on('#tExplode', () => { this.ar.st.explodeTarget = this.ar.st.explodeTarget ? 0 : 1; if (this.ar.st.explodeTarget) this.log('animacion', { payload: { anim: 'explosion' } }); this.syncToolbar(); });
    on('#tScale', () => { this.ar.st.realScale = !this.ar.st.realScale; toast(this.ar.st.realScale ? 'Escala real de tamaños (Júpiter ≈ 11 × Tierra)' : 'Escala didáctica'); this.syncToolbar(); });
    on('#tLabels', () => { this.ar.st.labels = !this.ar.st.labels; this.syncToolbar(); });
    on('#tCam', async () => {
      try { await this.ar.startCamera($('#camSelect').value || undefined); this.fillCameras(); if (this.ar.pinned && !this.quiz) this.unpin(); }
      catch (e) { toast('No se pudo abrir la cámara: ' + (e.message || e)); }
    });
    on('#tSim', () => $('#simButtons').classList.toggle('open'));
    on('#tSettings', () => { $('#settingsPop').hidden = !$('#settingsPop').hidden; this.fillCameras(); });
    on('#tFull', () => { const el = $('#stageCol'); document.fullscreenElement ? document.exitFullscreen() : el.requestFullscreen?.(); });
    on('#tHands', () => this.toggleHands());
    $('#speedRange').addEventListener('input', e => { this.ar.st.speed = +e.target.value; $('#speedVal').textContent = `${(+e.target.value).toFixed(2)}×`; });
    $('#camSelect').addEventListener('change', async e => { if (this.ar?.source === 'camera') { try { await this.ar.startCamera(e.target.value); } catch (err) { toast(err.message); } } });
    $$('[data-vtab]').forEach(b => b.addEventListener('click', () => this.showTab(b.dataset.vtab)));
  }
  syncToolbar() {
    if (!this.ar) return; const st = this.ar.st;
    $('#tAnim').classList.toggle('on', st.animate); $('#tFlow').classList.toggle('on', st.flow);
    $('#tExplode').classList.toggle('on', !!st.explodeTarget); $('#tScale').classList.toggle('on', st.realScale);
    $('#tLabels').classList.toggle('on', st.labels); $('#tCut').classList.toggle('on', !$('#cutWrap').hidden);
  }
  async fillCameras() {
    const cams = await this.ar.listCameras(); const sel = $('#camSelect'), cur = sel.value;
    sel.innerHTML = '<option value="">Predeterminada</option>' + cams.map((c, i) => `<option value="${c.deviceId}">${esc(c.label || 'Cámara ' + (i + 1))}</option>`).join('');
    sel.value = cur;
  }
  renderSimButtons() {
    const mod = this.module, opts = mod.markers.map(id => ({ ids: [id], label: `#${id} ${this.catalog.markers[id].title}` }));
    if (mod.markers.includes(3) && mod.markers.includes(4)) opts.push({ ids: [3, 4], label: 'Tierra + Júpiter (comparar)' });
    for (const r of this.catalog.reactions) {
      const ia = Object.keys(this.catalog.markers).find(k => this.catalog.markers[k].model === 'atom_' + r.a), ib = Object.keys(this.catalog.markers).find(k => this.catalog.markers[k].model === 'atom_' + r.b);
      if (ia && ib && mod.markers.includes(+ia)) opts.push({ ids: [+ia, +ib], label: `⚗️ ${r.a} + ${r.b} (reacción)` });
    }
    $('#simButtons').innerHTML = opts.map((o, i) => `<button class="chip" data-i="${i}">${esc(o.label)}</button>`).join('');
    $$('#simButtons button').forEach(b => b.onclick = () => { this.ar.startSim(opts[b.dataset.i].ids); if (this.ar.pinned && !this.quiz) this.unpin(); this.setStatus('Simulación: tarjeta virtual', 'search'); });
  }
  setStatus(t, kind) { const s = $('#vStatus'); s.textContent = t; s.className = 'pill ' + kind; }

  // ---------------------------------------------------------------- HoloHands
  async toggleHands() {
    if (this.hands?.active) { this.hands.stop(); $('#tHands').classList.remove('on'); return; }
    if (this.ar.source !== 'camera') { toast('Los gestos necesitan la cámara real (📷).'); return; }
    if (!this.ar.pinned) this.pin();
    this.hands ||= new HoloHands({ ar: this.ar, video: $('#video'), cursor: $('#handCursor'),
      onSelect: hit => { this.log('gesto', { payload: { g: 'seleccion' } }); if (this.quiz?.awaitingPick) this.quiz.onPick(hit.key); else this.selectPart(hit.content, hit.key); },
      onNav: dir => { this.log('gesto', { payload: { g: 'deslizar' } }); this.stepPart(dir); },
      onStatus: (t, off) => { toast(t, 3500); if (off) $('#tHands').classList.remove('on'); } });
    try { await this.hands.start(); $('#tHands').classList.add('on'); }
    catch (e) { toast('No se pudieron activar los gestos: ' + (e.message || e), 5000); }
  }
  stepPart(dir) {
    const c = this.active; if (!c) return;
    const keys = Object.keys(this.catalog.models[c.contentKey]?.parts || {}).filter(k => c.parts[k]);
    const i = keys.indexOf(c.highlighted); const k = keys[(i + dir + keys.length) % keys.length];
    this.selectPart(c, k); this.ar.focusPart(c, k);
  }

  // ---------------------------------------------------------------- Pestañas del panel
  showTab(tab) {
    this.tab = tab;
    $$('[data-vtab]').forEach(b => b.classList.toggle('active', b.dataset.vtab === tab));
    $('#pInfo').hidden = tab !== 'info'; $('#pTour').hidden = tab !== 'tour'; $('#pEval').hidden = tab !== 'eval';
    if (tab !== 'tour') this.stopTour();
    if (tab === 'info') this.renderInfo(); else if (tab === 'tour') this.renderTour(); else if (!this.quiz) this.renderEval();
  }
  renderInfo() {
    if (this.tab !== 'info') return;
    const el = $('#pInfo'), c = this.active, mod = this.module;
    const pct = this.exploredPct();
    const head = `<div class="explore-meter"><span>Exploración del módulo</span><b>${pct}%</b></div><div class="progress"><div style="width:${pct}%"></div></div>`;
    if (!c) {
      el.innerHTML = head + `<div class="empty"><div class="big">${this.app.subjectOf(mod).icon}</div>
        <p>Muestra una tarjeta de <b>${esc(mod.title)}</b> frente a la cámara.</p>
        <p class="muted small">Tarjetas: ${mod.markers.map(id => `#${id} ${esc(this.catalog.markers[id]?.title)}`).join(' · ')}</p>
        <p class="muted small">¿Sin tarjetas? <a href="tarjetas.html?module=${mod.key}" target="_blank">Ábrelas aquí</a>, usa 🧪 Simulación o 📌 Fijar.</p></div>`;
      return;
    }
    const model = this.catalog.models[c.contentKey]; if (!model) { el.innerHTML = head; return; }
    if (!c.ready) { el.innerHTML = head + `<p class="muted">${c.error ? '✖ No se pudo cargar el modelo 3D.' : '⏳ Cargando modelo 3D…'}</p>`; return; }
    const vars = this.vars(c);
    const keys = Object.keys(model.parts).filter(k => c.parts[k]);
    const sel = c.highlighted && model.parts[c.highlighted];
    let html = head + `<h2>${esc(model.name)}</h2>`;
    if (c.contentKey === 'bohr') {
      html += `<div class="elements">${this.catalog.elements.map(e => `<button class="el ${e.Z === this.ar.st.element ? 'sel' : ''}" data-z="${e.Z}" title="${esc(e.name)}"><small>${e.Z}</small>${e.sym}</button>`).join('')}</div>
        ${c.element ? `<p class="el-info"><b>${esc(c.element.name)}</b> · Z = ${c.element.Z} · ${c.element.N} neutrones · configuración <b>${c.config()}</b></p>` : ''}`;
    }
    html += sel ? `<div class="part-card"><h3>${esc(sel.name)}</h3><p>${esc(fill(sel.text, vars))}</p>
        ${sel.fact ? `<p class="fact">💡 ${esc(fill(sel.fact, vars))}</p>` : ''}
        ${sel.more ? `<details class="more"><summary>Saber más</summary><p>${esc(fill(sel.more, vars))}</p></details>` : ''}
        <div class="row"><button class="btn ghost small" id="iSpeak">🔊 Escuchar</button>${this.ar.pinned ? '<button class="btn ghost small" id="iFocus">🔍 Acercar</button>' : ''}<button class="btn ghost small" id="iClear">✖ Quitar selección</button></div></div>`
      : `<p>${esc(fill(model.intro, vars))}</p><p class="muted small">Toca una parte del modelo o una etiqueta para ver su explicación.</p>`;
    html += `<div class="chips">${keys.map(k => `<button class="chip ${this.explored.has(c.contentKey + ':' + k) ? 'done' : ''} ${c.highlighted === k ? 'sel' : ''}" data-k="${k}">${esc(model.parts[k].name)}</button>`).join('')}</div>`;
    if (model.source === 'glb' && model.attribution) html += `<p class="muted small credit">Modelo: ${esc(model.attribution)} · ${esc(model.license || '')}</p>`;
    el.innerHTML = html;
    $$('#pInfo .chip').forEach(b => b.onclick = () => { this.selectPart(c, b.dataset.k); this.ar.focusPart(c, b.dataset.k); });
    $$('#pInfo .el').forEach(b => b.onclick = () => { this.ar.st.element = +b.dataset.z; c.setElement(+b.dataset.z); this.log('animacion', { payload: { anim: 'elemento', z: +b.dataset.z } }); this.renderInfo(); });
    $('#iSpeak') && ($('#iSpeak').onclick = () => this.speakPart(c, c.highlighted));
    $('#iFocus') && ($('#iFocus').onclick = () => this.ar.focusPart(c, c.highlighted));
    $('#iClear') && ($('#iClear').onclick = () => { c.setHighlight(null); this.renderInfo(); });
  }

  // ---------------------------------------------------------------- Recorrido guiado
  renderTour() {
    const el = $('#pTour'), t = this.tour;
    const key = this.active?.contentKey || this.module.main, model = this.catalog.models[key];
    const steps = (model.tour || Object.keys(model.parts)).filter(k => model.parts[k]);
    el.innerHTML = `<h2>🧭 Recorrido guiado</h2><p class="muted">${esc(model.name)}: la cámara enfoca cada parte, la resalta y la explica en voz alta.</p>
      <ol class="tour-steps">${steps.map((k, i) => `<li class="${t && t.i === i ? 'cur' : ''} ${this.explored.has(key + ':' + k) ? 'done' : ''}">${esc(model.parts[k].name)}</li>`).join('')}</ol>
      <div class="row">${t ? `<button class="btn ghost" id="trPrev">◀</button><button class="btn ghost" id="trPause">${t.paused ? '▶ Continuar' : '⏸ Pausa'}</button><button class="btn ghost" id="trNext">▶▶</button><button class="btn ghost" id="trStop">⏹ Detener</button>`
        : `<button class="btn primary" id="trStart">▶ Iniciar recorrido</button>`}</div>
      <label class="small"><input type="checkbox" id="trVoice" ${this.tourVoice !== false ? 'checked' : ''}> Narrar cada paso</label>`;
    $('#trVoice').onchange = e => { this.tourVoice = e.target.checked; };
    if (!t) { $('#trStart').onclick = () => this.startTour(key, steps); return; }
    $('#trPause').onclick = () => { t.paused = !t.paused; if (t.paused) stopSpeak(); this.renderTour(); };
    $('#trNext').onclick = () => { t.jump = 1; stopSpeak(); };
    $('#trPrev').onclick = () => { t.jump = -1; stopSpeak(); };
    $('#trStop').onclick = () => this.stopTour();
  }
  async startTour(key, steps) {
    const c = this.ar.pinned && this.ar.pinnedContent?.contentKey === key ? this.ar.pinnedContent : this.pin(key);
    await new Promise(r => c.whenReady(r));
    const t = this.tour = { i: 0, paused: false, jump: 0, stopped: false };
    this.log('recorrido_paso', { model: key, payload: { start: true } });
    while (!t.stopped && t.i < steps.length) {
      const k = steps[t.i];
      if (c.parts[k]) { this.selectPart(c, k, { speakIt: false }); this.ar.focusPart(c, k); this.log('recorrido_paso', { model: key, part: k }); }
      this.renderTour();
      const p = this.catalog.models[key].parts[k];
      if (this.tourVoice !== false) await speak(fill(`${p.name}. ${p.text}`, this.vars(c))); else await sleep(5000);
      await sleep(600);
      while (t.paused && !t.stopped && !t.jump) await sleep(200);
      if (t.stopped) break;
      t.i = Math.max(0, t.i + (t.jump || 1)); t.jump = 0;
    }
    if (this.tour === t) { this.tour = null; this.ar.resetView(); c.setHighlight(null); if (!t.stopped) toast('✔ Recorrido terminado'); this.renderTour(); this.renderInfo(); }
  }
  stopTour() { if (this.tour) { this.tour.stopped = true; stopSpeak(); this.tour = null; } }

  // ---------------------------------------------------------------- Evaluación
  async renderEval() {
    const el = $('#pEval'), mod = this.module;
    const prog = (await this.store.progress())[mod.key] || {};
    const pct = Math.max(this.exploredPct(), prog.explored || 0), need = mod.min_explored_pct ?? 50;
    const qz = this.catalog.quizzes[mod.key] || {};
    el.innerHTML = `<h2>📝 Evaluación</h2>
      <div class="eval-card"><h3>1 · Pre-test <small class="muted">(${(qz.pre || []).length} preguntas)</small></h3>
        <p class="muted small">Contéstalo ANTES de explorar: mide lo que ya sabes para calcular cuánto aprendiste.</p>
        ${prog.pre != null ? `<p>✔ Hecho: <b>${prog.pre}%</b></p>` : `<button class="btn primary" id="eStartPre" ${(qz.pre || []).length ? '' : 'disabled'}>Comenzar pre-test</button>`}</div>
      <div class="eval-card"><h3>2 · Evaluación final <small class="muted">(${(qz.post || []).length} preguntas)</small></h3>
        <p class="muted small">Incluye preguntas que se contestan tocando el modelo 3D.</p>
        <div class="progress"><div style="width:${Math.min(100, (pct / need) * 100)}%"></div></div>
        <p class="small">${pct >= need ? '✔ Exploraste lo suficiente' : `Explora al menos el ${need}% del módulo (llevas ${pct}%)`}</p>
        ${prog.best != null ? `<p>Mejor resultado: <b>${prog.best}%</b> (${prog.attempts} intento${prog.attempts === 1 ? '' : 's'})</p>` : ''}
        <button class="btn ${pct >= need ? 'primary' : 'ghost'}" id="eStartPost" ${(qz.post || []).length ? '' : 'disabled'}>${pct >= need ? 'Comenzar evaluación' : 'Comenzar de todos modos'}</button></div>`;
    $('#eStartPre') && ($('#eStartPre').onclick = () => this.startQuiz('pre'));
    $('#eStartPost').onclick = () => this.startQuiz('post');
  }
  async startQuiz(kind) {
    this.stopTour();
    const mod = this.module, qs = this.catalog.quizzes[mod.key]?.[kind] || [];
    if (qs.some(q => q.type === 'pick')) { const c = this.pin(mod.main); await new Promise(r => c.whenReady(r)); c.setHighlight(null); }
    this.ar.st.quiz = true;
    this.quiz = new QuizRunner({ el: $('#pEval'), store: this.store, catalog: this.catalog, moduleKey: mod.key, kind,
      getModelContent: () => this.ar.pinnedContent,
      onPickModeChange: on => $('#stage').classList.toggle('picking', on),
      onDone: (k, res, clicked) => {
        this.ar.st.quiz = false;
        if (!clicked) return;
        this.quiz = null;
        if (k === 'pre') this.showTab('info'); else this.startQuiz('post');
      } });
    this.log('animacion', { payload: { anim: 'cuestionario_' + kind } });
    await this.quiz.start();
  }
}
