// Pembungkus fetch: JSON masuk-keluar, pesan galat dari server diteruskan apa adanya.
export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export async function api(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Koneksi terputus. Cek jaringanmu, lalu coba lagi.');
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* bukan JSON */
  }
  if (!res.ok) {
    const err = new ApiError(res.status, data?.error || 'Terjadi galat. Coba lagi sebentar lagi.');
    if (data?.field) err.field = data.field;
    if (res.status === 401 && path !== '/api/auth/login') window.dispatchEvent(new CustomEvent('uj:unauthorized'));
    if (res.status === 403) window.dispatchEvent(new CustomEvent('uj:forbidden'));
    throw err;
  }
  return data;
}

export const get = (p) => api(p);
export const post = (p, body = {}) => api(p, { method: 'POST', body });
export const del = (p, body = {}) => api(p, { method: 'DELETE', body });

/** Unduh berkas dari rute GET lewat tautan sementara. */
export async function download(path) {
  const res = await fetch(path, { credentials: 'same-origin' });
  if (!res.ok) {
    let msg = 'Unduhan gagal. Coba lagi.';
    try { msg = (await res.json()).error || msg; } catch { /* */ }
    throw new ApiError(res.status, msg);
  }
  const blob = await res.blob();
  const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') || '')?.[1] || 'unduhan';
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return name;
}
