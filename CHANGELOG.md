# Catatan versi

Mengikuti aturan perubahan PRD bagian 4.3: setelah v1.0 hanya perbaikan galat, teks, dan penyetelan angka,
masing-masing dicatat sebagai versi 1.x beserta alasannya.

## 1.1.0 (16 Oktober 2026, tampilan dan fitur pendukung)

Tidak ada peran, tahap, tabel inti, saluran notifikasi, atau aturan bisnis baru (sesuai PRD 4.3).
Sistem desain diganti dari acuan Notion (PRD 13.2) ke "Kompas" (docs/DESIGN.md), atas keputusan pemilik produk,
untuk menghilangkan pola tampilan yang umum pada antarmuka buatan AI.

- Navy dan kuning bintang dari logo; kanvas bertint dengan kartu putih; biru kobalt untuk tautan dan kemajuan.
- Judul dan angka Newsreader (serif), teks IBM Plex Sans; disajikan dari server sendiri (OFL).
- Beranda: pita sapaan dengan minggu ke-n dari 6, kartu langkah berikutnya, dan cincin menit percobaan.
- Tiga kartu siklus pastel diganti ubin rute bernomor 01–03 dengan penanda "Kamu di sini".
- Layar Masuk: judul besar dengan motif cincin kompas dan cuplikan rute asli, bukan orb gradien.
- Menu ponsel mengambang; angka ringkas fasilitator di pita navy; sebaran tahap berwarna tahap dengan arsir untuk sel < 10.
- Ikon kilau, panah di tombol, bullet centang, dan ikon dekoratif dihapus.
- Halaman publik baru: Ketentuan layanan (#/ketentuan) dan Kebijakan privasi (#/privasi).
- Kontras dihitung ulang; teks tersier dinaikkan ke ≥ 4,5:1.

Fitur pendukung (lihat docs/INOVASI.md):

- Aplikasi web yang bisa dipasang (PWA): manifest dan service worker; data /api tidak pernah disimpan di cache.
- Integrasi kalender: sesi Tinjau sebagai berkas .ics untuk peserta dan fasilitator.
- Peta jelajah di Perjalananku: dugaan sebagai titik, keputusan sebagai penghubung.
- Panduan cara pakai (#/panduan) dengan video demo per peran, bab, dan subtitel; direkam otomatis oleh npm run demo:video.
- Server mendukung permintaan Range untuk video.
- Perbaikan: label skor di detail peserta tidak terbaca (teks terang di latar terang).
- Uji: 13 unit, 9 skenario API, 22 pemeriksaan antarmuka.

## 1.0.0 (15 Oktober 2026, final, lingkup dibekukan)

Seluruh lingkup PRD v1.0 bagian 4.1 terpasang:

- Akses tiga peran, persetujuan data, pretes, postes, dan tindak lanjut dua skala.
- Siklus Dugaan, Uji, Tinjau dengan Pendamping AI: skrip tetap, penyamaran data pribadi, pemeriksa keluaran, cadangan templat.
- Fasilitator: Kelompokku (saringan tersimpan di URL), detail peserta dengan versi AI dan versi peserta, penutupan sesi.
- Koordinator: K1 sampai K5 dengan k-anonimitas, sebaran tahap, penugasan otomatis, bank mitra, mutu AI, log akses, CSV anonim.
- Mitra: halaman konfirmasi publik berbasis token yang berlaku 30 hari.
- Uji: 13 uji unit, 8 skenario API, 20 pemeriksaan antarmuka di Chromium.

Galat yang ditemukan dan diperbaiki saat pengujian sebelum rilis:

- Penghitung waktu tidak berdetak di layar.
- Balasan 413 (isi lebih dari 100 KB) terputus sebelum terkirim.
- Draf AI mengulang kata pengisi ("Kuduga sehari-harinya menurutku sehari-harinya").
- Penanda "[nomor disamarkan]" menghalangi penyimpanan dugaan.
- Halaman Uji bergulir horizontal 4 px di ponsel 390 px.
- Header koordinator terlipat di layar sedang.
- Sesi yang berganti di tab lain kini diarahkan ulang ke beranda peran yang benar.

Uji akhir (rekayasa balik dan uji adversarial, lihat docs/KETERTELUSURAN.md):

- URL dengan encoding rusak mematikan proses server; kini dibalas 400 dan ada jaring pengaman per permintaan.
- Pembatas masuk memercayai X-Forwarded-For mentah; kini hanya bila TRUST_PROXY=1.
- Pembatas menghitung masuk yang berhasil per IP sehingga satu lab kampus bisa terkunci; kini 8 percobaan gagal per IP+email.
- render.yaml menimpa data di setiap restart; kini seed --if-empty.
- Arahan ke layanan konseling kampus ditambahkan di kartu sesi (PRD 12).
- Uji ditambah: alur postes sampai tindak lanjut (BR10) dan uji adversarial. Total 13 unit, 8 skenario API, 20 pemeriksaan antarmuka.
