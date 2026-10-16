# Uji Jelajah

register: product
platform: web

## Apa ini
Sistem web untuk program enam minggu yang melatih mahasiswa mengambil keputusan karier lewat tiga siklus
percobaan kecil: Dugaan, Uji, Tinjau. Pendamping AI hanya bertanya dan merangkum; mahasiswa yang memutuskan,
fasilitator sebaya yang meninjau. Rujukan lingkup tunggal: `PRD_UjiJelajah.pdf` (v1.0, dibekukan).

## Pengguna
- Peserta (mahasiswa S1), sering membuka dari ponsel di sela kuliah.
- Fasilitator sebaya (mahasiswa BK semester lanjut), membuka di laptop sebelum sesi 30 menit.
- Koordinator (dosen BK), membaca angka gabungan untuk laporan fakultas.
- Mitra (praktisi), membuka satu tautan, menekan satu tombol, tanpa akun.

## Nada
Teman atau kakak tingkat yang tenang. Sapaan "kamu". Jelas lebih penting daripada ringkas, ringkas lebih
penting daripada lucu. Pesan galat: apa yang terjadi, lalu cara memperbaiki.

## Arah visual
"Kompas" (v1.1, lihat docs/DESIGN.md): navy dan kuning bintang dari logo, kanvas bertint dengan kartu putih,
judul dan angka serif Newsreader, teks IBM Plex Sans. Data nyata sebagai visual (cincin waktu, rute bernomor). Tanpa gradien,
orb, pastel, ikon kilau, atau bullet centang. Menggantikan acuan Notion di PRD 13.2.

## Batasan
Tanpa dependensi pihak ketiga di peramban maupun server. Tanpa innerHTML untuk isi pengguna.
Label "Data simulasi" di semua layar.
