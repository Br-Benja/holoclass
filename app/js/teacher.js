// =====================================================================
//  HoloClass · HoloTeacher (panel docente)
//  Resumen y analítica · Grupos y estudiantes · Editor de contenidos y preguntas · Nuevo módulo (GLB)
// =====================================================================
import { $, $$, esc, toast, download, fmtDate } from './util.js';
import { inspectGLB } from './models.js';

export class TeacherPanel {
  constructor(app) { this.app = app; this.tab = 'summary'; this.groupId = ''; }
  get store() { return this.app.store; }
  get catalog() { return this.app.catalog; }

  async render(tab = this.tab) {
    this.tab = tab;
    $$('[data-ttab]').forEach(b => { b.classList.toggle('active', b.dataset.ttab === tab); b.onclick = () => this.render(b.dataset.ttab); });
    const body = $('#teacherBody'); body.innerHTML = '<p class="muted">Cargando…</p>';
    try { await ({ summary: () => this.summary(body), groups: () => this.groups(body), content: () => this.content(body), quizzes: () => this.quizzes(body), newmodule: () => this.newModule(body) })[tab](); }
    catch (e) { console.error(e); body.innerHTML = `<p class="warnbox">✖ ${esc(e.message || e)}</p>`; }
  }

  // ---------------------------------------------------------------- Resumen
  async summary(body) {
    const groups = await this.store.groups();
    const stats = await this.store.stats(this.groupId || undefined);
    const T = stats.totals, mods = this.catalog.modules;
    const partName = key => { const [m, p] = key.split(':'); return this.catalog.models[m]?.parts[p]?.name || key; };
    body.innerHTML = `
      <div class="t-toolbar">
        <label>Grupo <select id="tgSel"><option value="">Todos mis grupos</option>${groups.map(g => `<option value="${g.id}" ${g.id == this.groupId ? 'selected' : ''}>${esc(g.name)} (${g.students})</option>`).join('')}</select></label>
        <button class="btn ghost small" id="tgCsv">⬇ Exportar CSV</button>
        <button class="btn ghost small" id="tgSim" ${this.groupId ? '' : 'disabled title="Elige un grupo"'}>🧪 Generar datos simulados</button>
        <button class="btn ghost small" id="tgSimDel">Borrar simulados</button>
      </div>
      ${!groups.length ? `<p class="warnbox">Aún no tienes grupos. Crea uno en la pestaña <b>Grupos</b> y comparte el código con tus estudiantes.</p>` : ''}
      <div class="kpis">
        <div class="kpi"><b>${T.students}</b><span>Estudiantes</span></div>
        <div class="kpi"><b>${T.sessions}</b><span>Sesiones de exploración</span></div>
        <div class="kpi"><b>${Math.round(T.minutes)}</b><span>Minutos explorando</span></div>
        <div class="kpi"><b>${T.attempts}</b><span>Evaluaciones</span></div>
        <div class="kpi"><b>${T.avgScore ?? '—'}${T.avgScore != null ? '%' : ''}</b><span>Promedio de evaluación</span></div>
      </div>
      ${mods.map(m => { const s = stats.modules[m.key]; if (!s) return ''; const maxP = s.parts[0]?.count || 1; return `
        <section class="t-card">
          <h3>${this.app.subjectOf(m).icon} ${esc(m.title)} ${m.custom ? '<span class="tag">propio</span>' : ''}</h3>
          <div class="mini-kpis"><span>Sesiones <b>${s.sessions}</b></span><span>Minutos <b>${Math.round(s.minutes)}</b></span>
            <span>Pre-test <b>${s.avgPre ?? '—'}${s.avgPre != null ? '%' : ''}</b></span><span>Evaluación <b>${s.avgPost ?? '—'}${s.avgPost != null ? '%' : ''}</b></span>
            <span title="(post − pre) / (100 − pre)">Ganancia normalizada <b>${s.avgGain ?? '—'}</b></span></div>
          ${s.hardest ? `<p class="hard">⚠ Concepto más difícil: <b>${esc(s.hardest.concept || '')}</b> — “${esc(s.hardest.q)}” (${s.hardest.pct}% de aciertos)</p>` : ''}
          <div class="cols2">
            <div><h4>Preguntas de la evaluación</h4><table><tr><th>Pregunta</th><th>Tipo</th><th>Resp.</th><th>% aciertos</th><th>Seg.</th></tr>
              ${s.questions.map(q => `<tr><td>${esc(q.q)}</td><td>${q.type === 'pick' ? '🎯' : q.type === 'order' ? '↕' : q.type === 'tf' ? 'V/F' : 'OM'}</td><td>${q.answered}</td>
                <td>${q.pct == null ? '—' : `<div class="pbar"><i style="width:${q.pct}%" class="${q.pct < 50 ? 'bad' : q.pct < 75 ? 'mid' : ''}"></i><span>${q.pct}%</span></div>`}</td><td>${q.avgSec ?? '—'}</td></tr>`).join('')}</table></div>
            <div><h4>Partes más consultadas</h4>${s.parts.slice(0, 8).map(p => `<div class="hbar"><span>${esc(partName(p.key))}</span><div><i style="width:${(p.count / maxP) * 100}%"></i></div><b>${p.count}</b></div>`).join('') || '<p class="muted small">Sin datos todavía.</p>'}
              ${s.gains.length ? `<h4>Pre → Post por estudiante</h4>${s.gains.map(g => { const st = stats.students.find(x => x.id === g.student); return `<div class="gainrow"><span>${esc(st?.name || '')}</span><b>${g.pre}% → ${g.post}%</b><small>g = ${g.gain}</small></div>`; }).join('')}` : ''}</div>
          </div>
        </section>`; }).join('')}
      <section class="t-card"><h3>Estudiantes</h3><div class="table-wrap"><table>
        <tr><th>Nombre</th><th>Sesiones</th><th>Min.</th><th>Última actividad</th>${mods.map(m => `<th>${this.app.subjectOf(m).icon} ${esc(m.title)}<br><small>pre → mejor · explorado</small></th>`).join('')}</tr>
        ${stats.students.map(st => `<tr><td>${esc(st.name)}<br><small class="muted">${esc(st.email)}</small></td><td>${st.sessions}</td><td>${Math.round(st.minutes)}</td><td>${st.last ? fmtDate(st.last) : '—'}</td>
          ${mods.map(m => { const x = st.modules[m.key] || {}; return `<td>${x.pre ?? '—'} → <b>${x.best ?? '—'}</b><br><small>${x.explored || 0}%</small></td>`; }).join('')}</tr>`).join('') || `<tr><td colspan="${4 + mods.length}" class="muted">Sin estudiantes en el grupo.</td></tr>`}
      </table></div></section>
      <details class="t-card method"><summary>ⓘ Cómo se calculan los indicadores</summary>
        <p><b>Ganancia normalizada (Hake):</b> g = (post − pre) / (100 − pre), usando el primer pre-test y el mejor resultado de la evaluación final de cada estudiante. g &lt; 0.3 baja, 0.3–0.7 media, &gt; 0.7 alta.</p>
        <p><b>Exploración:</b> porcentaje de partes distintas que el estudiante seleccionó en los modelos del módulo.</p>
        <p><b>Datos simulados:</b> sirven para mostrar el panel; se identifican con “(simulado)” y se pueden borrar. No deben presentarse como resultados reales.</p></details>`;
    $('#tgSel').onchange = e => { this.groupId = e.target.value; this.render('summary'); };
    $('#tgCsv').onclick = () => this.exportCSV(stats);
    $('#tgSim').onclick = async () => { await this.store.seedSimulated(this.groupId); toast('Datos simulados generados'); this.render('summary'); };
    $('#tgSimDel').onclick = async () => { await this.store.clearSimulated(); toast('Datos simulados eliminados'); this.render('summary'); };
  }
  exportCSV(stats) {
    const mods = this.catalog.modules, q = s => `"${String(s ?? '').replace(/"/g, '""')}"`;
    const rows = [['Estudiante', 'Correo', 'Sesiones', 'Minutos', ...mods.flatMap(m => [`${m.title} · pre`, `${m.title} · mejor`, `${m.title} · explorado %`])]];
    for (const st of stats.students) rows.push([st.name, st.email, st.sessions, Math.round(st.minutes), ...mods.flatMap(m => { const x = st.modules[m.key] || {}; return [x.pre ?? '', x.best ?? '', x.explored ?? 0]; })]);
    rows.push([]); rows.push(['Módulo', 'Pregunta', 'Concepto', 'Tipo', 'Respuestas', '% aciertos', 'Seg. promedio']);
    for (const m of mods) for (const x of stats.modules[m.key]?.questions || []) rows.push([m.title, x.q, x.concept, x.type, x.answered, x.pct ?? '', x.avgSec ?? '']);
    download(`holoclass_resultados_${new Date().toISOString().slice(0, 10)}.csv`, rows.map(r => r.map(q).join(',')).join('\n'));
  }

  // ---------------------------------------------------------------- Grupos
  async groups(body) {
    const groups = await this.store.groups();
    body.innerHTML = `
      <section class="t-card"><h3>Crear grupo</h3><div class="row"><input id="ngName" placeholder="Ej. 2.º B Ciencias" maxlength="80"><button class="btn primary" id="ngBtn">Crear</button></div>
        <p class="muted small">Cada grupo tiene un código de 6 caracteres. Los estudiantes lo escriben al crear su cuenta o en su panel para unirse.</p></section>
      ${groups.map(g => `<section class="t-card" data-g="${g.id}"><div class="g-head"><h3>${esc(g.name)}</h3><span class="code" title="Código para unirse">${esc(g.code)}</span>
          <button class="btn ghost small" data-copy="${esc(g.code)}">Copiar código</button><button class="btn ghost small" data-gview="${g.id}">Ver resumen</button><button class="btn ghost small danger" data-del="${g.id}">Eliminar</button></div>
          <div class="g-students muted small">Cargando estudiantes…</div></section>`).join('') || '<p class="muted">Todavía no hay grupos.</p>'}`;
    $('#ngBtn').onclick = async () => { const g = await this.store.createGroup($('#ngName').value); toast(`Grupo creado · código ${g.code}`, 4000); this.render('groups'); };
    $$('[data-copy]').forEach(b => b.onclick = () => { navigator.clipboard?.writeText(b.dataset.copy); toast('Código copiado'); });
    $$('[data-gview]', body).forEach(b => b.onclick = () => { this.groupId = b.dataset.gview; this.render('summary'); });
    $$('[data-del]').forEach(b => b.onclick = async () => { if (confirm('¿Eliminar el grupo? Los estudiantes conservan su cuenta.')) { await this.store.deleteGroup(b.dataset.del); this.render('groups'); } });
    for (const g of groups) {
      const st = await this.store.stats(g.id), el = $(`[data-g="${g.id}"] .g-students`);
      el.classList.remove('muted', 'small');
      el.innerHTML = st.students.length ? `<table><tr><th>Estudiante</th><th>Sesiones</th><th>Evaluaciones</th><th></th></tr>${st.students.map(s => `<tr><td>${esc(s.name)} <small class="muted">${esc(s.email)}</small></td><td>${s.sessions}</td>
          <td>${Object.values(s.modules).reduce((t, m) => t + (m.attempts || 0), 0)}</td><td><button class="btn ghost small" data-rm="${s.id}">Quitar</button></td></tr>`).join('')}</table>` : '<p class="muted small">Sin estudiantes todavía.</p>';
      $$('[data-rm]', el).forEach(b => b.onclick = async () => { await this.store.removeStudent(g.id, b.dataset.rm); this.render('groups'); });
    }
  }

  // ---------------------------------------------------------------- Editor de contenidos (textos por parte)
  async content(body) {
    const models = Object.entries(this.catalog.models);
    this.modelKey ||= 'heart';
    const m = this.catalog.models[this.modelKey];
    body.innerHTML = `
      <div class="t-toolbar"><label>Modelo <select id="ceModel">${models.map(([k, x]) => `<option value="${k}" ${k === this.modelKey ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
        <button class="btn ghost small danger" id="ceReset">Restaurar contenido original</button></div>
      <section class="t-card"><label class="field">Introducción<textarea id="ceIntro" rows="3">${esc(m.intro || '')}</textarea></label>
        <p class="muted small">En el átomo de Bohr puedes usar {name}, {sym}, {Z}, {N} y {config}.</p></section>
      ${Object.entries(m.parts).map(([k, p]) => `<section class="t-card part-edit" data-k="${k}"><h4>${esc(p.name)} <small class="muted">(${esc(k)})</small></h4>
        <label class="field">Nombre<input data-f="name" value="${esc(p.name)}"></label>
        <label class="field">Explicación<textarea data-f="text" rows="2">${esc(p.text || '')}</textarea></label>
        <label class="field">Dato curioso<input data-f="fact" value="${esc(p.fact || '')}"></label>
        <label class="field">Saber más<textarea data-f="more" rows="2">${esc(p.more || '')}</textarea></label></section>`).join('')}
      <button class="btn primary" id="ceSave">💾 Guardar cambios</button>`;
    $('#ceModel').onchange = e => { this.modelKey = e.target.value; this.render('content'); };
    $('#ceReset').onclick = async () => { if (confirm('¿Descartar todos los cambios de textos y preguntas?')) { await this.store.resetContent(); await this.app.reloadCatalog(); toast('Contenido restaurado'); this.render('content'); } };
    $('#ceSave').onclick = async () => {
      const parts = {}; $$('.part-edit').forEach(s => { parts[s.dataset.k] = Object.fromEntries($$('[data-f]', s).map(i => [i.dataset.f, i.value.trim()])); });
      await this.store.saveModelTexts(this.modelKey, { intro: $('#ceIntro').value.trim(), parts });
      await this.app.reloadCatalog(); toast('✔ Contenido guardado');
    };
  }

  // ---------------------------------------------------------------- Editor de preguntas
  async quizzes(body) {
    const mods = this.catalog.modules;
    this.qModule ||= mods[0].key; this.qKind ||= 'post';
    const mod = mods.find(m => m.key === this.qModule) || mods[0];
    const parts = this.catalog.models[mod.main]?.parts || {};
    this.draft = JSON.parse(JSON.stringify(this.catalog.quizzes[mod.key]?.[this.qKind] || []));
    const draw = () => {
      $('#qeList').innerHTML = this.draft.map((q, i) => `<section class="t-card q-edit" data-i="${i}">
        <div class="g-head"><b>${i + 1}.</b>
          <select data-f="type">${[['mc', 'Opción múltiple'], ['tf', 'Verdadero/Falso'], ['pick', '🎯 Tocar en el modelo'], ['order', '↕ Ordenar']].map(([v, l]) => `<option value="${v}" ${q.type === v ? 'selected' : ''} ${v === 'pick' && this.qKind === 'pre' ? 'disabled' : ''}>${l}</option>`).join('')}</select>
          <button class="btn ghost small" data-mv="-1">▲</button><button class="btn ghost small" data-mv="1">▼</button><button class="btn ghost small danger" data-rmq>Eliminar</button></div>
        <label class="field">Pregunta<input data-f="q" value="${esc(q.q)}"></label>
        ${q.type === 'mc' ? `<div class="mc-opts">${(q.options || ['', '', '', '']).map((o, j) => `<label><input type="radio" name="ans${i}" data-ans="${j}" ${q.answer === j ? 'checked' : ''}> <input data-opt="${j}" value="${esc(o)}" placeholder="Opción ${j + 1}"></label>`).join('')}</div><p class="muted small">Marca la opción correcta.</p>` : ''}
        ${q.type === 'tf' ? `<label class="field">Respuesta correcta<select data-f="answer"><option value="true" ${q.answer === true ? 'selected' : ''}>Verdadero</option><option value="false" ${q.answer === false ? 'selected' : ''}>Falso</option></select></label>` : ''}
        ${q.type === 'pick' ? `<label class="field">Parte correcta (modelo: ${esc(this.catalog.models[mod.main]?.name)})<select data-f="answer">${Object.entries(parts).map(([k, p]) => `<option value="${k}" ${q.answer === k ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>` : ''}
        ${q.type === 'order' ? `<label class="field">Elementos en el orden CORRECTO (uno por línea)<textarea data-f="items" rows="4">${esc((q.items || []).join('\n'))}</textarea></label>` : ''}
        <div class="cols2"><label class="field">Concepto<input data-f="concept" value="${esc(q.concept || '')}"></label><label class="field">Explicación (retroalimentación)<input data-f="explain" value="${esc(q.explain || '')}"></label></div>
      </section>`).join('') || '<p class="muted">Sin preguntas.</p>';
      $$('.q-edit').forEach(s => {
        const i = +s.dataset.i, q = this.draft[i];
        $$('[data-f]', s).forEach(inp => inp.onchange = () => {
          const f = inp.dataset.f, v = inp.value;
          if (f === 'type') { q.type = v; if (v === 'mc') { q.options ||= ['', '', '', '']; q.answer = 0; } if (v === 'tf') q.answer = true; if (v === 'pick') q.answer = Object.keys(parts)[0]; if (v === 'order') q.items ||= ['', '']; draw(); return; }
          if (f === 'answer') q.answer = q.type === 'tf' ? v === 'true' : v; else if (f === 'items') q.items = v.split('\n').map(x => x.trim()).filter(Boolean); else q[f] = v;
        });
        $$('[data-opt]', s).forEach(inp => inp.onchange = () => { q.options[+inp.dataset.opt] = inp.value; });
        $$('[data-ans]', s).forEach(r => r.onchange = () => { q.answer = +r.dataset.ans; });
        $$('[data-mv]', s).forEach(b => b.onclick = () => { const j = i + +b.dataset.mv; if (j < 0 || j >= this.draft.length) return; [this.draft[i], this.draft[j]] = [this.draft[j], this.draft[i]]; draw(); });
        $('[data-rmq]', s).onclick = () => { this.draft.splice(i, 1); draw(); };
      });
    };
    body.innerHTML = `
      <div class="t-toolbar"><label>Módulo <select id="qeMod">${mods.map(m => `<option value="${m.key}" ${m.key === mod.key ? 'selected' : ''}>${esc(m.title)}</option>`).join('')}</select></label>
        <label>Cuestionario <select id="qeKind"><option value="pre" ${this.qKind === 'pre' ? 'selected' : ''}>Pre-test</option><option value="post" ${this.qKind === 'post' ? 'selected' : ''}>Evaluación final</option></select></label></div>
      <div id="qeList"></div>
      <div class="row"><button class="btn ghost" id="qeAdd">+ Agregar pregunta</button><button class="btn primary" id="qeSave">💾 Guardar cuestionario</button></div>`;
    draw();
    $('#qeMod').onchange = e => { this.qModule = e.target.value; this.render('quizzes'); };
    $('#qeKind').onchange = e => { this.qKind = e.target.value; this.render('quizzes'); };
    $('#qeAdd').onclick = () => { this.draft.push({ id: 'q_' + Date.now().toString(36), type: 'mc', q: '', options: ['', '', '', ''], answer: 0, concept: '', explain: '' }); draw(); };
    $('#qeSave').onclick = async () => {
      const errors = [];
      this.draft.forEach((q, i) => {
        if (!q.q.trim()) errors.push(`Pregunta ${i + 1}: falta el texto.`);
        if (q.type === 'mc') { q.options = q.options.map(o => o.trim()); if (q.options.filter(Boolean).length < 2) errors.push(`Pregunta ${i + 1}: necesita al menos 2 opciones.`); if (!q.options[q.answer]) errors.push(`Pregunta ${i + 1}: la opción correcta está vacía.`); }
        if (q.type === 'order' && (q.items || []).length < 2) errors.push(`Pregunta ${i + 1}: necesita al menos 2 elementos.`);
        if (q.type !== 'mc') delete q.options; if (q.type !== 'order') delete q.items; if (q.type === 'order') delete q.answer;
      });
      if (errors.length) return toast(errors[0], 4500);
      await this.store.saveQuiz(mod.key, this.qKind, this.draft);
      await this.app.reloadCatalog(); toast('✔ Cuestionario guardado');
    };
  }

  // ---------------------------------------------------------------- Nuevo módulo con un modelo GLB propio
  async newModule(body) {
    const used = new Set(Object.keys(this.catalog.markers).map(Number));
    const free = (this.catalog.free_markers || []).filter(id => !used.has(id));
    const customs = this.catalog.modules.filter(m => m.custom);
    body.innerHTML = `
      <section class="t-card"><h3>➕ Nuevo módulo a partir de un modelo GLB</h3>
        <p class="muted small">Prepara el modelo en Blender: una malla por parte, con nombres claros, y expórtalo como <b>.glb</b> (idealmente &lt; 5 MB). Usa solo modelos propios o con licencia que lo permita (CC0, CC BY) y escribe la atribución.</p>
        <div class="cols2">
          <label class="field">Materia<select id="nmSubject">${this.catalog.subjects.map(s => `<option value="${s.key}">${s.icon} ${esc(s.name)}</option>`).join('')}</select></label>
          <label class="field">Título<input id="nmTitle" placeholder="Ej. El cerebro humano"></label>
          <label class="field">Descripción<input id="nmDesc" placeholder="¿Qué aprenderán?"></label>
          <label class="field">Nivel<input id="nmLevel" value="Secundaria"></label>
          <label class="field">Licencia del modelo<input id="nmLicense" placeholder="CC BY 4.0, CC0, Propio…"></label>
          <label class="field">Autor / atribución<input id="nmAttr" placeholder="Autor y fuente"></label>
          <label class="field">Tarjeta (marcador libre)<select id="nmMarker">${free.map(id => `<option value="${id}">#${id}</option>`).join('') || '<option value="">No hay marcadores libres</option>'}</select></label>
          <label class="field">Escala<input id="nmScale" type="number" value="1" min="0.2" max="3" step="0.1"></label>
        </div>
        <label class="field">Archivo .glb<input type="file" id="nmFile" accept=".glb,model/gltf-binary"></label>
        <div id="nmParts"></div>
        <button class="btn primary" id="nmCreate" disabled>Crear módulo</button></section>
      <section class="t-card"><h3>Módulos propios</h3>${customs.map(m => `<div class="g-head"><b>${this.app.subjectOf(m).icon} ${esc(m.title)}</b><span class="code">#${m.markers[0]}</span>
          <a class="btn ghost small" href="tarjetas.html?ids=${m.markers[0]}" target="_blank">🖨 Tarjeta</a><button class="btn ghost small danger" data-delm="${m.key}">Eliminar</button></div>`).join('') || '<p class="muted small">Aún no hay módulos propios.</p>'}</section>`;
    let file = null, names = [];
    $('#nmFile').onchange = async e => {
      file = e.target.files[0]; if (!file) return;
      $('#nmParts').innerHTML = '<p class="muted">Analizando el modelo…</p>';
      const url = URL.createObjectURL(file);
      try {
        const info = await inspectGLB(url); names = info.names;
        $('#nmParts').innerHTML = `<p class="small">✔ ${names.length} malla(s) · ${info.triangles.toLocaleString()} triángulos${info.animations ? ` · ${info.animations} animación(es)` : ''} · ${(file.size / 1048576).toFixed(1)} MB
          ${info.triangles > 150000 ? '<br><span class="warn">⚠ Más de 150,000 triángulos: puede ir lento en laptops de gama media.</span>' : ''}</p>
          <p class="muted small">Marca las mallas que serán partes seleccionables y escribe su explicación.</p>
          ${names.map((n, i) => `<section class="t-card part-edit" data-n="${esc(n)}"><label><input type="checkbox" data-inc ${i < 12 ? 'checked' : ''}> <b>${esc(n)}</b></label>
            <div class="cols2"><label class="field">Nombre visible<input data-f="name" value="${esc(n.replace(/[_\-.]+/g, ' '))}"></label><label class="field">Dato curioso<input data-f="fact"></label></div>
            <label class="field">Explicación<textarea data-f="text" rows="2"></textarea></label></section>`).join('')}`;
        $('#nmCreate').disabled = !free.length;
      } catch (err) { $('#nmParts').innerHTML = `<p class="warnbox">✖ No se pudo leer el archivo GLB: ${esc(err.message || err)}</p>`; }
      finally { URL.revokeObjectURL(url); }
    };
    $('#nmCreate').onclick = async () => {
      const title = $('#nmTitle').value.trim(); if (!title) return toast('Escribe un título.');
      if (!$('#nmLicense').value.trim()) return toast('Indica la licencia del modelo (requisito para usarlo).');
      const parts = {};
      $$('#nmParts .part-edit').forEach(s => { if ($('[data-inc]', s).checked) parts[s.dataset.n] = { name: $('[data-f="name"]', s).value.trim() || s.dataset.n, text: $('[data-f="text"]', s).value.trim(), fact: $('[data-f="fact"]', s).value.trim() }; });
      if (!Object.keys(parts).length) return toast('Selecciona al menos una parte.');
      const marker = +$('#nmMarker').value;
      const payload = {
        module: { subject: $('#nmSubject').value, title, desc: $('#nmDesc').value.trim(), level: $('#nmLevel').value.trim(), markers: [marker], min_explored_pct: 50 },
        model: { name: title, intro: $('#nmDesc').value.trim() || title, license: $('#nmLicense').value.trim(), attribution: $('#nmAttr').value.trim(), scale: +$('#nmScale').value || 1, parts, tour: Object.keys(parts) },
        quizzes: { pre: [], post: [] },
      };
      $('#nmCreate').disabled = true; $('#nmCreate').textContent = 'Creando…';
      try { await this.store.createCustomModule(payload, file); await this.app.reloadCatalog(); toast(`✔ Módulo creado. Imprime la tarjeta #${marker}.`, 5000); this.render('newmodule'); }
      catch (e) { toast('✖ ' + (e.message || e), 5000); $('#nmCreate').disabled = false; $('#nmCreate').textContent = 'Crear módulo'; }
    };
    $$('[data-delm]').forEach(b => b.onclick = async () => { if (confirm('¿Eliminar este módulo y su modelo?')) { await this.store.deleteCustomModule(b.dataset.delm); await this.app.reloadCatalog(); this.render('newmodule'); } });
  }
}
