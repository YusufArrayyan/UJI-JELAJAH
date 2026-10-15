// Router hash dan kerangka aplikasi.
import { h, icon, clear } from './dom.js';
import { get, post } from './api.js';
import { ROLE } from './format.js';
import { skeleton, errorState, toast } from './ui.js';
import * as auth from './views/auth.js';
import * as peserta from './views/peserta.js';
import * as siklus from './views/siklus.js';
import * as fas from './views/fasilitator.js';
import * as koord from './views/koordinator.js';

const ROUTES = [
  { path: '/masuk', view: auth.masuk, public: true, bare: true, title: 'Masuk' },
  { path: '/konfirmasi/:token', view: auth.konfirmasi, public: true, bare: true, title: 'Konfirmasi mitra' },
  { path: '/beranda', view: peserta.beranda, role: 'peserta', nav: '/beranda', title: 'Beranda' },
  { path: '/persetujuan', view: peserta.persetujuan, role: 'peserta', nav: '/beranda', title: 'Persetujuan data' },
  { path: '/instrumen/:fase', view: peserta.instrumen, role: 'peserta', nav: '/beranda', title: 'Kuesioner' },
  { path: '/dugaan/:id', view: siklus.dugaan, role: 'peserta', nav: '/beranda', title: 'Dugaan' },
  { path: '/uji/:id', view: siklus.uji, role: 'peserta', nav: '/beranda', title: 'Uji' },
  { path: '/tinjau/:id', view: siklus.tinjau, role: 'peserta', nav: '/beranda', title: 'Tinjau' },
  { path: '/perjalanan', view: peserta.perjalanan, role: 'peserta', nav: '/perjalanan', title: 'Perjalananku' },
  { path: '/pengaturan', view: peserta.pengaturan, role: 'peserta', nav: '/pengaturan', title: 'Pengaturan' },
  { path: '/kelompok', view: fas.kelompok, role: 'fasilitator', nav: '/kelompok', title: 'Kelompokku', wide: true },
  { path: '/peserta/:id', view: fas.detail, role: 'fasilitator', nav: '/kelompok', title: 'Detail peserta', wide: true },
  { path: '/ringkasan', view: koord.ringkasan, role: 'koordinator', nav: '/ringkasan', title: 'Ringkasan program', wide: true },
  { path: '/koord/fasilitator', view: koord.fasilitator, role: 'koordinator', nav: '/koord/fasilitator', title: 'Fasilitator', wide: true },
  { path: '/koord/mitra', view: koord.mitra, role: 'koordinator', nav: '/koord/mitra', title: 'Bank mitra', wide: true },
  { path: '/koord/ai', view: koord.ai, role: 'koordinator', nav: '/koord/ai', title: 'Pendamping AI', wide: true },
  { path: '/koord/audit', view: koord.audit, role: 'koordinator', nav: '/koord/audit', title: 'Log akses', wide: true },
].map((r) => {
  const keys = [];
  const re = new RegExp('^' + r.path.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '$');
  return { ...r, re, keys };
});

const NAV = {
  peserta: [
    { href: '/beranda', label: 'Beranda', icon: 'home' },
    { href: '/perjalanan', label: 'Perjalananku', icon: 'route' },
    { href: '/pengaturan', label: 'Pengaturan', icon: 'settings' },
  ],
  fasilitator: [{ href: '/kelompok', label: 'Kelompokku', icon: 'users' }],
  koordinator: [
    { href: '/ringkasan', label: 'Ringkasan', icon: 'chart' },
    { href: '/koord/fasilitator', label: 'Fasilitator', icon: 'userCheck' },
    { href: '/koord/mitra', label: 'Mitra', icon: 'handshake' },
    { href: '/koord/ai', label: 'Pendamping AI', short: 'AI', icon: 'sparkle' },
    { href: '/koord/audit', label: 'Log akses', short: 'Log', icon: 'list' },
  ],
};
export const HOME = { peserta: '/beranda', fasilitator: '/kelompok', koordinator: '/ringkasan' };

const state = { user: undefined };
const root = document.getElementById('app');

export const go = (path) => {
  if (location.hash === '#' + path) render();
  else location.hash = path;
};

async function loadUser(force = false) {
  if (state.user !== undefined && !force) return state.user;
  try {
    state.user = (await get('/api/me')).user;
  } catch {
    state.user = null;
  }
  return state.user;
}
export function setUser(u) {
  state.user = u;
}

function shell(route, user, page) {
  const items = NAV[user.role];
  const navLink = (it, bottom) =>
    h(
      'a',
      { href: '#' + it.href, 'aria-current': route.nav === it.href ? 'page' : null, 'aria-label': it.short && !bottom ? it.label : null },
      icon(it.icon),
      bottom || !it.short ? (bottom ? it.short ?? it.label : it.label) : [h('span', { class: 'nav-long' }, it.label), h('span', { class: 'nav-short', 'aria-hidden': 'true' }, it.short)],
    );
  const logout = h('button', { class: 'btn ghost small', type: 'button', 'aria-label': 'Keluar' }, icon('logout'), h('span', { class: 'logout-text', 'aria-hidden': 'true' }, 'Keluar'));
  logout.addEventListener('click', async () => {
    try { await post('/api/auth/logout'); } catch { /* tetap keluar di klien */ }
    state.user = null;
    go('/masuk');
  });
  const header = h(
    'header',
    { class: 'topbar' },
    h(
      'div',
      { class: 'topbar-inner' },
      h('a', { class: 'brand', translate: 'no', href: '#' + HOME[user.role], 'aria-label': 'Uji Jelajah, ke beranda' }, h('img', { src: '/img/logo-64.png', alt: '', width: 32, height: 32 }), 'Uji Jelajah'),
      h('nav', { class: 'nav nav-top', 'aria-label': 'Navigasi utama' }, items.map((it) => navLink(it))),
      h('div', { class: 'topbar-end' }, h('span', { class: 'sim-badge', title: 'Semua akun, nama, dan angka di prototipe ini fiktif' }, 'Data simulasi'), h('span', { class: 'who' }, `${user.name} · ${ROLE[user.role]}`), logout),
    ),
  );
  const bottom = items.length > 1 ? h('nav', { class: 'bottomnav', 'aria-label': 'Navigasi utama' }, items.map((it) => navLink(it, true))) : null;
  document.body.classList.toggle('has-bottom', !!bottom);
  return [h('a', { class: 'skip-link', href: '#main', onclick: (e) => { e.preventDefault(); document.getElementById('main')?.focus(); } }, 'Lompat ke isi'), header, h('main', { id: 'main', tabindex: '-1' }, page), bottom];
}

let renderSeq = 0;
async function render({ keepScroll = false } = {}) {
  const seq = ++renderSeq;
  const path = location.hash.replace(/^#/, '').split('?')[0] || '/';
  let route = null;
  let params = {};
  for (const r of ROUTES) {
    const m = r.re.exec(path);
    if (m) {
      route = r;
      r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
      break;
    }
  }
  const user = await loadUser();
  if (seq !== renderSeq) return;
  if (!route) return go(user ? HOME[user.role] : '/masuk');
  if (!route.public && !user) return go('/masuk');
  if (route.path === '/masuk' && user) return go(HOME[user.role]);
  if (route.role && user.role !== route.role) return go(HOME[user.role]);

  document.title = `${route.title} · Uji Jelajah`;
  const scrollY = window.scrollY;
  const page = h('div', { class: `page${route.wide ? ' wide' : ''}` });
  const ctx = {
    user,
    params,
    reload: () => render({ keepScroll: true }),
    go,
  };
  clear(root);
  if (route.bare) {
    document.body.classList.remove('has-bottom');
    root.append(h('a', { class: 'skip-link', href: '#main', onclick: (e) => { e.preventDefault(); document.getElementById('main')?.focus(); } }, 'Lompat ke isi'));
    const main = h('main', { id: 'main', tabindex: '-1' });
    root.append(main);
    await mountView(route, main, ctx, seq, true);
  } else {
    root.append(...shell(route, user, page).filter(Boolean));
    page.append(skeleton());
    await mountView(route, page, ctx, seq, false);
  }
  if (seq !== renderSeq) return;
  if (keepScroll) window.scrollTo(0, scrollY);
  else {
    window.scrollTo(0, 0);
    const h1 = root.querySelector('h1');
    if (h1) { h1.setAttribute('tabindex', '-1'); h1.focus({ preventScroll: true }); }
  }
}

async function mountView(route, container, ctx, seq, bare) {
  try {
    const node = await route.view(ctx);
    if (seq !== renderSeq) return;
    clear(container);
    const wrap = bare ? node : h('div', { class: 'view-enter' }, node);
    container.append(wrap);
  } catch (err) {
    if (seq !== renderSeq) return;
    clear(container);
    if (err.status === 401) return;
    container.append(errorState(err, () => render({ keepScroll: true })));
  }
}

window.addEventListener('hashchange', () => render());
window.addEventListener('uj:unauthorized', () => {
  if (state.user) toast('Sesimu sudah berakhir. Masuk lagi untuk melanjutkan.', 'err');
  state.user = null;
  go('/masuk');
});
// Sesi bisa berganti di tab lain (masuk dengan akun berbeda). Periksa ulang lalu arahkan ke peran yang benar.
window.addEventListener('uj:forbidden', async () => {
  const prev = state.user?.id;
  const u = await loadUser(true);
  if (u?.id !== prev) go(u ? HOME[u.role] : '/masuk');
});
document.body.append(h('div', { class: 'toast-region', 'aria-live': 'polite' }));
render();
