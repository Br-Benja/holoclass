// =====================================================================
//  HoloClass · Capa de datos
//  - ApiStore: habla con el backend FastAPI + PostgreSQL (si está disponible)
//  - LocalStore: mismo comportamiento guardando en el navegador (GitHub Pages / sin servidor)
//  La interfaz es idéntica, así la interfaz de usuario no sabe cuál está usando.
// =====================================================================
import { clone, uid } from './util.js';

const CONTENT_URL = './data/content.json';

// ------------------------------------------------------------------ Lógica compartida
export function gradeAnswer(q, answer) {
  switch (q.type) {
    case 'mc': return { ok: answer === q.answer, correct: q.answer };
    case 'tf': return { ok: answer === q.answer, correct: q.answer };
    case 'pick': return { ok: answer === q.answer, correct: q.answer };
    case 'order': return { ok: Array.isArray(answer) && answer.join('|') === q.items.join('|'), correct: q.items };
    default: return { ok: false, correct: null };
  }
}

export function applyOverrides(base, ov = {}, custom = []) {
  const c = clone(base);
  for (const [mk, m] of Object.entries(ov.models || {})) {
    if (!c.models[mk]) continue;
    if (m.intro != null) c.models[mk].intro = m.intro;
    for (const [pk, p] of Object.entries(m.parts || {})) c.models[mk].parts[pk] = { ...(c.models[mk].parts[pk] || {}), ...p };
  }
  for (const [mk, q] of Object.entries(ov.quizzes || {})) c.quizzes[mk] = { ...(c.quizzes[mk] || {}), ...q };
  for (const cm of custom) {
    c.modules.push(cm.module);
    c.models[cm.module.main] = cm.model;
    for (const id of cm.module.markers) c.markers[id] = { model: cm.module.main, title: cm.module.title };
    c.quizzes[cm.module.key] = cm.quizzes || { pre: [], post: [] };
  }
  return c;
}

/** Estadísticas para el panel docente (el backend calcula exactamente lo mismo en Python). */
export function computeStats(catalog, students, sessions, attempts) {
  const ids = new Set(students.map(s => s.id));
  const ses = sessions.filter(s => ids.has(s.user));
  const att = attempts.filter(a => ids.has(a.user));
  const minutes = s => s.end ? Math.max(0, (new Date(s.end) - new Date(s.start)) / 60000) : 0;
  const modules = {};
  for (const m of catalog.modules) {
    const qs = catalog.quizzes[m.key]?.post || [];
    const post = att.filter(a => a.module === m.key && a.kind === 'post');
    const pre = att.filter(a => a.module === m.key && a.kind === 'pre');
    const questions = qs.map(q => {
      const ans = post.flatMap(a => a.answers.filter(x => x.qid === q.id));
      return { id: q.id, q: q.q, type: q.type, concept: q.concept, answered: ans.length,
        pct: ans.length ? Math.round(100 * ans.filter(x => x.ok).length / ans.length) : null,
        avgSec: ans.length ? +(ans.reduce((s, x) => s + (x.ms || 0), 0) / ans.length / 1000).toFixed(1) : null };
    });
    const parts = {};
    for (const s of ses.filter(s => s.module === m.key)) for (const [k, n] of Object.entries(s.parts || {})) parts[k] = (parts[k] || 0) + n;
    const gains = [];
    for (const st of students) {
      const p = pre.filter(a => a.user === st.id).sort((a, b) => a.end.localeCompare(b.end));
      const q = post.filter(a => a.user === st.id);
      if (p.length && q.length) {
        const preS = p[0].score, postS = Math.max(...q.map(a => a.score));
        gains.push({ student: st.id, pre: preS, post: postS, gain: preS >= 100 ? 0 : +((postS - preS) / (100 - preS)).toFixed(2) });
      }
    }
    const answered = questions.filter(x => x.pct !== null);
    modules[m.key] = {
      sessions: ses.filter(s => s.module === m.key).length,
      minutes: +ses.filter(s => s.module === m.key).reduce((t, s) => t + minutes(s), 0).toFixed(1),
      attempts: post.length,
      avgPost: post.length ? Math.round(post.reduce((t, a) => t + a.score, 0) / post.length) : null,
      avgPre: pre.length ? Math.round(pre.reduce((t, a) => t + a.score, 0) / pre.length) : null,
      avgGain: gains.length ? +(gains.reduce((t, g) => t + g.gain, 0) / gains.length).toFixed(2) : null,
      gains, questions,
      parts: Object.entries(parts).map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count),
      hardest: answered.sort((a, b) => a.pct - b.pct)[0] || null,
    };
  }
  const studentsOut = students.map(st => {
    const mine = ses.filter(s => s.user === st.id), myAtt = att.filter(a => a.user === st.id);
    const mods = {};
    for (const m of catalog.modules) {
      const sm = mine.filter(s => s.module === m.key), am = myAtt.filter(a => a.module === m.key);
      const pre = am.filter(a => a.kind === 'pre').sort((a, b) => a.end.localeCompare(b.end))[0];
      const posts = am.filter(a => a.kind === 'post');
      mods[m.key] = { explored: sm.length ? Math.max(...sm.map(s => s.explored || 0)) : 0, pre: pre ? pre.score : null,
        best: posts.length ? Math.max(...posts.map(a => a.score)) : null, attempts: posts.length };
    }
    return { id: st.id, name: st.name, email: st.email, sessions: mine.length,
      minutes: +mine.reduce((t, s) => t + minutes(s), 0).toFixed(1), last: [...mine.map(s => s.start), ...myAtt.map(a => a.end)].sort().pop() || null, modules: mods };
  });
  const posts = att.filter(a => a.kind === 'post');
  return {
    totals: { students: students.length, sessions: ses.length, attempts: posts.length,
      avgScore: posts.length ? Math.round(posts.reduce((t, a) => t + a.score, 0) / posts.length) : null,
      minutes: +ses.reduce((t, s) => t + minutes(s), 0).toFixed(1) },
    modules, students: studentsOut,
  };
}

/** Progreso de un estudiante (mismo formato en ambos modos). */
function progressFrom(catalog, sessions, attempts) {
  const out = {};
  for (const m of catalog.modules) {
    const sm = sessions.filter(s => s.module === m.key), am = attempts.filter(a => a.module === m.key);
    const pre = am.filter(a => a.kind === 'pre').sort((a, b) => a.end.localeCompare(b.end))[0];
    const posts = am.filter(a => a.kind === 'post');
    out[m.key] = { explored: sm.length ? Math.max(...sm.map(s => s.explored || 0)) : 0, pre: pre ? pre.score : null,
      best: posts.length ? Math.max(...posts.map(a => a.score)) : null, attempts: posts.length, sessions: sm.length };
  }
  return out;
}

// ------------------------------------------------------------------ Contraseñas (modo local): PBKDF2-SHA256
async function hashPassword(password, salt) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: new TextEncoder().encode(salt), iterations: 120000, hash: 'SHA-256' }, key, 256);
  return [...new Uint8Array(bits)].map(b => b.toString(16).padStart(2, '0')).join('');
}
const joinCode = () => Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');

// ------------------------------------------------------------------ IndexedDB para archivos GLB (modo local)
function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('holoclass_files', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('files');
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function idbPut(key, blob) { const db = await idb(); return new Promise((res, rej) => { const tx = db.transaction('files', 'readwrite'); tx.objectStore('files').put(blob, key); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); }
async function idbGet(key) { const db = await idb(); return new Promise((res, rej) => { const r = db.transaction('files').objectStore('files').get(key); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
async function idbDel(key) { const db = await idb(); return new Promise(res => { const tx = db.transaction('files', 'readwrite'); tx.objectStore('files').delete(key); tx.oncomplete = res; }); }

// =====================================================================
//  LocalStore
// =====================================================================
const LKEY = 'holoclass_db_v2';
class LocalStore {
  constructor(base) {
    this.mode = 'local'; this.base = base;
    try { this.db = JSON.parse(localStorage.getItem(LKEY)); } catch { this.db = null; }
    this.db ||= { users: [], groups: [], members: [], sessions: [], attempts: [], overrides: {}, custom: [], current: null };
  }
  save() { try { localStorage.setItem(LKEY, JSON.stringify(this.db)); } catch (e) { console.warn('No se pudo guardar', e); } }
  publicUser(u) { return u && { id: u.id, name: u.name, email: u.email, role: u.role, groups: this.db.members.filter(m => m.student === u.id).map(m => m.group) }; }
  async me() { return this.publicUser(this.db.users.find(u => u.id === this.db.current)); }
  async register({ name, email, password, role, groupCode }) {
    email = email.trim().toLowerCase();
    if (!name?.trim() || !email || !password) throw new Error('Completa nombre, correo y contraseña.');
    if (password.length < 6) throw new Error('La contraseña debe tener al menos 6 caracteres.');
    if (this.db.users.some(u => u.email === email)) throw new Error('Ya existe una cuenta con ese correo.');
    const salt = uid();
    const u = { id: 'u_' + uid(), name: name.trim(), email, role: role === 'docente' ? 'docente' : 'estudiante', salt, hash: await hashPassword(password, salt), created: new Date().toISOString() };
    this.db.users.push(u); this.db.current = u.id; this.save();
    if (groupCode && u.role === 'estudiante') await this.joinGroup(groupCode);
    return this.me();
  }
  async login(email, password) {
    const u = this.db.users.find(x => x.email === email.trim().toLowerCase());
    if (!u || u.hash !== await hashPassword(password, u.salt)) throw new Error('Correo o contraseña incorrectos.');
    this.db.current = u.id; this.save(); return this.me();
  }
  async logout() { this.db.current = null; this.save(); }
  async ensureDemo() {
    if (!this.db.users.some(u => u.email === 'docente@demo.mx')) {
      const t = await this.register({ name: 'Mtra. Laura Gómez', email: 'docente@demo.mx', password: 'demo1234', role: 'docente' });
      this.db.groups.push({ id: 'g_demo', teacher: t.id, name: '2.º B Ciencias (demo)', code: 'DEMO01', created: new Date().toISOString() });
      await this.register({ name: 'Diego Ramírez', email: 'estudiante@demo.mx', password: 'demo1234', role: 'estudiante', groupCode: 'DEMO01' });
      this.db.current = null; this.save();
    }
  }
  // ----- contenido
  async catalog() { return applyOverrides(this.base, this.db.overrides, this.db.custom); }
  async saveModelTexts(modelKey, { intro, parts }) {
    const o = (this.db.overrides.models ||= {}); const m = (o[modelKey] ||= {});
    if (intro != null) m.intro = intro;
    m.parts = { ...(m.parts || {}), ...parts };
    const cm = this.db.custom.find(c => c.module.main === modelKey);
    if (cm) { if (intro != null) cm.model.intro = intro; for (const [k, p] of Object.entries(parts)) cm.model.parts[k] = { ...(cm.model.parts[k] || {}), ...p }; }
    this.save();
  }
  async saveQuiz(moduleKey, kind, questions) {
    const cm = this.db.custom.find(c => c.module.key === moduleKey);
    if (cm) (cm.quizzes ||= { pre: [], post: [] })[kind] = questions;
    else ((this.db.overrides.quizzes ||= {})[moduleKey] ||= {})[kind] = questions;
    this.save();
  }
  async resetContent() { this.db.overrides = {}; this.save(); }
  async createCustomModule({ module, model, quizzes }, file) {
    const key = 'custom_' + uid();
    const modelKey = 'glb_' + key;
    module = { ...module, key, main: modelKey, custom: true };
    model = { ...model, source: 'glb', file: 'idb:' + modelKey };
    await idbPut(modelKey, file);
    this.db.custom.push({ module, model, quizzes: quizzes || { pre: [], post: [] } }); this.save();
    return module;
  }
  async deleteCustomModule(key) {
    const cm = this.db.custom.find(c => c.module.key === key); if (!cm) return;
    await idbDel(cm.module.main); this.db.custom = this.db.custom.filter(c => c !== cm); this.save();
  }
  async modelFileURL(model) {
    if (!model.file) return null;
    if (model.file.startsWith('idb:')) { const blob = await idbGet(model.file.slice(4)); return blob ? URL.createObjectURL(blob) : null; }
    return model.file;
  }
  // ----- aprendizaje
  async startSession(moduleKey) {
    const s = { id: 's_' + uid(), user: this.db.current || 'guest', module: moduleKey, start: new Date().toISOString(), end: null, parts: {}, anims: {}, explored: 0, avgFps: null, lost: 0, events: 0 };
    this.db.sessions.push(s); this.save(); return s.id;
  }
  async logEvents(sid, events) {
    const s = this.db.sessions.find(x => x.id === sid); if (!s) return;
    for (const e of events) {
      s.events++;
      if (e.kind === 'parte_seleccionada') s.parts[e.model + ':' + e.part] = (s.parts[e.model + ':' + e.part] || 0) + 1;
      if (e.kind === 'animacion') s.anims[e.payload?.anim] = (s.anims[e.payload?.anim] || 0) + 1;
      if (e.kind === 'seguimiento_perdido') s.lost++;
    }
    this.save();
  }
  async endSession(sid, { explored, avgFps }) {
    const s = this.db.sessions.find(x => x.id === sid); if (!s) return;
    s.end = new Date().toISOString(); s.explored = Math.max(s.explored, explored || 0); if (avgFps) s.avgFps = avgFps; this.save();
  }
  async quiz(moduleKey, kind) { const c = await this.catalog(); return clone(c.quizzes[moduleKey]?.[kind] || []); }
  async check(moduleKey, kind, qid, answer) {
    const q = (await this.catalog()).quizzes[moduleKey][kind].find(x => x.id === qid);
    return { ...gradeAnswer(q, answer), explain: q.explain };
  }
  async submitAttempt(moduleKey, kind, answers, startedAt) {
    const qs = (await this.catalog()).quizzes[moduleKey][kind];
    const graded = answers.map(a => { const q = qs.find(x => x.id === a.qid); return { qid: a.qid, ok: gradeAnswer(q, a.answer).ok, ms: a.ms }; });
    const score = Math.round(100 * graded.filter(g => g.ok).length / (qs.length || 1));
    const at = { id: 'a_' + uid(), user: this.db.current || 'guest', module: moduleKey, kind, score, answers: graded, start: startedAt, end: new Date().toISOString() };
    this.db.attempts.push(at); this.save();
    return { score, answers: graded, attemptId: at.id };
  }
  async progress() {
    const me = this.db.current || 'guest';
    return progressFrom(await this.catalog(), this.db.sessions.filter(s => s.user === me), this.db.attempts.filter(a => a.user === me));
  }
  // ----- grupos
  async joinGroup(code) {
    const g = this.db.groups.find(x => x.code === code.trim().toUpperCase());
    if (!g) throw new Error('No existe un grupo con ese código.');
    if (!this.db.members.some(m => m.group === g.id && m.student === this.db.current)) this.db.members.push({ group: g.id, student: this.db.current, joined: new Date().toISOString() });
    this.save(); return g;
  }
  async myGroups() { return this.db.groups.filter(g => this.db.members.some(m => m.group === g.id && m.student === this.db.current)).map(g => ({ id: g.id, name: g.name, code: g.code })); }
  async groups() {
    return this.db.groups.filter(g => g.teacher === this.db.current)
      .map(g => ({ ...g, students: this.db.members.filter(m => m.group === g.id).length }));
  }
  async createGroup(name) {
    const g = { id: 'g_' + uid(), teacher: this.db.current, name: name.trim() || 'Grupo nuevo', code: joinCode(), created: new Date().toISOString() };
    this.db.groups.push(g); this.save(); return g;
  }
  async deleteGroup(id) { this.db.groups = this.db.groups.filter(g => g.id !== id); this.db.members = this.db.members.filter(m => m.group !== id); this.save(); }
  async removeStudent(groupId, studentId) { this.db.members = this.db.members.filter(m => !(m.group === groupId && m.student === studentId)); this.save(); }
  async stats(groupId) {
    const groups = groupId ? [groupId] : (await this.groups()).map(g => g.id);
    const sids = new Set(this.db.members.filter(m => groups.includes(m.group)).map(m => m.student));
    const students = this.db.users.filter(u => sids.has(u.id)).map(u => ({ id: u.id, name: u.name, email: u.email }));
    return computeStats(await this.catalog(), students, this.db.sessions, this.db.attempts);
  }
  /** Datos SIMULADOS para mostrar el panel docente (se marcan como tales). */
  async seedSimulated(groupId) {
    const c = await this.catalog();
    const names = ['Ana', 'Luis', 'Sofía', 'Mateo', 'Valeria', 'Emiliano', 'Regina', 'Santiago', 'Camila', 'Leonardo', 'Ximena', 'Iker'];
    const rnd = (a, b) => a + Math.random() * (b - a);
    for (const n of names) {
      const u = { id: 'u_' + uid(), name: `${n} (simulado)`, email: `${n.toLowerCase()}.${uid()}@sim.local`, role: 'estudiante', salt: 'x', hash: 'x', created: new Date().toISOString(), simulated: true };
      this.db.users.push(u); this.db.members.push({ group: groupId, student: u.id, joined: u.created });
      for (const m of c.modules.filter(m => !m.custom)) {
        if (Math.random() < 0.2) continue;
        const start = new Date(Date.now() - rnd(1, 9) * 86400000); const end = new Date(start.getTime() + rnd(4, 18) * 60000);
        const model = c.models[m.main]; const parts = {};
        for (const pk of Object.keys(model.parts)) if (Math.random() < 0.8) parts[m.main + ':' + pk] = Math.ceil(rnd(1, 4));
        const explored = Math.round(100 * Object.keys(parts).length / Object.keys(model.parts).length);
        this.db.sessions.push({ id: 's_' + uid(), user: u.id, module: m.key, start: start.toISOString(), end: end.toISOString(), parts, anims: {}, explored, avgFps: Math.round(rnd(35, 60)), lost: 0, events: 10 });
        const skill = rnd(0.3, 0.95);
        for (const kind of ['pre', 'post']) {
          const qs = c.quizzes[m.key]?.[kind] || []; if (!qs.length) continue;
          const p = kind === 'pre' ? skill * 0.6 : Math.min(0.98, skill + 0.15);
          const answers = qs.map(q => ({ qid: q.id, ok: Math.random() < (q.type === 'pick' ? p * 0.9 : p), ms: Math.round(rnd(3000, 15000)) }));
          const t = new Date(kind === 'pre' ? start.getTime() - 60000 : end.getTime());
          this.db.attempts.push({ id: 'a_' + uid(), user: u.id, module: m.key, kind, score: Math.round(100 * answers.filter(a => a.ok).length / qs.length), answers, start: t.toISOString(), end: t.toISOString() });
        }
      }
    }
    this.save();
  }
  async clearSimulated() {
    const sim = new Set(this.db.users.filter(u => u.simulated).map(u => u.id));
    this.db.users = this.db.users.filter(u => !sim.has(u.id)); this.db.members = this.db.members.filter(m => !sim.has(m.student));
    this.db.sessions = this.db.sessions.filter(s => !sim.has(s.user)); this.db.attempts = this.db.attempts.filter(a => !sim.has(a.user)); this.save();
  }
}

// =====================================================================
//  ApiStore (FastAPI)
// =====================================================================
class ApiStore {
  constructor(base, content) { this.mode = 'api'; this.api = base; this.token = localStorage.getItem('hc_token'); this.baseContent = content; }
  async req(path, { method = 'GET', body, form } = {}) {
    const headers = {}; if (this.token) headers.Authorization = 'Bearer ' + this.token;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const r = await fetch(this.api + path, { method, headers, body: form || (body !== undefined ? JSON.stringify(body) : undefined) });
    if (r.status === 401 && this.token) { this.token = null; localStorage.removeItem('hc_token'); }
    if (!r.ok) { let msg = `Error ${r.status}`; try { const j = await r.json(); msg = typeof j.detail === 'string' ? j.detail : (j.detail?.[0]?.msg || msg); } catch {} throw new Error(msg); }
    return r.status === 204 ? null : r.json();
  }
  async me() { if (!this.token) return null; try { return await this.req('/api/auth/me'); } catch { return null; } }
  async register(data) { const r = await this.req('/api/auth/register', { method: 'POST', body: { ...data, group_code: data.groupCode || null } }); this.setToken(r.token); return r.user; }
  async login(email, password) { const r = await this.req('/api/auth/login', { method: 'POST', body: { email, password } }); this.setToken(r.token); return r.user; }
  setToken(t) { this.token = t; localStorage.setItem('hc_token', t); }
  async logout() { this.token = null; localStorage.removeItem('hc_token'); }
  async ensureDemo() { /* el backend crea las cuentas demo al sembrar la base */ }
  async catalog() { return this.req('/api/catalog'); }
  async saveModelTexts(modelKey, data) { return this.req(`/api/teacher/models/${modelKey}/texts`, { method: 'PUT', body: data }); }
  async saveQuiz(moduleKey, kind, questions) { return this.req(`/api/teacher/quizzes/${moduleKey}/${kind}`, { method: 'PUT', body: { questions } }); }
  async resetContent() { return this.req('/api/teacher/content/reset', { method: 'POST' }); }
  async createCustomModule(payload, file) {
    const fd = new FormData(); fd.append('payload', JSON.stringify(payload)); fd.append('file', file, file.name || 'modelo.glb');
    return this.req('/api/teacher/modules', { method: 'POST', form: fd });
  }
  async deleteCustomModule(key) { return this.req(`/api/teacher/modules/${key}`, { method: 'DELETE' }); }
  async modelFileURL(model) { return model.file ? (model.file.startsWith('http') ? model.file : this.api + model.file) : null; }
  async startSession(moduleKey) { return (await this.req('/api/sessions', { method: 'POST', body: { module: moduleKey } })).id; }
  async logEvents(sid, events) { if (events.length) await this.req(`/api/sessions/${sid}/events`, { method: 'POST', body: { events } }); }
  async endSession(sid, data) { return this.req(`/api/sessions/${sid}/end`, { method: 'POST', body: { explored: data.explored, avg_fps: data.avgFps } }); }
  async quiz(moduleKey, kind) { return this.req(`/api/quizzes/${moduleKey}/${kind}`); }
  async check(moduleKey, kind, qid, answer) { return this.req(`/api/quizzes/${moduleKey}/${kind}/check`, { method: 'POST', body: { qid, answer } }); }
  async submitAttempt(moduleKey, kind, answers, startedAt) { return this.req(`/api/quizzes/${moduleKey}/${kind}/attempts`, { method: 'POST', body: { answers, started_at: startedAt } }); }
  async progress() { return this.req('/api/me/progress'); }
  async joinGroup(code) { return this.req('/api/groups/join', { method: 'POST', body: { code } }); }
  async myGroups() { return this.req('/api/me/groups'); }
  async groups() { return this.req('/api/teacher/groups'); }
  async createGroup(name) { return this.req('/api/teacher/groups', { method: 'POST', body: { name } }); }
  async deleteGroup(id) { return this.req(`/api/teacher/groups/${id}`, { method: 'DELETE' }); }
  async removeStudent(groupId, studentId) { return this.req(`/api/teacher/groups/${groupId}/students/${studentId}`, { method: 'DELETE' }); }
  async stats(groupId) { return this.req('/api/teacher/stats' + (groupId ? `?group_id=${groupId}` : '')); }
  async seedSimulated(groupId) { return this.req(`/api/teacher/groups/${groupId}/simulate`, { method: 'POST' }); }
  async clearSimulated() { return this.req('/api/teacher/simulated', { method: 'DELETE' }); }
}

// ------------------------------------------------------------------ Selección automática
export async function createStore() {
  const content = await (await fetch(CONTENT_URL)).json();
  const qs = new URLSearchParams(location.search).get('api');
  if (qs !== null) { if (qs) localStorage.setItem('hc_api', qs); else localStorage.removeItem('hc_api'); }
  const candidates = [localStorage.getItem('hc_api'), location.origin].filter(Boolean).map(b => b.replace(/\/$/, ''));
  for (const base of [...new Set(candidates)]) {
    try {
      const r = await fetch(base + '/api/health', { signal: AbortSignal.timeout(2500) });
      if (r.ok && (await r.json()).app === 'holoclass') return new ApiStore(base, content);
    } catch { /* sin servidor: modo local */ }
  }
  return new LocalStore(content);
}
