// =====================================================================
//  HoloClass · HoloQuiz
//  Tipos: opción múltiple (mc), verdadero/falso (tf), selección en el modelo 3D (pick), ordenar (order)
//  Pre-test: sin retroalimentación (mide conocimientos previos). Evaluación: retroalimentación inmediata.
// =====================================================================
import { esc, shuffle, confetti, speak } from './util.js';

export class QuizRunner {
  constructor({ el, store, catalog, moduleKey, kind, getModelContent, onPickModeChange, onDone }) {
    Object.assign(this, { el, store, catalog, moduleKey, kind, getModelContent, onPickModeChange, onDone });
    this.awaitingPick = false; this.pick = null; this.i = 0; this.answers = []; this.feedback = null;
  }
  async start() {
    this.el.innerHTML = '<p class="muted">Cargando preguntas…</p>';
    const qs = await this.store.quiz(this.moduleKey, this.kind);
    this.questions = shuffle(qs).map(q => (q.type === 'order' ? { ...q, view: shuffle(q.items) } : q));
    this.startedAt = new Date().toISOString();
    this.qStart = performance.now();
    if (!this.questions.length) { this.el.innerHTML = '<p class="muted">Este módulo aún no tiene preguntas.</p>'; return; }
    this.render();
  }
  get q() { return this.questions[this.i]; }
  partName(key) { const c = this.getModelContent(); const m = this.catalog.models[c?.contentKey]; return m?.parts[key]?.name || key; }
  render() {
    const q = this.q, fb = this.feedback, pre = this.kind === 'pre';
    this.awaitingPick = q.type === 'pick' && !fb;
    this.onPickModeChange?.(this.awaitingPick);
    const tag = { mc: 'Opción múltiple', tf: 'Verdadero o falso', pick: '🎯 En el modelo 3D', order: '↕ Ordenar' }[q.type];
    let html = `<div class="q-head"><span>${pre ? 'Pre-test' : 'Evaluación'} · ${this.i + 1} de ${this.questions.length}</span><span class="tag">${tag}</span></div>
      <div class="progress small"><div style="width:${(this.i / this.questions.length) * 100}%"></div></div>
      <h3 class="q">${esc(q.q)}</h3>`;
    if (q.type === 'mc') {
      html += `<div class="options">${q.options.map((o, i) => {
        let cls = ''; if (fb && !pre) cls = i === fb.correct ? 'right' : (i === fb.answer ? 'wrong' : ''); else if (fb && i === fb.answer) cls = 'chosen';
        return `<button class="opt ${cls}" data-v="${i}" ${fb ? 'disabled' : ''}>${esc(o)}</button>`; }).join('')}</div>`;
    } else if (q.type === 'tf') {
      html += `<div class="options two">${[true, false].map(v => {
        let cls = ''; if (fb && !pre) cls = v === fb.correct ? 'right' : (v === fb.answer ? 'wrong' : ''); else if (fb && v === fb.answer) cls = 'chosen';
        return `<button class="opt ${cls}" data-v="${v}" ${fb ? 'disabled' : ''}>${v ? 'Verdadero' : 'Falso'}</button>`; }).join('')}</div>`;
    } else if (q.type === 'pick') {
      if (!fb) html += `<p class="pick-hint">${this.pick ? `Seleccionaste: <b>${esc(this.partName(this.pick))}</b>` : '👆 Toca la parte en el modelo 3D (o usa los gestos)'}</p>
        <button class="btn primary" id="qConfirm" ${this.pick ? '' : 'disabled'}>Confirmar</button>`;
    } else if (q.type === 'order') {
      html += `<ol class="order">${q.view.map((it, i) => `<li><span>${esc(it)}</span>${fb ? '' : `<button data-up="${i}" ${i === 0 ? 'disabled' : ''}>▲</button><button data-down="${i}" ${i === q.view.length - 1 ? 'disabled' : ''}>▼</button>`}</li>`).join('')}</ol>`;
      if (!fb) html += `<button class="btn primary" id="qConfirm">Confirmar orden</button>`;
      else if (!pre && !fb.ok) html += `<p class="muted small">Orden correcto: ${fb.correct.map(esc).join(' → ')}</p>`;
    }
    if (fb) {
      html += pre ? `<div class="feedback neutral">Respuesta registrada.</div>`
        : `<div class="feedback ${fb.ok ? 'ok' : 'bad'}">${fb.ok ? '✔ ¡Correcto!' : '✖ Incorrecto'} — ${esc(fb.explain || '')}</div>`;
      html += `<button class="btn primary" id="qNext">${this.i + 1 < this.questions.length ? 'Siguiente →' : 'Ver resultados'}</button>`;
    }
    this.el.innerHTML = html;
    this.el.querySelectorAll('.opt').forEach(b => b.onclick = () => this.answer(q.type === 'tf' ? b.dataset.v === 'true' : Number(b.dataset.v)));
    this.el.querySelectorAll('[data-up]').forEach(b => b.onclick = () => { const i = +b.dataset.up; [q.view[i - 1], q.view[i]] = [q.view[i], q.view[i - 1]]; this.render(); });
    this.el.querySelectorAll('[data-down]').forEach(b => b.onclick = () => { const i = +b.dataset.down; [q.view[i + 1], q.view[i]] = [q.view[i], q.view[i + 1]]; this.render(); });
    const c = this.el.querySelector('#qConfirm'); if (c) c.onclick = () => this.answer(q.type === 'order' ? q.view.slice() : this.pick);
    const n = this.el.querySelector('#qNext'); if (n) n.onclick = () => this.next();
  }
  onPick(key) { if (!this.awaitingPick) return false; this.pick = key; this.getModelContent()?.setHighlight(key); this.render(); return true; }
  async answer(value) {
    const q = this.q, ms = Math.round(performance.now() - this.qStart);
    this.answers.push({ qid: q.id, answer: value, ms });
    let res = { ok: null, correct: null, explain: '' };
    if (this.kind !== 'pre') res = await this.store.check(this.moduleKey, this.kind, q.id, value);
    this.feedback = { ...res, answer: value };
    if (q.type === 'pick' && this.kind !== 'pre') this.getModelContent()?.setHighlight(res.correct);
    this.render();
  }
  next() {
    this.i++; this.pick = null; this.feedback = null; this.qStart = performance.now();
    this.getModelContent()?.setHighlight(null);
    if (this.i >= this.questions.length) this.finish(); else this.render();
  }
  async finish() {
    this.onPickModeChange?.(false);
    this.el.innerHTML = '<p class="muted">Calificando…</p>';
    const res = await this.store.submitAttempt(this.moduleKey, this.kind, this.answers, this.startedAt);
    const byConcept = {};
    for (const a of res.answers) { const q = this.questions.find(x => x.id === a.qid); const k = q?.concept || 'General'; (byConcept[k] ||= [0, 0])[1]++; if (a.ok) byConcept[k][0]++; }
    const progress = await this.store.progress(), p = progress[this.moduleKey] || {};
    const stars = res.score >= 90 ? '⭐⭐⭐' : res.score >= 60 ? '⭐⭐' : '⭐';
    const gain = this.kind === 'post' && p.pre != null ? (p.pre >= 100 ? 0 : Math.round(((res.score - p.pre) / (100 - p.pre)) * 100) / 100) : null;
    this.el.innerHTML = `<div class="result"><div class="score">${res.score}%</div><div class="stars">${stars}</div>
        <p>${res.answers.filter(a => a.ok).length} de ${res.answers.length} correctas${this.kind === 'pre' ? ' en el pre-test' : ''}</p>
        ${p.pre != null && this.kind === 'post' ? `<p class="gain">Antes <b>${p.pre}%</b> → Ahora <b>${res.score}%</b>${gain !== null ? ` · ganancia normalizada <b>${gain}</b>` : ''}</p>` : ''}
        ${this.kind === 'pre' ? '<p class="muted">¡Listo! Ahora explora el modelo y después presenta la evaluación final para medir cuánto aprendiste.</p>' : ''}
      </div>
      <h4>Por concepto</h4>
      ${Object.entries(byConcept).map(([k, [ok, n]]) => `<div class="bar-row"><span>${esc(k)}</span><div class="bar"><div style="width:${(ok / n) * 100}%"></div></div><b>${Math.round((ok / n) * 100)}%</b></div>`).join('')}
      <div class="row"><button class="btn primary" id="qAgain">${this.kind === 'pre' ? 'Ir a explorar' : 'Intentar de nuevo'}</button></div>`;
    if (this.kind === 'post' && res.score >= 80) { confetti(); speak(`¡Excelente! Obtuviste ${res.score} por ciento`); }
    this.el.querySelector('#qAgain').onclick = () => this.onDone?.(this.kind, res, true);
    this.onDone?.(this.kind, res, false);
  }
}
