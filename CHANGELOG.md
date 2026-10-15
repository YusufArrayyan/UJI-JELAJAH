# Catatan versi

Mengikuti aturan perubahan PRD bagian 4.3: setelah v1.0 hanya perbaikan galat, teks, dan penyetelan angka,
masing-masing dicatat sebagai versi 1.x beserta alasannya.

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
