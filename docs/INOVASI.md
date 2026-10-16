# Inovasi teknologi di Uji Jelajah

Ringkasan untuk esai dan presentasi. Setiap butir menyebut di mana ia diwujudkan dan bagaimana dibuktikan.

## A. Inovasi inti (sejak v1.0)

| # | Inovasi | Apa yang baru | Wujud di sistem | Bukti |
|---|---|---|---|---|
| 1 | **Pendamping AI berpagar** | AI dipakai hanya untuk bertanya dan merangkum, dengan lima lapis pengaman: skrip pertanyaan tetap, penyamaran data pribadi sebelum disimpan atau dikirim ke model, pemeriksa keluaran (menolak diagnosis, saran karier, data pribadi, lebih dari 80 kata, dan teks yang tidak berpijak pada tulisan mahasiswa), cadangan templat, dan pencatatan setiap proses | `server/ai.js` (`scrubPII`, `validateOutput`, `runAi`) | 10 uji unit |
| 2 | **Manusia tetap memutuskan** | Versi AI dan versi peserta disimpan terpisah; fasilitator melihat keduanya berdampingan dan mencentang "ringkasan diperiksa"; sistem mengukur persentase draf yang diubah peserta | Tabel `hypotheses`, `reflections`, `ai_runs.edited_by_user`; layar detail peserta | Uji antarmuka 14–15 |
| 3 | **Jejak audit AI** | Setiap proses AI mencatat versi prompt, penyedia, latensi, lolos atau tidak, dan apakah memakai cadangan | `ai_runs`; layar Pendamping AI koordinator | Uji unit runAi |
| 4 | **Privasi sejak rancangan** | k-anonimitas (angka dari kurang dari 10 orang disembunyikan), kode peserta anonim di CSV dan log, log akses fasilitator, unduh data dan hapus akun (hak menurut UU PDP), tanpa skrip pihak ketiga | `server/scoring.js` (`K_MIN`), rute koordinator, Pengaturan | Uji API dan antarmuka 18 |
| 5 | **Verifikasi mitra tanpa akun** | Bukti percobaan nyata lewat tautan sekali pakai berumur 30 hari; mitra tidak diminta nama atau kontak | Rute `/api/confirm/:token` | Uji API dan antarmuka 10 |
| 6 | **Mesin percobaan berbatas waktu** | Penghitung waktu dan catat manual dengan batas 6 jam per siklus yang ditegakkan server | Rute `experiments/*` | BR4, BR5 |
| 7 | **Pengukuran dampak bawaan** | Indikator K1–K5 dihitung otomatis dari data operasional (pretes, postes, tindak lanjut), sama dengan Tabel 1 di esai | `computeKpis` | Uji unit |
| 8 | **Arsitektur tanpa dependensi** | Satu proses Node dengan SQLite bawaan; tidak ada paket npm, sehingga permukaan serangan rantai pasok sangat kecil dan mudah dipasang di server kampus | `package.json` tanpa `dependencies` | — |
| 9 | **Keamanan yang diuji secara adversarial** | scrypt, pembatas percobaan masuk, CSP ketat, tahan URL rusak, uji akses lintas peran dan data orang lain | `server/server.js`, `test/e2e.test.js` | Uji adversarial |

## B. Fitur tambahan v1.1

| # | Fitur | Manfaat | Wujud | Bukti |
|---|---|---|---|---|
| 10 | **Aplikasi web yang bisa dipasang (PWA)** | Mahasiswa bisa memasang Uji Jelajah di layar utama ponsel; kerangka aplikasi tetap terbuka saat sinyal putus. Respons data (`/api/`) sengaja tidak disimpan di cache supaya tidak tertinggal di perangkat bersama | `public/manifest.webmanifest`, `public/sw.js` | Uji API PWA |
| 11 | **Integrasi kalender (.ics)** | Sesi Tinjau bisa ditambahkan ke Google Calendar, Outlook, atau kalender ponsel. Berupa berkas standar, bukan notifikasi, sehingga tidak menambah saluran notifikasi yang dikecualikan PRD | Rute `session.ics` peserta dan fasilitator | Uji API kalender |
| 12 | **Peta jelajah** | Visualisasi jalur eksplorasi: setiap dugaan jadi titik, setiap keputusan (lanjut, ubah arah, pindah bidang) jadi penghubung. Membantu peserta dan fasilitator melihat pola keputusan | Perjalananku | Uji antarmuka 20b |
| 13 | **Dokumentasi video yang dibangkitkan otomatis** | Video demo direkam langsung dari aplikasi oleh skrip, lengkap dengan bab dan subtitel. Bila tampilan berubah, cukup jalankan `npm run demo:video` untuk merekam ulang, sehingga panduan tidak pernah usang | `scripts/record-demo.mjs`, halaman `#/panduan` | Uji antarmuka 20b |

## C. Batasan yang dijaga

Sesuai PRD 4.2 dan 4.3, fitur tambahan tidak menambah peran, tahap, tabel inti, atau saluran notifikasi, dan tidak ada
rekomendasi pekerjaan oleh AI, gamifikasi, papan peringkat, atau label risiko pada mahasiswa.
