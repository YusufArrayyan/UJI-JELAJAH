// Basis data SQLite lewat node:sqlite (bawaan Node 22+). Tanpa dependensi npm.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export const DB_PATH = resolve(process.env.DB_PATH || 'data/uji-jelajah.db');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('peserta','fasilitator','koordinator')),
  password_hash TEXT NOT NULL,
  code TEXT UNIQUE,
  is_demo INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS cohorts (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  starts_on TEXT NOT NULL,
  ends_on TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'simulasi' CHECK (kind IN ('simulasi','juri')),
  facilitator_id INTEGER REFERENCES users(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS enrollments (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  cohort_id INTEGER NOT NULL REFERENCES cohorts(id),
  facilitator_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'terdaftar' CHECK (status IN ('terdaftar','aktif','postes','selesai')),
  consent_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS cycles (
  id INTEGER PRIMARY KEY,
  enrollment_id INTEGER NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
  n INTEGER NOT NULL CHECK (n BETWEEN 1 AND 3),
  stage TEXT NOT NULL DEFAULT 'dugaan' CHECK (stage IN ('dugaan','uji','tinjau','selesai')),
  starts_on TEXT NOT NULL,
  due_on TEXT NOT NULL,
  completed_at TEXT,
  UNIQUE (enrollment_id, n)
);
CREATE TABLE IF NOT EXISTS responses (
  id INTEGER PRIMARY KEY,
  enrollment_id INTEGER NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
  instrument TEXT NOT NULL CHECK (instrument IN ('adaptabilitas','efikasi')),
  phase TEXT NOT NULL CHECK (phase IN ('pretes','postes','tindak_lanjut')),
  answers TEXT NOT NULL,
  score REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (enrollment_id, instrument, phase)
);
CREATE TABLE IF NOT EXISTS hypotheses (
  id INTEGER PRIMARY KEY,
  cycle_id INTEGER NOT NULL UNIQUE REFERENCES cycles(id) ON DELETE CASCADE,
  ai_draft TEXT,
  statement TEXT,
  reason TEXT,
  signal TEXT,
  edited INTEGER NOT NULL DEFAULT 0,
  saved_at TEXT
);
CREATE TABLE IF NOT EXISTS partners (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  field TEXT NOT NULL,
  offer TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS experiments (
  id INTEGER PRIMARY KEY,
  cycle_id INTEGER NOT NULL UNIQUE REFERENCES cycles(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  partner_id INTEGER REFERENCES partners(id) ON DELETE SET NULL,
  partner_note TEXT NOT NULL DEFAULT '',
  planned_minutes INTEGER NOT NULL,
  logged_minutes INTEGER NOT NULL DEFAULT 0 CHECK (logged_minutes BETWEEN 0 AND 360),
  timer_started_at TEXT,
  status TEXT NOT NULL DEFAULT 'direncanakan' CHECK (status IN ('direncanakan','berjalan','selesai')),
  confirm_token TEXT UNIQUE,
  token_expires_at TEXT,
  confirmed_at TEXT,
  finished_at TEXT
);
CREATE TABLE IF NOT EXISTS reflections (
  id INTEGER PRIMARY KEY,
  cycle_id INTEGER NOT NULL UNIQUE REFERENCES cycles(id) ON DELETE CASCADE,
  what_happened TEXT NOT NULL,
  surprise TEXT NOT NULL DEFAULT '',
  verdict TEXT NOT NULL CHECK (verdict IN ('terbukti','sebagian','tidak')),
  ai_summary TEXT,
  summary_final TEXT,
  decision TEXT CHECK (decision IN ('lanjut','ubah','tinggalkan')),
  decision_note TEXT,
  decided_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS review_sessions (
  id INTEGER PRIMARY KEY,
  cycle_id INTEGER NOT NULL UNIQUE REFERENCES cycles(id) ON DELETE CASCADE,
  facilitator_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slot_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'terjadwal' CHECK (status IN ('terjadwal','selesai')),
  note TEXT,
  summary_checked INTEGER NOT NULL DEFAULT 0,
  completed_at TEXT,
  UNIQUE (facilitator_id, slot_at)
);
CREATE TABLE IF NOT EXISTS ai_messages (
  id INTEGER PRIMARY KEY,
  cycle_id INTEGER NOT NULL REFERENCES cycles(id) ON DELETE CASCADE,
  sender TEXT NOT NULL CHECK (sender IN ('ai','peserta')),
  step INTEGER NOT NULL,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS ai_runs (
  id INTEGER PRIMARY KEY,
  cycle_id INTEGER REFERENCES cycles(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('draft','summary')),
  prompt_version TEXT NOT NULL,
  provider TEXT NOT NULL,
  latency_ms INTEGER NOT NULL,
  passed INTEGER NOT NULL,
  fallback_used INTEGER NOT NULL,
  reject_reason TEXT,
  edited_by_user INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS issues (
  id INTEGER PRIMARY KEY,
  enrollment_id INTEGER NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  resolved INTEGER NOT NULL DEFAULT 0,
  resolved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY,
  actor_id INTEGER,
  actor_label TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS auth_sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_enr_fac ON enrollments(facilitator_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_ci ON users(lower(email));
CREATE INDEX IF NOT EXISTS idx_cycles_enr ON cycles(enrollment_id);
CREATE INDEX IF NOT EXISTS idx_msgs_cycle ON ai_messages(cycle_id);
CREATE INDEX IF NOT EXISTS idx_issues_enr ON issues(enrollment_id);
`;

export function openDb(path = DB_PATH) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  if (path !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;');
  migrate(db);
  db.exec(SCHEMA);
  return db;
}

/**
 * Basis data lama (misalnya disk Render) dibuat sebelum v1.2: tambahkan kolom baru. Semua akun lama berasal
 * dari seed, jadi is_demo bawaan 1; akun dari pendaftaran mandiri ditulis is_demo = 0.
 */
function migrate(db) {
  const cols = (t) => db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);
  const users = cols('users');
  if (users.length && !users.includes('is_demo')) db.exec('ALTER TABLE users ADD COLUMN is_demo INTEGER NOT NULL DEFAULT 1');
  const cohorts = cols('cohorts');
  if (cohorts.length && !cohorts.includes('kind')) db.exec("ALTER TABLE cohorts ADD COLUMN kind TEXT NOT NULL DEFAULT 'simulasi' CHECK (kind IN ('simulasi','juri'))");
  if (cohorts.length && !cohorts.includes('facilitator_id')) db.exec('ALTER TABLE cohorts ADD COLUMN facilitator_id INTEGER REFERENCES users(id) ON DELETE SET NULL');
}

/** Jalankan fn di dalam transaksi; batalkan bila galat. */
export function tx(db, fn) {
  db.exec('BEGIN');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
