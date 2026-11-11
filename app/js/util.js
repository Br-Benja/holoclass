// HoloClass · utilidades compartidas
export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const clone = o => JSON.parse(JSON.stringify(o));
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
export const fill = (text, vars = {}) => String(text ?? '').replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));

let toastTimer;
export function toast(msg, ms = 2800) {
  const t = $('#toast'); if (!t) return;
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

// ---------------------------------------------------------------- Voz (Web Speech API)
let esVoice = null;
function pickVoice() { const vs = speechSynthesis.getVoices(); esVoice = vs.find(v => v.lang === 'es-MX') || vs.find(v => v.lang?.startsWith('es')) || null; }
if ('speechSynthesis' in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
/** Lee un texto; la promesa se resuelve al terminar (o tras un tiempo máximo). */
export function speak(text, { rate = 1.02 } = {}) {
  return new Promise(resolve => {
    if (!('speechSynthesis' in window)) return resolve(false);
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'es-MX'; if (esVoice) u.voice = esVoice; u.rate = rate;
    const max = setTimeout(() => resolve(true), Math.max(4000, text.length * 95));
    u.onend = u.onerror = () => { clearTimeout(max); resolve(true); };
    speechSynthesis.speak(u);
  });
}
export const stopSpeak = () => { if ('speechSynthesis' in window) speechSynthesis.cancel(); };

export function confetti() {
  for (let i = 0; i < 70; i++) {
    const d = document.createElement('i'); d.className = 'confetti';
    d.style.left = Math.random() * 100 + 'vw'; d.style.background = `hsl(${Math.random() * 360},90%,60%)`;
    d.style.animationDelay = Math.random() * 0.5 + 's'; document.body.appendChild(d); setTimeout(() => d.remove(), 2600);
  }
}

export function download(filename, text, type = 'text/csv;charset=utf-8') {
  const blob = new Blob(['﻿' + text], { type });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export const fmtDate = iso => new Date(iso).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
export const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);
