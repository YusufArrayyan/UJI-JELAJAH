# Sistem desain Uji Jelajah v1.1 — "Kompas"

Menggantikan acuan Notion di PRD 13.2 (v1.0, disimpan di `docs/DESIGN.notion.md` sebagai arsip).
Alasan: token Notion (ungu dan hitam, kartu pastel, Inter, gradien) adalah pola paling umum di antarmuka buatan AI.
Acuan gaya: Wise (lewat awesome-design-md) untuk tata letak, dan pola dasbor mentoring di Dribbble untuk kartu sesi
dan peta jalan. Ciri modern datang dari satu aksen berani dan kontras permukaan, tanpa gradien, kaca, atau orb. Semua warna diturunkan dari logo kompas Uji Jelajah.

## Prinsip

1. **Kontras permukaan, bukan bayangan.** Kanvas bertint biru, kartu putih di atasnya, pita navy untuk momen penting.
2. **Satu aksen aksi.** Kuning bintang logo untuk setiap tombol utama dan penanda "Kamu di sini". Biru kobalt untuk tautan, fokus, dan kemajuan.
3. **Data nyata sebagai visual.** Cincin anggaran waktu 6 jam, ubin rute bernomor 01–03, angka indikator besar. Tidak ada grafik hiasan.
4. **Motif milik sendiri.** Cincin kompas dari geometri logo, redup di dalam pita navy. Tanpa ikon kilau, panah, atau bullet centang.
5. **Produk asli sebagai demo.** Layar Masuk memakai komponen rute yang sama dengan Beranda.

## Token (lihat `public/css/app.css`)

| Token | Nilai | Pemakaian |
|---|---|---|
| `--navy` | `oklch(0.24 0.075 270)` | Pita sapaan, layar Masuk, angka ringkas, menu ponsel, tombol pilihan aktif |
| `--sun` | `oklch(0.85 0.16 86)` | Tombol utama, tab ponsel aktif, label "Kamu di sini", aksen judul |
| `--cobalt` | `oklch(0.50 0.19 263)` | Tautan, fokus, meter kemajuan |
| `--canvas` / `--card` | bertint 0.955 / putih | Latar halaman / permukaan kartu |
| `--ink` / `--ink-2` / `--ink-3` | 0.21 / 0.42 / 0.49 L | Teks utama, sekunder, tersier (≥ 4,5:1 di semua permukaan terang) |
| `--dugaan` / `--uji` / `--tinjau` | ungu logo / oker / hijau tua | Tag tahap di atas latar lembutnya (4,75–5,8:1) |
| Sudut | 10 px input, 14 px blok kecil, 22–28 px kartu dan pita, pil untuk tombol dan tag | |

## Tipografi

- **Newsreader** (serif) 500–600: judul, sapaan, angka indikator, nomor rute, jam penghitung, kutipan dugaan.
- **IBM Plex Sans** 400–600: teks, label, tombol, data (angka tabular).
- Kombinasi serif untuk suara manusia dan sans untuk utilitas; dipilih pemilik produk setelah mencoba judul sans tebal.
- Font OFL, subset Latin, disajikan dari `public/fonts` (lisensi di folder yang sama), tanpa layanan pihak ketiga.

## Komponen kunci

- **Pita sapaan** (`.hero`): minggu ke-n dari 6, sapaan besar, kartu "Langkah berikutnya" dengan satu tombol kuning, cincin data di kanan.
- **Cincin** (`gauge()` di `ui.js`): menit percobaan tercatat dari rencana saat tahap Uji; selain itu siklus selesai dari 3.
- **Rute** (`route()`): tiga ubin bernomor; aktif bergaris navy dengan label "Kamu di sini", selesai redup, terkunci bergaris putus.
- **Angka ringkas**: pita navy berisi angka serif besar.
- **Peta jelajah**: dugaan sebagai titik, keputusan sebagai penghubung (lanjut hijau, ubah arah biru, pindah bidang putus-putus).
- **Panduan**: tab per peran, video dengan bab yang bisa dilompati, langkah tertulis.
- **Sebaran tahap**: satu batang per tahap berwarna tahap; tahap di bawah 10 peserta berarsir tanpa ukuran (BR11).

## Pemeriksaan

- Pendeteksi skill impeccable bersih pada v1.1.0.
- Kontras dihitung dari nilai OKLCH; semua teks ≥ 4,5:1, teks besar dan angka ≥ 3:1.
