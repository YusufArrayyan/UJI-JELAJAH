// Butir CONTOH untuk prototipe. Bukan instrumen baku; instrumen berizin dimuat koordinator saat rintisan.
export const SCALE = [
  { value: 1, label: 'Sangat tidak sesuai' },
  { value: 2, label: 'Tidak sesuai' },
  { value: 3, label: 'Netral' },
  { value: 4, label: 'Sesuai' },
  { value: 5, label: 'Sangat sesuai' },
];

export const INSTRUMENTS = {
  adaptabilitas: {
    key: 'adaptabilitas',
    title: 'Adaptabilitas karier',
    hint: 'Seberapa sesuai pernyataan ini dengan dirimu saat ini?',
    items: [
      'Aku memikirkan seperti apa masa depan kerjaku nanti.',
      'Aku sadar pilihan hari ini ikut membentuk karierku kelak.',
      'Aku mengambil keputusan tentang kuliah dan kerja dengan pertimbanganku sendiri.',
      'Aku bertanggung jawab atas langkah karier yang kuambil.',
      'Aku mencari tahu berbagai pilihan pekerjaan sebelum memutuskan.',
      'Aku penasaran mencoba hal baru yang berkaitan dengan pekerjaan.',
      'Aku yakin bisa mempelajari keterampilan baru saat dibutuhkan.',
      'Aku tetap mencari jalan keluar ketika rencanaku tidak berjalan.',
    ],
  },
  efikasi: {
    key: 'efikasi',
    title: 'Efikasi keputusan karier',
    hint: 'Seberapa yakin kamu bisa melakukan hal berikut?',
    items: [
      'Mengumpulkan informasi tentang pekerjaan yang menarik bagiku.',
      'Menilai kecocokan sebuah pekerjaan dengan hal yang kusukai.',
      'Menyusun langkah konkret untuk mencoba sebuah bidang kerja.',
      'Memutuskan pilihan karier walau belum semuanya pasti.',
    ],
  },
};

export const PHASES = {
  pretes: 'Pretes',
  postes: 'Postes',
  tindak_lanjut: 'Tindak lanjut',
};
