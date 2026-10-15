import { randomBytes } from 'node:crypto';

/** Galat aturan bisnis dengan kode status HTTP dan pesan "apa yang terjadi + cara memperbaiki". */
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
export const bad = (msg) => new HttpError(400, msg);
export const forbidden = (msg = 'Halaman ini bukan untuk peranmu. Kembali ke beranda.') => new HttpError(403, msg);
export const notFound = (msg = 'Data tidak ditemukan. Muat ulang halaman, lalu coba lagi.') => new HttpError(404, msg);

export const token = (bytes = 24) => randomBytes(bytes).toString('hex');

export const nowIso = () => new Date().toISOString();

/** Tanggal (YYYY-MM-DD) dalam zona WIB. */
export function wibDate(d = new Date()) {
  return new Date(d.getTime() + 7 * 3600e3).toISOString().slice(0, 10);
}
export function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function isoAddDays(n, from = new Date()) {
  return new Date(from.getTime() + n * 86400e3).toISOString();
}

export const str = (v, max = 2000) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
export const int = (v) => (Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : NaN);
export const wordCount = (s) => (s.trim() ? s.trim().split(/\s+/).length : 0);
