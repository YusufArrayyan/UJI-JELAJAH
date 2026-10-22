// Satu proses Node: berkas statis + API JSON. Tanpa dependensi npm.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { match } from './routes.js';
import { readCookie, sessionUser } from './auth.js';
import { HttpError } from './util.js';

const ROOT = resolve(fileURLToPath(new URL('../public', import.meta.url)));
const MAX_BODY = 100 * 1024;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.woff2': 'font/woff2', '.webm': 'video/webm', '.vtt': 'text/vtt; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
};
const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

// X-Forwarded-For hanya dipercaya di balik proksi (TRUST_PROXY=1, misalnya Render). Nilai paling kanan
// ditambahkan proksi sendiri; nilai di kirinya bisa dipalsukan klien untuk mengakali pembatas laju.
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
function clientIp(req) {
  if (TRUST_PROXY) {
    const hops = String(req.headers['x-forwarded-for'] || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (hops.length) return hops[hops.length - 1];
  }
  return req.socket.remoteAddress || 'unknown';
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { ...SECURITY_HEADERS, ...headers });
  res.end(body);
}
const sendJson = (res, status, obj, headers = {}) =>
  send(res, status, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });

function readBody(req) {
  const tooBig = () => new HttpError(413, 'Isian terlalu besar (maksimal 100 KB). Persingkat tulisanmu, lalu coba lagi.');
  return new Promise((ok, fail) => {
    if (Number(req.headers['content-length']) > MAX_BODY) {
      req.resume(); // kuras tanpa menyimpan, supaya balasan 413 tetap terkirim
      return fail(tooBig());
    }
    let size = 0;
    let over = false;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) over = true;
      else chunks.push(c);
    });
    req.on('end', () => (over ? fail(tooBig()) : ok(Buffer.concat(chunks).toString('utf8'))));
    req.on('error', fail);
  });
}

async function handleApi(db, req, res, url) {
  const extraHeaders = {};
  try {
    const m = match(req.method, url.pathname);
    if (!m) throw new HttpError(404, 'Alamat API tidak dikenal.');
    if (m.methodNotAllowed) throw new HttpError(405, 'Metode tidak didukung untuk alamat ini.');
    const sessionToken = readCookie(req);
    const user = sessionUser(db, sessionToken);
    const { roles } = m.route;
    if (roles !== 'publik') {
      if (!user) throw new HttpError(401, 'Sesimu sudah berakhir. Masuk lagi untuk melanjutkan.');
      if (roles !== 'semua' && !roles.includes(user.role)) throw new HttpError(403, 'Halaman ini bukan untuk peranmu. Kembali ke berandamu.');
    }
    let body = {};
    if (req.method === 'POST' || req.method === 'DELETE') {
      const raw = await readBody(req);
      if (raw) {
        // Wajib JSON: formulir lintas situs tidak bisa mengirim jenis ini tanpa preflight (lapis CSRF).
        if (!String(req.headers['content-type'] || '').startsWith('application/json')) throw new HttpError(400, 'Permintaan harus berformat JSON.');
        try { body = JSON.parse(raw); } catch { throw new HttpError(400, 'Isian tidak terbaca. Muat ulang halaman, lalu coba lagi.'); }
        if (!body || typeof body !== 'object' || Array.isArray(body)) body = {};
      }
    }
    const ctx = {
      db, req, user, body, params: m.params, query: url.searchParams, sessionToken,
      ip: clientIp(req),
      secure: TRUST_PROXY && req.headers['x-forwarded-proto'] === 'https',
      setCookie: (c) => (extraHeaders['Set-Cookie'] = c),
    };
    const out = await m.route.handler(ctx);
    if (out?.download) {
      const d = out.download;
      return send(res, 200, d.body, { 'Content-Type': d.type, 'Content-Disposition': `attachment; filename="${d.filename}"`, 'Cache-Control': 'no-store', ...extraHeaders });
    }
    sendJson(res, 200, out ?? { ok: true }, extraHeaders);
  } catch (err) {
    if (err instanceof HttpError) {
      const h = { ...extraHeaders };
      if (err.status === 429) h['Retry-After'] = String(err.retryAfterSec ?? 300);
      return sendJson(res, err.status, err.field ? { error: err.message, field: err.field } : { error: err.message }, h);
    }
    console.error('[galat]', err);
    sendJson(res, 500, { error: 'Terjadi galat di server. Coba lagi sebentar lagi.' }, extraHeaders);
  }
}

async function handleStatic(req, res, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Metode tidak didukung');
  let p;
  try {
    p = decodeURIComponent(url.pathname);
  } catch {
    return send(res, 400, 'Alamat tidak valid', { 'Content-Type': 'text/plain; charset=utf-8' });
  }
  if (p.includes('\0')) return send(res, 400, 'Alamat tidak valid', { 'Content-Type': 'text/plain; charset=utf-8' });
  if (p === '/' || p === '') p = '/index.html';
  const file = normalize(join(ROOT, p));
  if (!file.startsWith(ROOT + sep)) return send(res, 403, 'Terlarang');
  try {
    const st = await stat(file);
    if (!st.isFile()) throw new Error('bukan berkas');
    // Video demo: dukung permintaan Range supaya bisa dimajukan atau dimundurkan.
    if (extname(file) === '.webm') {
      const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
      const base = { 'Content-Type': 'video/webm', 'Accept-Ranges': 'bytes', 'Cache-Control': 'public, max-age=86400' };
      if (!m) {
        res.writeHead(200, { ...SECURITY_HEADERS, ...base, 'Content-Length': st.size });
        return req.method === 'HEAD' ? res.end() : createReadStream(file).pipe(res);
      }
      let start = m[1] === '' ? Math.max(0, st.size - Number(m[2])) : Number(m[1]);
      let end = m[1] !== '' && m[2] !== '' ? Math.min(Number(m[2]), st.size - 1) : st.size - 1;
      if (start > end || start >= st.size) {
        res.writeHead(416, { ...SECURITY_HEADERS, 'Content-Range': `bytes */${st.size}` });
        return res.end();
      }
      res.writeHead(206, { ...SECURITY_HEADERS, ...base, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Content-Length': end - start + 1 });
      return req.method === 'HEAD' ? res.end() : createReadStream(file, { start, end }).pipe(res);
    }
    const data = await readFile(file);
    send(res, 200, req.method === 'HEAD' ? '' : data, {
      'Content-Type': TYPES[extname(file)] || 'application/octet-stream',
      'Cache-Control': extname(file) === '.woff2' ? 'public, max-age=31536000, immutable' : extname(file) === '.png' ? 'public, max-age=86400' : 'no-cache',
    });
  } catch {
    send(res, 404, 'Halaman tidak ditemukan', { 'Content-Type': 'text/plain; charset=utf-8' });
  }
}

export function createApp(db = openDb()) {
  return createServer((req, res) => {
    // Jaring pengaman: satu permintaan aneh tidak boleh mematikan seluruh proses.
    const fail = (err) => {
      console.error('[galat tak tertangani]', err);
      if (!res.headersSent) send(res, 500, 'Terjadi galat di server.', { 'Content-Type': 'text/plain; charset=utf-8' });
      else res.end();
    };
    try {
      const url = new URL(req.url, 'http://localhost');
      const job = url.pathname.startsWith('/api/') ? handleApi(db, req, res, url) : handleStatic(req, res, url);
      Promise.resolve(job).catch(fail);
    } catch (err) {
      if (err instanceof TypeError) return send(res, 400, 'Alamat tidak valid', { 'Content-Type': 'text/plain; charset=utf-8' });
      fail(err);
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 3000;
  createApp().listen(port, () => console.log(`Uji Jelajah berjalan di http://localhost:${port}`));
}
