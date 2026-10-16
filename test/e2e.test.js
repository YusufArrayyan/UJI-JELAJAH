// Uji ujung ke ujung tingkat API: jalur penuh peserta, fasilitator, mitra, koordinator,
// aturan bisnis, dan batas akses lintas peran. Memakai basis data sementara hasil seed.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'uji-jelajah-'));
process.env.DB_PATH = join(dir, 'e2e.db');
process.env.TRUST_PROXY = '1'; // tiap Client meniru IP berbeda lewat X-Forwarded-For
let server;
let base;

before(async () => {
  const seed = spawnSync(process.execPath, ['server/seed.js'], { env: { ...process.env }, encoding: 'utf8' });
  assert.equal(seed.status, 0, seed.stderr);
  const { createApp } = await import('../server/server.js');
  server = createApp();
  await new Promise((ok) => server.listen(0, ok));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => {
  server?.close();
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* berkas WAL di Windows */ }
});

class Client {
  constructor(ip = '10.0.0.1') { this.cookie = ''; this.ip = ip; }
  async req(method, path, body) {
    const res = await fetch(base + path, {
      method,
      headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(this.cookie ? { cookie: this.cookie } : {}), 'x-forwarded-for': this.ip },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.get('set-cookie');
    if (set) this.cookie = set.split(';')[0];
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* bukan JSON */ }
    return { status: res.status, json, text, headers: res.headers };
  }
  get(p) { return this.req('GET', p); }
  post(p, b = {}) { return this.req('POST', p, b); }
  async login(email) {
    const r = await this.post('/api/auth/login', { email, password: 'demo1234' });
    assert.equal(r.status, 200, r.text);
    return this;
  }
}
const ok = (r) => assert.equal(r.status, 200, `${r.status} ${r.text}`);
const fails = (r, status, re) => {
  assert.equal(r.status, status, r.text);
  if (re) assert.match(r.json.error, re);
};

test('header keamanan dan akses tanpa sesi', async () => {
  const c = new Client();
  const page = await c.get('/');
  assert.match(page.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal(page.headers.get('x-frame-options'), 'DENY');
  assert.equal(page.headers.get('x-content-type-options'), 'nosniff');
  fails(await c.get('/api/my/state'), 401);
  const login = await c.post('/api/auth/login', { email: 'raka@demo.id', password: 'salah' });
  fails(login, 401, /belum cocok/);
});

test('jalur penuh peserta: persetujuan sampai keputusan, dengan fasilitator dan mitra', async () => {
  const raka = await new Client('10.0.0.2').login('raka@demo.id');
  const cookie = (await raka.post('/api/auth/login', { email: 'raka@demo.id', password: 'demo1234' })).headers.get('set-cookie');
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);

  // BR1: tidak ada data sebelum persetujuan
  fails(await raka.post('/api/my/responses', { instrument: 'efikasi', phase: 'pretes', answers: [3, 3, 3, 3] }), 400, /persetujuan/);
  fails(await raka.post('/api/my/issues', { text: 'Halo fasilitator' }), 400, /persetujuan/);
  ok(await raka.post('/api/my/consent', { agree: true }));

  // Pretes dua skala; BR3 jawaban tidak dapat diubah
  ok(await raka.post('/api/my/responses', { instrument: 'adaptabilitas', phase: 'pretes', answers: [3, 3, 3, 3, 3, 3, 3, 3] }));
  fails(await raka.post('/api/my/responses', { instrument: 'adaptabilitas', phase: 'pretes', answers: [5, 5, 5, 5, 5, 5, 5, 5] }), 400, /tidak dapat diubah/);
  fails(await raka.post('/api/my/responses', { instrument: 'efikasi', phase: 'pretes', answers: [3, 3] }), 400, /wajib dijawab/);
  ok(await raka.post('/api/my/responses', { instrument: 'efikasi', phase: 'pretes', answers: [3, 3, 2, 3] }));

  let st = (await raka.get('/api/my/state')).json;
  assert.equal(st.enrollment.status, 'aktif');
  assert.equal(st.cycles.length, 3);
  const [c1, c2] = st.cycles;

  // BR2: siklus 2 terkunci
  fails(await raka.post(`/api/cycles/${c2.id}/chat`), 400, /terkunci/);

  // Dugaan: lima pertanyaan, jawaban tersamar
  let chat = (await raka.post(`/api/cycles/${c1.id}/chat`)).json;
  assert.equal(chat.answered, 0);
  fails(await raka.post(`/api/cycles/${c1.id}/draft`), 400, /kelima pertanyaan/);
  const answers = ['Analis data', 'membersihkan data dan membuat grafik', 'Aku suka pola angka, NPM-ku 2210631170045', 'wawancara satu analis data', 'kalau aku ingin belajar SQL berarti benar'];
  for (const a of answers) chat = (await raka.post(`/api/cycles/${c1.id}/chat`, { answer: a })).json;
  assert.equal(chat.done, true);
  assert.ok(chat.messages.some((m) => m.text.includes('[NPM disamarkan]')));
  assert.ok(!chat.messages.some((m) => m.text.includes('2210631170045')));
  const draft = (await raka.post(`/api/cycles/${c1.id}/draft`)).json;
  assert.equal(draft.provider, 'mock');
  ok(await raka.post(`/api/cycles/${c1.id}/hypothesis`, { statement: draft.draft.statement + ' Aku ubah sedikit.', reason: draft.draft.reason, signal: draft.draft.signal }));

  // Uji: BR4 batas 6 jam, BR5 minimal 15 menit
  fails(await raka.post(`/api/cycles/${c1.id}/experiment`, { type: 'wawancara', title: 'Wawancara analis data', planned_minutes: 400 }), 400, /15 menit dan 6 jam/);
  ok(await raka.post(`/api/cycles/${c1.id}/experiment`, { type: 'wawancara', title: 'Wawancara analis data', planned_minutes: 60, partner_id: 1 }));
  st = (await raka.get('/api/my/state')).json;
  const x = st.cycles[0].experiment;
  fails(await raka.post(`/api/experiments/${x.id}/log`, { minutes: 400 }), 400, /360 menit/);
  fails(await raka.post(`/api/experiments/${x.id}/finish`), 400, /minimal 15 menit/);
  ok(await raka.post(`/api/experiments/${x.id}/log`, { minutes: 50 }));
  ok(await raka.post(`/api/experiments/${x.id}/start`));
  fails(await raka.post(`/api/experiments/${x.id}/finish`), 400, /Hentikan/);
  ok(await raka.post(`/api/experiments/${x.id}/stop`));

  // BR13: mitra mengonfirmasi tanpa akun
  const partner = new Client('10.0.0.9');
  const view = await partner.get(`/api/confirm/${x.confirm_token}`);
  ok(view);
  assert.equal(view.json.participant, 'Raka');
  assert.equal(view.json.email, undefined);
  ok(await partner.post(`/api/confirm/${x.confirm_token}`));
  fails(await partner.get('/api/confirm/' + 'f'.repeat(32)), 404);

  ok(await raka.post(`/api/experiments/${x.id}/finish`));

  // Tinjau: BR6 refleksi, BR7 sesi, BR9 keputusan setelah sesi
  fails(await raka.post(`/api/cycles/${c1.id}/session`, { slot_at: 'x' }), 400, /refleksi/);
  fails(await raka.post(`/api/cycles/${c1.id}/reflection`, { what_happened: 'pendek', verdict: 'sebagian' }), 400, /20 karakter/);
  const refl = (await raka.post(`/api/cycles/${c1.id}/reflection`, { what_happened: 'Aku mewawancarai analis data selama satu jam tentang pekerjaannya.', surprise: 'Banyak rapat dengan tim.', verdict: 'sebagian' })).json;
  assert.ok(refl.ai_summary.length > 10);
  ok(await raka.post(`/api/cycles/${c1.id}/summary`, { text: refl.ai_summary + ' Sudah kuperiksa.' }));
  const slots = (await raka.get('/api/slots')).json.slots;
  assert.ok(slots.length > 0);
  assert.match(slots[0], /T(09:00|13:00|15:30):00\+07:00$/);
  ok(await raka.post(`/api/cycles/${c1.id}/session`, { slot_at: slots[0] }));
  fails(await raka.post(`/api/cycles/${c1.id}/session`, { slot_at: slots[1] }), 400, /sudah terjadwal/);
  assert.ok(!(await raka.get('/api/slots')).json.slots.includes(slots[0]), 'slot terpakai tidak muncul lagi');
  fails(await raka.post(`/api/cycles/${c1.id}/decision`, { decision: 'lanjut' }), 400, /setelah fasilitator menutup/);

  // Fasilitator menutup sesi; akses dicatat
  const nadia = await new Client('10.0.0.3').login('fasilitator@demo.id');
  const group = (await nadia.get('/api/fac/participants')).json;
  const me = group.participants.find((p) => p.name === 'Raka Pratama');
  assert.ok(me);
  const detail = (await nadia.get(`/api/fac/participants/${me.id}`)).json;
  const ses = detail.cycles[0].session;
  assert.equal(detail.cycles[0].reflection.ai_summary, refl.ai_summary);
  fails(await nadia.post(`/api/sessions/${ses.id}/complete`, { note: 'oke' }), 400, /10 karakter/);
  ok(await nadia.post(`/api/sessions/${ses.id}/complete`, { note: 'Raka menemukan bahwa analis data banyak berkomunikasi.', summary_checked: true }));

  fails(await raka.post(`/api/cycles/${c1.id}/decision`, { decision: 'kabur' }), 400);
  ok(await raka.post(`/api/cycles/${c1.id}/decision`, { decision: 'ubah', note: 'Mau coba bagian visualisasi.' }));
  st = (await raka.get('/api/my/state')).json;
  assert.equal(st.cycles[0].stage, 'selesai');
  assert.equal(st.cycles[1].locked, false);
  assert.match(st.next.title, /Siklus 2/);

  // Kendala: data pribadi disamarkan, fasilitator menandai selesai
  const iss = (await raka.post('/api/my/issues', { text: 'Tolong hubungi aku di 0812 3456 7890' })).json;
  assert.match(iss.text, /\[nomor disamarkan\]/);
  const issues = (await nadia.get('/api/fac/participants')).json.issues;
  const mine = issues.find((i) => i.name === 'Raka Pratama');
  ok(await nadia.post(`/api/issues/${mine.id}/resolve`));

  // Hak peserta: unduh lalu hapus akun
  const exp = await raka.get('/api/my/export');
  ok(exp);
  assert.match(exp.headers.get('content-disposition'), /attachment/);
  assert.equal(JSON.parse(exp.text).siklus.length, 3);
  fails(await raka.req('DELETE', '/api/my/account', { confirm: 'hapus' }), 400, /HAPUS/);
  ok(await raka.req('DELETE', '/api/my/account', { confirm: 'HAPUS' }));
  fails(await new Client('10.0.0.2').post('/api/auth/login', { email: 'raka@demo.id', password: 'demo1234' }), 401);
});

test('batas akses lintas peran dan kelompok (BR12)', async () => {
  const dinda = await new Client('10.0.0.4').login('dinda@demo.id');
  const nadia = await new Client('10.0.0.5').login('fasilitator@demo.id');
  const bima = await new Client('10.0.0.6').login('fasilitator2@demo.id');
  const sari = await new Client('10.0.0.7').login('koordinator@demo.id');

  fails(await dinda.get('/api/coord/summary'), 403);
  fails(await dinda.get('/api/fac/participants'), 403);
  fails(await nadia.get('/api/coord/summary'), 403);
  fails(await sari.get('/api/fac/participants'), 403);
  fails(await sari.get('/api/my/state'), 403);

  const dindaRow = (await nadia.get('/api/fac/participants')).json.participants.find((p) => p.name === 'Dinda Maharani');
  ok(await nadia.get(`/api/fac/participants/${dindaRow.id}`));
  fails(await bima.get(`/api/fac/participants/${dindaRow.id}`), 403, /bukan anggota kelompokmu/);
  fails(await sari.get(`/api/fac/participants/${dindaRow.id}`), 403);

  const audit = (await sari.get('/api/coord/audit')).json.events;
  assert.ok(audit.some((e) => e.action === 'lihat_detail_peserta' && e.actor_label.startsWith('Nadia')));
});

test('koordinator: indikator, k-anonimitas, penugasan, mitra, mutu AI, CSV anonim', async () => {
  const sari = await new Client('10.0.0.8').login('koordinator@demo.id');
  const all = (await sari.get('/api/coord/summary')).json;
  assert.equal(all.kpis.k1.hidden, false);
  assert.ok(all.kpis.k1.value >= 70);
  const running = all.cohorts.find((c) => c.name.includes('berjalan'));
  const sum2 = (await sari.get(`/api/coord/summary?cohort=${running.id}`)).json;
  assert.equal(sum2.kpis.k1.hidden, true, 'K1 kohort berjalan disembunyikan (penyebut < 10)');
  assert.ok(sum2.stages.some((s) => s.n === null), 'sel sebaran tahap < 10 disembunyikan');

  const fac = (await sari.get('/api/coord/facilitators')).json;
  assert.ok(fac.unassigned > 0);
  const assigned = (await sari.post('/api/coord/facilitators/assign-auto')).json;
  assert.ok(assigned.assigned > 0);
  assert.equal((await sari.get('/api/coord/facilitators')).json.unassigned, 0);

  ok(await sari.post('/api/coord/partners', { name: 'Klinik Gizi Sehat', field: 'Gizi klinis', offer: 'Wawancara 45 menit' }));
  const partners = (await sari.get('/api/coord/partners')).json.partners;
  const p = partners.find((x) => x.name === 'Klinik Gizi Sehat');
  ok(await sari.post(`/api/coord/partners/${p.id}/toggle`));
  const dinda = await new Client('10.0.0.4').login('dinda@demo.id');
  assert.ok(!(await dinda.get('/api/coord/partners')).json.partners.some((x) => x.id === p.id), 'mitra nonaktif tidak bisa dipilih');

  const ai = (await sari.get('/api/coord/ai')).json;
  assert.ok(ai.all.runs > 0);
  assert.equal(ai.prompt_version, 'v1.0');

  const csv = await sari.get('/api/coord/export.csv');
  ok(csv);
  assert.match(csv.text, /kode_peserta/);
  assert.doesNotMatch(csv.text, /@demo\.id/);
  assert.doesNotMatch(csv.text, /Dinda|Maharani/);
  assert.ok((await sari.get('/api/coord/audit')).json.events.some((e) => e.action === 'ekspor_csv'));
});

test('pembatasan 8 percobaan masuk per 5 menit', async () => {
  const c = new Client('10.0.0.99');
  for (let i = 0; i < 8; i++) fails(await c.post('/api/auth/login', { email: 'x@demo.id', password: 'salah' }), 401);
  fails(await c.post('/api/auth/login', { email: 'x@demo.id', password: 'salah' }), 429, /Terlalu banyak/);
  // Satu lab kampus berbagi IP: masuk yang berhasil tidak menghabiskan jatah 8 percobaan.
  const lab = ['fasilitator2', 'fasilitator3', 'fasilitator4', 'fasilitator5', 'koordinator', 'dinda', 'fasilitator', 'fikri', 'fasilitator2', 'fasilitator3'];
  for (const name of lab) ok(await new Client('10.0.0.77').post('/api/auth/login', { email: `${name}@demo.id`, password: 'demo1234' }));
});

test('isi permintaan lebih dari 100 KB ditolak', async () => {
  const c = new Client('10.0.0.50');
  const r = await c.post('/api/auth/login', { email: 'a'.repeat(120 * 1024), password: 'x' });
  assert.equal(r.status, 413);
});

test('alur akhir program: siklus 3, postes, selesai, tindak lanjut (BR10)', async () => {
  const { openDb } = await import('../server/db.js');
  const db = openDb(process.env.DB_PATH);
  const e = db.prepare("SELECT e.id, e.facilitator_id FROM enrollments e JOIN users u ON u.id = e.user_id WHERE u.email = 'fikri@demo.id'").get();
  const cycles = db.prepare('SELECT id, n FROM cycles WHERE enrollment_id = ? ORDER BY n').all(e.id);
  // Siapkan: siklus 1-2 selesai, siklus 3 di Tinjau dengan sesi yang sudah ditutup fasilitator.
  db.prepare("UPDATE cycles SET stage = 'selesai', completed_at = datetime('now') WHERE enrollment_id = ? AND n < 3").run(e.id);
  db.prepare("UPDATE reflections SET decision = 'lanjut' WHERE cycle_id IN (SELECT id FROM cycles WHERE enrollment_id = ? AND n < 3)").run(e.id);
  const c3 = cycles[2].id;
  db.prepare("UPDATE cycles SET stage = 'tinjau' WHERE id = ?").run(c3);
  db.prepare("INSERT INTO hypotheses (cycle_id, ai_draft, statement, saved_at) VALUES (?, '{}', 'Aku menduga aku suka desain layar aplikasi.', datetime('now'))").run(c3);
  db.prepare("INSERT INTO reflections (cycle_id, what_happened, verdict, ai_summary) VALUES (?, 'Aku mendesain satu layar dan mengujinya ke teman.', 'terbukti', 'ringkasan')").run(c3);
  db.prepare("INSERT INTO review_sessions (cycle_id, facilitator_id, slot_at, status, note, completed_at) VALUES (?, ?, '2026-01-05T09:00:00+07:00', 'selesai', 'Catatan sesi uji.', datetime('now'))").run(c3, e.facilitator_id);
  db.close();

  const fikri = await new Client('10.0.1.1').login('fikri@demo.id');
  fails(await fikri.post('/api/my/responses', { instrument: 'efikasi', phase: 'postes', answers: [4, 4, 4, 4] }), 400, /Postes dibuka setelah tiga siklus/);
  fails(await fikri.post('/api/my/responses', { instrument: 'efikasi', phase: 'tindak_lanjut', answers: [4, 4, 4, 4] }), 400, /Tindak lanjut dibuka/);
  ok(await fikri.post(`/api/cycles/${c3}/decision`, { decision: 'lanjut' }));
  let st = (await fikri.get('/api/my/state')).json;
  assert.equal(st.enrollment.status, 'postes');
  assert.match(st.next.title, /postes/i);
  ok(await fikri.post('/api/my/responses', { instrument: 'adaptabilitas', phase: 'postes', answers: [4, 4, 4, 4, 4, 4, 4, 4] }));
  ok(await fikri.post('/api/my/responses', { instrument: 'efikasi', phase: 'postes', answers: [4, 4, 5, 4] }));
  st = (await fikri.get('/api/my/state')).json;
  assert.equal(st.enrollment.status, 'selesai');
  assert.ok(st.enrollment.completed_at);
  ok(await fikri.post('/api/my/responses', { instrument: 'adaptabilitas', phase: 'tindak_lanjut', answers: [4, 4, 4, 4, 4, 4, 4, 3] }));
  ok(await fikri.post('/api/my/responses', { instrument: 'efikasi', phase: 'tindak_lanjut', answers: [4, 4, 4, 4] }));
  fails(await fikri.post('/api/my/responses', { instrument: 'efikasi', phase: 'tindak_lanjut', answers: [5, 5, 5, 5] }), 400, /tidak dapat diubah/);
  st = (await fikri.get('/api/my/state')).json;
  assert.equal(st.next.title, 'Perjalananmu lengkap');
});

test('uji adversarial: URL rusak, penelusuran folder, IDOR, cookie palsu, tautan kedaluwarsa', async () => {
  const raw = (p) => fetch(base + p).then((r) => r.text().then((t) => ({ status: r.status, text: t })));
  // Satu URL rusak tidak boleh mematikan server.
  assert.equal((await raw('/%E0%A4%A')).status, 400);
  assert.equal((await raw('/')).status, 200, 'server tetap hidup');
  for (const p of ['/..%2fserver%2fdb.js', '/%2e%2e/package.json', '/..%5cserver%5cdb.js', '/css/%00.css']) {
    const r = await raw(p);
    assert.ok([400, 403, 404].includes(r.status), `${p} → ${r.status}`);
    assert.doesNotMatch(r.text, /DatabaseSync|"scripts"/);
  }
  const apiBad = await fetch(base + '/api/cycles/%E0%A4%A/chat', { method: 'POST' });
  assert.ok([400, 401, 404].includes(apiBad.status));

  const dinda = await new Client('10.0.2.1').login('dinda@demo.id');
  // Isian bukan JSON ditolak (lapis CSRF).
  const plain = await fetch(base + '/api/my/issues', { method: 'POST', headers: { cookie: dinda.cookie, 'content-type': 'text/plain', 'x-forwarded-for': '10.0.2.1' }, body: 'text=halo dunia' });
  assert.equal(plain.status, 400);
  // IDOR: siklus dan percobaan milik peserta lain.
  const { openDb } = await import('../server/db.js');
  const db = openDb(process.env.DB_PATH);
  const other = db.prepare("SELECT c.id AS cycle, x.id AS exp, x.confirm_token AS token FROM cycles c JOIN enrollments e ON e.id = c.enrollment_id JOIN users u ON u.id = e.user_id JOIN experiments x ON x.cycle_id = c.id WHERE u.email != 'dinda@demo.id' AND x.status != 'selesai' LIMIT 1").get();
  fails(await dinda.post(`/api/cycles/${other.cycle}/chat`), 404);
  fails(await dinda.post(`/api/experiments/${other.exp}/log`, { minutes: 30 }), 404);
  fails(await dinda.post('/api/cycles/abc/decision', { decision: 'lanjut' }), 404);
  // Fasilitator lain tidak bisa menutup sesi atau menandai kendala kelompok Nadia.
  const foreign = db.prepare("SELECT s.id FROM review_sessions s JOIN users f ON f.id = s.facilitator_id WHERE f.email = 'fasilitator@demo.id' AND s.status = 'terjadwal' LIMIT 1").get();
  const foreignIssue = db.prepare("SELECT i.id FROM issues i JOIN enrollments e ON e.id = i.enrollment_id JOIN users f ON f.id = e.facilitator_id WHERE f.email = 'fasilitator@demo.id' AND i.resolved = 0 LIMIT 1").get();
  const bima = await new Client('10.0.2.2').login('fasilitator2@demo.id');
  fails(await bima.post(`/api/sessions/${foreign.id}/complete`, { note: 'Mencoba menutup sesi orang lain.' }), 403);
  fails(await bima.post(`/api/issues/${foreignIssue.id}/resolve`), 403);
  // Cookie palsu atau rusak.
  const fake = new Client('10.0.2.3');
  fake.cookie = 'uj_sesi=' + 'a'.repeat(48);
  fails(await fake.get('/api/my/state'), 401);
  fake.cookie = "uj_sesi=' OR 1=1 --";
  fails(await fake.get('/api/my/state'), 401);
  // Isi berbahaya disimpan sebagai teks biasa (antarmuka merendernya lewat textContent).
  const xss = (await dinda.post('/api/my/issues', { text: '<img src=x onerror=alert(1)> tolong' })).json;
  assert.equal(xss.text, '<img src=x onerror=alert(1)> tolong');
  // Tautan mitra kedaluwarsa → 410; konfirmasi ganda tidak mengubah apa pun.
  db.prepare("UPDATE experiments SET token_expires_at = '2000-01-01T00:00:00.000Z' WHERE id = ?").run(other.exp);
  fails(await new Client('10.0.2.4').get(`/api/confirm/${other.token}`), 410, /kedaluwarsa/);
  db.close();
});

test('kalender .ics, aplikasi web terpasang (PWA), dan media panduan', async () => {
  const fikri = await new Client('10.0.3.1').login('fikri@demo.id');
  const st = (await fikri.get('/api/my/state')).json;
  const withSession = st.cycles.find((c) => c.session);
  const ics = await fikri.get(`/api/cycles/${withSession.id}/session.ics`);
  ok(ics);
  assert.match(ics.headers.get('content-type'), /text\/calendar/);
  assert.match(ics.text, /BEGIN:VCALENDAR[\s\S]*BEGIN:VEVENT[\s\S]*END:VCALENDAR/);
  assert.match(ics.text, /DTSTART:\d{8}T\d{6}Z/);
  assert.match(ics.text, new RegExp(`siklus ${withSession.n}`));
  assert.doesNotMatch(ics.text, /@demo\.id/);
  const locked = st.cycles.find((c) => !c.session);
  if (locked) fails(await fikri.get(`/api/cycles/${locked.id}/session.ics`), 404);

  const nadia = await new Client('10.0.3.2').login('fasilitator@demo.id');
  const detail = (await nadia.get(`/api/fac/participants/${(await nadia.get('/api/fac/participants')).json.participants.find((p) => p.name === 'Fikri Ramadhan').id}`)).json;
  const sid = detail.cycles.find((c) => c.session).session.id;
  const facIcs = await nadia.get(`/api/sessions/${sid}/session.ics`);
  ok(facIcs);
  assert.match(facIcs.text, /bersama peserta P-\d{3}/);
  assert.doesNotMatch(facIcs.text, /Fikri/);
  fails(await (await new Client('10.0.3.3').login('fasilitator2@demo.id')).get(`/api/sessions/${sid}/session.ics`), 403);

  const manifest = await fetch(base + '/manifest.webmanifest');
  assert.equal(manifest.status, 200);
  assert.match(manifest.headers.get('content-type'), /manifest\+json/);
  assert.equal((await manifest.json()).display, 'standalone');
  const sw = await fetch(base + '/sw.js');
  assert.equal(sw.status, 200);
  assert.match(await sw.text(), /\/api\//, 'service worker mengecualikan /api dari cache');

  const media = await fetch(base + '/media/demo-peserta.webm', { headers: { range: 'bytes=0-99' } });
  if (media.status !== 404) {
    assert.equal(media.status, 206);
    assert.match(media.headers.get('content-range'), /^bytes 0-99\/\d+$/);
    assert.equal((await media.arrayBuffer()).byteLength, 100);
  }
});
