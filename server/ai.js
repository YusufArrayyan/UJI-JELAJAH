// Pendamping AI: skrip tetap, penyamaran data pribadi, pemeriksa keluaran, dan cadangan templat.
import { wordCount } from './util.js';

export const PROMPT_VERSION = 'v1.0';
export const MAX_WORDS = 80;

export const SYSTEM_PROMPT = [
  'Kamu Pendamping Uji Jelajah, teman bicara yang tenang untuk mahasiswa yang sedang menguji dugaan tentang pekerjaan.',
  'Aturan: (1) Hanya bertanya, merangkum kata-kata mahasiswa, dan mengingatkan langkah berikutnya.',
  '(2) Jangan mendiagnosis, menilai kepribadian, atau menyebut kondisi psikologis.',
  '(3) Jangan merekomendasikan pekerjaan, jurusan, atau keputusan. Keputusan milik mahasiswa.',
  '(4) Pakai kata-kata mahasiswa sendiri. Jangan menambah fakta yang tidak ia sebut.',
  '(5) Bahasa Indonesia santai-baku, sapaan "kamu", paling banyak 80 kata.',
].join(' ');

/** Lima pertanyaan baku. Tetap, bukan hasil model. */
export const SCRIPT = [
  'Sebut satu pekerjaan atau bidang yang belakangan bikin kamu penasaran. Boleh yang masih samar.',
  'Menurutmu, pekerjaan itu sehari-harinya mengerjakan apa? Tulis seadanya, tidak perlu benar.',
  'Bagian mana yang kamu duga akan kamu nikmati, dan kenapa kamu menduga begitu?',
  'Apa yang bisa kamu coba dalam waktu paling lama enam jam untuk menguji dugaan itu?',
  'Kalau dugaanmu benar, apa yang akan kamu rasakan atau lihat setelah mencoba? Kalau salah, apa tandanya?',
];
export const INTRO =
  'Halo. Aku akan menanyakan lima hal singkat untuk membantumu merumuskan satu dugaan. Jawabanmu tidak dinilai, dan kamu yang memutuskan isi dugaan akhirnya.';

// ---------- Penyamaran data pribadi ----------
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE_RE = /(?:\+62|62|0)8[\d\s.-]{7,14}\d/g;
const NPM_RE = /\b\d{8,15}\b/g;

export function scrubPII(text) {
  return String(text ?? '')
    .replace(EMAIL_RE, '[email disamarkan]')
    .replace(PHONE_RE, '[nomor disamarkan]')
    .replace(NPM_RE, '[NPM disamarkan]');
}
const hasPII = (t) => new RegExp(EMAIL_RE.source).test(t) || new RegExp(PHONE_RE.source).test(t) || new RegExp(NPM_RE.source).test(t);

// ---------- Pemeriksa keluaran ----------
const FORBIDDEN = [
  /\bkamu\s+sebaiknya\b/i, /\bsebaiknya\s+kamu\b/i, /\bkarier\s+terbaik\b/i, /\bpilihlah\b/i,
  /\bkamu\s+harus\b/i, /\b(aku|saya)\s+sarankan\b/i, /\bdisarankan\b/i, /\bcocoknya\s+kamu\b/i,
  /\bpaling\s+cocok\s+untukmu\b/i, /\bdiagnos/i, /\bdepresi\b/i, /\bgangguan\s+(kecemasan|mental|jiwa)\b/i,
  /\bkepribadian(mu)?\s+(adalah|tipe|kamu)\b/i, /\bkamu\s+(adalah\s+)?(seorang\s+)?(introvert|ekstrovert)\b/i,
];

// Kosakata bingkai templat yang boleh muncul walau tidak ditulis mahasiswa.
const FRAME = new Set(
  ('aku penasaran dengan kuduga sehari harinya akan mengujinya lewat dugaanmu yang terjadi mengejutkan menurut ' +
   'penilaianmu sendiri dugaan terbukti sebagian tidak bahas ringkasan sesi tinjau langkah berikutnya bersama ' +
   'fasilitatormu belum ditulis').split(' '),
);
const tokens = (t) => (t.toLowerCase().match(/[a-zà-ÿ]{4,}/g) || []);

export function validateOutput(text, sourceText = '') {
  const t = String(text ?? '').trim();
  if (!t) return { ok: false, reason: 'kosong' };
  if (wordCount(t) > MAX_WORDS) return { ok: false, reason: 'lebih_dari_80_kata' };
  if (FORBIDDEN.some((re) => re.test(t))) return { ok: false, reason: 'diagnosis_atau_saran' };
  if (hasPII(t)) return { ok: false, reason: 'data_pribadi' };
  const src = new Set(tokens(sourceText));
  const words = tokens(t).filter((w) => !FRAME.has(w));
  if (words.length) {
    const grounded = words.filter((w) => src.has(w) || [...src].some((s) => s.length >= 5 && (s.startsWith(w) || w.startsWith(s)))).length;
    if (grounded / words.length < 0.8) return { ok: false, reason: 'tidak_berpijak' };
  }
  return { ok: true };
}

// ---------- Penyedia ----------
const clip = (s, n) => {
  const w = String(s ?? '').trim().replace(/[.!?\s]+$/, '').split(/\s+/).filter(Boolean);
  return w.length > n ? w.slice(0, n).join(' ') + '…' : w.join(' ');
};
const lc = (s) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);
// Buang kata pengisi di awal jawaban supaya bingkai templat tidak berulang ("Kuduga sehari-harinya menurutku sehari-harinya …").
const FILLER = /^(?:(?:menurutku|menurut aku|kayaknya|sepertinya|mungkin|aku rasa|kurasa|ya|jadi)[,\s]+|(?:sehari-hari(?:nya)?|setiap hari)[,\s]+|(?:dia|mereka|pekerjaan itu|pekerjaannya)\s+)+/i;
const core = (s) => String(s ?? '').trim().replace(FILLER, '');
const VERDICT = { terbukti: 'terbukti', sebagian: 'terbukti sebagian', tidak: 'tidak terbukti' };

export const mockProvider = {
  name: 'mock',
  async draft(a) {
    return {
      statement: `Aku penasaran dengan ${lc(clip(core(a[0]), 10))}. Kuduga sehari-harinya ${lc(clip(core(a[1]), 16))}. Aku akan mengujinya lewat ${lc(clip(core(a[3]), 16))}.`,
      reason: clip(a[2], 30) + '.',
      signal: clip(a[4], 30) + '.',
    };
  },
  async summary(r) {
    const parts = [`Dugaanmu: ${lc(clip(r.statement, 18))}.`, `Yang terjadi: ${lc(clip(r.what_happened, 20))}.`];
    if (r.surprise) parts.push(`Yang mengejutkan: ${lc(clip(r.surprise, 14))}.`);
    parts.push(`Menurut penilaianmu sendiri, dugaan ini ${VERDICT[r.verdict]}.`);
    return parts.join(' ');
  },
};

/** Adaptor OpenAI-compatible. Belum diuji karena prototipe tidak memakai kunci API. */
export function openAiProvider({ baseUrl, apiKey, model }) {
  async function chat(user) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    try {
      const res = await fetch(baseUrl.replace(/\/$/, '') + '/chat/completions', {
        method: 'POST',
        signal: ctrl.signal,
        headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, temperature: 0.2, messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: user }] }),
      });
      if (!res.ok) throw new Error('penyedia_' + res.status);
      const j = await res.json();
      return String(j.choices?.[0]?.message?.content ?? '');
    } finally {
      clearTimeout(timer);
    }
  }
  return {
    name: 'openai-compatible',
    async draft(a) {
      const out = await chat(
        'Susun draf dugaan dari jawaban berikut. Balas JSON {"statement","reason","signal"} saja.\n' +
          SCRIPT.map((q, i) => `${q}\nJawaban: ${a[i]}`).join('\n'),
      );
      const j = JSON.parse(out.replace(/^```(json)?|```$/g, ''));
      return { statement: String(j.statement ?? ''), reason: String(j.reason ?? ''), signal: String(j.signal ?? '') };
    },
    async summary(r) {
      return chat(
        `Rangkum refleksi ini dengan kata-kata mahasiswa sendiri.\nDugaan: ${r.statement}\nYang terjadi: ${r.what_happened}\nYang mengejutkan: ${r.surprise}\nPenilaian: ${VERDICT[r.verdict]}`,
      );
    },
  };
}

export function defaultProvider(env = process.env) {
  if (env.AI_PROVIDER === 'openai-compatible' && env.AI_BASE_URL && env.AI_API_KEY) {
    return openAiProvider({ baseUrl: env.AI_BASE_URL, apiKey: env.AI_API_KEY, model: env.AI_MODEL || 'gpt-4o-mini' });
  }
  return mockProvider;
}

// ---------- Cadangan ----------
export const FALLBACK = {
  draft: () => ({
    statement: 'Aku menduga aku akan menikmati [bagian pekerjaan] sebagai [nama pekerjaan]. Aku akan mengujinya lewat [percobaan paling lama 6 jam].',
    reason: '[Tulis alasanmu dengan kata-katamu sendiri.]',
    signal: '[Tulis tanda dugaanmu benar, dan tanda dugaanmu salah.]',
  }),
  summary: (r) => `Dugaanmu ${VERDICT[r.verdict] ?? 'sudah kamu nilai'} menurut penilaianmu sendiri. Tulis ulang ringkasan ini dengan kata-katamu, lalu bahas bersama fasilitatormu di sesi Tinjau.`,
};

/**
 * Jalankan satu proses AI dengan pemeriksaan dan cadangan, lalu catat di ai_runs.
 * kind: 'draft' (input = 5 jawaban) | 'summary' (input = refleksi + dugaan)
 */
export async function runAi(db, { kind, cycleId, input, provider = defaultProvider() }) {
  const started = performance.now();
  let output = null;
  let passed = 0;
  let reason = null;
  try {
    const raw = await provider[kind](input);
    const source = kind === 'draft' ? input.join(' ') : `${input.statement} ${input.what_happened} ${input.surprise}`;
    const fields = kind === 'draft' ? [raw.statement, raw.reason, raw.signal] : [raw];
    for (const f of fields) {
      const v = validateOutput(f, source);
      if (!v.ok) { reason = v.reason; break; }
    }
    if (!reason) { output = raw; passed = 1; }
  } catch (err) {
    reason = 'galat_penyedia: ' + String(err.message || err).slice(0, 80);
  }
  const fallback = output === null;
  if (fallback) output = FALLBACK[kind](input);
  const latency = Math.round(performance.now() - started);
  const run = db
    .prepare('INSERT INTO ai_runs (cycle_id, kind, prompt_version, provider, latency_ms, passed, fallback_used, reject_reason) VALUES (?,?,?,?,?,?,?,?)')
    .run(cycleId ?? null, kind, PROMPT_VERSION, provider.name, latency, passed, fallback ? 1 : 0, reason);
  return { output, runId: Number(run.lastInsertRowid), passed: !!passed, fallback, provider: provider.name, reason };
}
