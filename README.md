# Uji Jelajah

Sistem berbantuan AI untuk menumbuhkan adaptabilitas karier mahasiswa lewat tiga siklus **Dugaan, Uji, dan Tinjau**.
Prototipe berfungsi dengan **data simulasi**. Rujukan lingkup tunggal: `PRD_UjiJelajah.pdf` (v1.0, dibekukan).

## Menjalankan

Butuh Node.js 22.13 atau lebih baru (memakai `node:sqlite` bawaan). Tidak ada dependensi npm.

```bash
npm run seed   # data simulasi: 95 akun, dua kohort (menimpa basis data lama)
npm start      # http://localhost:3000
npm test       # 13 uji unit
npm run e2e    # ujung ke ujung: API (8 skenario) + antarmuka Chromium (20 pemeriksaan)
```

Hentikan server dulu sebelum `npm run seed` (di Windows berkas basis data terkunci selama server berjalan).

Variabel lingkungan:

| Nama | Bawaan | Fungsi |
|---|---|---|
| `PORT` | `3000` | Port HTTP |
| `DB_PATH` | `data/uji-jelajah.db` | Berkas SQLite |
| `TRUST_PROXY` | mati | `1` bila berjalan di balik proksi (Render): percayai X-Forwarded-For untuk pembatas laju |
| `DEMO_MODE` | aktif | `0` menyembunyikan daftar akun demo di layar Masuk |
| `AI_PROVIDER` | `mock` | `openai-compatible` untuk model sungguhan (**belum diuji**) |
| `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL` | – | Untuk adaptor openai-compatible |

## Uji antarmuka (Playwright)

`test/ui.test.js` menjalankan 20 pemeriksaan di Chromium sesuai PRD bagian 14: jalur penuh peserta, mitra, fasilitator,
koordinator, batas akses, tampilan ponsel 390 px, sasaran sentuh 44 px, dan tanpa galat konsol.

Proyek tetap tanpa dependensi. `playwright` atau `playwright-core` dicari di proyek, di `PLAYWRIGHT_CORE_PATH`, lalu di
instalasi global npm. Bila revisi Chromium bawaan belum terunduh, uji memakai Chrome atau Edge sistem. Bila Playwright tidak
ada sama sekali, uji ini dilewati dengan pesan. Untuk memasangnya:

```bash
npm i -D playwright && npx playwright install chromium
```

## Akun demo (kata sandi `demo1234`)

| Akun | Keadaan |
|---|---|
| raka@demo.id | Peserta baru, belum memberi persetujuan |
| dinda@demo.id | Siklus 1 tahap Uji, 45 dari 120 menit tercatat |
| fikri@demo.id | Siklus 2 tahap Tinjau, sesi terjadwal, satu kendala |
| fasilitator@demo.id | Nadia Putri, satu kelompok (20 peserta) |
| fasilitator2 sampai fasilitator5@demo.id | Fasilitator lain |
| koordinator@demo.id | Dr. Sari Wulandari, dasbor agregat dua kohort |

## Struktur

```
server/
  server.js       HTTP: berkas statis, API JSON, header keamanan, batas isi 100 KB
  routes.js       Semua rute API dan aturan bisnis BR1–BR14
  db.js           Skema SQLite (mode WAL)
  auth.js         scrypt, sesi cookie 7 hari, pembatas laju masuk
  ai.js           Skrip 5 pertanyaan, scrubPII, validateOutput, runAi + cadangan
  scoring.js      Skor instrumen, K1–K5, k-anonimitas (K_MIN = 10)
  instruments.js  Butir contoh (bukan instrumen baku)
  seed.js         Pembuat data simulasi
public/
  index.html, css/app.css, img/ (logo)
  js/app.js       Router hash dan kerangka
  js/views/       auth, peserta, siklus (Dugaan/Uji/Tinjau), fasilitator, koordinator
docs/DESIGN.notion.md   Acuan sistem desain (PRD 13.2)
docs/KETERTELUSURAN.md  Pemetaan PRD ke kode dan uji (hasil uji akhir)
test/             unit.test.js, e2e.test.js (API), ui.test.js (Playwright)
CHANGELOG.md      Catatan versi (aturan PRD 4.3)
```

## Catatan jujur

- Semua akun, nama, mitra, dan angka di dasbor adalah data simulasi. Angka itu menunjukkan perhitungannya berjalan, bukan bukti dampak.
- Butir kuesioner adalah contoh; skornya belum bermakna psikometrik.
- Penyedia AI bawaan adalah simulasi deterministik. Adaptor model sungguhan tersedia tetapi belum diuji.
- Belum diuji (PRD 14.2): adaptor model sungguhan, beban dan konkurensi, pembaca layar dan uji dengan mahasiswa nyata,
  pemulihan cadangan dan penerapan produksi.
