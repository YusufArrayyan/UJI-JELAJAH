import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';
import { isoAddDays, token } from './util.js';

const KEYLEN = 64;
export const SESSION_DAYS = 7;
export const COOKIE = 'uj_sesi';

export function hashPassword(pw) {
  const salt = randomBytes(16).toString('hex');
  return `scrypt$${salt}$${scryptSync(pw, salt, KEYLEN).toString('hex')}`;
}
export function verifyPassword(pw, stored) {
  const [alg, salt, hex] = String(stored).split('$');
  if (alg !== 'scrypt' || !salt || !hex) return false;
  const a = Buffer.from(hex, 'hex');
  const b = scryptSync(String(pw), salt, KEYLEN);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function createSession(db, userId) {
  const t = token(24); // 48 heksadesimal
  db.prepare('INSERT INTO auth_sessions (token, user_id, expires_at) VALUES (?,?,?)').run(t, userId, isoAddDays(SESSION_DAYS));
  return t;
}
export function sessionUser(db, t) {
  if (!t || !/^[a-f0-9]{48}$/.test(t)) return null;
  const row = db
    .prepare('SELECT u.id, u.email, u.name, u.role, u.code, s.expires_at FROM auth_sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?')
    .get(t);
  if (!row) return null;
  if (row.expires_at < new Date().toISOString()) {
    db.prepare('DELETE FROM auth_sessions WHERE token = ?').run(t);
    return null;
  }
  return { id: row.id, email: row.email, name: row.name, role: row.role, code: row.code };
}
export const destroySession = (db, t) => db.prepare('DELETE FROM auth_sessions WHERE token = ?').run(t ?? '');

export function cookieHeader(value, maxAgeSec, secure) {
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure ? '; Secure' : ''}`;
}
export function readCookie(req) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === COOKIE) return v.join('=');
  }
  return null;
}

/**
 * Pembatas laju jendela geser: maksimal `limit` kejadian per `windowMs` per kunci.
 * blocked() hanya memeriksa; hit() mencatat; reset() menghapus (misalnya setelah masuk berhasil).
 */
export function rateLimiter(limit = 8, windowMs = 5 * 60e3) {
  const hits = new Map();
  const recent = (key, now) => (hits.get(key) || []).filter((t) => now - t < windowMs);
  return {
    blocked(key) {
      const now = Date.now();
      const list = recent(key, now);
      return list.length >= limit ? { retryAfterSec: Math.ceil((windowMs - (now - list[0])) / 1000) } : null;
    },
    hit(key) {
      const now = Date.now();
      const list = recent(key, now);
      list.push(now);
      hits.set(key, list);
      if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
    },
    reset(key) {
      hits.delete(key);
    },
  };
}
