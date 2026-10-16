// Pembantu DOM. Isi pengguna selalu masuk sebagai text node, tidak pernah lewat innerHTML.

/**
 * h('div', { class: 'card', onclick: fn, attrs: {...} }, child1, 'teks', [child2, child3])
 */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  if (props === null || typeof props !== 'object' || props instanceof Node || Array.isArray(props)) {
    children.unshift(props);
    props = {};
  }
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'selected') el[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  append(el, children);
  return el;
}

export function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

/** Tombol dengan keadaan sibuk saat menjalankan aksi async. */
export function busy(btn, fn) {
  return async (ev) => {
    if (btn.classList.contains('is-busy')) return;
    btn.classList.add('is-busy');
    btn.setAttribute('aria-busy', 'true');
    try {
      await fn(ev);
    } finally {
      btn.classList.remove('is-busy');
      btn.removeAttribute('aria-busy');
    }
  };
}
