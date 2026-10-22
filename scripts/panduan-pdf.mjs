// PDF panduan penggunaan: tangkapan layar diambil dari aplikasi asli (data simulasi), lalu dicetak ke
// docs/demo/Panduan-Penggunaan-Uji-Jelajah.pdf lewat Chromium.
// Jalankan: node scripts/panduan-pdf.mjs   (butuh Playwright; lihat scripts/pw.mjs)
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { loadPlaywright, launchBrowser } from './pw.mjs';

const OUT = resolve('docs/demo');
const OUT_FILE = join(OUT, 'Panduan-Penggunaan-Uji-Jelajah.pdf');
const VERSION = JSON.parse(readFileSync(resolve('package.json'), 'utf8')).version;
mkdirSync(OUT, { recursive: true });

const pw = loadPlaywright();
if (!pw) {
  console.error('Playwright tidak ditemukan. Pasang dengan: npm i -D playwright && npx playwright install chromium');
  process.exit(1);
}
const tmp = mkdtempSync(join(tmpdir(), 'uji-jelajah-pdf-'));
process.env.DB_PATH = join(tmp, 'demo.db');
const seed = spawnSync(process.execPath, ['server/seed.js'], { env: { ...process.env }, encoding: 'utf8' });
if (seed.status !== 0) throw new Error(seed.stderr);
const { createApp } = await import('../server/server.js');
const server = createApp();
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await launchBrowser(pw);

const img = {};
async function session() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'id-ID', timezoneId: 'Asia/Jakarta' });
  await ctx.addInitScript(() => document.addEventListener('DOMContentLoaded', () => document.head.append(Object.assign(document.createElement('style'), { textContent: '.toast{display:none!important}' }))));
  const page = await ctx.newPage();
  const shot = async (name, locator = null, block = 'center') => {
    if (locator) await locator.first().evaluate((e, b) => e.scrollIntoView({ block: b }), block);
    else await page.evaluate(() => window.scrollTo(0, 0));
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(350);
    img[name] = 'data:image/jpeg;base64,' + (await page.screenshot({ type: 'jpeg', quality: 82 })).toString('base64');
  };
  const masuk = async (label) => {
    await page.goto(base + '/#/masuk');
    await page.locator('.demo-btn', { hasText: label }).first().click();
  };
  return { ctx, page, shot, masuk };
}

// ---------- Peserta ----------
{
  const { ctx, page, shot, masuk } = await session();
  await page.goto(base + '/#/masuk');
  await page.locator('.demo-btn').first().waitFor();
  await shot('masuk');
  await shot('demo', page.locator('#demo-h'), 'start');
  await masuk('Peserta baru');
  await page.waitForURL(/#\/beranda$/);
  await shot('beranda');
  await page.locator('.next a').click();
  await page.waitForURL(/persetujuan/);
  await shot('persetujuan', page.locator('#agree'));
  await page.locator('label.check').click();
  await page.getByRole('button', { name: 'Setuju dan lanjut' }).click();
  await page.waitForURL(/instrumen\/pretes/);
  const sets = page.locator('fieldset.likert');
  for (let i = 0; i < 2; i++) await sets.nth(i).locator('label.choice').nth(3).click();
  await shot('pretes');
  for (let i = 2; i < 12; i++) await sets.nth(i).locator('label.choice').nth(3).click();
  await page.getByRole('button', { name: 'Kirim pretes' }).click();
  await page.waitForURL(/#\/beranda$/);
  await shot('rute', page.locator('#cyc-h'), 'start');
  await page.locator('.next a').click();
  await page.waitForURL(/dugaan/);
  const answers = ['Analis data di perusahaan logistik', 'Membersihkan data pengiriman lalu membuat grafik untuk manajer', 'Aku menduga akan menikmati mencari pola keterlambatan karena suka teka-teki angka', 'Wawancara satu analis data selama satu jam', 'Kalau aku ingin belajar SQL setelahnya, dugaanku benar'];
  for (const [i, a] of answers.entries()) {
    if (i === 2) await shot('dugaan-chat', page.locator('.chat-form textarea'));
    await page.locator('.chat-form textarea').fill(a);
    await page.getByRole('button', { name: 'Kirim jawaban' }).click();
    await page.locator('.bubble.me').nth(i).waitFor();
  }
  await page.getByRole('button', { name: 'Susun draf dugaan' }).click();
  await page.getByText('Draf dari Pendamping AI').waitFor();
  await shot('dugaan-draf', page.locator('textarea[name=statement]'));
  await page.getByRole('button', { name: 'Simpan dugaan' }).click();
  await page.waitForURL(/#\/uji\//);
  await page.locator('label.choice', { hasText: 'Wawancara praktisi' }).click();
  await page.locator('input[name=title]').fill('Wawancara satu analis data');
  await page.locator('select[name=planned]').selectOption('60');
  await shot('uji-rencana', page.locator('input[name=title]'));
  await page.getByRole('button', { name: 'Simpan rencana' }).click();
  await page.getByRole('heading', { name: 'Catat waktu' }).waitFor();
  await page.locator('input[name=minutes]').fill('45');
  await page.getByRole('button', { name: 'Catat waktu' }).click();
  await page.waitForTimeout(600);
  await shot('uji-waktu', page.getByRole('heading', { name: 'Catat waktu' }), 'start');
  await shot('uji-tautan', page.locator('input.mono'));
  var mitraLink = await page.locator('input.mono').inputValue();
  await page.getByRole('button', { name: 'Selesaikan percobaan' }).click();
  await page.getByRole('button', { name: 'Ya, selesaikan dan lanjut ke Tinjau' }).click();
  await page.waitForURL(/#\/tinjau\//);
  await page.locator('textarea[name=what]').fill('Aku mewawancarai analis data tentang dasbor pengiriman dan cara mereka bertanya ke tim.');
  await page.locator('label.choice', { hasText: 'Terbukti sebagian' }).click();
  await shot('tinjau-refleksi', page.locator('textarea[name=what]'));
  await page.getByRole('button', { name: 'Kirim refleksi' }).click();
  await page.getByText('Ringkasan dari Pendamping AI').waitFor();
  await shot('tinjau-ringkasan', page.locator('textarea[name=summary]'));
  await shot('tinjau-jadwal', page.locator('.slots'));
  await page.locator('.slots label.choice').first().click();
  await page.getByRole('button', { name: 'Jadwalkan sesi' }).click();
  await page.getByRole('heading', { name: 'Sesi Tinjau terjadwal' }).waitFor();
  await shot('tinjau-terjadwal', page.getByRole('heading', { name: 'Sesi Tinjau terjadwal' }));

  const fac = await browser.newContext();
  const fp = await fac.newPage();
  await fp.goto(base + '/#/masuk');
  await fp.evaluate(async () => {
    await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'fasilitator@demo.id', password: 'demo1234' }) });
    const g = await (await fetch('/api/fac/participants')).json();
    const raka = g.participants.find((p) => p.name === 'Raka Pratama');
    const d = await (await fetch(`/api/fac/participants/${raka.id}`)).json();
    await fetch(`/api/sessions/${d.cycles[0].session.id}/complete`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note: 'Raka menemukan analis data banyak berdiskusi dengan tim.', summary_checked: true }) });
  });
  await fac.close();

  await page.reload();
  await page.locator('label.choice', { hasText: 'Ubah dugaan' }).click();
  await shot('keputusan', page.locator('label.choice', { hasText: 'Ubah dugaan' }));
  await page.getByRole('button', { name: 'Simpan keputusan' }).click();
  await page.waitForURL(/#\/beranda$/);
  await shot('kendala', page.locator('#iss-h'), 'start');
  await page.locator('.nav-top a', { hasText: 'Perjalananku' }).click();
  await page.waitForURL(/perjalanan/);
  await shot('perjalanan');
  await page.locator('.nav-top a', { hasText: 'Pengaturan' }).click();
  await page.waitForURL(/pengaturan/);
  await shot('pengaturan', page.locator('#data-h'));
  await ctx.close();

  // ---------- Mitra ----------
  const m = await session();
  await m.page.goto(mitraLink);
  await m.page.getByRole('button', { name: 'Ya, percobaan ini sudah terjadi' }).waitFor();
  await m.shot('mitra');
  await m.page.getByRole('button', { name: 'Ya, percobaan ini sudah terjadi' }).click();
  await m.page.getByText('Terima kasih, sudah terkonfirmasi.').waitFor();
  await m.shot('mitra-selesai');
  await m.ctx.close();
}

// ---------- Fasilitator ----------
{
  const { ctx, page, shot, masuk } = await session();
  await masuk('Fasilitator');
  await page.waitForURL(/#\/kelompok$/);
  await page.waitForTimeout(400);
  await shot('kelompok');
  await shot('kelompok-tabel', page.locator('#tb-h'), 'start');
  await page.getByRole('link', { name: 'Fikri Ramadhan' }).first().click();
  await page.waitForURL(/#\/peserta\//);
  await shot('detail');
  await shot('detail-banding', page.locator('.compare'));
  await page.locator('textarea[name=note]').fill('Fikri lebih menikmati menguji desain ke pengguna. Akan mencoba riset pengguna di siklus 3.');
  await page.locator('form.card input[type=checkbox]').check();
  await shot('tutup-sesi', page.locator('form.card'));
  await shot('fas-kendala', page.locator('#iss-h'), 'start');
  await ctx.close();
}

// ---------- Koordinator ----------
{
  const { ctx, page, shot, masuk } = await session();
  await masuk('Koordinator');
  await page.waitForURL(/#\/ringkasan$/);
  await page.locator('.kpi').first().waitFor();
  await shot('ringkasan');
  const sel = page.locator('select[name=cohort]');
  await sel.selectOption(await sel.locator('option', { hasText: 'berjalan' }).getAttribute('value'));
  await page.locator('.hidden-val').first().waitFor();
  await shot('kanonim');
  await shot('csv', page.locator('#csv-h'));
  for (const [key, label, url] of [['koord-fas', /Fasilitator/, /fasilitator/], ['koord-mitra', 'Mitra', /mitra/], ['koord-ai', /Pendamping AI|AI/, /ai$/], ['koord-log', /Log/, /audit/]]) {
    await page.locator('.nav-top a', { hasText: label }).click();
    await page.waitForURL(url);
    await page.waitForTimeout(500);
    await shot(key);
  }
  await ctx.close();
}

// ---------- Dokumen ----------
const fig = (k, cap) => `<figure><img src="${img[k]}" alt=""><figcaption>${cap}</figcaption></figure>`;
const steps = (...xs) => `<ol class="steps">${xs.map((x) => `<li>${x}</li>`).join('')}</ol>`;
const b64 = (f) => readFileSync(resolve(f)).toString('base64');
const today = new Intl.DateTimeFormat('id-ID', { dateStyle: 'long', timeZone: 'Asia/Jakarta' }).format(new Date());

const html = `<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Panduan Penggunaan Uji Jelajah</title><style>
@font-face{font-family:Newsreader;src:url(data:font/woff2;base64,${b64('public/fonts/newsreader-latin.woff2')}) format('woff2')}
@font-face{font-family:Plex;src:url(data:font/woff2;base64,${b64('public/fonts/ibm-plex-sans-latin.woff2')}) format('woff2')}
@page{size:A4;margin:18mm 17mm 20mm}
*{box-sizing:border-box}
body{font-family:Plex,system-ui,sans-serif;font-size:10.5pt;line-height:1.55;color:#1d2233;margin:0}
h1,h2,h3{font-family:Newsreader,serif;font-weight:600;color:#151b45;line-height:1.2}
h1{font-size:26pt;margin:0 0 6mm}
h2{font-size:15pt;margin:8mm 0 2.5mm;break-after:avoid}
h3{font-size:12pt;margin:5mm 0 1.5mm;break-after:avoid}
p{margin:0 0 2.5mm}
.chapter{break-before:page}
.kicker{color:#a87900;font-weight:600;letter-spacing:.12em;text-transform:uppercase;font-size:9pt;margin-bottom:2mm}
.cover{height:257mm;display:flex;flex-direction:column;justify-content:center;align-items:flex-start;gap:4mm}
.cover img{width:34mm;height:34mm}
.cover h1{font-size:38pt;margin:0}
.cover .sub{font-size:14pt;color:#4a5170;max-width:150mm}
.cover .meta{margin-top:14mm;font-size:10pt;color:#4a5170;border-top:2px solid #f5b81c;padding-top:4mm}
figure{margin:3mm 0 5mm;break-inside:avoid}
figure img{width:100%;border:1px solid #d7dae6;border-radius:6px;display:block}
figcaption{font-size:9pt;color:#5b627e;margin-top:1.5mm}
ol.steps{margin:0 0 3mm;padding-left:6mm}
ol.steps li{margin-bottom:1.2mm}
table{border-collapse:collapse;width:100%;margin:2mm 0 5mm;font-size:9.5pt;break-inside:avoid}
th,td{border:1px solid #d7dae6;padding:2mm 2.5mm;text-align:left;vertical-align:top}
th{background:#151b45;color:#fff;font-weight:600}
tr:nth-child(even) td{background:#f5f6fb}
code,.mono{font-family:Consolas,monospace;font-size:9.5pt;background:#eef0f7;padding:0 1mm;border-radius:2px}
.box{border-left:4px solid #f5b81c;background:#fffaeb;padding:3mm 4mm;margin:3mm 0 5mm;break-inside:avoid}
.box.navy{border-color:#151b45;background:#eef0f7}
.toc{list-style:none;padding:0;font-size:11.5pt}
.toc li{padding:1.8mm 0;border-bottom:1px dotted #c3c7d6}
.toc b{display:inline-block;width:9mm;color:#a87900}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:4mm}
.grid figure{margin:0}
</style></head><body>

<section class="cover">
  <img src="data:image/png;base64,${b64('public/img/logo-192.png')}" alt="">
  <div class="kicker">Panduan penggunaan</div>
  <h1>Uji Jelajah</h1>
  <p class="sub">Cara memakai aplikasi untuk peserta, mitra, fasilitator sebaya, dan koordinator, lengkap dengan daftar akun demo.</p>
  <div class="meta">Versi aplikasi ${VERSION} · Disusun ${today}<br>Tangkapan layar diambil dari aplikasi asli dengan data simulasi.</div>
</section>

<section class="chapter">
  <h1>Daftar isi</h1>
  <ul class="toc">
    <li><b>1</b>Mengenal Uji Jelajah</li>
    <li><b>2</b>Membuka aplikasi dan masuk</li>
    <li><b>3</b>Akun demo</li>
    <li><b>4</b>Panduan peserta</li>
    <li><b>5</b>Panduan mitra</li>
    <li><b>6</b>Panduan fasilitator</li>
    <li><b>7</b>Panduan koordinator</li>
    <li><b>8</b>Pertanyaan umum dan pemecahan masalah</li>
  </ul>
  <div class="box navy"><b>Video demo bersuara.</b> Panduan ini punya pasangan video berjudul <span class="mono">demo-uji-jelajah.mp4</span> (di folder yang sama). Video memperagakan semua langkah di bawah dengan narasi Bahasa Indonesia.</div>

  <h2>1. Mengenal Uji Jelajah</h2>
  <p>Uji Jelajah adalah aplikasi web berbantuan AI untuk program enam minggu yang melatih mahasiswa mengambil keputusan karier. Caranya bukan dengan tes minat, tetapi dengan percobaan kecil yang benar-benar dijalani.</p>
  <p>Program terdiri atas <b>tiga siklus</b>. Setiap siklus punya tiga tahap:</p>
  <table>
    <tr><th style="width:22%">Tahap</th><th>Yang dilakukan peserta</th></tr>
    <tr><td><b>Dugaan</b></td><td>Menjawab lima pertanyaan Pendamping AI, lalu menyunting draf dugaan tentang satu pekerjaan.</td></tr>
    <tr><td><b>Uji</b></td><td>Menjalankan satu percobaan kecil (paling lama 6 jam), mencatat waktunya, dan meminta konfirmasi mitra.</td></tr>
    <tr><td><b>Tinjau</b></td><td>Menulis refleksi, mengikuti sesi 30 menit dengan fasilitator sebaya, lalu memutuskan nasib dugaannya.</td></tr>
  </table>
  <p>Ada empat peran pengguna:</p>
  <table>
    <tr><th style="width:22%">Peran</th><th>Siapa</th><th style="width:34%">Halaman utama</th></tr>
    <tr><td><b>Peserta</b></td><td>Mahasiswa S1 yang menjalani program, sering dari ponsel.</td><td>Beranda, Perjalananku, Pengaturan</td></tr>
    <tr><td><b>Mitra</b></td><td>Praktisi yang membantu percobaan. Tidak punya akun.</td><td>Satu halaman konfirmasi lewat tautan</td></tr>
    <tr><td><b>Fasilitator</b></td><td>Mahasiswa BK semester lanjut yang mendampingi sesi Tinjau.</td><td>Kelompokku, Detail peserta</td></tr>
    <tr><td><b>Koordinator</b></td><td>Dosen BK yang memantau program lewat angka gabungan.</td><td>Ringkasan, Fasilitator, Mitra, Pendamping AI, Log akses</td></tr>
  </table>
  <div class="box">Pendamping AI hanya bertanya dan merangkum. Ia tidak mendiagnosis dan tidak memberi saran karier. Keputusan tetap di tangan peserta.</div>
</section>

<section class="chapter">
  <h2>2. Membuka aplikasi dan masuk</h2>
  <h3>Menjalankan di komputer sendiri</h3>
  <p>Butuh Node.js 22.13 atau lebih baru. Dari folder proyek, jalankan:</p>
  ${steps('<span class="mono">npm run seed</span> untuk mengisi data simulasi (95 akun, dua kohort). Hentikan server lebih dulu bila sedang berjalan.', '<span class="mono">npm start</span> untuk menyalakan server.', 'Buka <span class="mono">http://localhost:3000</span> di peramban.')}
  <p>Aplikasi juga bisa dipasang ke layar utama ponsel (aplikasi web terpasang) lewat menu peramban <i>Tambahkan ke layar utama</i>.</p>
  <h3>Masuk</h3>
  ${steps('Buka halaman Masuk.', 'Isi surel dan kata sandi, lalu tekan <b>Masuk</b>.', 'Atau tekan salah satu tombol akun demo di bawah formulir untuk langsung masuk.')}
  <p>Setelah masuk, aplikasi membuka halaman awal sesuai peran: peserta ke <b>Beranda</b>, fasilitator ke <b>Kelompokku</b>, koordinator ke <b>Ringkasan</b>. Tautan <i>Panduan cara pakai</i> di halaman Masuk berisi video per peran dan bisa dibuka tanpa akun.</p>
  ${fig('masuk', 'Gambar 2.1. Halaman Masuk.')}
</section>

<section class="chapter">
  <h2>3. Akun demo</h2>
  <p>Semua akun demo memakai kata sandi yang sama:</p>
  <div class="box" style="font-size:13pt">Kata sandi: <b class="mono" style="font-size:13pt">demo1234</b></div>
  <table>
    <tr><th style="width:30%">Surel</th><th style="width:16%">Peran</th><th>Keadaan awal</th></tr>
    <tr><td class="mono">raka@demo.id</td><td>Peserta</td><td>Raka Pratama. Peserta baru, belum memberi persetujuan data. Cocok untuk mencoba alur dari awal.</td></tr>
    <tr><td class="mono">dinda@demo.id</td><td>Peserta</td><td>Dinda Maharani. Siklus 1 tahap Uji, 45 dari 120 menit tercatat.</td></tr>
    <tr><td class="mono">fikri@demo.id</td><td>Peserta</td><td>Fikri Ramadhan. Siklus 2 tahap Tinjau, sesi terjadwal, satu kendala terbuka.</td></tr>
    <tr><td class="mono">fasilitator@demo.id</td><td>Fasilitator</td><td>Nadia Putri. Satu kelompok berisi 20 peserta, termasuk Raka, Dinda, dan Fikri.</td></tr>
    <tr><td class="mono">fasilitator2@demo.id</td><td>Fasilitator</td><td>Bima Saputra.</td></tr>
    <tr><td class="mono">fasilitator3@demo.id</td><td>Fasilitator</td><td>Citra Anjani.</td></tr>
    <tr><td class="mono">fasilitator4@demo.id</td><td>Fasilitator</td><td>Dimas Prasetyo.</td></tr>
    <tr><td class="mono">fasilitator5@demo.id</td><td>Fasilitator</td><td>Eka Rahmawati.</td></tr>
    <tr><td class="mono">koordinator@demo.id</td><td>Koordinator</td><td>Dr. Sari Wulandari, M.Pd. Dasbor agregat dua kohort.</td></tr>
  </table>
  <p>Selain akun di atas, data simulasi berisi peserta lain dengan pola surel <span class="mono">pesertaNN@demo.id</span> (misalnya <span class="mono">peserta01@demo.id</span>) dan kata sandi yang sama.</p>
  <div class="box navy"><b>Catatan.</b> Semua nama, mitra, dan angka adalah data simulasi. Perubahan yang kamu buat saat mencoba akan tersimpan. Untuk mengembalikan data ke keadaan awal, hentikan server lalu jalankan <span class="mono">npm run seed</span>. Daftar akun demo di halaman Masuk bisa disembunyikan dengan variabel lingkungan <span class="mono">DEMO_MODE=0</span>.</div>
  ${fig('demo', 'Gambar 3.1. Tombol akun demo di halaman Masuk. Satu tekan langsung masuk.')}
</section>

<section class="chapter">
  <div class="kicker">Akun contoh: raka@demo.id</div>
  <h2>4. Panduan peserta</h2>
  <h3>4.1 Beranda</h3>
  <p>Beranda selalu menampilkan <b>satu langkah berikutnya</b> di bagian atas. Ikuti tombol itu dan kamu tidak akan tersesat. Di bawahnya ada rute enam minggu dan kotak kendala.</p>
  ${fig('beranda', 'Gambar 4.1. Beranda peserta baru. Langkah berikutnya: persetujuan data.')}
  <h3>4.2 Persetujuan data</h3>
  ${steps('Tekan tombol langkah berikutnya di Beranda.', 'Baca ketentuan: data apa yang dikumpulkan, siapa yang bisa melihatnya, dan batas peran Pendamping AI.', 'Centang kotak persetujuan, lalu tekan <b>Setuju dan lanjut</b>.')}
  ${fig('persetujuan', 'Gambar 4.2. Persetujuan data. Data baru disimpan setelah kamu setuju.')}
  <h3>4.3 Pretes</h3>
  <p>Pretes berisi dua kuesioner singkat, 12 butir, sekitar lima menit. Pilih jawaban yang paling sesuai untuk setiap pernyataan, lalu tekan <b>Kirim pretes</b>. Kuesioner yang sama diisi lagi sebagai postes setelah tiga siklus selesai, supaya perubahanmu terlihat.</p>
  ${fig('pretes', 'Gambar 4.3. Pretes.')}
  <h3>4.4 Rute tiga siklus</h3>
  <p>Setelah pretes, siklus 1 terbuka. Siklus 2 dan 3 terkunci sampai siklus sebelumnya selesai.</p>
  ${fig('rute', 'Gambar 4.4. Rute enam minggu di Beranda.')}

  <h3>4.5 Tahap Dugaan</h3>
  ${steps('Buka siklus yang aktif. Pendamping AI menanyakan lima pertanyaan: pekerjaan yang ingin diuji, kegiatan sehari-harinya, dugaanmu, cara mengujinya, dan tanda bahwa dugaanmu benar.', 'Ketik jawaban dengan kata-katamu sendiri, lalu tekan <b>Kirim jawaban</b>.', 'Setelah lima jawaban, tekan <b>Susun draf dugaan</b>.', 'Sunting draf sampai sesuai maksudmu, lalu tekan <b>Simpan dugaan</b>.')}
  <div class="grid">${fig('dugaan-chat', 'Gambar 4.5. Tanya jawab dengan Pendamping AI.')}${fig('dugaan-draf', 'Gambar 4.6. Draf dugaan yang bisa disunting.')}</div>
  <p>Nomor ponsel, surel, dan NPM yang tidak sengaja kamu tulis disamarkan otomatis sebelum diproses AI. Fasilitator melihat versi AI dan versi suntinganmu berdampingan.</p>

  <h3>4.6 Tahap Uji</h3>
  ${steps('Pilih jenis percobaan, misalnya <i>Wawancara praktisi</i>.', 'Beri judul dan pilih perkiraan durasi, lalu tekan <b>Simpan rencana</b>.', 'Saat menjalankan percobaan, catat waktumu dengan penghitung waktu atau isi manual dalam menit, lalu tekan <b>Catat waktu</b>. Total waktu dibatasi 6 jam.', 'Salin tautan konfirmasi dan kirim ke mitra percobaanmu (opsional, lihat bab 5).', 'Setelah selesai, tekan <b>Selesaikan percobaan</b>, lalu <b>Ya, selesaikan dan lanjut ke Tinjau</b>.')}
  ${fig('uji-rencana', 'Gambar 4.7. Merancang percobaan.')}
  <div class="grid">${fig('uji-waktu', 'Gambar 4.8. Mencatat waktu.')}${fig('uji-tautan', 'Gambar 4.9. Tautan konfirmasi untuk mitra.')}</div>

  <h3>4.7 Tahap Tinjau</h3>
  ${steps('Ceritakan apa yang terjadi selama percobaan.', 'Nilai dugaanmu: <i>Terbukti</i>, <i>Terbukti sebagian</i>, atau <i>Tidak terbukti</i>. Tekan <b>Kirim refleksi</b>.', 'Periksa ringkasan dari Pendamping AI. Ubah bila ada yang kurang tepat, karena ringkasan ini dibawa ke sesi.', 'Pilih jam sesi 30 menit dengan fasilitator, lalu tekan <b>Jadwalkan sesi</b>. Sesi bisa ditambahkan ke kalendermu.')}
  <div class="grid">${fig('tinjau-refleksi', 'Gambar 4.10. Menulis refleksi.')}${fig('tinjau-ringkasan', 'Gambar 4.11. Ringkasan dari Pendamping AI.')}</div>
  <div class="grid">${fig('tinjau-jadwal', 'Gambar 4.12. Memilih jadwal sesi.')}${fig('tinjau-terjadwal', 'Gambar 4.13. Sesi terjadwal.')}</div>

  <h3>4.8 Keputusan</h3>
  <p>Setelah fasilitator menutup sesi, pilih keputusanmu lalu tekan <b>Simpan keputusan</b>:</p>
  <table>
    <tr><th style="width:28%">Pilihan</th><th>Artinya</th></tr>
    <tr><td>Lanjutkan dugaan</td><td>Uji lebih dalam bidang yang sama di siklus berikutnya.</td></tr>
    <tr><td>Ubah dugaan</td><td>Geser ke bagian atau bidang yang ternyata lebih menarik.</td></tr>
    <tr><td>Tinggalkan dugaan</td><td>Sudah cukup tahu; coba bidang lain.</td></tr>
  </table>
  ${fig('keputusan', 'Gambar 4.14. Memilih keputusan di akhir siklus.')}
  <p>Siklus berikutnya terbuka dan dijalani dengan cara yang sama. Setelah tiga siklus, isi postes dari Beranda.</p>

  <h3>4.9 Melaporkan kendala</h3>
  <p>Jadwal bentrok, mitra membatalkan, atau bingung langkah berikutnya? Tulis di kotak <b>Ada kendala?</b> di Beranda. Fasilitatormu akan membacanya dan menandainya selesai setelah ditangani.</p>
  ${fig('kendala', 'Gambar 4.15. Kotak kendala di Beranda.')}

  <h3>4.10 Perjalananku dan Pengaturan</h3>
  <p><b>Perjalananku</b> menampilkan peta jelajah: setiap dugaan, percobaan, dan keputusan tergambar sebagai satu jalur, beserta skor pretes dan postes. <b>Pengaturan</b> berisi data akunmu, tombol <b>Unduh dataku</b> (satu berkas JSON), dan <b>Hapus akun</b>.</p>
  ${fig('perjalanan', 'Gambar 4.16. Peta jelajah di Perjalananku.')}
  ${fig('pengaturan', 'Gambar 4.17. Pengaturan: unduh data dan hapus akun.')}
</section>

<section class="chapter">
  <h2>5. Panduan mitra</h2>
  <p>Mitra adalah orang yang membantu percobaan peserta, misalnya praktisi yang diwawancarai. Mitra <b>tidak perlu akun</b>.</p>
  ${steps('Peserta mengirim tautan konfirmasi (lewat pesan atau surel). Tautan berlaku 30 hari.', 'Buka tautannya. Halaman menampilkan nama depan peserta, judul percobaan, jenis, dan durasi rencana.', 'Jika percobaan memang sudah terjadi, tekan <b>Ya, percobaan ini sudah terjadi</b>. Selesai. Tidak ada nama atau kontak yang diminta.')}
  <div class="grid">${fig('mitra', 'Gambar 5.1. Halaman konfirmasi mitra.')}${fig('mitra-selesai', 'Gambar 5.2. Konfirmasi berhasil.')}</div>
  <p>Jika tautan sudah lewat 30 hari, halaman menampilkan pesan <i>Tautan sudah kedaluwarsa</i> dan mitra tidak perlu melakukan apa pun.</p>
</section>

<section class="chapter">
  <div class="kicker">Akun contoh: fasilitator@demo.id</div>
  <h2>6. Panduan fasilitator</h2>
  <h3>6.1 Kelompokku</h3>
  <p>Halaman awal fasilitator. Isinya tahap setiap peserta, sesi mendatang, dan kendala yang masih terbuka. Gunakan saringan <b>Perlu perhatian</b> (kendala terbuka atau tenggat lewat) dan <b>Sesi terjadwal</b> untuk menemukan peserta dengan cepat.</p>
  ${fig('kelompok', 'Gambar 6.1. Kelompokku.')}
  ${fig('kelompok-tabel', 'Gambar 6.2. Daftar semua peserta dengan saringan.')}
  <h3>6.2 Detail peserta</h3>
  <p>Tekan nama peserta untuk membuka detailnya: dugaan, percobaan, refleksi, dan riwayat siklus. Versi Pendamping AI dan versi peserta tampil berdampingan. Setiap kali fasilitator membuka data peserta, aksesnya tercatat di log.</p>
  ${fig('detail', 'Gambar 6.3. Detail peserta.')}
  ${fig('detail-banding', 'Gambar 6.4. Versi AI dan versi peserta berdampingan.')}
  <h3>6.3 Menutup sesi</h3>
  ${steps('Tambahkan sesi ke kalendermu lewat tombol kalender.', 'Setelah sesi 30 menit selesai, tulis catatan singkat.', 'Centang <b>ringkasan diperiksa</b>, lalu tekan <b>Tandai sesi selesai</b>.', 'Peserta kini bisa mencatat keputusannya.')}
  ${fig('tutup-sesi', 'Gambar 6.5. Formulir menutup sesi.')}
  <h3>6.4 Kendala</h3>
  <p>Di bagian <b>Kendala terbuka</b> pada detail peserta, tekan <b>Tandai selesai</b> setelah kendala ditangani.</p>
  ${fig('fas-kendala', 'Gambar 6.6. Kendala peserta.')}
</section>

<section class="chapter">
  <div class="kicker">Akun contoh: koordinator@demo.id</div>
  <h2>7. Panduan koordinator</h2>
  <h3>7.1 Ringkasan program</h3>
  <p>Ringkasan berisi lima indikator, <b>K1 sampai K5</b>, beserta sebaran tahap peserta. Setiap indikator punya target; garis tegak pada batang menandai targetnya. Koordinator hanya melihat angka gabungan, tanpa isi pribadi peserta.</p>
  ${fig('ringkasan', 'Gambar 7.1. Ringkasan program.')}
  <h3>7.2 Memilih kohort dan k-anonimitas</h3>
  <p>Pilih kohort di bagian atas. Untuk melindungi privasi, angka yang berasal dari kurang dari 10 orang disembunyikan.</p>
  ${fig('kanonim', 'Gambar 7.2. Kohort berjalan: sebagian angka disembunyikan.')}
  <h3>7.3 Data anonim untuk analisis</h3>
  <p>Di bagian bawah Ringkasan, unduh CSV anonim untuk analisis lanjutan. Peserta hanya muncul sebagai kode.</p>
  ${fig('csv', 'Gambar 7.3. Unduh data anonim.')}
  <h3>7.4 Fasilitator</h3>
  <p>Menampilkan beban tiap fasilitator. Tekan <b>Tugaskan otomatis</b> untuk membagikan peserta yang belum punya fasilitator ke fasilitator dengan beban paling ringan.</p>
  ${fig('koord-fas', 'Gambar 7.4. Penugasan fasilitator.')}
  <h3>7.5 Mitra</h3>
  <p>Bank mitra yang bisa dihubungi peserta. Koordinator bisa menambah, mengaktifkan, atau menonaktifkan mitra.</p>
  ${fig('koord-mitra', 'Gambar 7.5. Bank mitra.')}
  <h3>7.6 Pendamping AI</h3>
  <p>Memantau mutu Pendamping AI: persentase keluaran yang lolos pemeriksa, yang memakai cadangan, dan draf yang diubah peserta, beserta alasan penolakan pemeriksa.</p>
  ${fig('koord-ai', 'Gambar 7.6. Mutu Pendamping AI.')}
  <h3>7.7 Log akses</h3>
  <p>Mencatat siapa membuka data apa dan kapan. Peserta ditampilkan dengan kode, bukan nama.</p>
  ${fig('koord-log', 'Gambar 7.7. Log akses.')}
</section>

<section class="chapter">
  <h2>8. Pertanyaan umum dan pemecahan masalah</h2>
  <table>
    <tr><th style="width:36%">Masalah</th><th>Yang bisa dilakukan</th></tr>
    <tr><td>Tombol akun demo tidak muncul di halaman Masuk.</td><td>Server dijalankan dengan <span class="mono">DEMO_MODE=0</span>. Jalankan tanpa variabel itu, atau ketik surel dan kata sandi <span class="mono">demo1234</span> secara manual.</td></tr>
    <tr><td>Data demo sudah berubah karena dicoba berkali-kali.</td><td>Hentikan server, jalankan <span class="mono">npm run seed</span>, lalu <span class="mono">npm start</span> lagi. Di Windows, berkas basis data terkunci selama server berjalan.</td></tr>
    <tr><td>Siklus 2 atau 3 terkunci.</td><td>Selesaikan siklus sebelumnya sampai tahap keputusan. Keputusan baru bisa dipilih setelah fasilitator menutup sesi.</td></tr>
    <tr><td>Pilihan keputusan belum muncul.</td><td>Sesi Tinjau belum ditutup fasilitator. Hubungi fasilitatormu atau laporkan lewat kotak kendala.</td></tr>
    <tr><td>Tidak bisa mencatat waktu lagi.</td><td>Total waktu percobaan dibatasi 6 jam (360 menit) per siklus.</td></tr>
    <tr><td>Mitra melihat <i>Tautan sudah kedaluwarsa</i>.</td><td>Tautan berlaku 30 hari. Konfirmasi mitra bersifat opsional.</td></tr>
    <tr><td>Koordinator melihat tanda angka disembunyikan.</td><td>Angkanya berasal dari kurang dari 10 orang. Ini disengaja untuk melindungi privasi peserta.</td></tr>
    <tr><td>Terlalu banyak percobaan masuk yang gagal.</td><td>Aplikasi membatasi laju percobaan masuk. Tunggu beberapa menit, lalu coba lagi.</td></tr>
  </table>
  <div class="box navy"><b>Catatan jujur.</b> Uji Jelajah masih prototipe. Semua akun, nama, mitra, dan angka di dasbor adalah data simulasi; angka itu menunjukkan perhitungannya berjalan, bukan bukti dampak. Butir kuesioner adalah contoh, dan Pendamping AI bawaan adalah simulasi deterministik.</div>
</section>
</body></html>`;

const pctx = await browser.newContext();
const pdfPage = await pctx.newPage();
await pdfPage.setContent(html, { waitUntil: 'load' });
await pdfPage.evaluate(() => document.fonts.ready);
await pdfPage.pdf({
  path: OUT_FILE,
  format: 'A4',
  printBackground: true,
  displayHeaderFooter: true,
  headerTemplate: '<span></span>',
  footerTemplate: '<div style="width:100%;font:8pt sans-serif;color:#7a809a;padding:0 17mm;display:flex;justify-content:space-between"><span>Panduan Penggunaan Uji Jelajah</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>',
  margin: { top: '18mm', bottom: '20mm', left: '17mm', right: '17mm' },
});
await browser.close();
server.close();
try { rmSync(tmp, { recursive: true, force: true }); } catch { /* berkas WAL di Windows */ }
console.log('Selesai:', OUT_FILE);
