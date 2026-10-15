// Uji unit: penyamaran, pemeriksa keluaran, skrip, runAi, penskoran, k-anonimitas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { scrubPII, validateOutput, SCRIPT, runAi, mockProvider, PROMPT_VERSION } from '../server/ai.js';
import { scoreAnswers, computeKpis, K_MIN } from '../server/scoring.js';

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
