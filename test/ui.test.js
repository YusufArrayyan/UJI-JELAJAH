// Uji antarmuka ujung ke ujung di Chromium (Playwright): 20 pemeriksaan sesuai PRD bagian 14.
// Proyek tetap tanpa dependensi: playwright-core dicari di proyek, PLAYWRIGHT_CORE_PATH, atau instalasi global.
// Bila tidak ditemukan, seluruh uji dilewati dengan pesan.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join, dirname } from 'node:path';

const require = createRequire(import.meta.url);
function loadPlaywright() {
  const candidates = [process.env.PLAYWRIGHT_CORE_PATH, 'playwright', 'playwright-core'];
  // Folder paket global npm: <prefix>/node_modules (Windows) atau <prefix>/lib/node_modules (Unix).
  const prefix = dirname(process.execPath);
  for (const root of [join(prefix, 'node_modules'), join(prefix, '..', 'lib', 'node_modules')]) {
    candidates.push(join(root, 'playwright'), join(root, 'playwright-core'), join(root, '@playwright', 'cli', 'node_modules', 'playwright-core'), join(root, '@playwright', 'cli', 'node_modules', 'playwright'));
  }
  for (const c of candidates.filter(Boolean)) {
    try {
      if (c.includes('/') || c.includes('\\')) { if (!existsSync(c)) continue; }
      const m = require(c);
      if (m.chromium) return m;
    } catch { /* coba berikutnya */ }
  }
  return null;
}
const pw = loadPlaywright();
const skip = pw ? false : 'Playwright tidak ditemukan. Pasang dengan: npm i -D playwright && npx playwright install chromium';

const dir = mkdtempSync(join(tmpdir(), 'uji-jelajah-ui-'));
process.env.DB_PATH = join(dir, 'ui.db');
let server, base, browser;
const unexpected = []; // galat konsol dan respons 4xx/5xx yang tidak disengaja
const expected4xx = new Set();

before(async () => {
  if (skip) return;
  const seed = spawnSync(process.execPath, ['server/seed.js'], { env: { ...process.env }, encoding: 'utf8' });
  assert.equal(seed.status, 0, seed.stderr);
  const { createApp } = await import('../server/server.js');
  server = createApp();
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  base = `http://127.0.0.1:${server.address().port}`;
  browser = await launchBrowser();
});

/** Chromium bawaan Playwright; bila revisinya belum terunduh, pakai Chrome/Edge sistem atau Chromium lama yang ada. */
async function launchBrowser() {
  const tries = [{}, { channel: 'chrome' }, { channel: 'msedge' }];
  const cache = process.env.PLAYWRIGHT_BROWSERS_PATH || (process.platform === 'win32' ? join(process.env.LOCALAPPDATA || '', 'ms-playwright') : join(homedir(), process.platform === 'darwin' ? 'Library/Caches/ms-playwright' : '.cache/ms-playwright'));
  try {
    for (const d of readdirSync(cache).filter((n) => /^chromium-\d+$/.test(n)).sort().reverse()) {
      for (const exe of ['chrome-win/chrome.exe', 'chrome-win64/chrome.exe', 'chrome-linux/chrome', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium']) {
        if (existsSync(join(cache, d, exe))) tries.push({ executablePath: join(cache, d, exe) });
      }
    }
  } catch { /* tidak ada cache peramban */ }
  let last;
  for (const opt of tries) {
    try { return await pw.chromium.launch({ headless: true, ...opt }); } catch (err) { last = err; }
  }
  throw last;
}
after(async () => {
  await browser?.close();
  server?.close();
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* berkas WAL di Windows */ }
});

async function newPage(opts = {}) {
  const ctx = await browser.newContext({ acceptDownloads: true, locale: 'id-ID', timezoneId: 'Asia/Jakarta', ...opts });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error' && !/status of 4\d\d/.test(m.text())) unexpected.push(`konsol: ${m.text()}`); });
  page.on('pageerror', (e) => unexpected.push(`skrip: ${e.message}`));
  page.on('response', (r) => {
    const u = new URL(r.url());
    if (r.status() >= 400 && !expected4xx.has(`${r.status()} ${u.pathname}`)) unexpected.push(`${r.status()} ${r.request().method()} ${u.pathname}`);
  });
  return page;
}
async function demoLogin(page, label) {
  await page.goto(base + '/#/masuk');
  await page.locator('.demo-btn', { hasText: label }).click();
}
const choice = (scope, text) => scope.locator('label.choice', { hasText: text }).first();

test('uji antarmuka Uji Jelajah', { skip }, async (t) => {
  const raka = await newPage();
  let confirmLink;

  await t.test('01 Masuk: label data simulasi dan akun demo tampil', async () => {
    await raka.goto(base + '/');
    await raka.waitForURL(/#\/masuk$/);
    await assert.doesNotReject(raka.getByText('Prototipe · data simulasi').waitFor());
    assert.equal(await raka.locator('.demo-btn').count(), 5);
    assert.ok(await raka.locator('img[alt=""][src*="logo"]').count() >= 1);
  });

  await t.test('02 Peserta baru melihat satu langkah berikutnya: persetujuan', async () => {
    await raka.locator('.demo-btn', { hasText: 'Peserta baru' }).click();
    await raka.waitForURL(/#\/beranda$/);
    assert.equal(await raka.locator('.next h2').innerText(), 'Baca ketentuan data dulu');
    assert.equal(await raka.locator('.sim-badge').first().innerText(), 'DATA SIMULASI');
  });

  await t.test('03 Persetujuan: tombol aktif hanya setelah kotak dicentang (BR1)', async () => {
    await raka.locator('.next a').click();
    const btn = raka.getByRole('button', { name: 'Setuju dan lanjut' });
    assert.equal(await btn.isDisabled(), true);
    await raka.locator('#agree').check();
    assert.equal(await btn.isDisabled(), false);
    await btn.click();
    await raka.waitForURL(/#\/instrumen\/pretes$/);
  });

  await t.test('04 Pretes: butir kosong ditolak dan fokus pindah ke butir itu', async () => {
    const sets = raka.locator('fieldset.likert');
    await sets.first().waitFor();
    assert.equal(await sets.count(), 12);
    for (let i = 0; i < 12; i++) if (i !== 5) await sets.nth(i).locator('label.choice').nth(3).click();
    await raka.getByRole('button', { name: 'Kirim pretes' }).click();
    await assert.doesNotReject(raka.getByText('Butir 6 adaptabilitas karier belum dijawab').waitFor());
    assert.equal(await raka.evaluate(() => document.activeElement?.name), 'adaptabilitas-5');
  });

  await t.test('05 Pretes lengkap membuka siklus 1; siklus 2 dan 3 terkunci (BR2)', async () => {
    await raka.locator('fieldset.likert').nth(5).locator('label.choice').nth(2).click();
    await raka.getByRole('button', { name: 'Kirim pretes' }).click();
    await raka.waitForURL(/#\/beranda$/);
    assert.equal(await raka.locator('.next h2').innerText(), 'Siklus 1: tulis dugaanmu');
    assert.equal(await raka.locator('.cycle.locked').count(), 2);
  });

  await t.test('06 Dugaan: lima pertanyaan berurutan, data pribadi tersamar', async () => {
    await raka.locator('.next a').click();
    await raka.waitForURL(/#\/dugaan\/\d+$/);
    const answers = [
      'Analis data di perusahaan logistik',
      'Menurutku membersihkan data pengiriman dan membuat grafik untuk manajer',
      'Aku menduga akan menikmati mencari pola keterlambatan. Hubungi aku di 081234567890',
      'Wawancara satu analis data selama satu jam',
      'Kalau aku ingin belajar SQL setelahnya, dugaanku benar',
    ];
    for (const [i, a] of answers.entries()) {
      await raka.locator('.chat-form textarea').fill(a);
      await raka.getByRole('button', { name: 'Kirim jawaban' }).click();
      await raka.locator('.bubble.me').nth(i).waitFor();
    }
    assert.equal(await raka.locator('.steps i.on').count(), 5);
    const third = await raka.locator('.bubble.me').nth(2).innerText();
    assert.match(third, /\[nomor disamarkan\]/);
    assert.doesNotMatch(third, /081234567890/);
  });

  await t.test('07 Draf AI berlabel, bisa disunting, lalu disimpan', async () => {
    await raka.getByRole('button', { name: 'Susun draf dugaan' }).click();
    await raka.getByText('Draf dari Pendamping AI').waitFor();
    const st = raka.locator('textarea[name=statement]');
    assert.match(await st.inputValue(), /^Aku penasaran dengan analis data/);
    await st.fill((await st.inputValue()) + ' Aku ingin melihat dasbornya langsung.');
    await raka.getByRole('button', { name: 'Simpan dugaan' }).click();
    await raka.waitForURL(/#\/uji\/\d+$/);
  });

  await t.test('08 Uji: rencana tersimpan; tombol selesai nonaktif sebelum 15 menit (BR5)', async () => {
    await choice(raka, 'Wawancara praktisi').click();
    await raka.locator('input[name=title]').fill('Wawancara satu analis data');
    await raka.locator('select[name=planned]').selectOption('60');
    await raka.getByRole('button', { name: 'Simpan rencana' }).click();
    await raka.getByRole('heading', { name: 'Catat waktu' }).waitFor();
    assert.equal(await raka.getByRole('button', { name: 'Selesaikan percobaan' }).isDisabled(), true);
    confirmLink = await raka.locator('input.mono').inputValue();
    assert.match(confirmLink, /#\/konfirmasi\/[a-f0-9]{32}$/);
  });

  await t.test('09 Uji: catat manual melebihi 6 jam ditolak dengan pesan perbaikan (BR4)', async () => {
    await raka.locator('input[name=minutes]').fill('400');
    await raka.getByRole('button', { name: 'Catat waktu' }).click();
    await raka.getByText(/Sisa waktumu 360 menit/).waitFor();
    await raka.locator('input[name=minutes]').fill('30');
    await raka.getByRole('button', { name: 'Catat waktu' }).click();
    await raka.getByText('30 menit tercatat').waitFor();
  });

  await t.test('10 Mitra mengonfirmasi lewat tautan tanpa akun (BR13)', async () => {
    const partner = await newPage();
    await partner.goto(confirmLink.replace(/^https?:\/\/[^/]+/, base));
    await partner.getByRole('heading', { name: 'Konfirmasi satu percobaan' }).waitFor();
    assert.equal(await partner.locator('input').count(), 0, 'mitra tidak diminta mengisi nama atau kontak');
    await partner.getByRole('button', { name: /Ya, percobaan ini sudah terjadi/ }).click();
    await partner.getByRole('heading', { name: /Terima kasih/ }).waitFor();
    await partner.context().close();
    await raka.reload();
    await raka.getByText(/Dikonfirmasi/).first().waitFor();
  });

  await t.test('11 Selesaikan percobaan dengan konfirmasi dua langkah', async () => {
    const fin = raka.getByRole('button', { name: 'Selesaikan percobaan' });
    await fin.click();
    await raka.getByRole('button', { name: 'Ya, selesaikan dan lanjut ke Tinjau' }).click();
    await raka.waitForURL(/#\/tinjau\/\d+$/);
  });

  await t.test('12 Tinjau: refleksi pendek ditolak; ringkasan AI dapat disunting (BR6)', async () => {
    await raka.locator('textarea[name=what]').fill('Terlalu pendek');
    await raka.getByRole('button', { name: 'Kirim refleksi' }).click();
    await raka.getByText('Ceritamu masih terlalu pendek').waitFor();
    await raka.locator('textarea[name=what]').fill('Aku mewawancarai analis data selama satu jam tentang dasbor pengiriman.');
    await choice(raka, 'Terbukti sebagian').click();
    await raka.getByRole('button', { name: 'Kirim refleksi' }).click();
    await raka.getByText('Ringkasan dari Pendamping AI').waitFor();
    const sum = raka.locator('textarea[name=summary]');
    await sum.fill((await sum.inputValue()) + ' Sudah kuperiksa.');
    await raka.getByRole('button', { name: 'Simpan ringkasan' }).click();
    await raka.getByText('Ringkasanmu sudah tersimpan.').waitFor();
  });

  await t.test('13 Pilih jam sesi; keputusan belum terbuka sebelum sesi ditutup (BR7, BR9)', async () => {
    const slots = raka.locator('input[name=slot]');
    assert.ok((await slots.count()) > 0);
    await raka.locator('.slots label.choice').first().click();
    await raka.getByRole('button', { name: 'Jadwalkan sesi' }).click();
    await raka.getByRole('heading', { name: 'Sesi Tinjau terjadwal' }).waitFor();
    assert.equal(await raka.locator('input[name=decision]').count(), 0);
    await raka.getByText('Pilihan keputusan terbuka setelah fasilitatormu menutup sesi.').waitFor();
  });

  const nadia = await newPage();
  await t.test('14 Fasilitator: versi AI dan versi peserta berdampingan', async () => {
    await demoLogin(nadia, 'Fasilitator');
    await nadia.waitForURL(/#\/kelompok$/);
    await nadia.getByRole('link', { name: 'Raka Pratama' }).first().click();
    await nadia.waitForURL(/#\/peserta\/\d+$/);
    await nadia.getByText('Versi Pendamping AI').waitFor();
    assert.ok((await nadia.locator('.compare').count()) >= 2, 'dugaan dan ringkasan tampil berdampingan');
    await nadia.getByText('Versi peserta (disunting)').first().waitFor();
  });

  await t.test('15 Fasilitator menutup sesi dengan catatan dan centang (BR8)', async () => {
    await nadia.getByRole('button', { name: 'Tandai sesi selesai' }).click();
    await nadia.getByText('Catatan sesi minimal 10 karakter.').waitFor();
    await nadia.locator('textarea[name=note]').fill('Raka menemukan bahwa analis data banyak berdiskusi dengan tim.');
    await nadia.locator('form.card input[type=checkbox]').check();
    await nadia.getByRole('button', { name: 'Tandai sesi selesai' }).click();
    await nadia.getByText('Ringkasan diperiksa').waitFor();
  });

  await t.test('16 Peserta memutuskan; siklus 2 terbuka', async () => {
    await raka.reload();
    await choice(raka, 'Ubah dugaan').click();
    await raka.getByRole('button', { name: 'Simpan keputusan' }).click();
    await raka.waitForURL(/#\/beranda$/);
    assert.equal(await raka.locator('.next h2').innerText(), 'Siklus 2: tulis dugaanmu');
    assert.equal(await raka.locator('.cycle.locked').count(), 1);
  });

  await t.test('17 Batas akses: fasilitator tidak bisa membuka layar dan API koordinator (BR12)', async () => {
    await nadia.goto(base + '/#/ringkasan');
    await nadia.waitForURL(/#\/kelompok/);
    expected4xx.add('403 /api/coord/summary');
    const status = await nadia.evaluate(() => fetch('/api/coord/summary').then((r) => r.status));
    assert.equal(status, 403);
    await nadia.goto(base + '/#/kelompok?saring=sesi');
    await nadia.getByRole('button', { name: /Sesi terjadwal/ }).waitFor();
    assert.equal(await nadia.getByRole('button', { name: /Sesi terjadwal/ }).getAttribute('aria-pressed'), 'true');
  });

  await t.test('18 Koordinator: K1–K4, sel di bawah 10 disembunyikan, CSV tanpa nama atau email', async () => {
    const sari = await newPage();
    await demoLogin(sari, 'Koordinator');
    await sari.waitForURL(/#\/ringkasan$/);
    await sari.locator('.kpi').first().waitFor();
    assert.equal(await sari.locator('.kpi').count(), 4);
    await sari.getByText('Catatan jujur').waitFor();
    const sel = sari.locator('select[name=cohort]');
    const running = await sel.locator('option', { hasText: 'berjalan' }).getAttribute('value');
    await sel.selectOption(running);
    await sari.waitForURL(new RegExp(`kohort=${running}`));
    await sari.locator('.hidden-val').first().waitFor();
    assert.ok((await sari.locator('.hidden-val').count()) >= 3);
    const [dl] = await Promise.all([sari.waitForEvent('download'), sari.getByRole('button', { name: 'Unduh CSV anonim' }).click()]);
    const csv = readFileSync(await dl.path(), 'utf8');
    assert.match(csv, /kode_peserta/);
    assert.doesNotMatch(csv, /@demo\.id|Raka|Pratama/);
    await sari.context().close();
  });

  await t.test('19 Ponsel 390 px: tanpa gulir horizontal, menu bawah, sasaran sentuh ≥ 44 px (NFR-05, NFR-06)', async () => {
    const phone = await newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await demoLogin(phone, 'Peserta di tahap Uji');
    await phone.waitForURL(/#\/beranda$/);
    for (const route of ['/#/beranda', '/#/uji/' + (await phone.locator('.next a').getAttribute('href')).split('/').pop(), '/#/perjalanan', '/#/pengaturan']) {
      await phone.goto(base + route);
      await phone.locator('h1').waitFor();
      const overflow = await phone.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.ok(overflow <= 0, `${route} bergulir horizontal ${overflow}px`);
    }
    assert.equal(await phone.locator('.bottomnav').isVisible(), true);
    const small = await phone.evaluate(() =>
      [...document.querySelectorAll('.bottomnav a, .btn:not(.small), .input, .select, .textarea')]
        .filter((e) => e.offsetParent)
        .filter((e) => e.getBoundingClientRect().height < 44)
        .map((e) => e.textContent.trim() || e.name),
    );
    assert.deepEqual(small, []);
    await phone.context().close();
  });

  await t.test('20 Tanpa galat konsol atau status 4xx/5xx tak terduga', async () => {
    assert.deepEqual(unexpected, []);
  });
});
