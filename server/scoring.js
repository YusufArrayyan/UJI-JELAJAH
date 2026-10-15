// Penskoran instrumen dan indikator K1 sampai K5 dengan k-anonimitas.
import { INSTRUMENTS } from './instruments.js';
import { HttpError, wibDate } from './util.js';

export const K_MIN = 10;

/** Validasi jawaban dan hitung skor rerata 1 sampai 5. */
export function scoreAnswers(instrumentKey, answers) {
  const inst = INSTRUMENTS[instrumentKey];
  if (!inst) throw new HttpError(400, 'Instrumen tidak dikenal. Muat ulang halaman, lalu coba lagi.');
  if (!Array.isArray(answers) || answers.length !== inst.items.length) {
    throw new HttpError(400, `Semua ${inst.items.length} butir ${inst.title.toLowerCase()} wajib dijawab. Lengkapi butir yang masih kosong.`);
  }
  for (const a of answers) {
    if (!Number.isInteger(a) || a < 1 || a > 5) {
      throw new HttpError(400, 'Jawaban harus berupa pilihan 1 sampai 5. Pilih salah satu pilihan di setiap butir.');
    }
  }
  return Math.round((answers.reduce((s, a) => s + a, 0) / answers.length) * 100) / 100;
}

const pct = (num, den) => (den ? Math.round((num / den) * 1000) / 10 : null);
const mean = (xs) => (xs.length ? Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 100) / 100 : null);

function indicator(code, label, num, den, target) {
  const hidden = den < K_MIN;
  const value = hidden ? null : pct(num, den);
  return { code, label, num: hidden ? null : num, den: hidden ? null : den, value, hidden, target, met: hidden ? null : value >= target };
}

/**
 * rows: satu objek per peserta:
 * { cycle3Due, cyclesDone, pre:{adaptabilitas,efikasi}, post:{...}, follow:{adaptabilitas}, sessionsDone, sessionsDecided }
 */
export function computeKpis(rows, today = wibDate()) {
  const k1Pool = rows.filter((r) => r.cycle3Due && r.cycle3Due < today);
  const k1 = indicator('K1', 'Penyelesaian program', k1Pool.filter((r) => r.cyclesDone >= 3).length, k1Pool.length, 70);

  const k2Pool = rows.filter((r) => r.pre.adaptabilitas != null && r.post.adaptabilitas != null);
  const k2 = indicator('K2', 'Adaptabilitas karier naik', k2Pool.filter((r) => r.post.adaptabilitas > r.pre.adaptabilitas).length, k2Pool.length, 60);

  const k3Pool = rows.filter((r) => r.pre.efikasi != null && r.post.efikasi != null);
  const k3 = indicator('K3', 'Efikasi keputusan karier naik', k3Pool.filter((r) => r.post.efikasi > r.pre.efikasi).length, k3Pool.length, 60);

  const k4Pool = rows.filter((r) => r.sessionsDone > 0);
  const k4 = indicator('K4', 'Keputusan berbasis percobaan', k4Pool.filter((r) => r.sessionsDecided >= r.sessionsDone).length, k4Pool.length, 80);

  const k5Pool = rows.filter((r) => r.follow.adaptabilitas != null && r.pre.adaptabilitas != null);
  const k5Hidden = k5Pool.length < K_MIN;
  const followMean = mean(k5Pool.map((r) => r.follow.adaptabilitas));
  const preMean = mean(k5Pool.map((r) => r.pre.adaptabilitas));
  const k5 = {
    code: 'K5',
    label: 'Ketahanan efek',
    hidden: k5Hidden,
    n: k5Hidden ? null : k5Pool.length,
    followMean: k5Hidden ? null : followMean,
    preMean: k5Hidden ? null : preMean,
    met: k5Hidden ? null : followMean > preMean,
  };
  return { k1, k2, k3, k4, k5 };
}

/** Ambil baris indikator dari basis data. cohortId null = semua kohort. */
export function loadKpiRows(db, cohortId = null) {
  const enr = db
    .prepare(
      `SELECT e.id, e.status, e.cohort_id,
        (SELECT due_on FROM cycles c WHERE c.enrollment_id = e.id AND c.n = 3) AS cycle3Due,
        (SELECT COUNT(*) FROM cycles c WHERE c.enrollment_id = e.id AND c.stage = 'selesai') AS cyclesDone,
        (SELECT COUNT(*) FROM review_sessions s JOIN cycles c ON c.id = s.cycle_id WHERE c.enrollment_id = e.id AND s.status = 'selesai') AS sessionsDone,
        (SELECT COUNT(*) FROM review_sessions s JOIN cycles c ON c.id = s.cycle_id JOIN reflections r ON r.cycle_id = c.id
           WHERE c.enrollment_id = e.id AND s.status = 'selesai' AND r.decision IS NOT NULL) AS sessionsDecided
       FROM enrollments e JOIN users u ON u.id = e.user_id
       WHERE e.consent_at IS NOT NULL AND (? IS NULL OR e.cohort_id = ?)`,
    )
    .all(cohortId, cohortId);
  const resp = db.prepare('SELECT enrollment_id, instrument, phase, score FROM responses').all();
  const byEnr = new Map();
  for (const r of resp) {
    if (!byEnr.has(r.enrollment_id)) byEnr.set(r.enrollment_id, []);
    byEnr.get(r.enrollment_id).push(r);
  }
  return enr.map((e) => {
    const rs = byEnr.get(e.id) || [];
    const get = (inst, ph) => rs.find((r) => r.instrument === inst && r.phase === ph)?.score ?? null;
    return {
      ...e,
      pre: { adaptabilitas: get('adaptabilitas', 'pretes'), efikasi: get('efikasi', 'pretes') },
      post: { adaptabilitas: get('adaptabilitas', 'postes'), efikasi: get('efikasi', 'postes') },
      follow: { adaptabilitas: get('adaptabilitas', 'tindak_lanjut') },
    };
  });
}

/** Sebaran tahap; sel di bawah K_MIN disembunyikan. */
export function stageDistribution(db, cohortId = null) {
  const rows = db
    .prepare(
      `SELECT e.status,
        (SELECT MIN(n) FROM cycles c WHERE c.enrollment_id = e.id AND c.stage != 'selesai') AS cur
       FROM enrollments e WHERE (? IS NULL OR e.cohort_id = ?)`,
    )
    .all(cohortId, cohortId);
  const buckets = { Terdaftar: 0, 'Siklus 1': 0, 'Siklus 2': 0, 'Siklus 3': 0, Postes: 0, Selesai: 0 };
  for (const r of rows) {
    if (r.status === 'terdaftar') buckets.Terdaftar++;
    else if (r.status === 'aktif') buckets[`Siklus ${r.cur ?? 3}`]++;
    else if (r.status === 'postes') buckets.Postes++;
    else buckets.Selesai++;
  }
  return Object.entries(buckets).map(([label, n]) => ({ label, n: n < K_MIN ? null : n }));
}
