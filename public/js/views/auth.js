// Layar publik: Masuk dan Konfirmasi mitra.
import { h, icon, busy } from '../dom.js';
import { get, post } from '../api.js';
import { field, formMessage, notice } from '../ui.js';
import { dateShort, minutes } from '../format.js';
import { setUser, go } from '../app.js';

export async function masuk() {
  const demo = await get('/api/demo-accounts').catch(() => ({ accounts: [] }));
  const msg = formMessage();
  const email = field({ label: 'Email', name: 'email', type: 'email', autocomplete: 'username', inputmode: 'email', required: true, spellcheck: 'false' });
  const pass = field({ label: 'Kata sandi', name: 'password', type: 'password', autocomplete: 'current-password', required: true });
  const submit = h('button', { class: 'btn block', type: 'submit' }, 'Masuk');

  async function login(e, p) {
    msg.clear();
    try {
      const out = await post('/api/auth/login', { email: e, password: p });
      setUser(out.user);
      go(out.home.replace('#', ''));
    } catch (err) {
      msg.show('err', err.message);
    }
  }
  const form = h('form', { class: 'stack', novalidate: true }, email, pass, msg, submit);
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    busy(submit, async () => {
      let ok = true;
      if (!email.input.value.trim()) { email.setError('Tulis email akunmu.'); ok = false; }
      if (!pass.input.value) { pass.setError('Tulis kata sandimu.'); ok = false; }
      if (!ok) return (email.input.value.trim() ? pass : email).input.focus();
      await login(email.input.value.trim(), pass.input.value);
    })();
  });

  const demoList = demo.accounts.length
    ? h(
        'section',
        { class: 'stack', 'aria-labelledby': 'demo-h' },
        h('div', { class: 'divider', id: 'demo-h' }, 'atau coba akun demo'),
        h(
          'div',
          { class: 'demo-list' },
          demo.accounts.map((a) => {
            const b = h('button', { class: 'demo-btn', type: 'button' }, h('b', a.label), h('small', a.desc), icon('arrowRight'));
            b.addEventListener('click', busy(b, () => login(a.email, demo.password)));
            return b;
          }),
        ),
        h('p', { class: 'hint' }, `Semua akun demo memakai kata sandi ${demo.password}. Isinya data simulasi.`),
      )
    : null;

  return h(
    'div',
    { class: 'auth' },
    h(
      'section',
      { class: 'auth-side', 'aria-label': 'Tentang Uji Jelajah' },
      h('div', { class: 'brand', translate: 'no' }, h('img', { src: '/img/logo-192.png', alt: '', width: 40, height: 40 }), 'Uji Jelajah'),
      h('h1', 'Coba dulu, baru putuskan.'),
      h('p', { class: 'lede' }, 'Enam minggu, tiga siklus kecil. Tulis dugaan tentang satu pekerjaan, ujilah dalam paling lama 6 jam, lalu tinjau hasilnya bersama fasilitator sebaya.'),
      h(
        'div',
        { class: 'loop' },
        h(
          'ol',
          h('li', { class: 'l1' }, h('em', '1'), h('b', 'Dugaan'), h('span', 'Pendamping AI menanyakan lima hal. Kamu merumuskan satu dugaan.')),
          h('li', { class: 'l2' }, h('em', '2'), h('b', 'Uji'), h('span', 'Percobaan nyata paling lama 6 jam, dicatat di aplikasi.')),
          h('li', { class: 'l3' }, h('em', '3'), h('b', 'Tinjau'), h('span', 'Sesi 30 menit dengan fasilitator sebaya. Kamu yang memutuskan.')),
        ),
      ),
      h('img', { class: 'auth-mark', src: '/img/logo-512.png', alt: '', width: 360, height: 360 }),
    ),
    h(
      'section',
      { class: 'auth-main' },
      h(
        'div',
        { class: 'auth-panel' },
        h('div', { class: 'stack' }, h('span', { class: 'sim-badge', style: { justifySelf: 'start' } }, 'Prototipe · data simulasi'), h('h2', { style: { fontSize: '24px' } }, 'Masuk ke akunmu')),
        form,
        demoList,
      ),
    ),
  );
}

export async function konfirmasi({ params }) {
  const top = h('div', { class: 'partner-top' }, h('div', { class: 'brand', translate: 'no' }, h('img', { src: '/img/logo-64.png', alt: '', width: 32, height: 32 }), 'Uji Jelajah'), h('span', { class: 'sim-badge' }, 'Data simulasi'));
  const card = h('section', { class: 'partner-card' });
  const page = h('div', { class: 'partner' }, top, card);
  let data;
  try {
    data = await get(`/api/confirm/${encodeURIComponent(params.token)}`);
  } catch (err) {
    card.append(h('h1', err.status === 410 ? 'Tautan sudah kedaluwarsa' : 'Tautan tidak dikenal'), notice(err.status === 410 ? 'warn' : 'err', err.message));
    return page;
  }

  const done = () => {
    card.replaceChildren(
      h('div', { class: 'done-mark' }, icon('check', { width: '2.5' })),
      h('h1', 'Terima kasih, sudah terkonfirmasi.'),
      h('p', { class: 'muted' }, `${data.participant} akan melihat konfirmasimu di aplikasinya. Tidak ada lagi yang perlu kamu lakukan, dan kamu boleh menutup halaman ini.`),
    );
    card.querySelector('h1').focus?.();
  };
  if (data.confirmed_at) {
    done();
    card.append(h('p', { class: 'hint' }, `Dikonfirmasi pada ${dateShort(data.confirmed_at)}.`));
    return page;
  }

  const msg = formMessage();
  const btn = h('button', { class: 'btn block', type: 'button' }, icon('check'), 'Ya, percobaan ini sudah terjadi');
  btn.addEventListener('click', busy(btn, async () => {
    try {
      data = await post(`/api/confirm/${encodeURIComponent(params.token)}`);
      done();
    } catch (err) {
      msg.show('err', err.message);
    }
  }));
  card.append(
    h('h1', 'Konfirmasi satu percobaan'),
    h('p', { class: 'muted' }, `${data.participant}, mahasiswa peserta Uji Jelajah, sedang menguji dugaannya tentang sebuah pekerjaan. Ia mencantumkan kamu sebagai mitra percobaannya.`),
    h('dl', { class: 'dl' }, h('dt', 'Percobaan'), h('dd', data.title), h('dt', 'Jenis'), h('dd', data.type_label), h('dt', 'Durasi rencana'), h('dd', minutes(data.planned_minutes))),
    msg,
    btn,
    h('p', { class: 'hint' }, `Kami tidak meminta nama atau kontakmu. Tautan ini hanya untuk satu konfirmasi dan berlaku sampai ${dateShort(data.expires_at)}.`),
  );
  return page;
}
