# Ketertelusuran PRD ke kode dan uji

Hasil rekayasa balik v1.0.0: setiap butir PRD dibaca ulang dari sistem yang sudah jadi, lalu dicocokkan dengan kode
dan uji yang membuktikannya. Singkatan uji: **U** = `test/unit.test.js`, **A** = `test/e2e.test.js` (API),
**UI** = `test/ui.test.js` (Chromium, nomor pemeriksaan).

## Aturan bisnis (PRD 7)

| ID | Aturan | Ditegakkan di | Bukti |
|---|---|---|---|
| BR1 | Tidak ada data sebelum persetujuan | `routes.js` `requireConsent` | A jalur penuh; UI 03 |
| BR2 | Siklus dibuat setelah pretes lengkap; n+1 terkunci | `advanceEnrollment`, `ownCycle` | A jalur penuh; UI 05, 16 |
| BR3 | Jawaban instrumen tidak dapat diubah | `UNIQUE (enrollment_id, instrument, phase)` | A jalur penuh, BR10 |
| BR4 | Rencana 15 menit–6 jam; tercatat ≤ 360 menit | rute `experiment`, `log`, `stop`; `CHECK` di skema | A jalur penuh; UI 09 |
| BR5 | Selesai bila ≥ 15 menit dan timer berhenti | rute `finish` | A jalur penuh; UI 08 |
| BR6 | Refleksi ≥ 20 karakter; verdict sah | rute `reflection` | A jalur penuh; UI 12 |
| BR7 | Sesi setelah refleksi; satu per siklus; slot tidak ganda | rute `session`, `UNIQUE (facilitator_id, slot_at)` | A jalur penuh; UI 13 |
| BR8 | Tutup sesi dengan catatan ≥ 10 karakter | rute `sessions/:id/complete` | A jalur penuh; UI 15 |
| BR9 | Keputusan hanya setelah sesi selesai | rute `decision` | A jalur penuh; UI 13, 16 |
| BR10 | Siklus 3 → postes → selesai → tindak lanjut | `advanceEnrollment`, rute `responses` | A alur akhir program |
| BR11 | Penyebut < 10 disembunyikan | `scoring.js` `K_MIN` | U k-anonimitas; A koordinator; UI 18 |
| BR12 | Akses per peran dan kelompok; akses fasilitator dicatat | `server.js` peran rute, `ownEnrollmentFor`, `audit` | A BR12, adversarial; UI 17 |
| BR13 | Tautan mitra sekali konfirmasi, 30 hari, tanpa data lain | rute `confirm/:token` | A jalur penuh, adversarial (410); UI 10 |
| BR14 | Keluaran AI berisi diagnosis, saran, atau data pribadi ditolak | `ai.js` `validateOutput`, `runAi` | U 2–7, 9–10 |

## Kebutuhan fungsional (PRD 6.1)

| ID | Wujud | Bukti |
|---|---|---|
| FR-01 | Peran per rute di `server.js`; sesi cookie | A header & akses; A BR12 |
| FR-02 | `requireConsent` | A, UI 03 |
| FR-03 | `scoreAnswers` rerata 1–5; satu isian per fase | U skor; A |
| FR-04 | Tiga siklus dibuat saat pretes lengkap | A; UI 05 |
| FR-05 | `SCRIPT` lima pertanyaan, jawaban lewat `scrubPII` | U skrip; A; UI 06 |
| FR-06 | `runAi` + `validateOutput` + `ai_runs` | U runAi; A |
| FR-07 | Rencana percobaan, batas 6 jam | A; UI 08–09 |
| FR-08 | Token 32 heks, berlaku 30 hari | A; UI 10 |
| FR-09 | `ai_summary` dan `summary_final` terpisah | A; UI 12, 14 |
| FR-10 | `availableSlots`, slot unik per fasilitator | A; UI 13 |
| FR-11 | Keputusan setelah sesi ditutup | A; UI 13, 16 |
| FR-12 | `audit_log`: akses fasilitator, ekspor CSV | A BR12, koordinator |
| FR-13 | `computeKpis` + `stageDistribution` | U; A; UI 18 |
| FR-14 | Ekspor JSON; hapus akun dengan HAPUS | A jalur penuh |
| FR-15 | Label "Data simulasi" di header, Masuk, halaman mitra | UI 01, 02 |

## Kebutuhan nonfungsional (PRD 6.2)

| ID | Wujud | Bukti |
|---|---|---|
| NFR-01 | scrypt + salt; cookie HttpOnly SameSite=Lax; CSP, X-Frame-Options, nosniff | A header & akses |
| NFR-02 | `scrubPII` sebelum simpan dan sebelum AI; koordinator hanya agregat | U; A; UI 06, 18 |
| NFR-03 | Cadangan templat bila penyedia galat atau ditolak | U runAi |
| NFR-04 | Tanpa pustaka di peramban maupun server | `package.json` tanpa dependensi |
| NFR-05 | Label tampak, fokus terlihat, sasaran sentuh 44 px, gerak dikurangi | UI 19; `app.css` `prefers-reduced-motion` |
| NFR-06 | 390 px tanpa gulir horizontal; menu bawah di ponsel | UI 19; seluruh rute tiga peran diperiksa manual |
| NFR-07 | Bahasa Indonesia, sapaan "kamu", galat "apa + cara memperbaiki" | tinjauan teks |
| NFR-08 | Satu proses Node + satu berkas SQLite; `render.yaml` | README |
| NFR-09 | `ai_runs`: versi prompt, penyedia, latensi, lolos, cadangan, diubah | U runAi; layar Pendamping AI |

## Spesifikasi API (PRD 10.3)

Semua baris tabel API di PRD terpasang di `server/routes.js` sebagai 39 endpoint (PRD menggabungkan beberapa endpoint
dalam satu baris, misalnya `start | stop | log | finish`), dengan peran yang sama. Kode status sesuai PRD:
400 aturan bisnis, 401 belum masuk, 403 peran atau kelompok salah, 404, 410 tautan kedaluwarsa,
413 isi lebih dari 100 KB, 429 terlalu banyak percobaan masuk.

## Peta layar (PRD 13.3)

| Peran | Jalur | Berkas |
|---|---|---|
| Publik | `#/masuk`, `#/konfirmasi/:token` | `views/auth.js` |
| Peserta | `#/beranda`, `#/persetujuan`, `#/instrumen/:fase`, `#/perjalanan`, `#/pengaturan` | `views/peserta.js` |
| Peserta | `#/dugaan/:id`, `#/uji/:id`, `#/tinjau/:id` | `views/siklus.js` |
| Fasilitator | `#/kelompok`, `#/peserta/:id` | `views/fasilitator.js` |
| Koordinator | `#/ringkasan`, `#/koord/fasilitator`, `#/koord/mitra`, `#/koord/ai`, `#/koord/audit` | `views/koordinator.js` |

## Model data (PRD 9.2)

Semua tabel kamus data ada di `server/db.js`: users, cohorts, enrollments, cycles, responses, hypotheses,
experiments, reflections, review_sessions, ai_messages, ai_runs, partners, issues, audit_log, auth_sessions.

## Temuan uji akhir yang diperbaiki

| Temuan | Dampak | Perbaikan |
|---|---|---|
| URL dengan encoding rusak (`/%E0%A4%A`) mematikan proses server | Siapa pun bisa menjatuhkan aplikasi dengan satu tautan | Dekode aman (400) + jaring pengaman per permintaan |
| URL rusak di jalur API menghasilkan 500 | Pesan galat tidak jelas | 400 dengan pesan perbaikan |
| Pembatas masuk memercayai `X-Forwarded-For` mentah | Batas 8 percobaan bisa diakali dengan memalsukan header | Header hanya dipercaya bila `TRUST_PROXY=1`, memakai nilai paling kanan |
| Pembatas menghitung juga masuk yang berhasil, per IP | Satu lab kampus yang berbagi IP terkunci setelah 8 mahasiswa | Batas 8 untuk percobaan gagal per IP+email, plus 60 per IP |
| `render.yaml` menjalankan seed setiap start | Setiap restart atau deploy menghapus data peserta | `seed.js --if-empty` |
| Kartu sesi belum mengarahkan ke layanan konseling (PRD 12) | Batas klinis tidak tampil di sesi | Catatan arahan konseling di kartu sesi |

## Yang belum diuji (PRD 14.2)

Adaptor model bahasa sungguhan, beban dan konkurensi, pembaca layar dan uji dengan mahasiswa nyata,
pemulihan cadangan, dan penerapan produksi.
