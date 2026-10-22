// Uji unit: penyamaran, pemeriksa keluaran, skrip, runAi, penskoran, k-anonimitas, pendaftaran mandiri.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { scrubPII, validateOutput, SCRIPT, runAi, mockProvider, PROMPT_VERSION } from '../server/ai.js';
import { scoreAnswers, computeKpis, K_MIN, loadKpiRows, stageDistribution } from '../server/scoring.js';
import { rateLimiter, hashPassword, verifyPassword } from '../server/auth.js';
import { validateSignup, registerParticipant, SIGNUP_REJECTED, JURY_COHORT } from '../server/signup.js';

test('scrubPII menyamarkan NPM, nomor ponsel, dan email', () => {
  const out = scrubPII('NPM 2210631170045, WA 0812-3456-7890 atau +6281298765432, surel raka.p@kampus.ac.id');
  assert.doesNotMatch(out, /2210631170045/);
  assert.match(out, /\[NPM disamarkan\]/);
  assert.match(out, /\[nomor disamarkan\]/);
  assert.match(out, /\[email disamarkan\]/);
  assert.doesNotMatch(out, /raka\.p@kampus/);
  assert.doesNotMatch(out, /0812-3456-7890/);
});

test('validateOutput menolak teks kosong', () => {
  assert.equal(validateOutput('   ', 'apa saja').reason, 'kosong');
});

test('validateOutput menolak lebih dari 80 kata', () => {
  const src = Array.from({ length: 90 }, (_, i) => `kata${i}`).join(' ');
  assert.equal(validateOutput(src, src).reason, 'lebih_dari_80_kata');
});

test('validateOutput menolak diagnosis dan saran karier', () => {
  const src = 'aku suka angka dan data penjualan';
  assert.equal(validateOutput('Kamu sebaiknya menjadi analis data.', src).reason, 'diagnosis_atau_saran');
  assert.equal(validateOutput('Ini karier terbaik untuk angka dan data.', src).reason, 'diagnosis_atau_saran');
  assert.equal(validateOutput('Sepertinya kamu mengalami depresi ringan.', src).reason, 'diagnosis_atau_saran');
});

test('validateOutput menolak data pribadi', () => {
  const src = 'hubungi aku di nomor ini';
  assert.equal(validateOutput('Hubungi aku di 081234567890.', src).reason, 'data_pribadi');
});

test('validateOutput menolak keluaran yang tidak berpijak pada tulisan mahasiswa', () => {
  const src = 'aku suka menggambar layar aplikasi';
  assert.equal(validateOutput('Pekerjaan arsitek kapal selam membutuhkan sertifikasi internasional khusus.', src).reason, 'tidak_berpijak');
});

test('draf penyedia simulasi lolos pemeriksa', async () => {
  const a = ['analis data', 'menurutku sehari-harinya membersihkan data penjualan', 'aku suka mencari pola', 'wawancara satu analis data', 'kalau aku ingin belajar lagi berarti benar'];
  const d = await mockProvider.draft(a);
  for (const f of [d.statement, d.reason, d.signal]) assert.equal(validateOutput(f, a.join(' ')).ok, true, f);
  assert.doesNotMatch(d.statement, /sehari-harinya menurutku/);
});

test('skrip Pendamping AI tetap lima pertanyaan', () => {
  assert.equal(SCRIPT.length, 5);
  assert.match(SCRIPT[3], /enam jam/);
});

test('runAi memakai cadangan bila penyedia galat dan mencatat prosesnya', async () => {
  const db = openDb(':memory:');
  const broken = { name: 'rusak', draft: async () => { throw new Error('timeout'); } };
  const out = await runAi(db, { kind: 'draft', cycleId: null, input: ['a', 'b', 'c', 'd', 'e'], provider: broken });
  assert.equal(out.fallback, true);
  assert.match(out.output.statement, /\[bagian pekerjaan\]/);
  const run = db.prepare('SELECT * FROM ai_runs').get();
  assert.equal(run.fallback_used, 1);
  assert.equal(run.passed, 0);
  assert.equal(run.provider, 'rusak');
  assert.match(run.reject_reason, /galat_penyedia/);
});

test('runAi menolak keluaran berisi saran lalu memakai cadangan', async () => {
  const db = openDb(':memory:');
  const pushy = { name: 'nakal', summary: async () => 'Kamu sebaiknya langsung melamar kerja jadi analis data.' };
  const out = await runAi(db, { kind: 'summary', cycleId: null, input: { statement: 'analis data', what_happened: 'aku wawancara analis data', surprise: '', verdict: 'sebagian' }, provider: pushy });
  assert.equal(out.fallback, true);
  const run = db.prepare('SELECT * FROM ai_runs').get();
  assert.equal(run.reject_reason, 'diagnosis_atau_saran');
  assert.equal(run.prompt_version, PROMPT_VERSION);
});

test('scoreAnswers menghitung rerata 1 sampai 5', () => {
  assert.equal(scoreAnswers('efikasi', [4, 4, 3, 5]), 4);
  assert.equal(scoreAnswers('adaptabilitas', [1, 2, 3, 4, 5, 5, 4, 3]), 3.38);
});

test('scoreAnswers menolak jawaban tidak sah', () => {
  assert.throws(() => scoreAnswers('efikasi', [4, 4, 3]), /wajib dijawab/);
  assert.throws(() => scoreAnswers('efikasi', [4, 4, 3, 6]), /1 sampai 5/);
  assert.throws(() => scoreAnswers('efikasi', [4, 4, 3, '5']), /1 sampai 5/);
  assert.throws(() => scoreAnswers('kepribadian', [1]), /tidak dikenal/);
});

test('computeKpis menyembunyikan angka di bawah 10 dan menghitung kenaikan skor', () => {
  const row = (pre, post, extra = {}) => ({ cycle3Due: '2000-01-01', cyclesDone: 3, pre: { adaptabilitas: pre, efikasi: pre }, post: { adaptabilitas: post, efikasi: post }, follow: { adaptabilitas: post }, sessionsDone: 3, sessionsDecided: 3, ...extra });
  const few = computeKpis(Array.from({ length: K_MIN - 1 }, () => row(3, 4)), '2026-10-15');
  assert.equal(few.k1.hidden, true);
  assert.equal(few.k2.value, null);
  assert.equal(few.k5.hidden, true);
  const rows = [...Array.from({ length: 8 }, () => row(3, 4)), row(3, 3), row(3.5, 3, { cyclesDone: 2, sessionsDecided: 1 })];
  const k = computeKpis(rows, '2026-10-15');
  assert.equal(k.k1.value, 90);
  assert.equal(k.k2.num, 8);
  assert.equal(k.k2.value, 80);
  assert.equal(k.k4.value, 90);
  assert.equal(k.k5.met, true);
});

// ---------- Pendaftaran mandiri (v1.2) ----------

const signupDb = () => {
  const db = openDb(':memory:');
  const add = db.prepare('INSERT INTO users (email, name, role, password_hash) VALUES (?,?,?,?)');
  add.run('fasilitator@demo.id', 'Nadia Putri', 'fasilitator', hashPassword('demo1234'));
  add.run('fasilitator2@demo.id', 'Bima Saputra', 'fasilitator', hashPassword('demo1234'));
  return db;
};
const juri = (over = {}) => ({ name: 'Ibu Juri Satu', email: 'Juri.Satu@Kampus.ac.id', password: 'jelajah-juri-2026', password2: 'jelajah-juri-2026', ...over });
const fieldOf = (fn) => {
  try { fn(); } catch (err) { return { status: err.status, field: err.field, message: err.message }; }
  return null;
};

test('daftar sukses: peserta asli di kohort juri, email kecil, kata sandi di-hash, satu fasilitator', () => {
  const db = signupDb();
  const u = registerParticipant(db, juri());
  assert.equal(u.role, 'peserta');
  assert.equal(u.is_demo, 0);
  assert.equal(u.email, 'juri.satu@kampus.ac.id');
  assert.match(u.code, /^J-001$/);
  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(u.id);
  assert.ok(verifyPassword('jelajah-juri-2026', row.password_hash));
  assert.doesNotMatch(row.password_hash, /jelajah/);
  const e = db.prepare('SELECT e.*, c.name, c.kind, c.facilitator_id AS cf FROM enrollments e JOIN cohorts c ON c.id = e.cohort_id WHERE e.user_id = ?').get(u.id);
  assert.equal(e.name, JURY_COHORT);
  assert.equal(e.kind, 'juri');
  assert.equal(e.status, 'terdaftar');
  assert.equal(e.consent_at, null, 'alur peserta baru: persetujuan belum diberikan');
  assert.ok(e.facilitator_id);
  const u2 = registerParticipant(db, juri({ email: 'juri.dua@kampus.ac.id' }));
  const e2 = db.prepare('SELECT facilitator_id, cohort_id FROM enrollments WHERE user_id = ?').get(u2.id);
  assert.equal(e2.cohort_id, e.cohort_id, 'satu kohort juri');
  assert.equal(e2.facilitator_id, e.facilitator_id, 'semua juri ke satu fasilitator');
  assert.equal(u2.code, 'J-002');
});

test('daftar: email ganda ditolak tanpa membedakan huruf besar/kecil dan tanpa menyebut email terdaftar', () => {
  const db = signupDb();
  registerParticipant(db, juri());
  const dup = fieldOf(() => registerParticipant(db, juri({ email: 'JURI.SATU@kampus.AC.ID', password: 'kata-sandi-lain-9', password2: 'kata-sandi-lain-9' })));
  assert.equal(dup.status, 400);
  assert.equal(dup.message, SIGNUP_REJECTED);
  assert.doesNotMatch(dup.message, /sudah terdaftar|sudah dipakai|already/i);
  const demo = fieldOf(() => registerParticipant(db, juri({ email: 'fasilitator@demo.id' })));
  assert.equal(demo.message, SIGNUP_REJECTED, 'akun demo tidak bisa diambil alih');
  assert.equal(db.prepare("SELECT COUNT(*) n FROM users WHERE lower(email) = 'juri.satu@kampus.ac.id'").get().n, 1);
  assert.throws(() => db.prepare("INSERT INTO users (email, name, role, password_hash) VALUES ('Juri.SATU@kampus.ac.id','x','peserta','x')").run(), /UNIQUE/, 'indeks unik lower(email)');
});

test('daftar: kata sandi lemah, ulangan berbeda, nama dan email tidak valid', () => {
  assert.deepEqual(fieldOf(() => validateSignup(juri({ password: 'pendek7', password2: 'pendek7' }))).field, 'password');
  assert.match(fieldOf(() => validateSignup(juri({ password: 'pendek7', password2: 'pendek7' }))).message, /minimal 8 karakter/);
  for (const weak of ['12345678', 'password', 'aaaaaaaa', 'demo1234']) {
    const r = fieldOf(() => validateSignup(juri({ password: weak, password2: weak })));
    assert.equal(r.field, 'password', weak);
    assert.match(r.message, /mudah ditebak/);
  }
  assert.equal(fieldOf(() => validateSignup(juri({ password2: 'beda-sendiri-2026' }))).field, 'password2');
  assert.equal(fieldOf(() => validateSignup(juri({ name: ' A ' }))).field, 'name');
  assert.equal(fieldOf(() => validateSignup(juri({ email: 'bukan-email' }))).field, 'email');
  assert.equal(fieldOf(() => validateSignup({})).status, 400);
  assert.equal(validateSignup(juri({ name: '  Ibu   Juri ' })).name, 'Ibu Juri');
});

test('pembatas laju pendaftaran: memblokir setelah batas dan per kunci terpisah', () => {
  const lim = rateLimiter(3, 60e3);
  for (let i = 0; i < 3; i++) {
    assert.equal(lim.blocked('10.1.1.1'), null);
    lim.hit('10.1.1.1');
  }
  const b = lim.blocked('10.1.1.1');
  assert.ok(b && b.retryAfterSec > 0 && b.retryAfterSec <= 60);
  assert.equal(lim.blocked('10.1.1.2'), null, 'IP lain tidak ikut terblokir');
});

test('angka koordinator "semua kohort" tidak memuat kohort juri', () => {
  const db = signupDb();
  const sim = Number(db.prepare("INSERT INTO cohorts (name, starts_on, ends_on) VALUES ('Simulasi', '2026-01-01', '2026-02-12')").run().lastInsertRowid);
  const fac = db.prepare("SELECT id FROM users WHERE role = 'fasilitator'").get().id;
  for (let i = 0; i < 12; i++) {
    const uid = Number(db.prepare("INSERT INTO users (email, name, role, password_hash, code) VALUES (?, 'Sim', 'peserta', 'x', ?)").run(`s${i}@demo.id`, `P-${i}`).lastInsertRowid);
    db.prepare("INSERT INTO enrollments (user_id, cohort_id, facilitator_id, consent_at) VALUES (?,?,?, '2026-01-01')").run(uid, sim, fac);
  }
  const before = loadKpiRows(db).length;
  const u = registerParticipant(db, juri());
  db.prepare("UPDATE enrollments SET consent_at = '2026-10-22' WHERE user_id = ?").run(u.id);
  assert.equal(loadKpiRows(db).length, before, 'juri tidak masuk angka simulasi');
  assert.equal(loadKpiRows(db).length, 12);
  const jc = db.prepare("SELECT id FROM cohorts WHERE kind = 'juri'").get().id;
  assert.equal(loadKpiRows(db, jc).length, 1, 'juri terlihat bila kohortnya dipilih');
  assert.ok(stageDistribution(db, jc).every((s) => s.n === null), 'k-anonimitas tetap: sel < 10 disembunyikan');
  assert.equal(stageDistribution(db).find((s) => s.label === 'Terdaftar').n, 12);
});

test('migrasi: basis data lama mendapat is_demo = 1 dan kohort simulasi', async () => {
  const { DatabaseSync } = await import('node:sqlite');
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const dir = mkdtempSync(join(tmpdir(), 'uj-migrasi-'));
  const file = join(dir, 'lama.db');
  const old = new DatabaseSync(file);
  old.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, role TEXT NOT NULL, password_hash TEXT NOT NULL, code TEXT UNIQUE, created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE cohorts (id INTEGER PRIMARY KEY, name TEXT NOT NULL, starts_on TEXT NOT NULL, ends_on TEXT NOT NULL);
    INSERT INTO users (email, name, role, password_hash) VALUES ('raka@demo.id', 'Raka', 'peserta', 'x');
    INSERT INTO cohorts (name, starts_on, ends_on) VALUES ('Lama', '2026-01-01', '2026-02-01');`);
  old.close();
  const db = openDb(file);
  assert.equal(db.prepare('SELECT is_demo FROM users').get().is_demo, 1);
  assert.equal(db.prepare('SELECT kind FROM cohorts').get().kind, 'simulasi');
  db.close();
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* WAL di Windows */ }
});
