// Pembuat data simulasi: 95 akun (89 peserta, 5 fasilitator, 1 koordinator), dua kohort.
// Semua nama, mitra, dan angka FIKTIF. Tanggal dihitung relatif terhadap hari ini.
import { rmSync, existsSync } from 'node:fs';
import { openDb, DB_PATH, tx } from './db.js';
import { hashPassword } from './auth.js';
import { SCRIPT, INTRO, PROMPT_VERSION } from './ai.js';
import { INSTRUMENTS } from './instruments.js';
import { wibDate, addDays, token } from './util.js';

// ---------- PRNG deterministik ----------
let s = 20261015;
const rnd = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const between = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const clamp = (x) => Math.max(1, Math.min(5, x));

const TODAY = wibDate();
const iso = (date, hh = '10:00') => new Date(`${date}T${hh}:00+07:00`).toISOString();

// ---------- Bahan cerita ----------
const STORIES = [
  {
    field: 'analis data', daily: 'membersihkan data penjualan lalu membuat grafik untuk tim', enjoy: 'Aku suka mencari pola dalam angka karena senang menebak penyebab sesuatu',
    test: 'wawancara satu analis data selama satu jam', signal: 'Kalau setelah wawancara aku ingin belajar lebih jauh, berarti dugaanku benar. Kalau aku bosan mendengar prosesnya, berarti salah',
    type: 'wawancara', title: 'Wawancara seorang analis data selama satu jam', partner: 1,
    what: 'Aku melihat analis data memakai dasbor dan bertanya banyak soal kebutuhan tim sebelum menyentuh angka.', surprise: 'Ternyata lebih banyak berbicara dengan orang daripada yang kukira.',
  },
  {
    field: 'desainer UX', daily: 'mewawancarai pengguna lalu menggambar alur aplikasi', enjoy: 'Aku menduga akan menikmati bagian menggambar layar karena suka merapikan tampilan',
    test: 'proyek mini mendesain ulang satu layar aplikasi kampus dalam empat jam', signal: 'Kalau aku lupa waktu saat mengerjakannya, dugaanku benar. Kalau aku cepat jenuh, berarti salah',
    type: 'proyek_mini', title: 'Mendesain ulang layar jadwal aplikasi kampus', partner: 2,
    what: 'Aku menggambar tiga versi layar jadwal dan meminta lima teman mencobanya.', surprise: 'Bagian paling seru justru melihat teman bingung, bukan menggambarnya.',
  },
  {
    field: 'guru sekolah dasar', daily: 'menyiapkan materi dan mendampingi anak belajar di kelas', enjoy: 'Aku menduga akan menikmati saat anak paham sesuatu karena aku senang menjelaskan',
    test: 'ikut membantu mengajar satu pagi di sekolah dasar dekat kampus', signal: 'Kalau aku masih bersemangat setelah tiga jam di kelas, dugaanku benar. Kalau lelah sekali dan kesal, berarti salah',
    type: 'bayangan', title: 'Membantu satu pagi di kelas 3 SD', partner: 3,
    what: 'Aku membantu guru kelas tiga membimbing kelompok membaca selama tiga jam.', surprise: 'Mengatur kelas jauh lebih melelahkan daripada menjelaskan materi.',
  },
  {
    field: 'jurnalis', daily: 'mencari narasumber, wawancara, lalu menulis berita', enjoy: 'Aku menduga akan menikmati bagian menulis karena suka merangkai cerita',
    test: 'menulis satu liputan pendek acara kampus lalu meminta editor pers mahasiswa membacanya', signal: 'Kalau aku ingin menulis liputan berikutnya, dugaanku benar. Kalau aku menunda terus, berarti salah',
    type: 'proyek_mini', title: 'Menulis satu liputan acara kampus', partner: 4,
    what: 'Aku meliput diskusi di aula dan menulis 600 kata, lalu editor memberi catatan.', surprise: 'Mengejar narasumber lebih sulit daripada menulisnya.',
  },
  {
    field: 'staf HRD', daily: 'menyaring lamaran dan mengatur wawancara kerja', enjoy: 'Aku menduga akan menikmati bagian bertemu banyak orang karena senang mendengar cerita',
    test: 'wawancara satu staf HRD dan ikut mengamati satu sesi seleksi', signal: 'Kalau aku tertarik dengan cara mereka menilai pelamar, dugaanku benar. Kalau terasa kaku, berarti salah',
    type: 'wawancara', title: 'Wawancara staf HRD perusahaan rintisan', partner: 5,
    what: 'Aku berbincang satu jam dengan staf HRD tentang cara menyaring lamaran.', surprise: 'Banyak pekerjaannya berupa administrasi dan surel.',
  },
  {
    field: 'pemasar digital', daily: 'membuat konten dan membaca angka kampanye media sosial', enjoy: 'Aku menduga akan menikmati membuat konten karena suka bereksperimen dengan ide',
    test: 'membuat tiga unggahan untuk satu UMKM dan melihat hasilnya seminggu', signal: 'Kalau aku penasaran menunggu angkanya, dugaanku benar. Kalau aku tidak peduli hasilnya, berarti salah',
    type: 'proyek_mini', title: 'Tiga unggahan untuk UMKM kopi', partner: 6,
    what: 'Aku membuat tiga unggahan untuk kedai kopi tetangga dan mencatat jangkauannya.', surprise: 'Unggahan paling sederhana justru paling banyak dilihat.',
  },
  {
    field: 'programmer', daily: 'menulis kode dan memperbaiki galat bersama tim', enjoy: 'Aku menduga akan menikmati memecahkan galat karena suka teka-teki',
    test: 'ikut kelas terbuka pemrograman web selama tiga jam', signal: 'Kalau aku tetap mengulik setelah kelas, dugaanku benar. Kalau aku frustrasi dan berhenti, berarti salah',
    type: 'kelas_terbuka', title: 'Kelas terbuka pemrograman web dasar', partner: null,
    what: 'Aku ikut kelas tiga jam dan membuat satu halaman web sederhana.', surprise: 'Aku menikmati bagian mencari kesalahan lebih dari menulis kodenya.',
  },
  {
    field: 'konselor sekolah', daily: 'mendengarkan siswa dan membantu mereka merencanakan studi', enjoy: 'Aku menduga akan menikmati mendengarkan karena teman sering bercerita padaku',
    test: 'wawancara satu guru BK SMA tentang hari kerjanya', signal: 'Kalau aku membayangkan diriku di ruangan itu dengan senang, dugaanku benar. Kalau terasa berat, berarti salah',
    type: 'wawancara', title: 'Wawancara guru BK SMA', partner: 7,
    what: 'Aku mewawancarai guru BK selama satu jam dan melihat ruang konselingnya.', surprise: 'Banyak waktu habis untuk administrasi dan rapat.',
  },
  {
    field: 'peneliti lingkungan', daily: 'mengambil sampel di lapangan dan menulis laporan', enjoy: 'Aku menduga akan menikmati kerja lapangan karena suka berada di luar ruangan',
    test: 'menjadi relawan pengambilan sampel sungai selama satu pagi', signal: 'Kalau aku ingin ikut lagi, dugaanku benar. Kalau aku hanya ingin pulang, berarti salah',
    type: 'relawan', title: 'Relawan pengambilan sampel air sungai', partner: 8,
    what: 'Aku ikut tim mengambil sampel di tiga titik sungai dan mencatat hasilnya.', surprise: 'Bagian mencatat dengan teliti ternyata paling penting dan cukup kusukai.',
  },
];
const DECISION_NOTES = {
  lanjut: 'Aku ingin menguji bidang ini lebih dalam di siklus berikutnya.',
  ubah: 'Aku akan mengubah dugaanku ke bagian pekerjaan yang ternyata lebih kusukai.',
  tinggalkan: 'Aku sudah cukup tahu. Aku akan mencoba bidang lain.',
};
const FIRST = ['Ayu', 'Bagas', 'Citra', 'Dewi', 'Eko', 'Fajar', 'Gita', 'Hana', 'Irfan', 'Joko', 'Kirana', 'Laras', 'Maya', 'Nanda', 'Oki', 'Putri', 'Rizky', 'Salsa', 'Tegar', 'Umi', 'Vina', 'Wahyu', 'Yusuf', 'Zahra', 'Adit', 'Bella', 'Dian', 'Galih', 'Intan', 'Kevin'];
const LAST = ['Saputra', 'Lestari', 'Pratama', 'Rahmawati', 'Hidayat', 'Wulandari', 'Nugroho', 'Kusuma', 'Siregar', 'Hasibuan', 'Setiawan', 'Anggraini', 'Firmansyah', 'Maharani', 'Ramadhan'];

// ---------- Mulai ----------
// --if-empty: jangan menimpa basis data yang sudah ada (dipakai saat start di Render supaya restart tidak menghapus data).
if (process.argv.includes('--if-empty') && existsSync(DB_PATH)) {
  console.log('Basis data sudah ada; seed dilewati.');
  process.exit(0);
}
try {
  if (existsSync(DB_PATH)) for (const suf of ['', '-wal', '-shm']) rmSync(DB_PATH + suf, { force: true });
} catch (err) {
  if (err.code !== 'EPERM' && err.code !== 'EBUSY') throw err;
  console.error('Basis data sedang dipakai server. Hentikan server (npm start) dulu, lalu jalankan npm run seed lagi.');
  process.exit(1);
}
const db = openDb();
const t0 = Date.now();

const insUser = db.prepare('INSERT INTO users (email, name, role, password_hash, code) VALUES (?,?,?,?,?)');
const pw = (p = 'demo1234') => hashPassword(p);
const user = (email, name, role, code = null) => Number(insUser.run(email, name, role, pw(), code).lastInsertRowid);

tx(db, () => {
  user('koordinator@demo.id', 'Dr. Sari Wulandari, M.Pd.', 'koordinator');
  const facs = [
    user('fasilitator@demo.id', 'Nadia Putri', 'fasilitator'),
    user('fasilitator2@demo.id', 'Bima Saputra', 'fasilitator'),
    user('fasilitator3@demo.id', 'Citra Anjani', 'fasilitator'),
    user('fasilitator4@demo.id', 'Dimas Prasetyo', 'fasilitator'),
    user('fasilitator5@demo.id', 'Eka Rahmawati', 'fasilitator'),
  ];
  const [nadia] = facs;

  const partners = [
    ['Kak Reza', 'Analisis data, perusahaan rintisan logistik', 'Wawancara 1 jam lewat daring'],
    ['Studio Rupa Kita', 'Desain produk digital', 'Ulasan satu karya desain'],
    ['SD Negeri Sukamaju 2', 'Pendidikan dasar', 'Membantu satu pagi di kelas'],
    ['Pers Mahasiswa Gema', 'Jurnalistik', 'Editor membaca satu tulisan'],
    ['Bu Lina', 'Sumber daya manusia', 'Wawancara dan pengamatan seleksi'],
    ['Kedai Kopi Senja', 'UMKM kuliner', 'Proyek konten media sosial'],
    ['Pak Hendra', 'Bimbingan dan konseling SMA', 'Wawancara 1 jam'],
    ['Komunitas Sungai Bersih', 'Lingkungan', 'Relawan pengambilan sampel'],
    ['Biro Arsitek Garis', 'Arsitektur', 'Kunjungan studio 2 jam'],
  ];
  const insP = db.prepare('INSERT INTO partners (name, field, offer, active) VALUES (?,?,?,?)');
  partners.forEach((p, i) => insP.run(p[0], p[1], p[2], i === 8 ? 0 : 1));

  const startA = addDays(TODAY, -214);
  const startB = addDays(TODAY, -32);
  const cohortA = Number(db.prepare('INSERT INTO cohorts (name, starts_on, ends_on) VALUES (?,?,?)').run('Rintisan Semester Genap (selesai)', startA, addDays(startA, 42)).lastInsertRowid);
  const cohortB = Number(db.prepare('INSERT INTO cohorts (name, starts_on, ends_on) VALUES (?,?,?)').run('Rintisan Semester Ganjil (berjalan)', startB, addDays(startB, 49)).lastInsertRowid);

  const insEnr = db.prepare('INSERT INTO enrollments (user_id, cohort_id, facilitator_id, status, consent_at, completed_at, created_at) VALUES (?,?,?,?,?,?,?)');
  const insResp = db.prepare('INSERT INTO responses (enrollment_id, instrument, phase, answers, score, created_at) VALUES (?,?,?,?,?,?)');
  const insCycle = db.prepare('INSERT INTO cycles (enrollment_id, n, stage, starts_on, due_on, completed_at) VALUES (?,?,?,?,?,?)');
  const insMsg = db.prepare('INSERT INTO ai_messages (cycle_id, sender, step, text, created_at) VALUES (?,?,?,?,?)');
  const insHyp = db.prepare('INSERT INTO hypotheses (cycle_id, ai_draft, statement, reason, signal, edited, saved_at) VALUES (?,?,?,?,?,?,?)');
  const insExp = db.prepare(
    'INSERT INTO experiments (cycle_id, type, title, partner_id, partner_note, planned_minutes, logged_minutes, status, confirm_token, token_expires_at, confirmed_at, finished_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
  );
  const insRef = db.prepare('INSERT INTO reflections (cycle_id, what_happened, surprise, verdict, ai_summary, summary_final, decision, decision_note, decided_at, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)');
  const insSes = db.prepare('INSERT INTO review_sessions (cycle_id, facilitator_id, slot_at, status, note, summary_checked, completed_at) VALUES (?,?,?,?,?,?,?)');
  const insRun = db.prepare('INSERT INTO ai_runs (cycle_id, kind, prompt_version, provider, latency_ms, passed, fallback_used, reject_reason, edited_by_user, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)');
  const insIssue = db.prepare('INSERT INTO issues (enrollment_id, text, resolved, resolved_at, created_at) VALUES (?,?,?,?,?)');

  // Slot sesi unik per fasilitator.
  const usedSlots = new Set();
  function slotFor(facId, date, future = false) {
    for (let i = 0; i < 40; i++) {
      const d = addDays(date, future ? i : -i);
      const wd = new Date(d + 'T00:00:00Z').getUTCDay();
      if (wd === 0 || wd === 6) continue;
      for (const t of ['09:00', '13:00', '15:30']) {
        const slot = `${d}T${t}:00+07:00`;
        if (future && Date.parse(slot) < Date.now() + 3600e3) continue;
        const k = facId + slot;
        if (!usedSlots.has(k)) { usedSlots.add(k); return slot; }
      }
    }
    throw new Error('slot habis');
  }

  function answers(n, base) {
    return Array.from({ length: n }, () => clamp(Math.round(base + (rnd() - 0.5) * 1.6)));
  }
  const mean = (a) => Math.round((a.reduce((x, y) => x + y, 0) / a.length) * 100) / 100;
  function respond(enr, phase, adaptBase, efBase, date) {
    const a = answers(INSTRUMENTS.adaptabilitas.items.length, adaptBase);
    const e = answers(INSTRUMENTS.efikasi.items.length, efBase);
    insResp.run(enr, 'adaptabilitas', phase, JSON.stringify(a), mean(a), iso(date));
    insResp.run(enr, 'efikasi', phase, JSON.stringify(e), mean(e), iso(date));
  }

  /**
   * Isi satu siklus sampai langkah tertentu.
   * step: 0 dugaan kosong, 1 sedang tanya-jawab, 2 uji direncanakan, 3 tinjau (refleksi), 4 sesi terjadwal,
   *       5 sesi selesai belum diputuskan, 6 selesai
   */
  function fillCycle(cycleId, story, step, facId, dates, opts = {}) {
    const { start, due } = dates;
    const a = [story.field, story.daily, story.enjoy, story.test, story.signal];
    if (step >= 1) {
      const nAns = step === 1 ? between(1, 4) : 5;
      insMsg.run(cycleId, 'ai', 1, `${INTRO} ${SCRIPT[0]}`, iso(start));
      for (let i = 0; i < nAns; i++) {
        insMsg.run(cycleId, 'peserta', i + 1, a[i], iso(start));
        if (i + 1 < 5 && (i + 1 < nAns || step === 1)) insMsg.run(cycleId, 'ai', i + 2, SCRIPT[i + 1], iso(start));
      }
    }
    if (step < 2) return;
    const draft = {
      statement: `Aku penasaran dengan ${story.field}. Kuduga sehari-harinya ${story.daily}. Aku akan mengujinya lewat ${story.test}.`,
      reason: story.enjoy + '.',
      signal: story.signal + '.',
    };
    const fb = rnd() < 0.04;
    const edited = opts.edited ?? rnd() < 0.4;
    const statement = edited ? `Aku menduga aku akan menikmati pekerjaan ${story.field}, terutama ${story.enjoy.split(' ').slice(3, 9).join(' ')}. Aku mengujinya lewat ${story.test}.` : draft.statement;
    insHyp.run(cycleId, JSON.stringify(draft), statement, draft.reason, draft.signal, edited ? 1 : 0, iso(start, '11:00'));
    insRun.run(cycleId, 'draft', PROMPT_VERSION, 'mock', between(4, 38), fb ? 0 : 1, fb ? 1 : 0, fb ? pick(['tidak_berpijak', 'lebih_dari_80_kata']) : null, edited ? 1 : 0, iso(start, '11:00'));

    const planned = opts.planned ?? pick([60, 90, 120, 180, 240]);
    const finished = step >= 3;
    const logged = opts.logged ?? (finished ? Math.min(360, planned + between(-30, 30)) : between(0, 40));
    const confirmed = finished && rnd() < 0.65 ? iso(addDays(start, 5)) : null;
    insExp.run(cycleId, story.type, story.title, opts.partner ?? story.partner, '', planned, Math.max(finished ? 15 : 0, logged), 'direncanakan', token(16), new Date(Date.parse(iso(start)) + 30 * 86400e3).toISOString(), confirmed, null);
    if (finished) db.prepare("UPDATE experiments SET status = 'selesai', finished_at = ? WHERE cycle_id = ?").run(iso(addDays(start, 7)), cycleId);
    if (step < 3) return;

    const verdict = pick(['terbukti', 'sebagian', 'sebagian', 'tidak']);
    const vLabel = { terbukti: 'terbukti', sebagian: 'terbukti sebagian', tidak: 'tidak terbukti' }[verdict];
    const summary = `Dugaanmu: aku penasaran dengan ${story.field}. Yang terjadi: ${story.what.charAt(0).toLowerCase() + story.what.slice(1, -1)}. Yang mengejutkan: ${story.surprise.charAt(0).toLowerCase() + story.surprise.slice(1, -1)}. Menurut penilaianmu sendiri, dugaan ini ${vLabel}.`;
    const sEdited = rnd() < 0.3;
    const final = sEdited ? summary + ' Aku juga ingin tahu bagaimana rasanya bekerja penuh waktu di bidang ini.' : summary;
    const decision = step >= 6 ? opts.decision ?? pick(['lanjut', 'ubah', 'ubah', 'tinggalkan']) : null;
    insRef.run(cycleId, story.what, story.surprise, verdict, summary, final, decision, decision ? DECISION_NOTES[decision] : null, decision ? iso(due, '16:00') : null, iso(addDays(start, 8)));
    insRun.run(cycleId, 'summary', PROMPT_VERSION, 'mock', between(3, 30), 1, 0, null, sEdited ? 1 : 0, iso(addDays(start, 8)));
    if (step < 4 || !facId) return;

    const future = step === 4 && !opts.pastSession;
    const pastBase = addDays(start, 11) < TODAY ? addDays(start, 11) : addDays(TODAY, -1);
    const slot = opts.slot ?? slotFor(facId, future ? addDays(TODAY, 1) : pastBase, future);
    const done = step >= 5;
    insSes.run(cycleId, facId, slot, done ? 'selesai' : 'terjadwal', done ? 'Peserta menceritakan temuannya dan membandingkan dengan dugaan awal. Disepakati langkah berikutnya.' : null, done && rnd() < 0.85 ? 1 : 0, done ? slot : null);
  }

  // ---------- Kohort A: selesai ----------
  let codeNo = 0;
  const nextCode = () => `P-${String(++codeNo).padStart(3, '0')}`;
  const otherFacs = facs.slice(1);
  for (let i = 0; i < 30; i++) {
    const name = `${FIRST[i % FIRST.length]} ${LAST[(i * 7) % LAST.length]}`;
    const code = nextCode();
    const uid = user(`peserta${String(codeNo).padStart(2, '0')}@demo.id`, name, 'peserta', code);
    const fac = otherFacs[i % otherFacs.length];
    const finishedAll = i >= 3; // 27 dari 30 menuntaskan
    const status = finishedAll ? 'selesai' : 'aktif';
    const pretesDate = addDays(startA, between(0, 3));
    const enr = Number(insEnr.run(uid, cohortA, fac, status, iso(pretesDate, '08:00'), finishedAll ? iso(addDays(pretesDate, 43)) : null, iso(startA)).lastInsertRowid);
    const pre = 2.6 + rnd() * 0.9;
    const preE = 2.7 + rnd() * 0.8;
    respond(enr, 'pretes', pre, preE, pretesDate);
    const stuckAt = finishedAll ? 4 : between(2, 3);
    for (let n = 1; n <= 3; n++) {
      const start = addDays(pretesDate, (n - 1) * 14);
      const due = addDays(pretesDate, n * 14);
      const done = n < stuckAt;
      const cid = Number(insCycle.run(enr, n, done ? 'selesai' : n === stuckAt ? 'uji' : 'dugaan', start, due, done ? iso(due, '16:00') : null).lastInsertRowid);
      fillCycle(cid, STORIES[(i + n) % STORIES.length], done ? 6 : n === stuckAt ? 2 : 0, fac, { start, due });
    }
    if (finishedAll) {
      const up = rnd() < 0.85 ? 0.5 + rnd() * 0.6 : -0.3;
      const upE = rnd() < 0.8 ? 0.4 + rnd() * 0.6 : -0.2;
      respond(enr, 'postes', pre + up, preE + upE, addDays(pretesDate, 43));
      if (i < 27) respond(enr, 'tindak_lanjut', pre + up - 0.15, preE + upE - 0.1, addDays(pretesDate, 133));
    }
  }

  // ---------- Kohort B: berjalan ----------
  // Rencana kelompok Nadia (20 peserta) termasuk tiga akun demo, lalu peserta lain di fasilitator 2 sampai 5.
  const demo = {};
  function participantB({ email, name, fac, plan, story }) {
    const code = nextCode();
    const uid = user(email ?? `peserta${String(codeNo).padStart(2, '0')}@demo.id`, name ?? `${FIRST[(codeNo * 3) % FIRST.length]} ${LAST[(codeNo * 5) % LAST.length]}`, 'peserta', code);
    const pretesDate = plan.pretesDate ?? addDays(startB, between(0, 4));
    const consent = plan.kind !== 'baru';
    const status = plan.kind === 'baru' || plan.kind === 'setuju' ? 'terdaftar' : 'aktif';
    const enr = Number(insEnr.run(uid, cohortB, fac, status, consent ? iso(pretesDate, '08:00') : null, null, iso(startB)).lastInsertRowid);
    if (status === 'terdaftar') return { uid, enr, code };
    respond(enr, 'pretes', 2.6 + rnd() * 0.9, 2.7 + rnd() * 0.8, pretesDate);
    const ids = [];
    for (let n = 1; n <= 3; n++) {
      const start = addDays(pretesDate, (n - 1) * 14);
      const due = addDays(pretesDate, n * 14);
      const step = n < plan.cycle ? 6 : n === plan.cycle ? plan.step : 0;
      const stage = step >= 6 ? 'selesai' : step >= 3 ? 'tinjau' : step >= 2 ? 'uji' : 'dugaan';
      const cid = Number(insCycle.run(enr, n, stage, start, due, step >= 6 ? iso(due, '16:00') : null).lastInsertRowid);
      ids.push(cid);
      const st = n === plan.cycle && story ? story : STORIES[(codeNo + n) % STORIES.length];
      fillCycle(cid, st, step, fac, { start, due }, n === plan.cycle ? plan.opts ?? {} : n < plan.cycle ? { decision: plan.prevDecision } : {});
    }
    return { uid, enr, code, cycles: ids };
  }

  // Akun demo
  demo.raka = participantB({ email: 'raka@demo.id', name: 'Raka Pratama', fac: nadia, plan: { kind: 'baru' } });
  demo.dinda = participantB({
    email: 'dinda@demo.id', name: 'Dinda Maharani', fac: nadia,
    plan: { cycle: 1, step: 2, pretesDate: addDays(TODAY, -4), opts: { planned: 120, logged: 45, partner: 1, edited: true } },
    story: {
      ...STORIES[0], title: 'Wawancara seorang analis data selama satu jam',
    },
  });
  db.prepare('UPDATE hypotheses SET statement = ? WHERE cycle_id = ?').run('Aku menduga aku akan menikmati mencari pola dalam data penjualan karena suka menebak penyebab sesuatu.', demo.dinda.cycles[0]);
  demo.fikri = participantB({
    email: 'fikri@demo.id', name: 'Fikri Ramadhan', fac: nadia,
    plan: { cycle: 2, step: 4, pretesDate: addDays(TODAY, -20), prevDecision: 'ubah' },
    story: STORIES[1],
  });
  insIssue.run(demo.fikri.enr, 'Mitra wawancaraku membatalkan jadwal dua kali. Aku bingung mencari pengganti sebelum tenggat siklus.', 0, null, iso(addDays(TODAY, -1)));

  // Sisa kelompok Nadia: variasi tahap supaya layar fasilitator hidup.
  const nadiaPlans = [
    { cycle: 1, step: 1 }, { cycle: 1, step: 2 }, { cycle: 1, step: 3 }, { cycle: 1, step: 4, opts: { pastSession: true } },
    { cycle: 1, step: 5 }, { cycle: 2, step: 1 }, { cycle: 2, step: 2 }, { cycle: 2, step: 2 }, { cycle: 2, step: 3 },
    { cycle: 2, step: 4 }, { cycle: 2, step: 5 }, { cycle: 3, step: 1 }, { cycle: 3, step: 2 }, { cycle: 1, step: 2 },
    { kind: 'setuju' }, { cycle: 2, step: 2 }, { cycle: 1, step: 3 },
  ];
  for (const p of nadiaPlans) {
    if (p.cycle && p.cycle >= 2) p.pretesDate = addDays(TODAY, -(p.cycle - 1) * 14 - between(2, 9));
    else if (p.cycle) p.pretesDate = addDays(TODAY, -between(2, 10));
    const r = participantB({ fac: nadia, plan: p });
    if (rnd() < 0.2 && r.cycles) insIssue.run(r.enr, pick(['Jadwal kuliah praktikum bentrok dengan jam mitra.', 'Aku belum menemukan mitra yang mau diwawancara.']), 0, null, iso(addDays(TODAY, -between(1, 5))));
  }

  // Fasilitator lain: 39 peserta, empat di antaranya belum ditugaskan.
  for (let i = 0; i < 39; i++) {
    const unassigned = i >= 35;
    const fac = unassigned ? null : otherFacs[i % otherFacs.length];
    const r = rnd();
    let plan;
    if (unassigned) plan = { kind: i % 2 ? 'baru' : 'setuju' };
    else if (r < 0.08) plan = { kind: 'setuju' };
    else if (r < 0.4) plan = { cycle: 1, step: between(1, 5), pretesDate: addDays(TODAY, -between(3, 12)) };
    else if (r < 0.85) plan = { cycle: 2, step: between(1, 5), pretesDate: addDays(TODAY, -between(16, 26)) };
    else plan = { cycle: 3, step: between(1, 3), pretesDate: addDays(TODAY, -between(29, 32)) };
    if (plan.step >= 4 && !fac) plan.step = 3;
    const res = participantB({ fac, plan });
    if (res.cycles && rnd() < 0.15) insIssue.run(res.enr, 'Laptopku rusak, jadi catatan percobaan tertunda beberapa hari.', rnd() < 0.5 ? 1 : 0, null, iso(addDays(TODAY, -between(1, 9))));
  }

  // Log akses awal
  const insAudit = db.prepare('INSERT INTO audit_log (actor_id, actor_label, action, target, created_at) VALUES (?,?,?,?,?)');
  insAudit.run(nadia, 'Nadia Putri (fasilitator)', 'lihat_detail_peserta', demo.fikri.code, iso(addDays(TODAY, -1), '14:10'));
  insAudit.run(nadia, 'Nadia Putri (fasilitator)', 'tutup_sesi', 'P-034', iso(addDays(TODAY, -2), '09:40'));
  insAudit.run(facs[1], 'Bima Saputra (fasilitator)', 'lihat_daftar_kelompok', '10 peserta', iso(addDays(TODAY, -2), '08:15'));
  console.log(`Data simulasi dibuat dalam ${((Date.now() - t0) / 1000).toFixed(1)} detik.`);
});

const count = (t) => db.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n;
console.log(`Akun: ${count('users')}, peserta: ${count('enrollments')}, siklus: ${count('cycles')}, proses AI: ${count('ai_runs')}`);
console.log('Kata sandi semua akun demo: demo1234');
db.close();
