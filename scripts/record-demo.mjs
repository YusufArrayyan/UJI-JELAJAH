// Perekam video demo cara pakai: memainkan skenario nyata di aplikasi (data simulasi) lewat Playwright,
// lalu menyimpan public/media/demo-<peran>.{webm,vtt,json,png} untuk halaman #/panduan.
// Jalankan: npm run demo:video   (butuh Playwright; lihat scripts/pw.mjs)
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, renameSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { loadPlaywright, launchBrowser } from './pw.mjs';

const OUT = resolve('public/media');
const W = 1280;
const H = 720;
const only = process.argv[2];

const pw = loadPlaywright();
if (!pw) {
  console.error('Playwright tidak ditemukan. Pasang dengan: npm i -D playwright && npx playwright install chromium');
  process.exit(1);
}

const tmp = mkdtempSync(join(tmpdir(), 'uji-jelajah-demo-'));
process.env.DB_PATH = join(tmp, 'demo.db');
const seed = spawnSync(process.execPath, ['server/seed.js'], { env: { ...process.env }, encoding: 'utf8' });
if (seed.status !== 0) throw new Error(seed.stderr);
const { createApp } = await import('../server/server.js');
const server = createApp();
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await launchBrowser(pw);
mkdirSync(OUT, { recursive: true });

// Lapisan teks penjelasan dan sorotan klik. Disuntik lewat init script (tidak dibatasi CSP halaman).
const OVERLAY = () => {
  window.__cap = (text) => {
    let el = document.getElementById('__cap');
    if (!el) {
      el = document.createElement('div');
      el.id = '__cap';
      Object.assign(el.style, { position: 'fixed', left: '50%', top: '84px', transform: 'translateX(-50%)', zIndex: 2147483647, maxWidth: '880px', padding: '14px 22px', borderRadius: '14px', background: 'rgba(21,27,69,0.94)', color: '#fff', font: '500 19px/1.4 "IBM Plex Sans", system-ui, sans-serif', textAlign: 'center', pointerEvents: 'none', transition: 'opacity 200ms' });
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

/**
 * Video mentah Playwright tidak punya indeks "Cues", sehingga pemutar tidak bisa melompat ke bab.
 * Kemas ulang tanpa encode (-c copy) memakai ffmpeg bawaan Playwright bila ada.
 */
function remux(file) {
  const cache = process.env.PLAYWRIGHT_BROWSERS_PATH || (process.platform === 'win32' ? join(process.env.LOCALAPPDATA || '', 'ms-playwright') : join(homedir(), process.platform === 'darwin' ? 'Library/Caches/ms-playwright' : '.cache/ms-playwright'));
  let ff = null;
  try {
    for (const d of readdirSync(cache).filter((n) => n.startsWith('ffmpeg'))) {
      for (const exe of readdirSync(join(cache, d))) if (/^ffmpeg/.test(exe)) ff = join(cache, d, exe);
    }
  } catch { /* tanpa cache */ }
  if (!ff) return console.warn('ffmpeg tidak ditemukan; video tetap bisa diputar tetapi bab tidak bisa dilompati.');
  const tmpOut = file.replace(/\.webm$/, '.tmp.webm');
  const r = spawnSync(ff, ['-loglevel', 'error', '-y', '-i', file, '-c', 'copy', '-cues_to_front', '1', tmpOut]);
  if (r.status === 0) renameSync(tmpOut, file);
  else console.warn('Gagal mengemas ulang video:', String(r.stderr));
}

async function record(role, scenario) {
  const dir = mkdtempSync(join(tmp, role + '-'));
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, recordVideo: { dir, size: { width: W, height: H } }, locale: 'id-ID', timezoneId: 'Asia/Jakarta', acceptDownloads: true });
  await ctx.addInitScript(OVERLAY);
  const page = await ctx.newPage();
  const t0 = Date.now();
  const cues = [];
  const chapters = [];
  let open = null;
  const now = () => (Date.now() - t0) / 1000;
  const wait = (ms) => page.waitForTimeout(ms);

  const say = async (text, ms = 2600, chapter = null) => {
    if (open) open.end = now();
    open = { start: now(), end: null, text };
    cues.push(open);
    if (chapter) chapters.push({ t: Math.max(0, Math.floor(open.start)), label: chapter });
    await page.evaluate((t) => window.__cap?.(t), text).catch(() => {});
    await wait(ms);
  };
  const click = async (locator) => {
    const el = locator.first();
    await el.scrollIntoViewIfNeeded();
    const b = await el.boundingBox();
    if (b) await page.evaluate(([x, y, w, h]) => window.__hl?.(x, y, w, h), [b.x, b.y, b.width, b.height]);
    await wait(450);
    await el.click();
  };
  const type = async (locator, text) => {
    const el = locator.first();
    await el.scrollIntoViewIfNeeded();
    await el.click();
    await el.pressSequentially(text, { delay: 14 });
  };
  const scroll = (y) => page.evaluate((v) => window.scrollTo({ top: v, behavior: 'smooth' }), y).then(() => wait(700));
  const scrollTo = async (locator) => {
    await locator.first().evaluate((e) => e.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    await wait(700);
  };

  await scenario({ page, say, click, type, wait, scroll, scrollTo, base });
  if (open) open.end = now();
  await say('', 600);
  const duration = Math.ceil(now());
  await page.screenshot({ path: join(OUT, `demo-${role}.png`) }).catch(() => {});
  const video = page.video();
  await ctx.close();
  const src = await video.path();
  renameSync(src, join(OUT, `demo-${role}.webm`));
  remux(join(OUT, `demo-${role}.webm`));

  const ts = (s) => {
    const ms = Math.round(s * 1000);
    const hh = String(Math.floor(ms / 3600000)).padStart(2, '0');
    const mm = String(Math.floor((ms % 3600000) / 60000)).padStart(2, '0');
    const ss = String(Math.floor((ms % 60000) / 1000)).padStart(2, '0');
    return `${hh}:${mm}:${ss}.${String(ms % 1000).padStart(3, '0')}`;
  };
  const vtt = ['WEBVTT', ''].concat(cues.filter((c) => c.text).flatMap((c, i) => [String(i + 1), `${ts(c.start)} --> ${ts(c.end ?? c.start + 2)}`, c.text, ''])).join('\n');
  writeFileSync(join(OUT, `demo-${role}.vtt`), vtt);
  writeFileSync(join(OUT, `demo-${role}.json`), JSON.stringify({ role, duration, width: W, height: H, chapters, recorded_at: new Date().toISOString() }, null, 2));
  console.log(`demo-${role}: ${duration} detik, ${chapters.length} bab`);
}

// ---------------- Skenario ----------------
async function demoLogin(page, base, label) {
  await page.goto(base + '/#/masuk');
  await page.locator('.demo-btn', { hasText: label }).first().waitFor();
}

const scenarios = {
  async peserta({ page, say, click, type, wait, scroll, scrollTo, base }) {
    await demoLogin(page, base, 'Peserta baru');
    await say('Uji Jelajah: tiga siklus Dugaan, Uji, dan Tinjau dalam enam minggu.', 3200, 'Masuk');
    await say('Untuk demo, kita masuk sebagai peserta baru dengan akun simulasi.', 2400);
    await click(page.locator('.demo-btn', { hasText: 'Peserta baru' }));
    await page.waitForURL(/#\/beranda$/);
    await say('Beranda selalu menampilkan satu langkah berikutnya. Mulai dari ketentuan data.', 3200, 'Persetujuan data');
    await click(page.locator('.next a'));
    await page.waitForURL(/persetujuan/);
    await scrollTo(page.locator('#agree'));
    await say('Data baru diterima setelah peserta setuju. AI tidak mendiagnosis dan tidak memberi saran karier.', 3400);
    await click(page.locator('label.check'));
    await click(page.getByRole('button', { name: 'Setuju dan lanjut' }));
    await page.waitForURL(/instrumen\/pretes/);
    await say('Pretes: dua kuesioner singkat sebelum siklus pertama.', 2600, 'Pretes');
    const sets = page.locator('fieldset.likert');
    for (let i = 0; i < 12; i++) {
      await sets.nth(i).locator('label.choice').nth([3, 2, 3, 4, 2, 3, 3, 4, 3, 2, 3, 4][i]).click();
      await wait(i < 3 ? 350 : 90);
    }
    await click(page.getByRole('button', { name: 'Kirim pretes' }));
    await page.waitForURL(/#\/beranda$/);
    await scrollTo(page.locator('#cyc-h'));
    await say('Siklus 1 terbuka. Siklus 2 dan 3 terkunci sampai siklus sebelumnya selesai.', 3200, 'Rute tiga siklus');
    await scroll(0);
    await click(page.locator('.next a'));
    await page.waitForURL(/dugaan/);
    await say('Dugaan: Pendamping AI menanyakan lima pertanyaan baku.', 2800, 'Dugaan bersama Pendamping AI');
    const answers = [
      'Analis data di perusahaan logistik',
      'Membersihkan data pengiriman lalu membuat grafik untuk manajer',
      'Aku menduga akan menikmati mencari pola keterlambatan karena suka teka-teki angka',
      'Wawancara satu analis data selama satu jam',
      'Kalau aku ingin belajar SQL setelahnya, dugaanku benar',
    ];
    for (const [i, a] of answers.entries()) {
      await type(page.locator('.chat-form textarea'), a);
      await click(page.getByRole('button', { name: 'Kirim jawaban' }));
      await page.locator('.bubble.me').nth(i).waitFor();
      await wait(250);
    }
    await say('Pendamping AI menyusun draf dari kata-kata peserta sendiri.', 2400);
    await click(page.getByRole('button', { name: 'Susun draf dugaan' }));
    await page.getByText('Draf dari Pendamping AI').waitFor();
    await scrollTo(page.locator('textarea[name=statement]'));
    await say('Drafnya bisa disunting. Fasilitator nanti melihat versi AI dan versi peserta.', 3000);
    await type(page.locator('textarea[name=statement]'), ' Aku ingin melihat dasbornya langsung.');
    await click(page.getByRole('button', { name: 'Simpan dugaan' }));
    await page.waitForURL(/#\/uji\//);
    await say('Uji: rancang satu percobaan kecil, paling lama 6 jam.', 2600, 'Uji: percobaan dan waktu');
    await click(page.locator('label.choice', { hasText: 'Wawancara praktisi' }));
    await type(page.locator('input[name=title]'), 'Wawancara satu analis data');
    await page.locator('select[name=planned]').selectOption('60');
    await click(page.getByRole('button', { name: 'Simpan rencana' }));
    await page.getByRole('heading', { name: 'Catat waktu' }).waitFor();
    await scrollTo(page.getByRole('heading', { name: 'Catat waktu' }));
    await say('Waktu dicatat dengan penghitung atau manual. Totalnya dibatasi 6 jam.', 2800);
    await type(page.locator('input[name=minutes]'), '45');
    await click(page.getByRole('button', { name: 'Catat waktu' }));
    await wait(700);
    await scrollTo(page.locator('input.mono'));
    await say('Tautan ini dikirim ke mitra. Mitra cukup menekan satu tombol, tanpa akun.', 3200);
    await scrollTo(page.getByRole('button', { name: 'Selesaikan percobaan' }));
    await click(page.getByRole('button', { name: 'Selesaikan percobaan' }));
    await click(page.getByRole('button', { name: 'Ya, selesaikan dan lanjut ke Tinjau' }));
    await page.waitForURL(/#\/tinjau\//);
    await say('Tinjau: ceritakan apa yang terjadi, lalu nilai dugaanmu sendiri.', 2800, 'Tinjau: refleksi dan sesi');
    await type(page.locator('textarea[name=what]'), 'Aku mewawancarai analis data tentang dasbor pengiriman dan cara mereka bertanya ke tim.');
    await click(page.locator('label.choice', { hasText: 'Terbukti sebagian' }));
    await click(page.getByRole('button', { name: 'Kirim refleksi' }));
    await page.getByText('Ringkasan dari Pendamping AI').waitFor();
    await scrollTo(page.locator('textarea[name=summary]'));
    await say('Ringkasan AI bisa diperiksa dan diubah sebelum dibawa ke sesi.', 2800);
    await scrollTo(page.locator('.slots'));
    await say('Pilih jam sesi 30 menit dengan fasilitator sebaya.', 2400);
    await click(page.locator('.slots label.choice').first());
    await click(page.getByRole('button', { name: 'Jadwalkan sesi' }));
    await page.getByRole('heading', { name: 'Sesi Tinjau terjadwal' }).waitFor();
    await scrollTo(page.getByRole('heading', { name: 'Sesi Tinjau terjadwal' }));
    await say('Sesi bisa ditambahkan ke kalender. Keputusan terbuka setelah fasilitator menutup sesi.', 3400);

    // Fasilitator menutup sesi di latar (diperagakan di video fasilitator).
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

    await say('Setelah sesi selesai, peserta sendiri yang memutuskan.', 2400, 'Keputusan');
    await page.reload();
    await scrollTo(page.locator('label.choice', { hasText: 'Ubah dugaan' }));
    await click(page.locator('label.choice', { hasText: 'Ubah dugaan' }));
    await click(page.getByRole('button', { name: 'Simpan keputusan' }));
    await page.waitForURL(/#\/beranda$/);
    await scrollTo(page.locator('#cyc-h'));
    await say('Siklus 1 selesai, siklus 2 terbuka.', 2600);
    await click(page.locator('.nav-top a', { hasText: 'Perjalananku' }));
    await page.waitForURL(/perjalanan/);
    await say('Peta jelajah merekam setiap dugaan dan keputusan sebagai jalur.', 3400, 'Peta jelajah');
  },

  async fasilitator({ page, say, click, wait, scrollTo, base }) {
    await demoLogin(page, base, 'Fasilitator');
    await click(page.locator('.demo-btn', { hasText: 'Fasilitator' }));
    await page.waitForURL(/#\/kelompok$/);
    await say('Kelompokku: tahap setiap peserta, sesi mendatang, dan kendala terbuka.', 3200, 'Kelompokku');
    await scrollTo(page.locator('#tb-h'));
    await click(page.getByRole('button', { name: /Perlu perhatian/ }));
    await say('Saring peserta yang perlu perhatian: kendala terbuka atau tenggat lewat.', 3000);
    await click(page.getByRole('button', { name: /Sesi terjadwal/ }));
    await wait(800);
    await click(page.getByRole('link', { name: 'Fikri Ramadhan' }));
    await page.waitForURL(/#\/peserta\//);
    await say('Detail peserta. Setiap akses fasilitator tercatat di log.', 2800, 'Detail peserta');
    await scrollTo(page.locator('.compare').first());
    await say('Versi Pendamping AI dan versi peserta tampil berdampingan.', 3000);
    await scrollTo(page.locator('form.card'));
    await say('Sesi bisa ditambahkan ke kalender. Setelah sesi, tutup dengan catatan.', 3000, 'Menutup sesi');
    await page.locator('textarea[name=note]').pressSequentially('Fikri lebih menikmati menguji desain ke pengguna. Akan mencoba riset pengguna di siklus 3.', { delay: 12 });
    await click(page.locator('form.card input[type=checkbox]'));
    await click(page.getByRole('button', { name: 'Tandai sesi selesai' }));
    await page.getByText('Ringkasan diperiksa').first().waitFor();
    await say('Sesi tertutup. Peserta sekarang bisa mencatat keputusannya.', 2800);
    await scrollTo(page.locator('#iss-h'));
    await say('Kendala peserta ditandai selesai setelah ditangani.', 2400, 'Kendala');
    await click(page.getByRole('button', { name: 'Tandai selesai' }));
    await wait(1200);
  },

  async koordinator({ page, say, click, wait, scroll, scrollTo, base }) {
    await demoLogin(page, base, 'Koordinator');
    await click(page.locator('.demo-btn', { hasText: 'Koordinator' }));
    await page.waitForURL(/#\/ringkasan$/);
    await page.locator('.kpi').first().waitFor();
    await say('Koordinator hanya melihat angka gabungan, tanpa isi pribadi peserta.', 3200, 'Indikator K1 sampai K5');
    await scrollTo(page.locator('.kpi').nth(2));
    await say('Setiap indikator punya target. Garis tegak menandai targetnya.', 2800);
    await scroll(0);
    const sel = page.locator('select[name=cohort]');
    const running = await sel.locator('option', { hasText: 'berjalan' }).getAttribute('value');
    await sel.selectOption(running);
    await page.locator('.hidden-val').first().waitFor();
    await say('Kohort berjalan: angka dari kurang dari 10 orang disembunyikan.', 3200, 'k-anonimitas');
    await scrollTo(page.locator('#st-h'));
    await wait(1200);
    await click(page.locator('.nav-top a', { hasText: /Fasilitator/ }));
    await say('Peserta tanpa fasilitator ditugaskan otomatis ke beban paling ringan.', 3000, 'Penugasan fasilitator');
    await click(page.getByRole('button', { name: 'Tugaskan otomatis' }));
    await wait(1400);
    await click(page.locator('.nav-top a', { hasText: /Pendamping AI|AI/ }));
    await say('Mutu Pendamping AI: persentase lolos pemeriksa, cadangan, dan draf yang diubah peserta.', 3400, 'Mutu AI dan log akses');
    await click(page.locator('.nav-top a', { hasText: /Log/ }));
    await say('Log akses mencatat siapa membuka data apa, dengan kode peserta.', 3000);
  },
};

try {
  for (const [role, fn] of Object.entries(scenarios)) {
    if (only && only !== role) continue;
    await record(role, fn);
  }
} finally {
  await browser.close();
  server.close();
  try { rmSync(tmp, { recursive: true, force: true }); } catch { /* berkas WAL di Windows */ }
}
console.log('Berkas:', readdirSync(OUT).join(', '));
