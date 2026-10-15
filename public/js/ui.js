// Komponen kecil yang dipakai ulang di semua layar.
import { h, icon, clear } from './dom.js';
import { STAGE } from './format.js';

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
  return h('div', { class: `notice ${kind}`, role: kind === 'err' ? 'alert' : 'status' }, icon(ic ?? (kind === 'ok' ? 'check' : kind === 'err' ? 'alert' : 'info')), h('div', msg));
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
  const t = h('div', { class: `toast ${kind === 'err' ? 'err' : ''}`, role: kind === 'err' ? 'alert' : 'status' }, icon(kind === 'err' ? 'alert' : 'check'), h('span', msg));
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
  return h('div', { class: 'empty-state' }, icon(ic), h('b', title), body && h('p', body), action);
}

export function errorState(err, retry) {
  return h(
    'div',
    { class: 'stack' },
    notice('err', err.message || 'Terjadi galat.'),
    retry && h('div', h('button', { class: 'btn secondary', type: 'button', onclick: retry }, icon('refresh'), 'Coba lagi')),
  );
}

export function kv(labelText, value) {
  return h('div', { class: 'kv' }, h('p', { class: 'label', text: labelText }), value instanceof Node ? value : h('p', value ?? '–'));
}

export function quote(text, ai = false) {
  return h('div', { class: `quote-block${ai ? ' ai' : ''}` }, h('p', text || '–'));
}
