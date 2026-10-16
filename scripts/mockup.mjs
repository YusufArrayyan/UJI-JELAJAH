// Pembuat mockup ponsel untuk esai: memotret layar asli aplikasi (data simulasi) di ukuran ponsel,
// lalu memasangnya ke bingkai HP. Hasil: docs/mockup/*.png
// Jalankan: npm run mockup   (butuh Playwright; lihat scripts/pw.mjs)
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { loadPlaywright, launchBrowser } from './pw.mjs';

const OUT = resolve('docs/mockup');
const W = 390;
const H = 844;
const pw = loadPlaywright();
if (!pw) {
  console.error('Playwright tidak ditemukan. Pasang dengan: npm i -D playwright && npx playwright install chromium');
  process.exit(1);
}

const tmp = mkdtempSync(join(tmpdir(), 'uji-jelajah-mockup-'));
process.env.DB_PATH = join(tmp, 'mockup.db');
const seed = spawnSync(process.execPath, ['server/seed.js'], { env: { ...process.env }, encoding: 'utf8' });
if (seed.status !== 0) throw new Error(seed.stderr);
const { createApp } = await import('../server/server.js');
const server = createApp();
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await launchBrowser(pw);
mkdirSync(OUT, { recursive: true });

const phoneCtx = () => browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: 'id-ID', timezoneId: 'Asia/Jakarta' });
async function api(page, path, body, method = 'POST') {
  return page.evaluate(async ([p, b, m]) => {
    const r = await fetch(p, { method: m, headers: b ? { 'Content-Type': 'application/json' } : {}, body: b ? JSON.stringify(b) : undefined });
    return r.json();
  }, [path, body, method]);
}
async function login(page, email) {
  await page.goto(base + '/#/masuk');
  await api(page, '/api/auth/login', { email, password: 'demo1234' });
}
/** Muat penuh (bukan hanya ganti hash) supaya aplikasi membaca sesi yang baru dibuat. */
const open = (page, hash) => page.goto(`${base}/?t=${Date.now()}${hash}`);
const settle = (page) => page.waitForTimeout(1400); // tunggu animasi meter dan cincin selesai
// Sembunyikan scrollbar lewat CSSOM (diizinkan CSP aplikasi; gaya inline tidak).
const hideScrollbar = (page) => page.evaluate(() => { document.documentElement.style.scrollbarWidth = 'none'; });
async function scrollToEl(page, selector, ratio) {
  await page.evaluate(([s, r]) => {
    const el = document.querySelector(s);
    if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - window.innerHeight * r);
  }, [selector, ratio]);
  await page.waitForTimeout(500);
}

const shots = [];
async function shoot(name, title, caption, prepare) {
  const ctx = await phoneCtx();
  const page = await ctx.newPage();
  await prepare(page);
  await hideScrollbar(page);
  await settle(page);
  const file = join(tmp, `${name}.png`);
  await page.screenshot({ path: file });
  shots.push({ name, title, caption, data: readFileSync(file).toString('base64') });
  await ctx.close();
}

// 1. Beranda peserta
await shoot('1-beranda', 'Beranda peserta', 'Satu langkah berikutnya, minggu ke berapa, dan menit percobaan yang sudah tercatat.', async (page) => {
  await login(page, 'dinda@demo.id');
  await open(page, '/#/beranda');
  await page.locator('.hero').waitFor();
});

// 2. Dugaan bersama Pendamping AI
await shoot('2-dugaan-ai', 'Dugaan bersama Pendamping AI', 'Lima pertanyaan baku; draf AI disusun dari kata-kata peserta dan bisa disunting.', async (page) => {
  await login(page, 'raka@demo.id');
  await api(page, '/api/my/consent', { agree: true });
  await api(page, '/api/my/responses', { instrument: 'adaptabilitas', phase: 'pretes', answers: [3, 4, 3, 4, 3, 3, 4, 3] });
  await api(page, '/api/my/responses', { instrument: 'efikasi', phase: 'pretes', answers: [3, 3, 4, 3] });
  const st = await api(page, '/api/my/state', undefined, 'GET');
  const id = st.cycles[0].id;
  for (const a of [
    'Analis data di perusahaan logistik',
    'Membersihkan data pengiriman lalu membuat grafik untuk manajer',
    'Aku menduga akan menikmati mencari pola keterlambatan karena suka teka-teki angka',
    'Wawancara satu analis data selama satu jam',
    'Kalau aku ingin belajar SQL setelahnya, dugaanku benar',
  ]) await api(page, `/api/cycles/${id}/chat`, { answer: a });
  await api(page, `/api/cycles/${id}/draft`, {});
  await open(page, `/#/dugaan/${id}`);
  await page.locator('#draft-h').waitFor();
  await scrollToEl(page, '#draft-h', 0.42);
});

// 3. Peta jelajah
await shoot('3-peta-jelajah', 'Peta jelajah', 'Setiap dugaan jadi titik, setiap keputusan jadi jalur: lanjut, ubah arah, atau pindah bidang.', async (page) => {
  await login(page, 'fikri@demo.id');
  await open(page, '/#/perjalanan');
  await page.locator('.map').waitFor();
  await scrollToEl(page, '.map-card', 0.04);
});

// 4. Ringkasan koordinator
await shoot('4-koordinator', 'Ringkasan koordinator', 'Indikator K1–K5 dalam angka gabungan; data dari kurang dari 10 orang disembunyikan.', async (page) => {
  await login(page, 'koordinator@demo.id');
  await open(page, '/#/ringkasan');
  await page.locator('.kpi').first().waitFor();
  await scrollToEl(page, '.kpis', 0.12);
});

// ---------- Bingkai HP ----------
const css = `
@font-face { font-family: 'Newsreader'; src: url('${base}/fonts/newsreader-latin.woff2') format('woff2'); font-weight: 400 700; }
@font-face { font-family: 'IBM Plex Sans'; src: url('${base}/fonts/ibm-plex-sans-latin.woff2') format('woff2'); font-weight: 400 600; }
* { box-sizing: border-box; margin: 0; }
body { background: transparent; font-family: 'IBM Plex Sans', sans-serif; }
.phone { width: 430px; padding: 14px; border-radius: 64px; background: #0f1330; box-shadow: inset 0 0 0 2px #2a3157, 0 30px 60px -20px rgba(15, 19, 48, 0.45); position: relative; }
.phone::before { content: ''; position: absolute; right: -4px; top: 180px; width: 4px; height: 90px; border-radius: 0 3px 3px 0; background: #1b2147; }
.screen { width: 402px; border-radius: 50px; overflow: hidden; background: #eceff6; position: relative; }
.status { height: 50px; display: flex; align-items: center; justify-content: space-between; padding: 0 34px 0 40px; font: 600 16px/1 'IBM Plex Sans', sans-serif; color: #151b45; background: #eceff6; }
.island { position: absolute; top: 12px; left: 50%; transform: translateX(-50%); width: 120px; height: 34px; border-radius: 20px; background: #050714; }
.icons { display: flex; gap: 6px; align-items: center; }
.bars { display: flex; gap: 2px; align-items: flex-end; height: 12px; }
.bars i { width: 3px; background: #151b45; border-radius: 1px; }
.batt { width: 25px; height: 12px; border: 1.5px solid #151b45; border-radius: 4px; padding: 1.5px; }
.batt i { display: block; width: 75%; height: 100%; background: #151b45; border-radius: 1.5px; }
.shot { display: block; width: 402px; height: ${Math.round((402 / W) * H)}px; object-fit: cover; object-position: top; }
.home { position: absolute; bottom: 10px; left: 50%; transform: translateX(-50%); width: 140px; height: 5px; border-radius: 3px; background: #151b45; opacity: 0.85; }
.board { background: #eceff6; padding: 72px 64px 64px; display: grid; gap: 48px; width: max-content; }
.board h1 { font: 600 44px/1.1 'Newsreader', serif; color: #151b45; letter-spacing: -0.01em; }
.board .sub { font-size: 18px; color: #4b5170; margin-top: 10px; }
.row { display: flex; gap: 44px; align-items: flex-start; }
.item { display: grid; gap: 22px; width: 430px; }
.cap b { display: block; font: 600 22px/1.25 'Newsreader', serif; color: #151b45; }
.cap span { display: block; font-size: 15.5px; line-height: 1.45; color: #4b5170; margin-top: 6px; }
.cap em { font-style: normal; display: inline-block; font: 600 13px/1 'IBM Plex Sans'; color: #1f2552; background: #fbe7a1; padding: 5px 10px; border-radius: 999px; margin-bottom: 10px; }
.foot { font-size: 14px; color: #5a6080; }
`;
const phone = (s) => `
  <div class="phone"><div class="screen">
    <div class="status"><span>9:41</span><div class="island"></div><div class="icons"><div class="bars"><i style="height:4px"></i><i style="height:6px"></i><i style="height:9px"></i><i style="height:12px"></i></div><div class="batt"><i></i></div></div></div>
    <img class="shot" src="data:image/png;base64,${s.data}" alt="">
    <div class="home"></div>
  </div></div>`;

// Halaman komposisi mockup (bukan aplikasi): lewati CSP supaya blok <style> komposisi bisa dipakai.
const ctx = await browser.newContext({ deviceScaleFactor: 2, viewport: { width: 2200, height: 1400 }, bypassCSP: true });
const page = await ctx.newPage();
await page.goto(base + '/manifest.webmanifest'); // asal yang sama supaya font dari server bisa dimuat

// Satu per satu, latar transparan (untuk disusun sendiri di esai).
for (const s of shots) {
  await page.setContent(`<!doctype html><html><head><style>${css}</style></head><body><div id="m" style="padding:30px;display:inline-block">${phone(s)}</div></body></html>`);
  await page.evaluate(() => document.fonts.ready);
  await page.locator('#m').screenshot({ path: join(OUT, `layar-${s.name}.png`), omitBackground: true });
}

// Papan berisi empat layar dengan keterangan.
await page.setContent(`<!doctype html><html><head><style>${css}</style></head><body>
  <div class="board" id="board">
    <div><h1>Uji Jelajah: coba dulu, baru putuskan</h1><p class="sub">Empat layar dari prototipe berfungsi. Semua data simulasi.</p></div>
    <div class="row">${shots.map((s, i) => `<div class="item">${phone(s)}<div class="cap"><em>Layar ${i + 1}</em><b>${s.title}</b><span>${s.caption}</span></div></div>`).join('')}</div>
    <p class="foot">Tangkapan layar asli pada lebar ponsel 390 px. Pendamping AI memakai penyedia simulasi.</p>
  </div></body></html>`);
await page.evaluate(() => document.fonts.ready);
await page.locator('#board').screenshot({ path: join(OUT, 'mockup-4-layar.png') });

await ctx.close();
await browser.close();
server.close();
try { rmSync(tmp, { recursive: true, force: true }); } catch { /* berkas WAL di Windows */ }
console.log('Mockup tersimpan di docs/mockup:', shots.map((s) => `layar-${s.name}.png`).join(', '), '+ mockup-4-layar.png');
