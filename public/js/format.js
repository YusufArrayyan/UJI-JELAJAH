// Format tanggal, waktu, dan label dalam bahasa Indonesia (WIB).
const TZ = 'Asia/Jakarta';

export const dateShort = (d) =>
  d ? new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: TZ }).format(new Date(d.length === 10 ? d + 'T12:00:00+07:00' : d)).replace('.', '') : '–';

export const dateLong = (d) =>
  new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ }).format(new Date(d));

export const time = (d) => new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: TZ }).format(new Date(d));

export const dateTime = (d) => `${dateShort(d)}, ${time(d)}`;

export const slotLabel = (d) => `${dateLong(d)}, ${time(d)} WIB`;

export function minutes(m) {
  if (m == null) return '–';
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (!h) return `${r} menit`;
  return r ? `${h} jam ${r} menit` : `${h} jam`;
}

export const num = (x, d = 1) => (x == null ? '–' : new Intl.NumberFormat('id-ID', { minimumFractionDigits: d, maximumFractionDigits: d }).format(x));

export const STAGE = { dugaan: 'Dugaan', uji: 'Uji', tinjau: 'Tinjau', selesai: 'Selesai' };
export const VERDICT = { terbukti: 'Terbukti', sebagian: 'Terbukti sebagian', tidak: 'Tidak terbukti' };
export const DECISION = { lanjut: 'Lanjutkan dugaan', ubah: 'Ubah dugaan', tinggalkan: 'Tinggalkan dugaan' };
export const STATUS = { terdaftar: 'Terdaftar', aktif: 'Aktif', postes: 'Postes', selesai: 'Selesai' };
export const PHASE = { pretes: 'Pretes', postes: 'Postes', tindak_lanjut: 'Tindak lanjut' };
export const ROLE = { peserta: 'Peserta', fasilitator: 'Fasilitator', koordinator: 'Koordinator' };

export const firstName = (n) => String(n || '').split(' ')[0];
