// Layar publik: Masuk dan Konfirmasi mitra.
import { h, busy } from '../dom.js';
import { get, post } from '../api.js';
import { field, formMessage, notice, route, compassMotif } from '../ui.js';
import { dateShort, minutes } from '../format.js';
import { setUser, go } from '../app.js';

export async function masuk() {
  const signup = new URLSearchParams(location.hash.split('?')[1] || '').has('daftar');
  const demo = signup ? { accounts: [] } : await get('/api/demo-accounts').catch(() => ({ accounts: [] }));
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
        h('div', { class: 'divider', id: 'demo-h' }, 'Atau coba tanpa mendaftar'),
        h(
          'div',
          { class: 'demo-list' },
          demo.accounts.map((a) => {
            const b = h('button', { class: 'demo-btn', type: 'button' }, h('b', a.label), h('small', a.desc));
            b.addEventListener('click', busy(b, () => login(a.email, demo.password)));
            return b;
          }),
        ),
        h('p', { class: 'hint' }, `Akun demo berisi data contoh, bukan mahasiswa sungguhan. Kata sandi semuanya ${demo.password}.`),
      )
    : null;

  return h(
    'div',
    { class: 'auth' },
    h(
      'section',
      { class: 'auth-side', 'aria-label': 'Tentang Uji Jelajah' },
      compassMotif('auth-motif'),
      h('div', { class: 'brand', translate: 'no' }, h('img', { src: '/img/logo-192.png', alt: '', width: 40, height: 40 }), 'Uji Jelajah'),
      h('p', { class: 'auth-kicker' }, 'Program karier enam minggu untuk mahasiswa S1'),
      h('h1', 'Coba dulu, baru ', h('em', 'putuskan.')),
      h('p', { class: 'lede' }, 'Punya bayangan tentang satu pekerjaan, tapi belum yakin cocok? Di Uji Jelajah kamu mengujinya sendiri lewat percobaan kecil, lalu memutuskan langkah berikutnya.'),
      h(
        'ol',
        { class: 'auth-steps', 'aria-label': 'Cara kerja Uji Jelajah' },
        h('li', h('b', 'Dugaan'), h('span', 'Tulis apa yang kamu bayangkan tentang pekerjaan itu. Pendamping AI hanya bertanya dan merangkum, tidak memberi saran.')),
        h('li', h('b', 'Uji'), h('span', 'Coba paling lama 6 jam, misalnya mewawancarai praktisi atau ikut proyek mini.')),
        h('li', h('b', 'Tinjau'), h('span', 'Bahas hasilnya 30 menit dengan fasilitator sebaya, lalu putuskan: lanjut, ubah, atau tinggalkan dugaanmu.')),
      ),
      demoPreview(),
    ),
    h(
      'section',
      { class: 'auth-main' },
      h(
        'div',
        { class: 'auth-panel' },
        h('div', { class: 'stack' }, h('span', { class: 'sim-badge', style: { justifySelf: 'start' } }, 'Prototipe · data simulasi'), h('h2', signup ? 'Buat akun peserta' : 'Masuk ke akunmu')),
        signup ? signupForm() : form,
        signup
          ? h('p', { class: 'auth-switch' }, 'Sudah punya akun? ', h('a', { href: '#/masuk' }, 'Masuk'))
          : h('p', { class: 'auth-switch' }, 'Belum punya akun? ', h('a', { href: '#/masuk?daftar' }, 'Daftar')),
        demoList,
        h('p', { class: 'auth-legal' }, h('a', { href: '#/panduan' }, 'Panduan cara pakai (video)'), h('a', { href: '#/ketentuan' }, 'Ketentuan layanan'), h('a', { href: '#/privasi' }, 'Kebijakan privasi')),
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
  const btn = h('button', { class: 'btn block', type: 'button' }, 'Ya, percobaan ini sudah terjadi');
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

/** Pendaftaran mandiri (v1.2): peran selalu peserta, masuk ke kohort Uji coba juri. */
function signupForm() {
  const msg = formMessage();
  const name = field({ label: 'Nama lengkap', name: 'name', autocomplete: 'name', required: true, maxlength: 80 });
  const email = field({ label: 'Email', name: 'email', type: 'email', autocomplete: 'email', inputmode: 'email', required: true, spellcheck: 'false' });
  const pass = field({ label: 'Kata sandi', hint: 'Minimal 8 karakter. Hindari kata sandi umum seperti 12345678.', name: 'password', type: 'password', autocomplete: 'new-password', required: true, minlength: 8 });
  const pass2 = field({ label: 'Ulangi kata sandi', name: 'password2', type: 'password', autocomplete: 'new-password', required: true, minlength: 8 });
  const fields = { name, email, password: pass, password2: pass2 };
  const submit = h('button', { class: 'btn block', type: 'submit' }, 'Buat akun');
  const form = h(
    'form',
    { class: 'stack', novalidate: true },
    notice('warn', 'Akun asli, tetapi keluaran AI masih simulasi dan angka ini bukan bukti dampak.', 'info'),
    h('p', { class: 'hint' }, 'Akun baru selalu akun peserta dan masuk kohort Uji coba juri, terpisah dari data contoh. Setelah daftar, kamu mulai dari persetujuan data, kuesioner awal, lalu dugaan pertama.'),
    name, email, pass, pass2, msg, submit,
  );
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    busy(submit, async () => {
      msg.clear();
      const v = { name: name.input.value.trim(), email: email.input.value.trim(), password: pass.input.value, password2: pass2.input.value };
      const errs = [];
      if (v.name.length < 2) errs.push([name, 'Tulis nama lengkapmu, minimal 2 karakter.']);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) errs.push([email, 'Tulis email yang valid, misalnya nama@kampus.ac.id.']);
      if (v.password.length < 8) errs.push([pass, 'Kata sandi minimal 8 karakter.']);
      else if (v.password2 !== v.password) errs.push([pass2, 'Ulangan kata sandi belum sama. Ketik ulang kata sandi yang sama.']);
      if (errs.length) {
        errs.forEach(([f, m]) => f.setError(m));
        return errs[0][0].input.focus();
      }
      try {
        const out = await post('/api/auth/register', v);
        setUser(out.user);
        go(out.home.replace('#', ''));
      } catch (err) {
        const f = fields[err.field];
        if (f) {
          f.setError(err.message);
          f.input.focus();
        } else msg.show('err', err.message);
      }
    })();
  });
  return form;
}

/**
 * Cuplikan produk asli di layar Masuk: komponen rute yang sama dengan Beranda,
 * diisi keadaan akun demo Dinda (siklus 1 tahap Uji, 45 dari 120 menit).
 */
function demoPreview() {
  const day = (n) => new Date(Date.now() + n * 86400e3).toISOString().slice(0, 10);
  const cycles = [
    { n: 1, stage: 'uji', starts_on: day(-4), due_on: day(10), hypothesis: { saved: true, statement: 'Aku menduga aku akan menikmati mencari pola dalam data penjualan karena suka menebak penyebab sesuatu.' }, experiment: { title: 'Wawancara seorang analis data', logged_minutes: 45, planned_minutes: 120 } },
    { n: 2, stage: 'dugaan', locked: true, starts_on: day(10), due_on: day(24) },
    { n: 3, stage: 'dugaan', locked: true, starts_on: day(24), due_on: day(38) },
  ];
  return h(
    'figure',
    { class: 'demo-frame', 'aria-label': 'Contoh tampilan Beranda peserta' },
    h('figcaption', { class: 'demo-frame-bar' }, h('span', 'Contoh Beranda peserta (akun demo Dinda)'), h('span', 'Siklus 1 dari 3')),
    route(cycles),
  );
}
