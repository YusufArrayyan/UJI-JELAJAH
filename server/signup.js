// Pendaftaran mandiri (v1.2): akun asli untuk juri lomba. Peran selalu peserta, kohort "Uji coba juri".
import { hashPassword } from './auth.js';
import { HttpError, bad, wibDate, addDays } from './util.js';
import { tx } from './db.js';

export const JURY_COHORT = 'Uji coba juri';
export const MIN_PASSWORD = 8;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const COMMON = new Set(['12345678', '123456789', '1234567890', '87654321', 'password', 'password1', 'katasandi', 'qwertyui', 'qwerty123', '11111111', '00000000', 'abcdefgh', 'demo1234', 'ujijelajah']);

// Satu pesan untuk email yang sudah dipakai: tidak menyatakan email itu terdaftar.
export const SIGNUP_REJECTED = 'Pendaftaran dengan data ini belum bisa diproses. Bila kamu pernah mendaftar, masuk lewat halaman Masuk; bila tidak, coba email lain.';

/** Periksa isian daftar. Mengembalikan data bersih atau melempar 400 dengan pesan per isian. */
export function validateSignup(body = {}) {
  const name = typeof body.name === 'string' ? body.name.trim().replace(/\s+/g, ' ') : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const password2 = typeof body.password2 === 'string' ? body.password2 : '';
  if (name.length < 2 || name.length > 80) throw fieldError('name', 'Tulis nama lengkapmu, 2 sampai 80 karakter.');
  if (email.length > 200 || !EMAIL_RE.test(email)) throw fieldError('email', 'Tulis email yang valid, misalnya nama@kampus.ac.id.');
  if (password.length < MIN_PASSWORD) throw fieldError('password', `Kata sandi minimal ${MIN_PASSWORD} karakter. Tambah panjangnya, lalu coba lagi.`);
  if (password.length > 200) throw fieldError('password', 'Kata sandi paling panjang 200 karakter.');
  if (COMMON.has(password.toLowerCase()) || /^(.)\1+$/.test(password) || password.toLowerCase() === email) {
    throw fieldError('password', 'Kata sandi ini terlalu mudah ditebak. Pakai gabungan kata atau angka yang tidak umum.');
  }
  if (password2 !== password) throw fieldError('password2', 'Ulangan kata sandi belum sama. Ketik ulang kata sandi yang sama.');
  return { name, email, password };
}

function fieldError(field, msg) {
  const err = bad(msg);
  err.field = field;
  return err;
}

/**
 * Kohort juri dibuat saat pendaftar pertama datang (juga untuk basis data lama). Fasilitatornya dipilih sekali,
 * yaitu fasilitator dengan peserta aktif paling sedikit, lalu dipakai untuk semua akun juri.
 */
export function juryCohort(db) {
  let c = db.prepare("SELECT * FROM cohorts WHERE kind = 'juri' ORDER BY id LIMIT 1").get();
  if (!c) {
    const today = wibDate();
    const id = Number(db.prepare("INSERT INTO cohorts (name, starts_on, ends_on, kind) VALUES (?,?,?,'juri')").run(JURY_COHORT, today, addDays(today, 42)).lastInsertRowid);
    c = db.prepare('SELECT * FROM cohorts WHERE id = ?').get(id);
  }
  if (!c.facilitator_id || !db.prepare("SELECT 1 FROM users WHERE id = ? AND role = 'fasilitator'").get(c.facilitator_id)) {
    const f = db
      .prepare(
        `SELECT u.id FROM users u WHERE u.role = 'fasilitator'
         ORDER BY (SELECT COUNT(*) FROM enrollments e WHERE e.facilitator_id = u.id AND e.status != 'selesai'), u.id LIMIT 1`,
      )
      .get();
    db.prepare('UPDATE cohorts SET facilitator_id = ? WHERE id = ?').run(f?.id ?? null, c.id);
    c.facilitator_id = f?.id ?? null;
  }
  return c;
}

function nextJuryCode(db) {
  const last = db.prepare("SELECT code FROM users WHERE code LIKE 'J-%' ORDER BY CAST(substr(code, 3) AS INTEGER) DESC LIMIT 1").get();
  return `J-${String((last ? Number(last.code.slice(2)) : 0) + 1).padStart(3, '0')}`;
}

/** Buat akun peserta asli (is_demo = 0) beserta pendaftarannya. Mengembalikan baris pengguna. */
export function registerParticipant(db, input) {
  const { name, email, password } = validateSignup(input);
  // Hash dihitung sebelum memeriksa email supaya waktu tanggap email lama dan baru tidak berbeda.
  const hash = hashPassword(password);
  return tx(db, () => {
    if (db.prepare('SELECT 1 FROM users WHERE lower(email) = ?').get(email)) throw new HttpError(400, SIGNUP_REJECTED);
    const cohort = juryCohort(db);
    const code = nextJuryCode(db);
    const uid = Number(db.prepare("INSERT INTO users (email, name, role, password_hash, code, is_demo) VALUES (?,?,'peserta',?,?,0)").run(email, name, hash, code).lastInsertRowid);
    db.prepare('INSERT INTO enrollments (user_id, cohort_id, facilitator_id) VALUES (?,?,?)').run(uid, cohort.id, cohort.facilitator_id);
    return db.prepare('SELECT id, email, name, role, code, is_demo FROM users WHERE id = ?').get(uid);
  });
}
