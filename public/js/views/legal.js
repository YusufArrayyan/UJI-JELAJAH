// Halaman publik: Ketentuan layanan dan Kebijakan privasi. Isi mengacu PRD bagian 12.
import { h } from '../dom.js';

const UPDATED = '15 Oktober 2026';

function shell(title, lede, sections) {
  return h(
    'div',
    { class: 'partner' },
    h(
      'div',
      { class: 'partner-top' },
      h('a', { class: 'brand', href: '#/masuk', translate: 'no' }, h('img', { src: '/img/logo-64.png', alt: '', width: 30, height: 30 }), 'Uji Jelajah'),
      h('span', { class: 'sim-badge' }, 'Prototipe'),
    ),
    h(
      'article',
      { class: 'partner-card legal' },
      h('h1', title),
      h('p', { class: 'muted' }, `${lede} Diperbarui ${UPDATED}.`),
      sections.map(([heading, ...paras]) => [
        h('h2', heading),
        paras.map((p) => (Array.isArray(p) ? h('ul', p.map((li) => h('li', li))) : h('p', p))),
      ]),
      h('p', { class: 'auth-legal', style: { marginTop: '24px' } }, h('a', { href: '#/ketentuan' }, 'Ketentuan layanan'), h('a', { href: '#/privasi' }, 'Kebijakan privasi'), h('a', { href: '#/masuk' }, 'Kembali ke Uji Jelajah')),
    ),
  );
}

export function ketentuan() {
  return shell('Ketentuan layanan', 'Ketentuan ini berlaku untuk prototipe Uji Jelajah.', [
    [
      'Apa itu Uji Jelajah',
      'Uji Jelajah adalah prototipe program enam minggu yang membantu mahasiswa menguji dugaan tentang pekerjaan lewat tiga siklus: Dugaan, Uji, dan Tinjau. Prototipe ini dibuat sebagai pendamping esai Lomba Esai Umum BK EXPO HIMABIKO 2026.',
    ],
    [
      'Data simulasi',
      'Semua akun, nama, mitra, dan angka di prototipe ini fiktif. Jangan memasukkan data pribadi sungguhan, termasuk nama lengkap, NPM, nomor ponsel, atau alamat.',
    ],
    [
      'Bukan layanan konseling',
      'Uji Jelajah bukan alat tes minat, bukan alat diagnosis, dan bukan layanan konseling. Fasilitator adalah mahasiswa sebaya, bukan konselor profesional. Bila kamu sedang merasa berat atau butuh bantuan di luar urusan karier, hubungi layanan konseling kampusmu.',
    ],
    [
      'Peran Pendamping AI',
      'Pendamping AI hanya menanyakan lima pertanyaan baku dan merangkum kata-katamu sendiri. Ia tidak mendiagnosis, tidak menilai kepribadian, dan tidak merekomendasikan pekerjaan. Semua keluarannya berupa draf yang bisa kamu ubah, dan keputusan tetap milikmu.',
    ],
    [
      'Hak dan kewajibanmu',
      [
        'Kamu boleh berhenti kapan saja tanpa pengaruh pada nilai kuliah.',
        'Kamu boleh mengunduh semua datamu dan menghapus akunmu dari halaman Pengaturan.',
        'Kamu tidak boleh memakai sistem ini untuk mengirim isi yang melecehkan, menipu, atau melanggar hukum.',
      ],
    ],
    [
      'Mitra percobaan',
      'Mitra mengonfirmasi percobaan lewat tautan sekali pakai yang berlaku 30 hari, tanpa akun dan tanpa diminta nama atau kontak.',
    ],
    [
      'Batas tanggung jawab',
      'Prototipe ini disediakan apa adanya untuk keperluan lomba dan uji coba. Ketersediaan layanan tidak dijamin, dan data dapat diatur ulang sewaktu-waktu. Dokumen ini bukan nasihat hukum.',
    ],
  ]);
}

export function privasi() {
  return shell('Kebijakan privasi', 'Kebijakan ini menjelaskan data apa yang diproses prototipe Uji Jelajah dan bagaimana kami menjaganya.', [
    [
      'Data yang dikumpulkan',
      [
        'Akun: nama, email, dan kode peserta anonim (misalnya P-031).',
        'Jawaban kuesioner pretes, postes, dan tindak lanjut.',
        'Dugaan, percakapan dengan Pendamping AI, rencana dan jam percobaan, refleksi, dan keputusanmu.',
        'Kendala yang kamu laporkan, dan catatan sesi dari fasilitator.',
      ],
      'Kami tidak mengumpulkan lokasi, kontak ponsel, atau akun media sosial. Data tidak diterima sebelum kamu memberi persetujuan.',
    ],
    [
      'Penyamaran',
      'NPM, nomor ponsel, dan alamat email yang kamu tulis di isian bebas disamarkan otomatis sebelum disimpan atau diproses Pendamping AI.',
    ],
    [
      'Siapa yang bisa melihat',
      [
        'Kamu: semua datamu sendiri.',
        'Fasilitator: hanya peserta di kelompoknya. Setiap kali fasilitator membuka data peserta, aksesnya dicatat di log.',
        'Koordinator: hanya angka gabungan. Angka dari kurang dari 10 orang disembunyikan, dan ekspor data hanya memuat kode peserta.',
        'Mitra: hanya judul dan durasi percobaan yang mereka konfirmasi, serta nama depan peserta.',
      ],
    ],
    [
      'Cookie',
      'Kami hanya memakai satu cookie sesi untuk menjaga kamu tetap masuk selama 7 hari. Cookie ini tidak bisa dibaca skrip dan tidak dipakai untuk pelacakan atau iklan. Tidak ada skrip atau layanan analitik pihak ketiga.',
    ],
    [
      'Penyimpanan dan penghapusan',
      'Di prototipe, data disimpan di satu basis data di server penerapan. Kamu bisa mengunduh semua datamu dalam format JSON dan menghapus akun beserta seluruh datanya dari halaman Pengaturan. Log akses hanya menyimpan kode peserta.',
    ],
    [
      'Dasar hukum',
      'Pemrosesan data pribadi mahasiswa mengacu pada Undang-Undang Nomor 27 Tahun 2022 tentang Pelindungan Data Pribadi. Sebelum rintisan dengan peserta sungguhan, program ini memerlukan kajian etik, penanggung jawab data, dan perjanjian pemrosesan dengan penyedia model. Dokumen ini bukan nasihat hukum.',
    ],
  ]);
}
