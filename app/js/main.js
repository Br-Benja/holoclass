// =====================================================================
//  HoloClass · Aplicación principal (sesión, navegación, inicio, acerca)
// =====================================================================
import { createStore } from './store.js';
import { Viewer } from './viewer.js';
import { TeacherPanel } from './teacher.js';
import { $, $$, esc, toast, icon } from './util.js';
import { hydrateIcons } from './icons.js';

const app = {
  store: null, catalog: null, user: null,
  subjectOf(m) { return this.catalog.subjects.find(s => s.key === m.subject) || { icon: 'box', name: 'Otro', color: '#888' }; },
  async reloadCatalog() { this.catalog = await this.store.catalog(); if (viewer.ar) viewer.ar.catalog = this.catalog; },
};
const viewer = new Viewer(app);
const teacher = new TeacherPanel(app);
window.holoclass = { app, viewer, teacher };   // para depuración desde la consola
hydrateIcons();                                // <i data-icon> del HTML -> SVG

// ------------------------------------------------------------------ Navegación por hash (#/home, #/module/corazon/camera …)
async function route() {
  const [page, a, b] = location.hash.replace(/^#\/?/, '').split('/');
  if (!app.user && page !== 'about') return show('login');
  if (page !== 'module') await viewer.close();
  if (page === 'module' && a) { show('viewer'); await viewer.open(a, b || 'camera'); return; }
  if (page === 'teacher') { if (app.user.role !== 'docente') { location.hash = '#/home'; return; } show('teacher'); return teacher.render(); }
  if (page === 'about') { show('about'); return renderAbout(); }
  if (page === 'login') return show('login');
  show('home'); renderHome();
}
function show(page) {
  $$('[data-page]').forEach(p => p.hidden = p.dataset.page !== page);
  $$('[data-nav]').forEach(a => a.classList.toggle('active', a.dataset.nav === page));
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);

function renderHeader() {
  const u = app.user;
  $('#modeBadge').innerHTML = app.store.mode === 'api' ? `${icon('server')} Servidor` : `${icon('hard-drive')} Local`;
  $('#modeBadge').classList.toggle('ok', app.store.mode === 'api');
  $('#modeBadge').title = app.store.mode === 'api' ? `Conectado a ${app.store.api} (FastAPI + PostgreSQL)` : 'Modo local: los datos se guardan en este navegador';
  $('#userChip').hidden = $('#btnLogout').hidden = !u;
  if (u) $('#userChip').innerHTML = `${icon(u.role === 'docente' ? 'graduation-cap' : 'user')} ${esc(u.name)}`;
  $('#navTeacher').hidden = u?.role !== 'docente';
}

// ------------------------------------------------------------------ Sesión
async function afterLogin(user) { app.user = user; renderHeader(); location.hash = user.role === 'docente' ? '#/teacher' : '#/home'; route(); }
$$('[data-ltab]').forEach(b => b.onclick = () => { $$('[data-ltab]').forEach(x => x.classList.toggle('active', x === b)); $('#formIn').hidden = b.dataset.ltab !== 'in'; $('#formUp').hidden = b.dataset.ltab !== 'up'; $('#loginErr').textContent = ''; });
$('#upRole').onchange = e => { $('#upCodeWrap').hidden = e.target.value !== 'estudiante'; };
$('#formIn').onsubmit = async e => { e.preventDefault(); try { await afterLogin(await app.store.login($('#inEmail').value, $('#inPass').value)); } catch (err) { $('#loginErr').textContent = err.message; } };
$('#formUp').onsubmit = async e => {
  e.preventDefault();
  try { await afterLogin(await app.store.register({ name: $('#upName').value, email: $('#upEmail').value, password: $('#upPass').value, role: $('#upRole').value, groupCode: $('#upCode').value.trim() || null })); }
  catch (err) { $('#loginErr').textContent = err.message; }
};
$('#demoStudent').onclick = async () => { try { await afterLogin(await app.store.login('estudiante@demo.mx', 'demo1234')); } catch (e) { $('#loginErr').textContent = e.message; } };
$('#demoTeacher').onclick = async () => { try { await afterLogin(await app.store.login('docente@demo.mx', 'demo1234')); } catch (e) { $('#loginErr').textContent = e.message; } };
$('#guestBtn').onclick = () => { app.user = { id: null, name: 'Invitado', role: 'estudiante', guest: true, groups: [] }; renderHeader(); location.hash = '#/home'; route(); };
$('#btnLogout').onclick = async () => { await viewer.close(); await app.store.logout(); app.user = null; renderHeader(); location.hash = '#/login'; route(); };
$('#formJoin').onsubmit = async e => {
  e.preventDefault();
  if (app.user?.guest) return toast('Crea una cuenta para unirte a un grupo.');
  try { const g = await app.store.joinGroup($('#joinCode').value); toast(`Te uniste a ${g.name}`, 2800, 'circle-check'); $('#joinCode').value = ''; renderHome(); }
  catch (err) { toast(err.message, 3500, 'circle-x'); }
};

// ------------------------------------------------------------------ Inicio
async function renderHome() {
  const u = app.user, prog = await app.store.progress();
  $('#hello').textContent = `¡Hola, ${u.name.split(' ')[0]}!`;
  $('#helloSub').textContent = u.role === 'docente' ? 'Puedes explorar los módulos o abrir tu panel docente.' : 'Elige un módulo. Te recomendamos: pre-test → explorar → evaluación final.';
  $('#guestNote').hidden = !u.guest;
  $('#joinBox').hidden = u.role !== 'estudiante' || u.guest;
  if (u.role === 'estudiante' && !u.guest) {
    const gs = await app.store.myGroups().catch(() => []);
    $('#myGroups').textContent = gs.length ? 'Tus grupos: ' + gs.map(g => g.name).join(', ') : 'Aún no perteneces a ningún grupo.';
  }
  // insignias
  const P = Object.entries(prog);
  const badges = [
    ['compass', 'Explorador', 'Exploraste el 80 % de un módulo', P.some(([, p]) => p.explored >= 80)],
    ['target', 'Puntería 3D', 'Obtuviste 90 % o más en una evaluación', P.some(([, p]) => (p.best ?? 0) >= 90)],
    ['trending-up', 'Gran avance', 'Mejoraste 30 puntos respecto a tu pre-test', P.some(([, p]) => p.best != null && p.pre != null && p.best - p.pre >= 30)],
    ['award', 'Multidisciplina', 'Trabajaste en 3 módulos o más', P.filter(([, p]) => p.sessions > 0).length >= 3],
  ];
  $('#badges').innerHTML = badges.map(([i, n, d, ok]) => `<div class="badge ${ok ? 'on' : ''}" title="${esc(d)}"><span>${icon(i)}</span><b>${n}</b><small>${esc(d)}</small></div>`).join('');
  $('#modules').innerHTML = app.catalog.modules.map(m => {
    const s = app.subjectOf(m), p = prog[m.key] || {};
    return `<article class="mod" style="--c:${s.color}">
      <div class="mod-top"><div class="mod-icon">${icon(s.icon)}</div><div class="mod-subject">${esc(s.name)}${m.custom ? ' · propio' : ''}</div></div>
      <h3>${esc(m.title)}</h3><p>${esc(m.desc || '')}</p>
      <div class="mod-progress"><div class="progress"><div style="width:${p.explored || 0}%"></div></div>
        <small>Explorado ${p.explored || 0}% · Pre-test ${p.pre ?? '—'}${p.pre != null ? '%' : ''} · Mejor evaluación ${p.best ?? '—'}${p.best != null ? '%' : ''}</small></div>
      <p class="muted small">Tarjetas: ${m.markers.map(id => '#' + id).join(', ')} · <a href="tarjetas.html?module=${m.key}" target="_blank">imprimir</a></p>
      <div class="row">
        <a class="btn primary" href="#/module/${m.key}/camera">${icon('camera')} Con cámara</a>
        <a class="btn ghost" href="#/module/${m.key}/sim">${icon('flask-conical')} Simulación</a>
        <a class="btn ghost" href="#/module/${m.key}/none">${icon('mouse-pointer-2')} Sin cámara</a>
      </div></article>`;
  }).join('');
}

// ------------------------------------------------------------------ Acerca / ajustes
async function renderAbout() {
  const cat = app.catalog;
  let cal = null; try { cal = await (await fetch('./camera.json', { cache: 'no-store' })).json(); } catch {}
  const glbs = Object.values(cat.models).filter(m => m.source === 'glb');
  $('#aboutBody').innerHTML = `
    <section class="t-card"><h3>Modo de funcionamiento</h3>
      <p>${app.store.mode === 'api' ? `${icon('server')} Conectado al servidor <code>${esc(app.store.api)}</code> (FastAPI + PostgreSQL). Cuentas, grupos y resultados se guardan en la base de datos.`
        : `${icon('hard-drive')}` + ' Modo local: todo se guarda en este navegador (útil para GitHub Pages o sin servidor). Para usar la base de datos, ejecuta el backend y conéctate.'}</p>
      <form id="apiForm" class="row"><input id="apiUrl" placeholder="http://localhost:8000" value="${esc(localStorage.getItem('hc_api') || '')}"><button class="btn ghost">Conectar a servidor</button><button type="button" class="btn ghost" id="apiLocal">Usar modo local</button></form></section>
    <section class="t-card"><h3>Calibración de la cámara</h3>
      <p>${cal?.calibrated ? `${icon('circle-check')} Calibrada (${cal.width}×${cal.height}, fx = ${Number(cal.fx).toFixed(1)}, error ${cal.rms ?? '—'}). Fecha: ${esc(cal.date || '')}` : 'Sin calibrar: se usa un campo de visión típico. Para mayor precisión ejecuta <code>tools/calibrate_camera.py</code>.'}</p></section>
    <section class="t-card"><h3>Créditos y licencias</h3><table><tr><th>Recurso</th><th>Licencia</th></tr>
      ${cat.credits.map(c => `<tr><td>${c.url ? `<a href="${esc(c.url)}" target="_blank" rel="noopener">${esc(c.what)}</a>` : esc(c.what)}</td><td>${esc(c.license)}</td></tr>`).join('')}
      ${glbs.map(m => `<tr><td>${esc(m.name)} — ${esc(m.attribution || '')}</td><td>${esc(m.license || '')}</td></tr>`).join('')}</table></section>
    <section class="t-card"><h3>Privacidad</h3><p>El video de la cámara se procesa <b>solo en este dispositivo</b> y nunca se envía ni se guarda. Se registran únicamente las interacciones con los modelos y los resultados de los cuestionarios.</p></section>
    <section class="t-card"><h3>Proyecto</h3><p>HoloClass — Feria de Proyectos de Ingeniería en Sistemas Computacionales. Código y documentación: <a href="https://github.com/Br-Benja/holoclass" target="_blank" rel="noopener">github.com/Br-Benja/holoclass</a></p></section>`;
  $('#apiForm').onsubmit = e => { e.preventDefault(); const v = $('#apiUrl').value.trim(); if (v) { localStorage.setItem('hc_api', v); location.reload(); } };
  $('#apiLocal').onclick = () => { localStorage.removeItem('hc_api'); localStorage.removeItem('hc_token'); location.href = location.pathname + '?api='; };
}

// ------------------------------------------------------------------ Arranque
(async () => {
  try {
    app.store = await createStore();
    await app.store.ensureDemo();
    app.catalog = await app.store.catalog();
    app.user = await app.store.me();
    $('#guestBtn').hidden = app.store.mode === 'api';
    renderHeader();
    $('#boot').hidden = true;
    if (!location.hash) location.hash = app.user ? '#/home' : '#/login';
    route();
    import('./models.js').then(mod => mod.warmTextures()).catch(() => {});   // texturas de planetas en segundo plano
  } catch (e) {
    console.error(e);
    $('#boot').innerHTML = `<p>${icon('circle-x')} No se pudo iniciar HoloClass: ${esc(e.message || e)}</p><p class="muted">Verifica tu conexión a internet (las librerías se cargan desde un CDN).</p>`;
  }
})();
