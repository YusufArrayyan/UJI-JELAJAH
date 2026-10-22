// Video demo bersuara: satu MP4 (H.264 + AAC) berisi pembuka, peserta, mitra, fasilitator, koordinator, penutup.
// Narasi dibacakan suara Bahasa Indonesia (edge-tts, id-ID-GadisNeural) dan ditampilkan sebagai teks di layar.
// Waktu tiap adegan mengikuti panjang suara, sehingga gambar dan suara selalu selaras.
// Jalankan: node scripts/demo-bersuara.mjs
// Butuh: Playwright (scripts/pw.mjs), Python dengan paket edge-tts dan imageio-ffmpeg:
//   python -m pip install --user edge-tts imageio-ffmpeg
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { loadPlaywright, launchBrowser } from './pw.mjs';

const OUT = resolve('docs/demo');
const OUT_FILE = join(OUT, 'demo-uji-jelajah.mp4');
const W = 1280;
const H = 720;
const VOICE = process.env.TTS_VOICE || 'id-ID-GadisNeural';
const PY = process.env.PYTHON || 'python';
const CACHE = join(tmpdir(), 'uji-jelajah-tts');
mkdirSync(CACHE, { recursive: true });
mkdirSync(OUT, { recursive: true });

const pw = loadPlaywright();
if (!pw) {
  console.error('Playwright tidak ditemukan. Pasang dengan: npm i -D playwright && npx playwright install chromium');
  process.exit(1);
}
const ffr = spawnSync(PY, ['-c', 'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())'], { encoding: 'utf8' });
const FF = ffr.stdout.trim();
if (ffr.status !== 0 || !FF) {
  console.error('ffmpeg tidak ditemukan. Pasang dengan: python -m pip install --user edge-tts imageio-ffmpeg');
  process.exit(1);
}

function ff(args) {
  const r = spawnSync(FF, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { encoding: 'utf8', maxBuffer: 64 << 20 });
  if (r.status !== 0) throw new Error('ffmpeg gagal: ' + r.stderr);
}
function mediaDuration(file) {
  const r = spawnSync(FF, ['-hide_banner', '-i', file], { encoding: 'utf8' });
  const m = /Duration: (\d+):(\d+):([\d.]+)/.exec(r.stderr);
  return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : 0;
}

/** Suara untuk satu kalimat, disimpan di cache agar perekaman ulang tidak perlu membuat suara lagi. */
function tts(text) {
  const key = createHash('sha1').update(VOICE + '|' + text).digest('hex').slice(0, 16);
  const file = join(CACHE, key + '.mp3');
  if (!existsSync(file)) {
    for (let i = 0; i < 3; i++) {
      const r = spawnSync(PY, ['-m', 'edge_tts', '--voice', VOICE, '--rate=+4%', '--text', text, '--write-media', file], { encoding: 'utf8' });
      if (r.status === 0 && existsSync(file)) break;
      if (i === 2) throw new Error('edge-tts gagal: ' + r.stderr);
    }
  }
  return { file, dur: mediaDuration(file) };
}

const tmp = mkdtempSync(join(tmpdir(), 'uji-jelajah-bersuara-'));
process.env.DB_PATH = join(tmp, 'demo.db');
const seed = spawnSync(process.execPath, ['server/seed.js'], { env: { ...process.env }, encoding: 'utf8' });
if (seed.status !== 0) throw new Error(seed.stderr);
const { createApp } = await import('../server/server.js');
const server = createApp();
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await launchBrowser(pw);
const shared = {};

const b64 = (f) => readFileSync(resolve(f)).toString('base64');
const LOGO = 'data:image/png;base64,' + b64('public/img/logo-192.png');
const FONT_SERIF = 'data:font/woff2;base64,' + b64('public/fonts/newsreader-latin.woff2');
const FONT_SANS = 'data:font/woff2;base64,' + b64('public/fonts/ibm-plex-sans-latin.woff2');

// Teks narasi di layar dan sorotan klik (sama dengan scripts/record-demo.mjs).
const OVERLAY = () => {
  window.__cap = (text) => {
    let el = document.getElementById('__cap');
    if (!el) {
      el = document.createElement('div');
      el.id = '__cap';
      Object.assign(el.style, { position: 'fixed', left: '50%', bottom: '28px', transform: 'translateX(-50%)', zIndex: 2147483647, maxWidth: '960px', padding: '12px 22px', borderRadius: '14px', background: 'rgba(21,27,69,0.92)', color: '#fff', font: '500 19px/1.45 "IBM Plex Sans", system-ui, sans-serif', textAlign: 'center', pointerEvents: 'none', transition: 'opacity 200ms', boxShadow: '0 6px 24px rgba(0,0,0,.25)' });
      document.documentElement.append(el);
    }
    el.textContent = text;
    el.style.opacity = text ? '1' : '0';
  };
  window.__hl = (x, y, w, h) => {
    const r = document.createElement('div');
    Object.assign(r.style, { position: 'fixed', left: `${x - 6}px`, top: `${y - 6}px`, width: `${w + 12}px`, height: `${h + 12}px`, border: '3px solid #f5b81c', borderRadius: '14px', zIndex: 2147483646, pointerEvents: 'none', transition: 'opacity 300ms' });
    document.documentElement.append(r);
    setTimeout(() => (r.style.opacity = '0'), 650);
    setTimeout(() => r.remove(), 1000);
  };
};

const card = (kicker, title, sub) => `<!doctype html><html lang="id"><head><meta charset="utf-8"><style>
@font-face{font-family:Newsreader;src:url(${FONT_SERIF}) format('woff2')}
@font-face{font-family:'IBM Plex Sans';src:url(${FONT_SANS}) format('woff2')}
html,body{margin:0;height:100%;background:#151b45;color:#fff;font-family:'IBM Plex Sans',system-ui,sans-serif}
.w{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:14px}
img{width:96px;height:96px;margin-bottom:8px}
.k{color:#f5b81c;font-weight:600;letter-spacing:.14em;text-transform:uppercase;font-size:16px}
h1{font-family:Newsreader,serif;font-weight:500;font-size:60px;margin:0}
p{margin:0;font-size:22px;color:#c9cdea;max-width:820px;line-height:1.45}
</style></head><body><div class="w"><img src="${LOGO}" alt=""><div class="k">${kicker}</div><h1>${title}</h1><p>${sub}</p></div></body></html>`;

/** Merekam satu bagian. Mengembalikan berkas video mentah, daftar suara beserta waktunya, dan bab. */
async function record(name, scenario) {
  const dir = mkdtempSync(join(tmp, name + '-'));
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, recordVideo: { dir, size: { width: W, height: H } }, locale: 'id-ID', timezoneId: 'Asia/Jakarta' });
  await ctx.addInitScript(OVERLAY);
  const page = await ctx.newPage();
  const t0 = Date.now();
  const now = () => (Date.now() - t0) / 1000;
  const wait = (ms) => page.waitForTimeout(ms);
  const clips = [];
  const chapters = [];
  let speakingUntil = 0;

  // Bacakan satu kalimat. Bawaan: tunggu sampai selesai dibacakan. { lanjut: true }: aksi berikut berjalan sambil dibacakan.
  const say = async (text, { lanjut = false, bab = null } = {}) => {
    const clip = tts(text);
    const left = speakingUntil - now();
    if (left > 0) await wait(left * 1000);
    const start = now();
    clips.push({ ...clip, start, text });
    if (bab) chapters.push({ start, label: bab });
    speakingUntil = start + clip.dur + 0.35;
    await page.evaluate((t) => window.__cap?.(t), text).catch(() => {});
    if (!lanjut) await wait((clip.dur + 0.35) * 1000);
  };
  const tunggu = async () => {
    const left = speakingUntil - now();
    if (left > 0) await wait(left * 1000);
  };
  const click = async (locator) => {
    const el = locator.first();
    await el.scrollIntoViewIfNeeded();
    const b = await el.boundingBox();
    if (b) await page.evaluate(([x, y, w, h]) => window.__hl?.(x, y, w, h), [b.x, b.y, b.width, b.height]);
    await wait(450);
    await el.click();
  };
  const type = async (locator, text, delay = 14) => {
    const el = locator.first();
    await el.scrollIntoViewIfNeeded();
    await el.click();
    await el.pressSequentially(text, { delay });
  };
  const scroll = (y) => page.evaluate((v) => window.scrollTo({ top: v, behavior: 'smooth' }), y).then(() => wait(700));
  const scrollTo = async (locator) => {
    await locator.first().evaluate((e) => e.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    await wait(700);
  };
  const titleCard = async (kicker, title, sub) => {
    await page.setContent(card(kicker, title, sub));
    await page.evaluate(OVERLAY);
    await page.evaluate(() => document.fonts.ready);
  };

  await scenario({ page, say, tunggu, click, type, wait, scroll, scrollTo, titleCard });
  await tunggu();
  await page.evaluate(() => window.__cap?.('')).catch(() => {});
  await wait(500);
  const duration = now();
  const video = page.video();
  await ctx.close();
  const src = await video.path();
  console.log(`${name}: ${duration.toFixed(1)} detik, ${clips.length} kalimat`);
  return { name, src, clips, chapters, duration };
}

async function masukDemo(page, label, click) {
  await page.goto(base + '/#/masuk');
  await page.locator('.demo-btn', { hasText: label }).first().waitFor();
  await page.evaluate(() => document.fonts.ready);
  if (click) await click(page.locator('.demo-btn', { hasText: label }));
}

// ---------------- Skenario ----------------
const bagian = [
  ['pembuka', async ({ page, say, titleCard, scrollTo, wait }) => {
    await titleCard('Demo penggunaan aplikasi', 'Uji Jelajah', 'Menumbuhkan adaptabilitas karier lewat tiga siklus: Dugaan, Uji, dan Tinjau.');
    await say('Halo! Ini demo penggunaan Uji Jelajah, aplikasi berbantuan AI yang membantu mahasiswa menguji pilihan kariernya lewat percobaan kecil.', { bab: 'Pembuka' });
    await say('Programnya berjalan enam minggu, dalam tiga siklus. Setiap siklus punya tiga tahap: Dugaan, Uji, dan Tinjau.');
    await say('Ada empat peran: peserta, mitra, fasilitator sebaya, dan koordinator. Kita lihat satu per satu.');
    await page.goto(base + '/#/masuk');
    await page.locator('.demo-btn').first().waitFor();
    await say('Semua dimulai dari halaman Masuk. Isi surel dan kata sandi akunmu, lalu tekan Masuk.', { bab: 'Halaman Masuk dan akun demo' });
    await scrollTo(page.locator('#demo-h'));
    await say('Untuk mencoba, tersedia akun demo. Cukup tekan salah satu tombol ini. Semua akun demo memakai kata sandi demo satu dua tiga empat.');
    await wait(400);
  }],

  ['peserta', async ({ page, say, tunggu, click, type, wait, scroll, scrollTo, titleCard }) => {
    await titleCard('Bagian 1', 'Peserta', 'Mahasiswa yang menjalani tiga siklus Dugaan, Uji, dan Tinjau.');
    await say('Bagian pertama: peserta. Kita masuk sebagai Raka, peserta baru yang belum memberi persetujuan data.', { bab: 'Peserta: masuk' });
    await masukDemo(page, 'Peserta baru', click);
    await page.waitForURL(/#\/beranda$/);
    await say('Ini Beranda. Di bagian atas selalu ada satu langkah berikutnya, jadi peserta tidak perlu menebak harus mulai dari mana.', { bab: 'Persetujuan data' });
    await click(page.locator('.next a'));
    await page.waitForURL(/persetujuan/);
    await say('Langkah pertama adalah persetujuan data. Bacalah ketentuannya.', { lanjut: true });
    await scrollTo(page.locator('#agree'));
    await tunggu();
    await say('Data baru disimpan setelah peserta setuju. Pendamping AI tidak mendiagnosis dan tidak memberi saran karier.');
    await click(page.locator('label.check'));
    await click(page.getByRole('button', { name: 'Setuju dan lanjut' }));
    await page.waitForURL(/instrumen\/pretes/);
    await say('Berikutnya pretes: dua kuesioner singkat. Pilih jawaban yang paling sesuai untuk setiap pernyataan.', { lanjut: true, bab: 'Pretes' });
    const sets = page.locator('fieldset.likert');
    for (let i = 0; i < 12; i++) {
      await sets.nth(i).locator('label.choice').nth([3, 2, 3, 4, 2, 3, 3, 4, 3, 2, 3, 4][i]).click();
      await wait(i < 4 ? 450 : 160);
    }
    await tunggu();
    await click(page.getByRole('button', { name: 'Kirim pretes' }));
    await page.waitForURL(/#\/beranda$/);
    await scrollTo(page.locator('#cyc-h'));
    await say('Pretes terkirim. Siklus satu sekarang terbuka. Siklus dua dan tiga masih terkunci sampai siklus sebelumnya selesai.', { bab: 'Rute tiga siklus' });
    await scroll(0);
    await click(page.locator('.next a'));
    await page.waitForURL(/dugaan/);
    await say('Tahap pertama, Dugaan. Pendamping AI akan menanyakan lima pertanyaan. Peserta menjawab dengan kata-katanya sendiri.', { lanjut: true, bab: 'Dugaan bersama Pendamping AI' });
    const answers = [
      'Analis data di perusahaan logistik',
      'Membersihkan data pengiriman lalu membuat grafik untuk manajer',
      'Aku menduga akan menikmati mencari pola keterlambatan karena suka teka-teki angka',
      'Wawancara satu analis data selama satu jam',
      'Kalau aku ingin belajar SQL setelahnya, dugaanku benar',
    ];
    for (const [i, a] of answers.entries()) {
      if (i === 2) await say('Pertanyaannya meliputi pekerjaan yang ingin diuji, kegiatan sehari-harinya, dugaan peserta, cara mengujinya, dan tanda bahwa dugaannya benar.', { lanjut: true });
      await type(page.locator('.chat-form textarea'), a, 22);
      await click(page.getByRole('button', { name: 'Kirim jawaban' }));
      await page.locator('.bubble.me').nth(i).waitFor();
      await wait(400);
    }
    await tunggu();
    await say('Setelah lima jawaban, tekan Susun draf dugaan. Pendamping AI merangkai jawaban tadi menjadi satu kalimat dugaan.');
    await click(page.getByRole('button', { name: 'Susun draf dugaan' }));
    await page.getByText('Draf dari Pendamping AI').waitFor();
    await scrollTo(page.locator('textarea[name=statement]'));
    await say('Draf ini milik peserta, jadi boleh disunting. Fasilitator nanti melihat versi AI dan versi peserta secara berdampingan.', { lanjut: true });
    await type(page.locator('textarea[name=statement]'), ' Aku ingin melihat dasbornya langsung.', 30);
    await tunggu();
    await click(page.getByRole('button', { name: 'Simpan dugaan' }));
    await page.waitForURL(/#\/uji\//);
    await say('Tahap kedua, Uji. Rancang satu percobaan kecil: pilih jenisnya, beri judul, dan perkirakan waktunya. Paling lama enam jam.', { lanjut: true, bab: 'Uji: rencana percobaan' });
    await wait(1500);
    await click(page.locator('label.choice', { hasText: 'Wawancara praktisi' }));
    await type(page.locator('input[name=title]'), 'Wawancara satu analis data', 30);
    await page.locator('select[name=planned]').selectOption('60');
    await tunggu();
    await click(page.getByRole('button', { name: 'Simpan rencana' }));
    await page.getByRole('heading', { name: 'Catat waktu' }).waitFor();
    await scrollTo(page.getByRole('heading', { name: 'Catat waktu' }));
    await say('Selama percobaan, catat waktunya. Bisa memakai penghitung waktu, atau diisi manual dalam menit.', { lanjut: true, bab: 'Uji: catat waktu dan tautan mitra' });
    await type(page.locator('input[name=minutes]'), '45', 120);
    await tunggu();
    await click(page.getByRole('button', { name: 'Catat waktu' }));
    await wait(800);
    await scrollTo(page.locator('input.mono'));
    shared.mitraLink = await page.locator('input.mono').inputValue();
    await say('Di bawahnya ada tautan konfirmasi. Kirim tautan ini ke mitra percobaan, misalnya praktisi yang diwawancarai. Mitra tidak perlu membuat akun.');
    await scrollTo(page.getByRole('button', { name: 'Selesaikan percobaan' }));
    await say('Kalau percobaan sudah selesai, tekan Selesaikan percobaan, lalu konfirmasi.', { lanjut: true });
    await click(page.getByRole('button', { name: 'Selesaikan percobaan' }));
    await tunggu();
    await click(page.getByRole('button', { name: 'Ya, selesaikan dan lanjut ke Tinjau' }));
    await page.waitForURL(/#\/tinjau\//);
    await say('Tahap ketiga, Tinjau. Ceritakan apa yang terjadi selama percobaan, lalu nilai dugaanmu sendiri: terbukti, terbukti sebagian, atau tidak terbukti.', { lanjut: true, bab: 'Tinjau: refleksi' });
    await type(page.locator('textarea[name=what]'), 'Aku mewawancarai analis data tentang dasbor pengiriman dan cara mereka bertanya ke tim.', 20);
    await click(page.locator('label.choice', { hasText: 'Terbukti sebagian' }));
    await tunggu();
    await click(page.getByRole('button', { name: 'Kirim refleksi' }));
    await page.getByText('Ringkasan dari Pendamping AI').waitFor();
    await scrollTo(page.locator('textarea[name=summary]'));
    await say('Pendamping AI membuat ringkasan refleksi. Periksa dan ubah bila perlu, karena ringkasan ini dibawa ke sesi dengan fasilitator.');
    await scrollTo(page.locator('.slots'));
    await say('Lalu pilih jadwal sesi tiga puluh menit dengan fasilitator sebaya, dan tekan Jadwalkan sesi.', { lanjut: true, bab: 'Tinjau: jadwal sesi' });
    await click(page.locator('.slots label.choice').first());
    await tunggu();
    await click(page.getByRole('button', { name: 'Jadwalkan sesi' }));
    await page.getByRole('heading', { name: 'Sesi Tinjau terjadwal' }).waitFor();
    await scrollTo(page.getByRole('heading', { name: 'Sesi Tinjau terjadwal' }));
    await say('Sesi terjadwal dan bisa ditambahkan ke kalender. Pilihan keputusan baru terbuka setelah fasilitator menutup sesi.');

    // Fasilitator menutup sesi Raka di latar (cara menutup sesi diperagakan di bagian fasilitator).
    const fac = await browser.newContext();
    const fp = await fac.newPage();
    await fp.goto(base + '/#/masuk');
    await fp.evaluate(async () => {
      await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'fasilitator@demo.id', password: 'demo1234' }) });
      const g = await (await fetch('/api/fac/participants')).json();
      const raka = g.participants.find((p) => p.name === 'Raka Pratama');
      const d = await (await fetch(`/api/fac/participants/${raka.id}`)).json();
      const s = d.cycles[0].session;
      await fetch(`/api/sessions/${s.id}/complete`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note: 'Raka menemukan analis data banyak berdiskusi dengan tim.', summary_checked: true }) });
    });
    await fac.close();

    await page.reload();
    await scrollTo(page.locator('label.choice', { hasText: 'Ubah dugaan' }));
    await say('Sesi sudah ditutup fasilitator. Sekarang peserta sendiri yang memutuskan: lanjutkan, ubah, atau tinggalkan dugaannya. Raka memilih Ubah dugaan.', { lanjut: true, bab: 'Keputusan' });
    await wait(2500);
    await click(page.locator('label.choice', { hasText: 'Ubah dugaan' }));
    await tunggu();
    await click(page.getByRole('button', { name: 'Simpan keputusan' }));
    await page.waitForURL(/#\/beranda$/);
    await scrollTo(page.locator('#cyc-h'));
    await say('Siklus satu selesai, dan siklus dua terbuka. Siklus berikutnya dijalani dengan cara yang sama.');
    await click(page.locator('.nav-top a', { hasText: 'Perjalananku' }));
    await page.waitForURL(/perjalanan/);
    await say('Menu Perjalananku menampilkan peta jelajah: setiap dugaan, percobaan, dan keputusan tergambar sebagai satu jalur.', { bab: 'Peta jelajah' });
    await scroll(400);
    await wait(800);
  }],

  ['mitra', async ({ page, say, tunggu, click, wait, titleCard }) => {
    await titleCard('Bagian 2', 'Mitra', 'Praktisi yang membantu percobaan. Cukup satu tautan dan satu tombol, tanpa akun.');
    await say('Bagian kedua: mitra. Mitra adalah orang yang membantu percobaan, misalnya praktisi yang diwawancarai.', { bab: 'Mitra: konfirmasi percobaan' });
    await page.goto(shared.mitraLink);
    await page.getByRole('button', { name: 'Ya, percobaan ini sudah terjadi' }).waitFor();
    await say('Mitra membuka tautan dari peserta. Halaman ini menampilkan nama peserta, judul percobaan, jenis, dan durasinya.');
    await say('Jika percobaan memang sudah terjadi, mitra cukup menekan satu tombol.', { lanjut: true });
    await wait(1800);
    await click(page.getByRole('button', { name: 'Ya, percobaan ini sudah terjadi' }));
    await page.getByText('Terima kasih, sudah terkonfirmasi.').waitFor();
    await tunggu();
    await say('Selesai. Konfirmasi ini langsung tampil di aplikasi peserta. Tautan berlaku tiga puluh hari.');
  }],

  ['fasilitator', async ({ page, say, tunggu, click, wait, scrollTo, titleCard }) => {
    await titleCard('Bagian 3', 'Fasilitator', 'Mahasiswa BK semester lanjut yang mendampingi sesi Tinjau.');
    await say('Bagian ketiga: fasilitator sebaya. Kita masuk sebagai Nadia Putri.', { bab: 'Fasilitator: Kelompokku' });
    await masukDemo(page, 'Fasilitator', click);
    await page.waitForURL(/#\/kelompok$/);
    await say('Halaman Kelompokku menampilkan tahap setiap peserta, sesi mendatang, dan kendala yang masih terbuka.');
    await scrollTo(page.locator('#tb-h'));
    await say('Gunakan saringan untuk menemukan peserta yang perlu perhatian, misalnya yang punya kendala atau tenggatnya lewat.', { lanjut: true });
    await click(page.getByRole('button', { name: /Perlu perhatian/ }));
    await tunggu();
    await say('Saringan Sesi terjadwal menampilkan peserta yang akan bertemu. Kita buka detail Fikri.', { lanjut: true });
    await click(page.getByRole('button', { name: /Sesi terjadwal/ }));
    await wait(1800);
    await tunggu();
    await click(page.getByRole('link', { name: 'Fikri Ramadhan' }));
    await page.waitForURL(/#\/peserta\//);
    await say('Ini detail peserta. Setiap kali fasilitator membuka data peserta, aksesnya tercatat di log.', { bab: 'Detail peserta' });
    await scrollTo(page.locator('.compare').first());
    await say('Versi Pendamping AI dan versi peserta tampil berdampingan, sehingga fasilitator bisa melihat apa yang diubah peserta.');
    await scrollTo(page.locator('form.card'));
    await say('Setelah sesi, tulis catatan singkat, centang bahwa ringkasan sudah diperiksa, lalu tekan Tandai sesi selesai.', { lanjut: true, bab: 'Menutup sesi' });
    await page.locator('textarea[name=note]').pressSequentially('Fikri lebih menikmati menguji desain ke pengguna. Akan mencoba riset pengguna di siklus 3.', { delay: 22 });
    await click(page.locator('form.card input[type=checkbox]'));
    await tunggu();
    await click(page.getByRole('button', { name: 'Tandai sesi selesai' }));
    await page.getByText('Ringkasan diperiksa').first().waitFor();
    await say('Sesi tertutup. Sekarang peserta bisa mencatat keputusannya.');
    await scrollTo(page.locator('#iss-h'));
    await say('Di bagian Kendala, tandai kendala peserta sebagai selesai setelah ditangani.', { lanjut: true, bab: 'Kendala' });
    await wait(1500);
    await click(page.getByRole('button', { name: 'Tandai selesai' }));
    await wait(1200);
  }],

  ['koordinator', async ({ page, say, tunggu, click, wait, scroll, scrollTo, titleCard }) => {
    await titleCard('Bagian 4', 'Koordinator', 'Dosen BK yang memantau program lewat angka gabungan.');
    await say('Bagian keempat: koordinator. Kita masuk sebagai Doktor Sari Wulandari.', { bab: 'Koordinator: ringkasan K1 sampai K5' });
    await masukDemo(page, 'Koordinator', click);
    await page.waitForURL(/#\/ringkasan$/);
    await page.locator('.kpi').first().waitFor();
    await say('Halaman Ringkasan berisi lima indikator, K1 sampai K5. Koordinator hanya melihat angka gabungan, tanpa isi pribadi peserta.');
    await scrollTo(page.locator('.kpi').nth(2));
    await say('Setiap indikator punya target. Garis tegak pada batang menandai targetnya.');
    await scroll(0);
    const sel = page.locator('select[name=cohort]');
    const running = await sel.locator('option', { hasText: 'berjalan' }).getAttribute('value');
    await say('Kohort bisa dipilih di sini. Pada kohort yang masih berjalan, angka dari kurang dari sepuluh orang disembunyikan untuk melindungi privasi.', { lanjut: true, bab: 'Pilih kohort dan k-anonimitas' });
    await wait(1800);
    await sel.selectOption(running);
    await page.locator('.hidden-val').first().waitFor();
    await tunggu();
    await scrollTo(page.locator('#st-h'));
    await wait(1000);
    await click(page.locator('.nav-top a', { hasText: /Fasilitator/ }));
    await say('Menu Fasilitator menampilkan beban tiap fasilitator. Peserta yang belum punya fasilitator bisa ditugaskan otomatis ke yang bebannya paling ringan.', { lanjut: true, bab: 'Penugasan fasilitator' });
    await wait(3500);
    await click(page.getByRole('button', { name: 'Tugaskan otomatis' }));
    await tunggu();
    await click(page.locator('.nav-top a', { hasText: 'Mitra' }));
    await say('Menu Mitra berisi bank mitra yang bisa dihubungi peserta untuk percobaan.', { bab: 'Bank mitra' });
    await click(page.locator('.nav-top a', { hasText: /Pendamping AI|AI/ }));
    await say('Menu Mutu AI memantau Pendamping AI: berapa yang lolos pemeriksa, berapa yang memakai cadangan, dan berapa draf yang diubah peserta.', { bab: 'Mutu AI dan log akses' });
    await click(page.locator('.nav-top a', { hasText: /Log/ }));
    await say('Menu Log akses mencatat siapa membuka data apa dan kapan, dengan kode peserta.');
  }],

  ['penutup', async ({ say, titleCard }) => {
    await titleCard('Selesai', 'Selamat menjelajah', 'Panduan lengkap dan daftar akun demo ada di berkas PDF panduan penggunaan.');
    await say('Itulah alur lengkap Uji Jelajah, dari dugaan sampai keputusan. Panduan tertulis dan daftar akun demo tersedia di berkas PDF panduan penggunaan. Selamat menjelajah!', { bab: 'Penutup' });
  }],
];

const parts = [];
try {
  for (const [name, fn] of bagian) parts.push(await record(name, fn));
} finally {
  await browser.close();
  server.close();
}

// Gabungkan: setiap bagian diberi trek suara, dikodekan ke H.264/AAC, lalu disambung tanpa kode ulang.
const segs = [];
for (const p of parts) {
  const seg = join(tmp, p.name + '.mp4');
  const inputs = ['-i', p.src];
  const filters = [];
  p.clips.forEach((c, i) => {
    inputs.push('-i', c.file);
    const ms = Math.round(c.start * 1000);
    filters.push(`[${i + 1}:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${ms}|${ms}[a${i}]`);
  });
  const mix = p.clips.map((_, i) => `[a${i}]`).join('') + `amix=inputs=${p.clips.length}:normalize=0:dropout_transition=0,apad[aout]`;
  ff([...inputs, '-filter_complex', filters.concat(mix).join(';'), '-map', '0:v', '-map', '[aout]', '-t', p.duration.toFixed(2), '-vf', 'fps=30,format=yuv420p', '-c:v', 'libx264', '-preset', 'medium', '-crf', '24', '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', seg]);
  segs.push(seg);
}
const list = join(tmp, 'list.txt');
writeFileSync(list, segs.map((s) => `file '${s.replace(/\\/g, '/')}'`).join('\n'));
ff(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', OUT_FILE]);

// Subtitel SRT dan daftar bab (stempel waktu pada video gabungan).
const ts = (s) => {
  const ms = Math.round(s * 1000);
  const p2 = (n, l = 2) => String(n).padStart(l, '0');
  return `${p2(Math.floor(ms / 3600000))}:${p2(Math.floor((ms % 3600000) / 60000))}:${p2(Math.floor((ms % 60000) / 1000))},${p2(ms % 1000, 3)}`;
};
let offset = 0;
const srt = [];
const bab = [];
for (const [k, p] of parts.entries()) {
  const real = mediaDuration(segs[k]);
  for (const c of p.clips) srt.push(`${srt.length + 1}\n${ts(offset + c.start)} --> ${ts(offset + c.start + c.dur)}\n${c.text}\n`);
  for (const c of p.chapters) bab.push(`${ts(offset + c.start).slice(3, 8)}  ${c.label}`);
  offset += real;
}
writeFileSync(OUT_FILE.replace(/\.mp4$/, '.srt'), srt.join('\n'));
writeFileSync(join(OUT, 'demo-bab.txt'), 'Bab video demo Uji Jelajah\n\n' + bab.join('\n') + '\n');
console.log(`Selesai: ${OUT_FILE} (${offset.toFixed(1)} detik)`);
console.log(bab.join('\n'));
try { rmSync(tmp, { recursive: true, force: true }); } catch { /* berkas WAL di Windows */ }
