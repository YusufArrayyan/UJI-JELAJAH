// Komponen kecil yang dipakai ulang di semua layar.
import { h, clear } from './dom.js';
import { STAGE, DECISION, dateRange, minutes } from './format.js';

let fieldSeq = 0;

/** Bidang isian dengan label tampak, petunjuk, dan pesan galat yang terhubung lewat aria. */
export function field({ label, hint, name, type = 'text', value = '', textarea = false, rows, required, maxlength, minlength, placeholder, inputmode, autocomplete = 'off', min, max, step, counter, spellcheck }) {
  const id = `f${++fieldSeq}`;
  const hintId = hint ? `${id}-h` : null;
  const errId = `${id}-e`;
  const props = {
    id, name, class: textarea ? 'textarea' : 'input', required, maxlength, minlength, placeholder, inputmode, autocomplete, min, max, step, spellcheck,
    'aria-describedby': [hintId, errId].filter(Boolean).join(' '),
  };
  const input = textarea ? h('textarea', { ...props, rows: rows ?? 4 }) : h('input', { ...props, type });
  input.value = value ?? '';
  const err = h('p', { id: errId, class: 'field-error', hidden: true, 'aria-live': 'polite' });
  const kids = [h('label', { for: id, text: label })];
  if (hint) kids.push(h('p', { id: hintId, class: 'hint', text: hint }));
  kids.push(input);
  let cnt = null;
  if (counter && maxlength) {
    cnt = h('p', { class: 'counter', 'aria-hidden': 'true' });
    const upd = () => {
      cnt.textContent = `${input.value.length} / ${maxlength}`;
      cnt.classList.toggle('over', minlength && input.value.trim().length < minlength && input.value.length > 0);
    };
    input.addEventListener('input', upd);
    upd();
    kids.push(cnt);
  }
  kids.push(err);
  const wrap = h('div', { class: 'field' }, kids);
  wrap.input = input;
  wrap.setError = (msg) => {
    err.hidden = !msg;
    err.textContent = msg || '';
    if (msg) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
  };
  input.addEventListener('input', () => wrap.setError(null));
  return wrap;
}

export function selectField({ label, hint, name, options, value }) {
  const id = `f${++fieldSeq}`;
  const sel = h('select', { id, name, class: 'select' }, options.map((o) => h('option', { value: o.value, selected: String(o.value) === String(value) }, o.label)));
  const wrap = h('div', { class: 'field' }, h('label', { for: id, text: label }), hint && h('p', { class: 'hint', text: hint }), sel);
  wrap.input = sel;
  return wrap;
}

/** Grup radio bergaya kartu. */
export function choices({ legend, name, options, value, cols, hint }) {
  const fs = h(
    'fieldset',
    { class: 'field' },
    h('legend', { class: 'field-label', text: legend }),
    hint && h('p', { class: 'hint', text: hint }),
    h(
      'div',
      { class: `choices${cols ? ' cols-' + cols : ''}` },
      options.map((o) =>
        h('label', { class: 'choice' }, h('input', { type: 'radio', name, value: o.value, checked: o.value === value, disabled: o.disabled }), h('span', h('b', { style: { fontWeight: 550 } }, o.label), o.sub && h('small', o.sub))),
      ),
    ),
  );
  fs.value = () => fs.querySelector('input:checked')?.value ?? null;
  return fs;
}

export function stageTag(stage, text) {
  return h('span', { class: `tag ${stage}` }, text ?? STAGE[stage]);
}

export function notice(kind, msg, ic) {
  return h('div', { class: `notice ${kind}`, role: kind === 'err' ? 'alert' : 'status' }, h('div', msg));
}

/** Area pesan di dalam formulir. */
export function formMessage() {
  const box = h('div', { 'aria-live': 'polite' });
  box.show = (kind, msg) => { clear(box); if (msg) box.append(notice(kind, msg)); };
  box.clear = () => clear(box);
  return box;
}

const toastRegion = () => document.querySelector('.toast-region');
export function toast(msg, kind = 'ok') {
  const t = h('div', { class: `toast ${kind === 'err' ? 'err' : ''}`, role: kind === 'err' ? 'alert' : 'status' }, h('span', msg));
  toastRegion()?.append(t);
  setTimeout(() => {
    t.classList.add('out');
    setTimeout(() => t.remove(), 220);
  }, kind === 'err' ? 6000 : 3200);
}

export function pageHead(title, lede, extra) {
  return h('header', { class: 'page-head' }, extra, h('h1', { text: title }), lede && h('p', { class: 'lede', text: lede }));
}

export function meter(value, target, { over = false, label } = {}) {
  const v = Math.max(0, Math.min(1, value));
  const m = h('div', { class: `meter${over ? ' over' : ''}`, role: 'img', 'aria-label': label ?? `${Math.round(v * 100)} persen` }, h('i'));
  m.style.setProperty('--v', 0);
  requestAnimationFrame(() => requestAnimationFrame(() => m.style.setProperty('--v', v)));
  if (target != null) {
    const b = h('b');
    b.style.setProperty('--t', `calc(${Math.min(1, target) * 100}% - 1px)`);
    m.append(b);
  }
  return m;
}

export function skeleton(lines = [56, 120, 120]) {
  return h('div', { class: 'skeleton', 'aria-busy': 'true', 'aria-label': 'Memuat…' }, lines.map((px) => h('div', { class: 'sk', style: { height: px + 'px' } })));
}

export function emptyState(ic, title, body, action) {
  return h('div', { class: 'empty-state' }, h('b', title), body && h('p', body), action);
}

export function errorState(err, retry) {
  return h(
    'div',
    { class: 'stack' },
    notice('err', err.message || 'Terjadi galat.'),
    retry && h('div', h('button', { class: 'btn secondary', type: 'button', onclick: retry }, 'Coba lagi')),
  );
}

export function kv(labelText, value) {
  return h('div', { class: 'kv' }, h('p', { class: 'label', text: labelText }), value instanceof Node ? value : h('p', value ?? '–'));
}

export function quote(text, ai = false) {
  return h('div', { class: `quote-block${ai ? ' ai' : ''}` }, h('p', text || '–'));
}

/**
 * Rute tiga siklus: satu garis dengan tiga stasiun bernomor. Menggantikan tiga kartu pastel.
 * cycles: [{ n, stage, locked, starts_on, due_on, hypothesis, experiment, reflection, href }]
 */
export function route(cycles) {
  const doneCount = cycles.filter((c) => c.stage === 'selesai').length;
  const currentIdx = cycles.findIndex((c) => c.stage !== 'selesai' && !c.locked);
  const reach = currentIdx === -1 ? doneCount : currentIdx;
  const progress = h('li', { class: 'progress', 'aria-hidden': 'true', role: 'presentation' });
  // Titik stasiun ke-k berada di (k-1)/3 lebar rute; garis berhenti di titik siklus yang sedang berjalan.
  progress.style.setProperty('--p', String(Math.min(reach, 3) / 3));
  const stations = cycles.map((c, i) => {
    const state = c.stage === 'selesai' ? 'done' : c.locked ? 'locked' : i === currentIdx ? 'current' : '';
    const stageText = c.locked ? 'Terkunci' : STAGE[c.stage];
    const body = [];
    if (c.locked) body.push(h('p', { class: 'station-meta' }, c.lockedNote ?? (c.n > 1 ? `Terbuka setelah siklus ${c.n - 1} selesai.` : 'Terbuka setelah pretes selesai.')));
    else if (c.hypothesis?.saved) body.push(h('p', { class: 'station-quote' }, `“${c.hypothesis.statement}”`));
    else body.push(h('p', { class: 'station-meta' }, 'Belum ada dugaan.'));
    if (!c.locked && c.experiment) body.push(h('p', { class: 'station-meta' }, `${c.experiment.title} · ${minutes(c.experiment.logged_minutes)} dari ${minutes(c.experiment.planned_minutes)}`));
    if (c.reflection?.decision) body.push(h('p', { class: 'station-meta' }, DECISION[c.reflection.decision]));
    return h(
      'li',
      { class: `station ${state}`, 'aria-current': state === 'current' ? 'step' : null },
      h('span', { class: 'station-dot', 'aria-hidden': 'true' }),
      h('span', { class: 'station-num', 'aria-hidden': 'true' }, String(c.n).padStart(2, '0')),
      h('div', { class: 'station-head' }, h('span', { class: 'station-n' }, `Siklus ${c.n}`), c.locked ? null : stageTag(c.stage, stageText)),
      c.starts_on ? h('p', { class: 'station-dates' }, dateRange(c.starts_on, c.due_on)) : null,
      body,
      !c.locked && c.href ? h('a', { href: c.href, 'aria-label': `Buka siklus ${c.n}` }, c.stage === 'selesai' ? 'Baca catatan' : 'Buka siklus') : null,
    );
  });
  return h('ol', { class: 'route', 'aria-label': 'Rute tiga siklus' }, progress, stations);
}

// ---------- SVG milik merek (tanpa pustaka ikon) ----------
const NS = 'http://www.w3.org/2000/svg';
function svg(tag, attrs = {}, ...kids) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  for (const k of kids) if (k) el.append(k);
  return el;
}

/** Motif cincin kompas dari geometri logo: cincin tebal, empat penunjuk arah, cincin dalam tipis. Dekorasi saja. */
export function compassMotif(className) {
  const tick = (rot) => svg('path', { d: 'M100 6 L108 24 L100 20 L92 24 Z', transform: `rotate(${rot} 100 100)`, fill: 'currentColor' });
  return svg(
    'svg',
    { class: className, viewBox: '0 0 200 200', 'aria-hidden': 'true', focusable: 'false' },
    svg('circle', { cx: 100, cy: 100, r: 70, fill: 'none', stroke: 'currentColor', 'stroke-width': 14 }),
    svg('circle', { cx: 100, cy: 100, r: 46, fill: 'none', stroke: 'currentColor', 'stroke-width': 2 }),
    tick(0), tick(90), tick(180), tick(270),
  );
}

/** Cincin kemajuan (data nyata, bukan hiasan). value/max dibatasi 0..1. */
export function gauge(value, max, big, small, label) {
  const r = 52;
  const len = 2 * Math.PI * r;
  const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const arc = svg('circle', { class: 'arc', cx: 60, cy: 60, r, fill: 'none', 'stroke-width': 10, 'stroke-dasharray': len.toFixed(1), 'stroke-dashoffset': len.toFixed(1) });
  requestAnimationFrame(() => requestAnimationFrame(() => arc.setAttribute('stroke-dashoffset', (len * (1 - ratio)).toFixed(1))));
  return h(
    'div',
    { class: 'gauge', role: 'img', 'aria-label': label },
    svg('svg', { viewBox: '0 0 120 120', 'aria-hidden': 'true', focusable: 'false' }, svg('circle', { class: 'track', cx: 60, cy: 60, r, fill: 'none', 'stroke-width': 10 }), arc),
    h('div', { class: 'gauge-center', 'aria-hidden': 'true' }, h('b', big), h('span', small)),
  );
}

/** Tombol "Tambah ke kalender": mengunduh berkas .ics sesi Tinjau dari server. */
export function calendarButton(path, extraClass = '') {
  const b = h('button', { class: `btn secondary small ${extraClass}`.trim(), type: 'button' }, 'Tambah ke kalender');
  b.addEventListener('click', async () => {
    b.classList.add('is-busy');
    try {
      const { download } = await import('./api.js');
      await download(path);
      toast('Berkas kalender terunduh. Buka untuk menambahkannya ke kalendermu.');
    } catch (err) {
      toast(err.message, 'err');
    } finally {
      b.classList.remove('is-busy');
    }
  });
  return b;
}
