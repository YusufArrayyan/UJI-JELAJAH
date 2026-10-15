// Rute API JSON. Setiap rute menyatakan peran yang boleh mengaksesnya.
import { INSTRUMENTS, SCALE, PHASES } from './instruments.js';
import { SCRIPT, INTRO, scrubPII, runAi, defaultProvider, PROMPT_VERSION } from './ai.js';
import { scoreAnswers, computeKpis, loadKpiRows, stageDistribution, K_MIN } from './scoring.js';
import { verifyPassword, createSession, destroySession, cookieHeader, rateLimiter, SESSION_DAYS } from './auth.js';
import { HttpError, bad, forbidden, notFound, token, nowIso, wibDate, addDays, isoAddDays, str, int } from './util.js';
import { tx } from './db.js';

export const EXPERIMENT_TYPES = {
  wawancara: 'Wawancara praktisi',
  bayangan: 'Membayangi kerja (job shadowing)',
  proyek_mini: 'Proyek mini',
  kelas_terbuka: 'Ikut kelas atau acara terbuka',
  relawan: 'Kerja relawan singkat',
};
const VERDICTS = ['terbukti', 'sebagian', 'tidak'];
const DECISIONS = ['lanjut', 'ubah', 'tinggalkan'];
const SLOT_TIMES = ['09:00', '13:00', '15:30'];
const MAX_MIN = 360;
const loginFails = rateLimiter(8, 5 * 60e3);
const loginPerIp = rateLimiter(60, 5 * 60e3);

const HOME = { peserta: '#/beranda', fasilitator: '#/kelompok', koordinator: '#/ringkasan' };

// ---------------- Pembantu ----------------
export function audit(db, user, action, target = null) {
  const label = user ? `${user.name} (${user.role})` : 'Mitra (tanpa akun)';
  db.prepare('INSERT INTO audit_log (actor_id, actor_label, action, target) VALUES (?,?,?,?)').run(user?.id ?? null, label, action, target);
}

function myEnrollment(ctx) {
  const e = ctx.db
    .prepare(
      `SELECT e.*, c.name AS cohort_name, c.starts_on AS cohort_start, c.ends_on AS cohort_end, f.name AS facilitator_name
       FROM enrollments e JOIN cohorts c ON c.id = e.cohort_id LEFT JOIN users f ON f.id = e.facilitator_id
       WHERE e.user_id = ?`,
    )
    .get(ctx.user.id);
  if (!e) throw notFound('Kamu belum terdaftar di kohort mana pun. Hubungi koordinator programmu.');
  return e;
}

/** BR1: tidak ada data peserta diterima sebelum persetujuan. */
function requireConsent(ctx) {
  const e = myEnrollment(ctx);
  if (!e.consent_at) throw bad('Kamu belum memberi persetujuan data. Buka halaman Persetujuan, baca, lalu centang setuju.');
  return e;
}

/** Siklus milik peserta, aktif, dan tidak terkunci (BR2). */
function ownCycle(ctx, id, stage) {
  const e = requireConsent(ctx);
  const c = ctx.db.prepare('SELECT * FROM cycles WHERE id = ? AND enrollment_id = ?').get(int(id), e.id);
  if (!c) throw notFound('Siklus ini tidak ditemukan di akunmu. Kembali ke Beranda.');
  if (c.n > 1) {
    const prev = ctx.db.prepare('SELECT stage FROM cycles WHERE enrollment_id = ? AND n = ?').get(e.id, c.n - 1);
    if (prev.stage !== 'selesai') throw bad(`Siklus ${c.n} masih terkunci. Selesaikan siklus ${c.n - 1} dulu.`);
  }
  if (stage && c.stage !== stage) {
    const where = { dugaan: 'Dugaan', uji: 'Uji', tinjau: 'Tinjau', selesai: 'Selesai' }[c.stage];
    throw bad(`Siklus ${c.n} sedang di tahap ${where}. Buka tahap itu dari Beranda.`);
  }
  return { e, c };
}

/** BR2 dan BR10: memajukan status pendaftaran. */
export function advanceEnrollment(db, enrollmentId) {
  const e = db.prepare('SELECT * FROM enrollments WHERE id = ?').get(enrollmentId);
  const count = (phase) => db.prepare('SELECT COUNT(*) n FROM responses WHERE enrollment_id = ? AND phase = ?').get(e.id, phase).n;
  if (e.status === 'terdaftar' && e.consent_at && count('pretes') === 2) {
    const today = wibDate();
    const ins = db.prepare('INSERT OR IGNORE INTO cycles (enrollment_id, n, starts_on, due_on) VALUES (?,?,?,?)');
    for (let n = 1; n <= 3; n++) ins.run(e.id, n, addDays(today, (n - 1) * 14), addDays(today, n * 14));
    db.prepare("UPDATE enrollments SET status = 'aktif' WHERE id = ?").run(e.id);
  } else if (e.status === 'aktif') {
    const done = db.prepare("SELECT COUNT(*) n FROM cycles WHERE enrollment_id = ? AND stage = 'selesai'").get(e.id).n;
    if (done === 3) db.prepare("UPDATE enrollments SET status = 'postes' WHERE id = ?").run(e.id);
  } else if (e.status === 'postes' && count('postes') === 2) {
    db.prepare("UPDATE enrollments SET status = 'selesai', completed_at = ? WHERE id = ?").run(nowIso(), e.id);
  }
}

function cycleDetail(db, c) {
  const h = db.prepare('SELECT * FROM hypotheses WHERE cycle_id = ?').get(c.id);
  const x = db.prepare('SELECT x.*, p.name AS partner_name FROM experiments x LEFT JOIN partners p ON p.id = x.partner_id WHERE cycle_id = ?').get(c.id);
  const r = db.prepare('SELECT * FROM reflections WHERE cycle_id = ?').get(c.id);
  const s = db.prepare('SELECT s.*, u.name AS facilitator_name FROM review_sessions s JOIN users u ON u.id = s.facilitator_id WHERE cycle_id = ?').get(c.id);
  return {
    id: c.id,
    n: c.n,
    stage: c.stage,
    starts_on: c.starts_on,
    due_on: c.due_on,
    completed_at: c.completed_at,
    hypothesis: h
      ? { statement: h.statement, reason: h.reason, signal: h.signal, ai_draft: h.ai_draft ? JSON.parse(h.ai_draft) : null, edited: !!h.edited, saved: !!h.saved_at }
      : null,
    experiment: x
      ? {
          id: x.id, type: x.type, type_label: EXPERIMENT_TYPES[x.type] ?? x.type, title: x.title, partner_id: x.partner_id,
          partner_name: x.partner_name, partner_note: x.partner_note, planned_minutes: x.planned_minutes,
          logged_minutes: x.logged_minutes, timer_started_at: x.timer_started_at, status: x.status,
          confirm_token: x.confirm_token, token_expires_at: x.token_expires_at, confirmed_at: x.confirmed_at,
        }
      : null,
    reflection: r
      ? { what_happened: r.what_happened, surprise: r.surprise, verdict: r.verdict, ai_summary: r.ai_summary, summary_final: r.summary_final, decision: r.decision, decision_note: r.decision_note }
      : null,
    session: s ? { id: s.id, slot_at: s.slot_at, status: s.status, note: s.note, summary_checked: !!s.summary_checked, facilitator_name: s.facilitator_name } : null,
  };
}

function responsesMap(db, enrollmentId) {
  const out = { pretes: {}, postes: {}, tindak_lanjut: {} };
  for (const r of db.prepare('SELECT instrument, phase, score FROM responses WHERE enrollment_id = ?').all(enrollmentId)) out[r.phase][r.instrument] = r.score;
  return out;
}

function nextStep(e, cycles, resp) {
  if (!e.consent_at)
    return { title: 'Baca ketentuan data dulu', body: 'Sebelum mulai, baca data apa yang dikumpulkan dan siapa yang bisa melihatnya.', cta: 'Baca ketentuan', href: '#/persetujuan' };
  if (e.status === 'terdaftar')
    return { title: 'Isi pretes', body: 'Dua kuesioner singkat, 12 butir, sekitar 5 menit. Jawabanmu tidak dinilai benar atau salah.', cta: 'Mulai pretes', href: '#/instrumen/pretes' };
  if (e.status === 'aktif') {
    const c = cycles.find((x) => x.stage !== 'selesai');
    const t = `Siklus ${c.n}: `;
    if (c.stage === 'dugaan') return { title: t + 'tulis dugaanmu', body: 'Pendamping AI menanyakan lima hal singkat. Kamu yang memutuskan isi dugaannya.', cta: 'Tulis dugaan', href: `#/dugaan/${c.id}`, stage: 'dugaan' };
    if (c.stage === 'uji') {
      if (!c.experiment) return { title: t + 'rancang percobaanmu', body: 'Pilih satu percobaan yang muat dalam paling lama 6 jam.', cta: 'Rancang percobaan', href: `#/uji/${c.id}`, stage: 'uji' };
      return { title: t + 'ujilah dugaanmu', body: 'Catat waktu percobaanmu. Batasnya 6 jam per siklus.', cta: 'Lanjutkan percobaan', href: `#/uji/${c.id}`, stage: 'uji' };
    }
    if (!c.reflection) return { title: t + 'tulis refleksimu', body: 'Ceritakan apa yang terjadi saat mencoba. Pendamping AI akan merangkumnya untukmu periksa.', cta: 'Tulis refleksi', href: `#/tinjau/${c.id}`, stage: 'tinjau' };
    if (!c.session) return { title: t + 'jadwalkan sesi Tinjau', body: `Pilih jam untuk sesi 30 menit dengan ${e.facilitator_name ?? 'fasilitatormu'}.`, cta: 'Pilih jam sesi', href: `#/tinjau/${c.id}`, stage: 'tinjau' };
    if (c.session.status === 'terjadwal') return { title: t + 'sesi Tinjau sudah terjadwal', body: 'Bawa ringkasanmu ke sesi. Setelah fasilitator menutup sesi, kamu bisa memutuskan nasib dugaanmu.', cta: 'Lihat persiapan sesi', href: `#/tinjau/${c.id}`, stage: 'tinjau', slot_at: c.session.slot_at };
    return { title: t + 'putuskan nasib dugaanmu', body: 'Sesi sudah selesai. Lanjutkan, ubah, atau tinggalkan dugaanmu. Keputusannya milikmu.', cta: 'Buat keputusan', href: `#/tinjau/${c.id}`, stage: 'tinjau' };
  }
  if (e.status === 'postes') return { title: 'Tiga siklus selesai. Isi postes', body: 'Kuesioner yang sama dengan pretes, supaya perubahanmu terlihat.', cta: 'Mulai postes', href: '#/instrumen/postes' };
  if (resp.tindak_lanjut.adaptabilitas == null || resp.tindak_lanjut.efikasi == null)
    return { title: 'Program selesai. Isi tindak lanjut nanti', body: 'Tindak lanjut idealnya diisi tiga bulan setelah program. Di prototipe ini kamu bisa mengisinya sekarang.', cta: 'Isi tindak lanjut', href: '#/instrumen/tindak_lanjut' };
  return { title: 'Perjalananmu lengkap', body: 'Semua siklus dan kuesioner sudah selesai. Catatanmu tetap bisa kamu baca kapan saja.', cta: 'Lihat perjalananku', href: '#/perjalanan' };
}

function availableSlots(db, facilitatorId) {
  const today = wibDate();
  const taken = new Set(db.prepare('SELECT slot_at FROM review_sessions WHERE facilitator_id = ?').all(facilitatorId).map((r) => r.slot_at));
  const out = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(today, i);
    const wd = new Date(d + 'T00:00:00Z').getUTCDay();
    if (wd === 0 || wd === 6) continue;
    for (const t of SLOT_TIMES) {
      const slot = `${d}T${t}:00+07:00`;
      if (Date.parse(slot) > Date.now() + 30 * 60e3 && !taken.has(slot)) out.push(slot);
    }
  }
  return out;
}

const firstName = (n) => String(n).split(' ')[0];

// ---------------- Daftar rute ----------------
const R = [];
const route = (method, path, roles, handler) => {
  const keys = [];
  const re = new RegExp('^' + path.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '$');
  R.push({ method, re, keys, roles, handler });
};

// ----- Akses -----
route('POST', '/api/auth/login', 'publik', (ctx) => {
  const email = str(ctx.body.email, 200).toLowerCase();
  const password = typeof ctx.body.password === 'string' ? ctx.body.password.slice(0, 200) : '';
  // PRD: 8 percobaan per 5 menit. Dihitung untuk percobaan GAGAL per IP+email (menahan tebak kata sandi
  // tanpa mengunci satu lab kampus yang berbagi IP), plus batas longgar per IP untuk tebakan acak.
  const key = `${ctx.ip}|${email}`;
  const blocked = loginFails.blocked(key) || loginPerIp.blocked(ctx.ip);
  if (blocked) throw new HttpError(429, `Terlalu banyak percobaan masuk. Tunggu ${Math.ceil(blocked.retryAfterSec / 60)} menit, lalu coba lagi.`);
  loginPerIp.hit(ctx.ip);
  if (!email || !password) throw bad('Email dan kata sandi wajib diisi. Lengkapi keduanya, lalu tekan Masuk.');
  const u = ctx.db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!u || !verifyPassword(password, u.password_hash)) {
    loginFails.hit(key);
    throw new HttpError(401, 'Email atau kata sandi belum cocok. Periksa lagi, atau minta koordinator mengatur ulang akunmu.');
  }
  loginFails.reset(key);
  const t = createSession(ctx.db, u.id);
  ctx.setCookie(cookieHeader(t, SESSION_DAYS * 86400, ctx.secure));
  return { user: { id: u.id, name: u.name, role: u.role, email: u.email }, home: HOME[u.role] };
});
route('POST', '/api/auth/logout', 'semua', (ctx) => {
  destroySession(ctx.db, ctx.sessionToken);
  ctx.setCookie(cookieHeader('', 0, ctx.secure));
  return { ok: true };
});
route('GET', '/api/me', 'publik', (ctx) => ({ user: ctx.user ? { ...ctx.user, home: HOME[ctx.user.role] } : null }));
route('GET', '/api/demo-accounts', 'publik', () => {
  if (process.env.DEMO_MODE === '0') return { accounts: [] };
  return {
    password: 'demo1234',
    accounts: [
      { email: 'raka@demo.id', role: 'peserta', label: 'Peserta baru', desc: 'Raka, belum memberi persetujuan' },
      { email: 'dinda@demo.id', role: 'peserta', label: 'Peserta di tahap Uji', desc: 'Dinda, siklus 1, 45 dari 120 menit tercatat' },
      { email: 'fikri@demo.id', role: 'peserta', label: 'Peserta di tahap Tinjau', desc: 'Fikri, siklus 2, sesi terjadwal' },
      { email: 'fasilitator@demo.id', role: 'fasilitator', label: 'Fasilitator', desc: 'Nadia Putri, satu kelompok' },
      { email: 'koordinator@demo.id', role: 'koordinator', label: 'Koordinator', desc: 'Dr. Sari Wulandari, dua kohort' },
    ],
  };
});

// ----- Peserta: keadaan -----
route('GET', '/api/my/state', ['peserta'], (ctx) => {
  const e = myEnrollment(ctx);
  const cycles = ctx.db.prepare('SELECT * FROM cycles WHERE enrollment_id = ? ORDER BY n').all(e.id).map((c) => cycleDetail(ctx.db, c));
  cycles.forEach((c, i) => (c.locked = i > 0 && cycles[i - 1].stage !== 'selesai'));
  const resp = responsesMap(ctx.db, e.id);
  const issues = ctx.db.prepare('SELECT id, text, resolved, created_at FROM issues WHERE enrollment_id = ? ORDER BY id DESC').all(e.id);
  return {
    enrollment: {
      status: e.status, consent_at: e.consent_at, cohort: e.cohort_name, cohort_start: e.cohort_start, cohort_end: e.cohort_end,
      facilitator: e.facilitator_name, completed_at: e.completed_at,
    },
    responses: resp,
    cycles,
    issues,
    next: nextStep(e, cycles, resp),
    ai_provider: defaultProvider().name,
  };
});
route('POST', '/api/my/consent', ['peserta'], (ctx) => {
  const e = myEnrollment(ctx);
  if (ctx.body.agree !== true) throw bad('Centang kotak persetujuan dulu, lalu tekan Setuju dan lanjut.');
  if (!e.consent_at) ctx.db.prepare('UPDATE enrollments SET consent_at = ? WHERE id = ?').run(nowIso(), e.id);
  return { ok: true };
});
route('GET', '/api/instruments/:key', ['peserta'], (ctx) => {
  const inst = INSTRUMENTS[ctx.params.key];
  if (!inst) throw notFound('Instrumen tidak ditemukan. Kembali ke Beranda.');
  return { ...inst, scale: SCALE };
});
route('POST', '/api/my/responses', ['peserta'], (ctx) => {
  const e = requireConsent(ctx);
  const instrument = str(ctx.body.instrument, 40);
  const phase = str(ctx.body.phase, 40);
  if (!PHASES[phase]) throw bad('Fase kuesioner tidak dikenal. Muat ulang halaman, lalu coba lagi.');
  const allowed = { pretes: 'terdaftar', postes: 'postes', tindak_lanjut: 'selesai' }[phase];
  if (e.status !== allowed) {
    const msg = {
      pretes: 'Pretes sudah selesai. Lanjutkan siklusmu dari Beranda.',
      postes: 'Postes dibuka setelah tiga siklus selesai.',
      tindak_lanjut: 'Tindak lanjut dibuka setelah postes selesai.',
    }[phase];
    throw bad(msg);
  }
  const score = scoreAnswers(instrument, ctx.body.answers);
  try {
    tx(ctx.db, () => {
      ctx.db.prepare('INSERT INTO responses (enrollment_id, instrument, phase, answers, score) VALUES (?,?,?,?,?)').run(e.id, instrument, phase, JSON.stringify(ctx.body.answers), score);
      advanceEnrollment(ctx.db, e.id);
    });
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) throw bad(`Kamu sudah mengisi ${INSTRUMENTS[instrument].title.toLowerCase()} untuk ${PHASES[phase].toLowerCase()}. Jawaban tidak dapat diubah atau diulang.`);
    throw err;
  }
  return { ok: true, score };
});

// ----- Dugaan -----
function chatState(db, cycleId) {
  const messages = db.prepare('SELECT sender, step, text FROM ai_messages WHERE cycle_id = ? ORDER BY id').all(cycleId);
  const answered = messages.filter((m) => m.sender === 'peserta').length;
  return { messages, answered, total: SCRIPT.length, done: answered >= SCRIPT.length };
}
route('POST', '/api/cycles/:id/chat', ['peserta'], (ctx) => {
  const { c } = ownCycle(ctx, ctx.params.id, 'dugaan');
  const db = ctx.db;
  if (ctx.body.reset === true) {
    db.prepare('DELETE FROM ai_messages WHERE cycle_id = ?').run(c.id);
    db.prepare('DELETE FROM hypotheses WHERE cycle_id = ? AND saved_at IS NULL').run(c.id);
  }
  let st = chatState(db, c.id);
  const add = db.prepare('INSERT INTO ai_messages (cycle_id, sender, step, text) VALUES (?,?,?,?)');
  if (!st.messages.length) add.run(c.id, 'ai', 1, `${INTRO} ${SCRIPT[0]}`);
  const answer = str(ctx.body.answer, 1000);
  if (ctx.body.answer !== undefined) {
    if (st.done) throw bad('Kelima pertanyaan sudah kamu jawab. Lanjutkan dengan menyusun draf dugaan.');
    if (answer.length < 2) throw bad('Jawabanmu masih kosong. Tulis seadanya, satu kalimat pun cukup.');
    tx(db, () => {
      add.run(c.id, 'peserta', st.answered + 1, scrubPII(answer));
      if (st.answered + 1 < SCRIPT.length) add.run(c.id, 'ai', st.answered + 2, SCRIPT[st.answered + 1]);
    });
  }
  st = chatState(db, c.id);
  return st;
});
route('POST', '/api/cycles/:id/draft', ['peserta'], async (ctx) => {
  const { c } = ownCycle(ctx, ctx.params.id, 'dugaan');
  const st = chatState(ctx.db, c.id);
  if (!st.done) throw bad(`Jawab kelima pertanyaan dulu. Baru ${st.answered} dari 5 yang terjawab.`);
  const answers = st.messages.filter((m) => m.sender === 'peserta').map((m) => m.text);
  const run = await runAi(ctx.db, { kind: 'draft', cycleId: c.id, input: answers });
  ctx.db
    .prepare('INSERT INTO hypotheses (cycle_id, ai_draft) VALUES (?, ?) ON CONFLICT(cycle_id) DO UPDATE SET ai_draft = excluded.ai_draft')
    .run(c.id, JSON.stringify(run.output));
  return { draft: run.output, fallback: run.fallback, provider: run.provider };
});
route('POST', '/api/cycles/:id/hypothesis', ['peserta'], (ctx) => {
  const { c } = ownCycle(ctx, ctx.params.id, 'dugaan');
  const h = ctx.db.prepare('SELECT * FROM hypotheses WHERE cycle_id = ?').get(c.id);
  if (!h?.ai_draft) throw bad('Susun draf bersama Pendamping AI dulu, lalu sunting sesukamu.');
  const statement = scrubPII(str(ctx.body.statement, 800));
  const reason = scrubPII(str(ctx.body.reason, 800));
  const signal = scrubPII(str(ctx.body.signal, 800));
  if (statement.length < 20) throw bad('Dugaanmu terlalu pendek. Tulis minimal 20 karakter supaya bisa diuji.');
  if (/\[(bagian pekerjaan|nama pekerjaan|percobaan paling lama 6 jam|Tulis [^\]]*)\]/.test(statement + reason + signal))
    throw bad('Masih ada bagian templat dalam kurung siku. Ganti dengan kata-katamu sendiri, lalu simpan.');
  const draft = JSON.parse(h.ai_draft);
  const edited = draft.statement !== statement || draft.reason !== reason || draft.signal !== signal ? 1 : 0;
  tx(ctx.db, () => {
    ctx.db.prepare('UPDATE hypotheses SET statement = ?, reason = ?, signal = ?, edited = ?, saved_at = ? WHERE cycle_id = ?').run(statement, reason, signal, edited, nowIso(), c.id);
    ctx.db.prepare("UPDATE ai_runs SET edited_by_user = ? WHERE id = (SELECT MAX(id) FROM ai_runs WHERE cycle_id = ? AND kind = 'draft')").run(edited, c.id);
    ctx.db.prepare("UPDATE cycles SET stage = 'uji' WHERE id = ?").run(c.id);
  });
  return { ok: true, edited: !!edited };
});

// ----- Uji -----
function ownExperiment(ctx, id) {
  const x = ctx.db.prepare('SELECT * FROM experiments WHERE id = ?').get(int(id));
  if (!x) throw notFound('Percobaan tidak ditemukan. Kembali ke Beranda.');
  const { c } = ownCycle(ctx, x.cycle_id, 'uji');
  if (x.status === 'selesai') throw bad('Percobaan ini sudah selesai. Lanjutkan ke tahap Tinjau.');
  return { x, c };
}
route('POST', '/api/cycles/:id/experiment', ['peserta'], (ctx) => {
  const { c } = ownCycle(ctx, ctx.params.id, 'uji');
  const type = str(ctx.body.type, 40);
  const title = scrubPII(str(ctx.body.title, 140));
  const planned = int(ctx.body.planned_minutes);
  const partnerNote = scrubPII(str(ctx.body.partner_note, 140));
  const partnerId = ctx.body.partner_id ? int(ctx.body.partner_id) : null;
  if (!EXPERIMENT_TYPES[type]) throw bad('Pilih jenis percobaan dari daftar.');
  if (title.length < 5) throw bad('Judul percobaan terlalu pendek. Tulis minimal 5 karakter, misalnya “Wawancara satu analis data”.');
  if (!(planned >= 15 && planned <= MAX_MIN)) throw bad('Durasi rencana harus antara 15 menit dan 6 jam. Ubah durasinya, lalu simpan.');
  if (partnerId) {
    const p = ctx.db.prepare('SELECT active FROM partners WHERE id = ?').get(partnerId);
    if (!p || !p.active) throw bad('Mitra itu sedang tidak aktif. Pilih mitra lain atau tulis mitramu sendiri.');
  }
  const x = ctx.db.prepare('SELECT * FROM experiments WHERE cycle_id = ?').get(c.id);
  if (x?.status === 'selesai') throw bad('Percobaan ini sudah selesai. Lanjutkan ke tahap Tinjau.');
  if (x) {
    ctx.db.prepare('UPDATE experiments SET type = ?, title = ?, partner_id = ?, partner_note = ?, planned_minutes = ? WHERE id = ?').run(type, title, partnerId, partnerNote, planned, x.id);
  } else {
    ctx.db
      .prepare('INSERT INTO experiments (cycle_id, type, title, partner_id, partner_note, planned_minutes, confirm_token, token_expires_at) VALUES (?,?,?,?,?,?,?,?)')
      .run(c.id, type, title, partnerId, partnerNote, planned, token(16), isoAddDays(30));
  }
  return { ok: true };
});
route('POST', '/api/experiments/:id/start', ['peserta'], (ctx) => {
  const { x } = ownExperiment(ctx, ctx.params.id);
  if (x.timer_started_at) throw bad('Penghitung waktu sudah berjalan. Tekan Berhenti bila percobaanmu selesai.');
  if (x.logged_minutes >= MAX_MIN) throw bad('Waktumu sudah mencapai batas 6 jam untuk siklus ini. Selesaikan percobaan.');
  ctx.db.prepare("UPDATE experiments SET timer_started_at = ?, status = 'berjalan' WHERE id = ?").run(nowIso(), x.id);
  return { ok: true };
});
route('POST', '/api/experiments/:id/stop', ['peserta'], (ctx) => {
  const { x } = ownExperiment(ctx, ctx.params.id);
  if (!x.timer_started_at) throw bad('Penghitung waktu belum berjalan. Tekan Mulai dulu.');
  const minutes = Math.floor((Date.now() - Date.parse(x.timer_started_at)) / 60e3);
  const total = Math.min(MAX_MIN, x.logged_minutes + minutes);
  ctx.db.prepare("UPDATE experiments SET logged_minutes = ?, timer_started_at = NULL, status = 'direncanakan' WHERE id = ?").run(total, x.id);
  return { ok: true, added: total - x.logged_minutes, capped: x.logged_minutes + minutes > MAX_MIN };
});
route('POST', '/api/experiments/:id/log', ['peserta'], (ctx) => {
  const { x } = ownExperiment(ctx, ctx.params.id);
  if (x.timer_started_at) throw bad('Penghitung waktu sedang berjalan. Hentikan dulu, baru catat manual.');
  const m = int(ctx.body.minutes);
  if (!(m >= 5)) throw bad('Catat minimal 5 menit. Untuk waktu lebih singkat, pakai penghitung waktu.');
  if (x.logged_minutes + m > MAX_MIN)
    throw bad(`Total waktu tercatat paling banyak 6 jam (360 menit) per siklus. Sisa waktumu ${MAX_MIN - x.logged_minutes} menit.`);
  ctx.db.prepare('UPDATE experiments SET logged_minutes = logged_minutes + ? WHERE id = ?').run(m, x.id);
  return { ok: true };
});
route('POST', '/api/experiments/:id/finish', ['peserta'], (ctx) => {
  const { x, c } = ownExperiment(ctx, ctx.params.id);
  if (x.timer_started_at) throw bad('Hentikan penghitung waktu dulu, lalu selesaikan percobaan.');
  if (x.logged_minutes < 15) throw bad(`Percobaan bisa diselesaikan setelah minimal 15 menit tercatat. Baru ${x.logged_minutes} menit.`);
  tx(ctx.db, () => {
    ctx.db.prepare("UPDATE experiments SET status = 'selesai', finished_at = ? WHERE id = ?").run(nowIso(), x.id);
    ctx.db.prepare("UPDATE cycles SET stage = 'tinjau' WHERE id = ?").run(c.id);
  });
  return { ok: true };
});

// ----- Mitra (publik, berbasis token) -----
function byToken(ctx) {
  const t = ctx.params.token;
  if (!/^[a-f0-9]{32}$/.test(t)) throw notFound('Tautan konfirmasi tidak dikenal. Minta peserta mengirim ulang tautannya.');
  const x = ctx.db
    .prepare('SELECT x.*, u.name AS participant_name, u.code FROM experiments x JOIN cycles c ON c.id = x.cycle_id JOIN enrollments e ON e.id = c.enrollment_id JOIN users u ON u.id = e.user_id WHERE x.confirm_token = ?')
    .get(t);
  if (!x) throw notFound('Tautan konfirmasi tidak dikenal. Minta peserta mengirim ulang tautannya.');
  if (x.token_expires_at < nowIso()) throw new HttpError(410, 'Tautan ini sudah kedaluwarsa (berlaku 30 hari). Tidak ada yang perlu kamu lakukan.');
  return x;
}
const confirmView = (x) => ({
  participant: firstName(x.participant_name),
  title: x.title,
  type_label: EXPERIMENT_TYPES[x.type] ?? x.type,
  planned_minutes: x.planned_minutes,
  confirmed_at: x.confirmed_at,
  expires_at: x.token_expires_at,
});
route('GET', '/api/confirm/:token', 'publik', (ctx) => confirmView(byToken(ctx)));
route('POST', '/api/confirm/:token', 'publik', (ctx) => {
  const x = byToken(ctx);
  if (!x.confirmed_at) {
    ctx.db.prepare('UPDATE experiments SET confirmed_at = ? WHERE id = ?').run(nowIso(), x.id);
    audit(ctx.db, null, 'mitra_konfirmasi', x.code);
  }
  return confirmView(ctx.db.prepare('SELECT x.*, u.name AS participant_name FROM experiments x JOIN cycles c ON c.id = x.cycle_id JOIN enrollments e ON e.id = c.enrollment_id JOIN users u ON u.id = e.user_id WHERE x.id = ?').get(x.id));
});

// ----- Tinjau -----
route('POST', '/api/cycles/:id/reflection', ['peserta'], async (ctx) => {
  const { c } = ownCycle(ctx, ctx.params.id, 'tinjau');
  const what = scrubPII(str(ctx.body.what_happened, 1500));
  const surprise = scrubPII(str(ctx.body.surprise, 800));
  const verdict = str(ctx.body.verdict, 20);
  if (what.length < 20) throw bad('Ceritamu masih terlalu pendek. Tulis minimal 20 karakter tentang apa yang terjadi.');
  if (!VERDICTS.includes(verdict)) throw bad('Pilih penilaianmu: terbukti, terbukti sebagian, atau tidak terbukti.');
  if (ctx.db.prepare('SELECT 1 FROM review_sessions WHERE cycle_id = ?').get(c.id)) throw bad('Sesi Tinjau sudah dijadwalkan, jadi refleksi tidak bisa diubah lagi. Bawa tambahanmu ke sesi.');
  const h = ctx.db.prepare('SELECT statement FROM hypotheses WHERE cycle_id = ?').get(c.id);
  const run = await runAi(ctx.db, { kind: 'summary', cycleId: c.id, input: { statement: h?.statement ?? '', what_happened: what, surprise, verdict } });
  ctx.db
    .prepare(
      `INSERT INTO reflections (cycle_id, what_happened, surprise, verdict, ai_summary) VALUES (?,?,?,?,?)
       ON CONFLICT(cycle_id) DO UPDATE SET what_happened = excluded.what_happened, surprise = excluded.surprise, verdict = excluded.verdict, ai_summary = excluded.ai_summary, summary_final = NULL`,
    )
    .run(c.id, what, surprise, verdict, run.output);
  return { ai_summary: run.output, fallback: run.fallback, provider: run.provider };
});
route('POST', '/api/cycles/:id/summary', ['peserta'], (ctx) => {
  const { c } = ownCycle(ctx, ctx.params.id, 'tinjau');
  const r = ctx.db.prepare('SELECT * FROM reflections WHERE cycle_id = ?').get(c.id);
  if (!r) throw bad('Tulis refleksimu dulu, baru ringkasannya bisa disimpan.');
  const text = scrubPII(str(ctx.body.text, 1500));
  if (text.length < 10) throw bad('Ringkasanmu terlalu pendek. Tulis minimal 10 karakter.');
  const edited = text !== r.ai_summary ? 1 : 0;
  ctx.db.prepare('UPDATE reflections SET summary_final = ? WHERE id = ?').run(text, r.id);
  ctx.db.prepare("UPDATE ai_runs SET edited_by_user = ? WHERE id = (SELECT MAX(id) FROM ai_runs WHERE cycle_id = ? AND kind = 'summary')").run(edited, c.id);
  return { ok: true };
});
route('GET', '/api/slots', ['peserta'], (ctx) => {
  const e = requireConsent(ctx);
  if (!e.facilitator_id) throw bad('Kamu belum punya fasilitator. Laporkan kendala ini supaya koordinator menugaskan fasilitator.');
  return { facilitator: e.facilitator_name, slots: availableSlots(ctx.db, e.facilitator_id) };
});
route('POST', '/api/cycles/:id/session', ['peserta'], (ctx) => {
  const { e, c } = ownCycle(ctx, ctx.params.id, 'tinjau');
  if (!ctx.db.prepare('SELECT 1 FROM reflections WHERE cycle_id = ?').get(c.id)) throw bad('Kirim refleksimu dulu, baru pilih jam sesi.');
  if (ctx.db.prepare('SELECT 1 FROM review_sessions WHERE cycle_id = ?').get(c.id)) throw bad('Sesi untuk siklus ini sudah terjadwal. Satu siklus, satu sesi.');
  if (!e.facilitator_id) throw bad('Kamu belum punya fasilitator. Laporkan kendala ini supaya koordinator menugaskan fasilitator.');
  const slot = str(ctx.body.slot_at, 40);
  if (!availableSlots(ctx.db, e.facilitator_id).includes(slot)) throw bad('Jam itu sudah tidak tersedia. Pilih jam lain dari daftar.');
  try {
    ctx.db.prepare('INSERT INTO review_sessions (cycle_id, facilitator_id, slot_at) VALUES (?,?,?)').run(c.id, e.facilitator_id, slot);
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) throw bad('Jam itu baru saja dipesan peserta lain. Pilih jam lain.');
    throw err;
  }
  return { ok: true };
});
route('POST', '/api/cycles/:id/decision', ['peserta'], (ctx) => {
  const { e, c } = ownCycle(ctx, ctx.params.id, 'tinjau');
  const s = ctx.db.prepare('SELECT status FROM review_sessions WHERE cycle_id = ?').get(c.id);
  if (!s || s.status !== 'selesai') throw bad('Keputusan baru bisa dicatat setelah fasilitator menutup sesi Tinjau.');
  const decision = str(ctx.body.decision, 20);
  if (!DECISIONS.includes(decision)) throw bad('Pilih salah satu: lanjutkan, ubah, atau tinggalkan dugaan.');
  const note = scrubPII(str(ctx.body.note, 500));
  tx(ctx.db, () => {
    ctx.db.prepare('UPDATE reflections SET decision = ?, decision_note = ?, decided_at = ? WHERE cycle_id = ?').run(decision, note, nowIso(), c.id);
    ctx.db.prepare("UPDATE cycles SET stage = 'selesai', completed_at = ? WHERE id = ?").run(nowIso(), c.id);
    advanceEnrollment(ctx.db, e.id);
  });
  return { ok: true };
});

// ----- Dukungan -----
route('POST', '/api/my/issues', ['peserta'], (ctx) => {
  const e = requireConsent(ctx);
  const text = scrubPII(str(ctx.body.text, 600));
  if (text.length < 5 || text.length > 500) throw bad('Ceritakan kendalamu dalam 5 sampai 500 karakter.');
  ctx.db.prepare('INSERT INTO issues (enrollment_id, text) VALUES (?,?)').run(e.id, text);
  return { ok: true, text };
});
route('GET', '/api/my/export', ['peserta'], (ctx) => {
  const e = myEnrollment(ctx);
  const db = ctx.db;
  const cycles = db.prepare('SELECT * FROM cycles WHERE enrollment_id = ? ORDER BY n').all(e.id);
  const data = {
    diekspor_pada: nowIso(),
    catatan: 'Data simulasi dari prototipe Uji Jelajah.',
    akun: { nama: ctx.user.name, email: ctx.user.email, kode: ctx.user.code },
    pendaftaran: { kohort: e.cohort_name, status: e.status, persetujuan: e.consent_at, fasilitator: e.facilitator_name },
    kuesioner: db.prepare('SELECT instrument, phase, answers, score, created_at FROM responses WHERE enrollment_id = ?').all(e.id).map((r) => ({ ...r, answers: JSON.parse(r.answers) })),
    siklus: cycles.map((c) => ({
      ...cycleDetail(db, c),
      percakapan: db.prepare('SELECT sender, step, text, created_at FROM ai_messages WHERE cycle_id = ? ORDER BY id').all(c.id),
    })),
    kendala: db.prepare('SELECT text, resolved, created_at FROM issues WHERE enrollment_id = ?').all(e.id),
  };
  return { download: { filename: `uji-jelajah-${ctx.user.code ?? 'data'}.json`, type: 'application/json; charset=utf-8', body: JSON.stringify(data, null, 2) } };
});
route('DELETE', '/api/my/account', ['peserta'], (ctx) => {
  if (ctx.body.confirm !== 'HAPUS') throw bad('Ketik HAPUS dengan huruf kapital untuk mengonfirmasi.');
  tx(ctx.db, () => {
    audit(ctx.db, null, 'hapus_akun', ctx.user.code);
    ctx.db.prepare('DELETE FROM users WHERE id = ?').run(ctx.user.id);
  });
  ctx.setCookie(cookieHeader('', 0, ctx.secure));
  return { ok: true };
});

// ----- Fasilitator -----
function ownEnrollmentFor(ctx, enrollmentId) {
  const e = ctx.db
    .prepare('SELECT e.*, u.name, u.code, c.name AS cohort_name FROM enrollments e JOIN users u ON u.id = e.user_id JOIN cohorts c ON c.id = e.cohort_id WHERE e.id = ?')
    .get(int(enrollmentId));
  if (!e) throw notFound('Peserta tidak ditemukan. Kembali ke Kelompokku.');
  if (e.facilitator_id !== ctx.user.id) throw forbidden('Peserta ini bukan anggota kelompokmu. Kamu hanya bisa membuka peserta di kelompokmu.');
  return e;
}
route('GET', '/api/fac/participants', ['fasilitator'], (ctx) => {
  const db = ctx.db;
  const today = wibDate();
  const rows = db
    .prepare(
      `SELECT e.id, e.status, u.name, u.code, c.name AS cohort_name,
        (SELECT COUNT(*) FROM issues i WHERE i.enrollment_id = e.id AND i.resolved = 0) AS open_issues
       FROM enrollments e JOIN users u ON u.id = e.user_id JOIN cohorts c ON c.id = e.cohort_id
       WHERE e.facilitator_id = ? ORDER BY u.name`,
    )
    .all(ctx.user.id);
  const curCycle = db.prepare("SELECT * FROM cycles WHERE enrollment_id = ? AND stage != 'selesai' ORDER BY n LIMIT 1");
  const people = rows.map((r) => {
    const c = curCycle.get(r.id);
    const x = c && db.prepare('SELECT logged_minutes, planned_minutes FROM experiments WHERE cycle_id = ?').get(c.id);
    const s = c && db.prepare('SELECT id, slot_at, status FROM review_sessions WHERE cycle_id = ?').get(c.id);
    return {
      ...r,
      consent: r.status !== 'terdaftar' || null,
      cycle: c ? { n: c.n, stage: c.stage, due_on: c.due_on, overdue: c.due_on < today } : null,
      minutes: x ? { logged: x.logged_minutes, planned: x.planned_minutes } : null,
      session: s ?? null,
    };
  });
  const issues = db
    .prepare('SELECT i.id, i.text, i.created_at, i.enrollment_id, u.name FROM issues i JOIN enrollments e ON e.id = i.enrollment_id JOIN users u ON u.id = e.user_id WHERE e.facilitator_id = ? AND i.resolved = 0 ORDER BY i.id')
    .all(ctx.user.id);
  audit(db, ctx.user, 'lihat_daftar_kelompok', `${people.length} peserta`);
  return {
    participants: people,
    issues,
    stats: {
      total: people.length,
      sessions: people.filter((p) => p.session?.status === 'terjadwal').length,
      attention: people.filter((p) => p.open_issues > 0 || p.cycle?.overdue).length,
    },
  };
});
route('GET', '/api/fac/participants/:id', ['fasilitator'], (ctx) => {
  const e = ownEnrollmentFor(ctx, ctx.params.id);
  const db = ctx.db;
  audit(db, ctx.user, 'lihat_detail_peserta', e.code);
  return {
    id: e.id, name: e.name, code: e.code, cohort: e.cohort_name, status: e.status,
    responses: responsesMap(db, e.id),
    cycles: db.prepare('SELECT * FROM cycles WHERE enrollment_id = ? ORDER BY n').all(e.id).map((c) => cycleDetail(db, c)),
    issues: db.prepare('SELECT id, text, resolved, created_at FROM issues WHERE enrollment_id = ? ORDER BY id DESC').all(e.id),
  };
});
route('POST', '/api/sessions/:id/complete', ['fasilitator'], (ctx) => {
  const s = ctx.db
    .prepare('SELECT s.*, u.code FROM review_sessions s JOIN cycles c ON c.id = s.cycle_id JOIN enrollments e ON e.id = c.enrollment_id JOIN users u ON u.id = e.user_id WHERE s.id = ?')
    .get(int(ctx.params.id));
  if (!s) throw notFound('Sesi tidak ditemukan. Muat ulang halaman.');
  if (s.facilitator_id !== ctx.user.id) throw forbidden('Sesi ini milik fasilitator lain. Kamu hanya bisa menutup sesimu sendiri.');
  if (s.status === 'selesai') throw bad('Sesi ini sudah ditutup.');
  const note = str(ctx.body.note, 1500);
  if (note.length < 10) throw bad('Catatan sesi minimal 10 karakter. Tulis singkat apa yang dibahas.');
  ctx.db.prepare("UPDATE review_sessions SET status = 'selesai', note = ?, summary_checked = ?, completed_at = ? WHERE id = ?").run(scrubPII(note), ctx.body.summary_checked === true ? 1 : 0, nowIso(), s.id);
  audit(ctx.db, ctx.user, 'tutup_sesi', s.code);
  return { ok: true };
});
route('POST', '/api/issues/:id/resolve', ['fasilitator'], (ctx) => {
  const i = ctx.db.prepare('SELECT i.*, e.facilitator_id, u.code FROM issues i JOIN enrollments e ON e.id = i.enrollment_id JOIN users u ON u.id = e.user_id WHERE i.id = ?').get(int(ctx.params.id));
  if (!i) throw notFound('Kendala tidak ditemukan. Muat ulang halaman.');
  if (i.facilitator_id !== ctx.user.id) throw forbidden('Kendala ini dari peserta di luar kelompokmu.');
  ctx.db.prepare('UPDATE issues SET resolved = 1, resolved_at = ? WHERE id = ?').run(nowIso(), i.id);
  audit(ctx.db, ctx.user, 'tandai_kendala_selesai', i.code);
  return { ok: true };
});

// ----- Koordinator -----
const cohortParam = (ctx) => (ctx.query.get('cohort') && ctx.query.get('cohort') !== 'semua' ? int(ctx.query.get('cohort')) : null);
route('GET', '/api/coord/summary', ['koordinator'], (ctx) => {
  const cohortId = cohortParam(ctx);
  const cohorts = ctx.db.prepare('SELECT c.*, (SELECT COUNT(*) FROM enrollments e WHERE e.cohort_id = c.id) AS n FROM cohorts c ORDER BY starts_on').all();
  const rows = loadKpiRows(ctx.db, cohortId);
  const total = ctx.db.prepare('SELECT COUNT(*) n FROM enrollments WHERE (? IS NULL OR cohort_id = ?)').get(cohortId, cohortId).n;
  return { cohorts, cohort: cohortId, total, k_min: K_MIN, kpis: computeKpis(rows), stages: stageDistribution(ctx.db, cohortId) };
});
function facilitatorLoads(db) {
  return db
    .prepare(
      `SELECT u.id, u.name, u.email,
        (SELECT COUNT(*) FROM enrollments e WHERE e.facilitator_id = u.id AND e.status != 'selesai') AS active,
        (SELECT COUNT(*) FROM enrollments e WHERE e.facilitator_id = u.id) AS total,
        (SELECT COUNT(*) FROM review_sessions s WHERE s.facilitator_id = u.id AND s.status = 'terjadwal') AS sessions
       FROM users u WHERE u.role = 'fasilitator' ORDER BY u.name`,
    )
    .all();
}
route('GET', '/api/coord/facilitators', ['koordinator'], (ctx) => ({
  facilitators: facilitatorLoads(ctx.db),
  unassigned: ctx.db.prepare('SELECT COUNT(*) n FROM enrollments WHERE facilitator_id IS NULL').get().n,
}));
route('POST', '/api/coord/facilitators/assign-auto', ['koordinator'], (ctx) => {
  const db = ctx.db;
  const pending = db.prepare("SELECT id FROM enrollments WHERE facilitator_id IS NULL AND status != 'selesai' ORDER BY id").all();
  const loads = facilitatorLoads(db);
  if (!loads.length) throw bad('Belum ada akun fasilitator. Tambahkan fasilitator dulu.');
  let assigned = 0;
  tx(db, () => {
    const up = db.prepare('UPDATE enrollments SET facilitator_id = ? WHERE id = ?');
    for (const p of pending) {
      loads.sort((a, b) => a.active - b.active || a.id - b.id);
      up.run(loads[0].id, p.id);
      loads[0].active++;
      assigned++;
    }
  });
  audit(db, ctx.user, 'penugasan_otomatis', `${assigned} peserta`);
  return { assigned, facilitators: facilitatorLoads(db) };
});
route('GET', '/api/coord/partners', ['koordinator', 'peserta'], (ctx) => {
  if (ctx.user.role === 'peserta') return { partners: ctx.db.prepare('SELECT id, name, field, offer FROM partners WHERE active = 1 ORDER BY name').all() };
  return { partners: ctx.db.prepare('SELECT p.*, (SELECT COUNT(*) FROM experiments x WHERE x.partner_id = p.id) AS used FROM partners p ORDER BY p.active DESC, p.name').all() };
});
route('POST', '/api/coord/partners', ['koordinator'], (ctx) => {
  const name = str(ctx.body.name, 120);
  const field = str(ctx.body.field, 120);
  const offer = str(ctx.body.offer, 200);
  if (name.length < 3) throw bad('Nama mitra minimal 3 karakter.');
  if (field.length < 3) throw bad('Bidang mitra minimal 3 karakter, misalnya “Analisis data”.');
  ctx.db.prepare('INSERT INTO partners (name, field, offer) VALUES (?,?,?)').run(name, field, offer);
  audit(ctx.db, ctx.user, 'tambah_mitra', name);
  return { ok: true };
});
route('POST', '/api/coord/partners/:id/toggle', ['koordinator'], (ctx) => {
  const p = ctx.db.prepare('SELECT * FROM partners WHERE id = ?').get(int(ctx.params.id));
  if (!p) throw notFound('Mitra tidak ditemukan.');
  ctx.db.prepare('UPDATE partners SET active = ? WHERE id = ?').run(p.active ? 0 : 1, p.id);
  audit(ctx.db, ctx.user, p.active ? 'nonaktifkan_mitra' : 'aktifkan_mitra', p.name);
  return { ok: true, active: !p.active };
});
route('GET', '/api/coord/ai', ['koordinator'], (ctx) => {
  const db = ctx.db;
  const agg = (where) =>
    db.prepare(`SELECT COUNT(*) AS runs, COALESCE(SUM(passed),0) AS passed, COALESCE(SUM(fallback_used),0) AS fallback, COALESCE(SUM(edited_by_user),0) AS edited, COALESCE(ROUND(AVG(latency_ms)),0) AS latency FROM ai_runs ${where}`).get();
  return {
    provider: defaultProvider().name,
    prompt_version: PROMPT_VERSION,
    all: agg(''),
    draft: agg("WHERE kind = 'draft'"),
    summary: agg("WHERE kind = 'summary'"),
    reasons: db.prepare('SELECT reject_reason AS reason, COUNT(*) AS n FROM ai_runs WHERE reject_reason IS NOT NULL GROUP BY reject_reason ORDER BY n DESC').all(),
    recent: db.prepare('SELECT id, kind, provider, prompt_version, latency_ms, passed, fallback_used, edited_by_user, reject_reason, created_at FROM ai_runs ORDER BY id DESC LIMIT 20').all(),
  };
});
route('GET', '/api/coord/audit', ['koordinator'], (ctx) => ({
  events: ctx.db.prepare('SELECT id, actor_label, action, target, created_at FROM audit_log ORDER BY id DESC LIMIT 60').all(),
}));
route('GET', '/api/coord/export.csv', ['koordinator'], (ctx) => {
  const cohortId = cohortParam(ctx);
  const rows = loadKpiRows(ctx.db, cohortId);
  const codes = new Map(ctx.db.prepare('SELECT e.id, u.code, c.name AS cohort FROM enrollments e JOIN users u ON u.id = e.user_id JOIN cohorts c ON c.id = e.cohort_id').all().map((r) => [r.id, r]));
  const head = ['kode_peserta', 'kohort', 'status', 'siklus_selesai', 'sesi_selesai', 'keputusan_tercatat', 'adaptabilitas_pretes', 'adaptabilitas_postes', 'adaptabilitas_tindak_lanjut', 'efikasi_pretes', 'efikasi_postes'];
  const esc = (v) => (v == null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const lines = [head.join(',')].concat(
    rows.map((r) => [codes.get(r.id).code, codes.get(r.id).cohort, r.status, r.cyclesDone, r.sessionsDone, r.sessionsDecided, r.pre.adaptabilitas, r.post.adaptabilitas, r.follow.adaptabilitas, r.pre.efikasi, r.post.efikasi].map(esc).join(',')),
  );
  audit(ctx.db, ctx.user, 'ekspor_csv', `${rows.length} baris`);
  return { download: { filename: `uji-jelajah-anonim-${wibDate()}.csv`, type: 'text/csv; charset=utf-8', body: String.fromCharCode(0xfeff) + lines.join('\n') } };
});

// ---------------- Pencocok rute ----------------
export function match(method, path) {
  let pathMatched = false;
  for (const r of R) {
    const m = r.re.exec(path);
    if (!m) continue;
    pathMatched = true;
    if (r.method !== method) continue;
    const params = {};
    try {
      r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
    } catch {
      throw bad('Alamat tidak valid. Muat ulang halaman, lalu coba lagi.');
    }
    return { route: r, params };
  }
  return pathMatched ? { methodNotAllowed: true } : null;
}
