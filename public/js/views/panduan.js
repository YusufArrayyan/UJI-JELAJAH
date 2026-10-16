// Halaman publik: Panduan cara pakai, dengan video demo per peran (direkam dari aplikasi asli, data simulasi).
import { h, clear } from '../dom.js';

const ROLES = [
  {
    key: 'peserta',
    label: 'Peserta',
    lede: 'Dari persetujuan sampai keputusan di akhir siklus pertama.',
    steps: [
      'Masuk, baca ketentuan data, lalu centang persetujuan.',
      'Isi pretes: 12 butir, sekitar 5 menit.',
      'Dugaan: jawab lima pertanyaan Pendamping AI, lalu sunting draf dugaannya sampai sesuai maksudmu.',
      'Uji: pilih jenis percobaan, catat waktu dengan penghitung atau manual (paling lama 6 jam), kirim tautan ke mitra.',
      'Tinjau: tulis refleksi, periksa ringkasan AI, lalu pilih jam sesi 30 menit dengan fasilitator.',
      'Setelah fasilitator menutup sesi, putuskan nasib dugaanmu: lanjutkan, ubah, atau tinggalkan.',
    ],
  },
  {
    key: 'fasilitator',
    label: 'Fasilitator',
    lede: 'Membaca kelompok, menyiapkan sesi, dan menutupnya dengan catatan.',
    steps: [
      'Buka Kelompokku: lihat tahap setiap peserta, sesi mendatang, dan kendala terbuka.',
      'Saring peserta yang perlu perhatian atau yang sesinya terjadwal.',
      'Buka detail peserta: baca dugaan, percobaan, dan refleksi; bandingkan versi AI dengan versi peserta.',
      'Tambahkan sesi ke kalendermu, lalu tutup sesi dengan catatan dan centang "ringkasan diperiksa".',
      'Tandai kendala yang sudah ditangani.',
    ],
  },
  {
    key: 'koordinator',
    label: 'Koordinator',
    lede: 'Membaca angka gabungan tanpa membuka isi pribadi peserta.',
    steps: [
      'Ringkasan: baca K1 sampai K5 dan sebaran tahap; angka dari kurang dari 10 orang disembunyikan.',
      'Saring per kohort, lalu unduh CSV anonim untuk analisis.',
      'Fasilitator: tugaskan peserta yang belum punya fasilitator secara otomatis.',
      'Mitra: tambah, aktifkan, atau nonaktifkan mitra percobaan.',
      'Pendamping AI dan Log akses: pantau mutu keluaran AI dan siapa membuka data apa.',
    ],
  },
  {
    key: 'mitra',
    label: 'Mitra',
    lede: 'Mitra tidak perlu akun. Satu tautan, satu tombol.',
    steps: [
      'Peserta mengirim tautan konfirmasi kepadamu (berlaku 30 hari).',
      'Buka tautannya: kamu melihat judul, jenis, dan durasi percobaan.',
      'Tekan "Ya, percobaan ini sudah terjadi". Selesai; tidak ada nama atau kontak yang diminta.',
    ],
  },
];

const fmt = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

async function panel(role) {
  const box = h('div', { class: 'stack-lg', role: 'tabpanel', id: `panel-${role.key}`, 'aria-labelledby': `tab-${role.key}` });
  let meta = null;
  if (role.key !== 'mitra') {
    try {
      const res = await fetch(`/media/demo-${role.key}.json`, { cache: 'no-cache' });
      if (res.ok) meta = await res.json();
    } catch { /* video belum direkam */ }
  }
  const steps = h('ol', { class: 'guide-steps' }, role.steps.map((s) => h('li', s)));
  if (!meta) {
    box.append(h('p', { class: 'lede' }, role.lede), role.key === 'mitra' ? null : h('p', { class: 'notice info' }, 'Video untuk peran ini belum tersedia. Ikuti langkah tertulis di bawah.'), steps);
    return box;
  }
  const video = h(
    'video',
    { class: 'guide-video', controls: true, preload: 'metadata', playsinline: true, poster: `/media/demo-${role.key}.png`, width: meta.width, height: meta.height, 'aria-describedby': `steps-${role.key}` },
    h('source', { src: `/media/demo-${role.key}.webm`, type: 'video/webm' }),
    h('track', { kind: 'captions', src: `/media/demo-${role.key}.vtt`, srclang: 'id', label: 'Bahasa Indonesia' }),
    'Perambanmu tidak bisa memutar video ini. Ikuti langkah tertulis di bawah.',
  );
  const chapters = h(
    'ol',
    { class: 'chapters', 'aria-label': 'Bab video' },
    meta.chapters.map((c) => {
      const b = h('button', { type: 'button', class: 'chapter' }, h('span', { class: 'mono' }, fmt(c.t)), h('span', c.label));
      b.addEventListener('click', () => {
        video.currentTime = c.t;
        video.play().catch(() => {});
      });
      return h('li', b);
    }),
  );
  box.append(
    h('p', { class: 'lede' }, `${role.lede} Durasi ${fmt(meta.duration)}. Penjelasan tampil di dalam video; subtitel yang sama tersedia lewat tombol CC.`),
    h('div', { class: 'guide-player' }, video, h('div', { class: 'stack', style: { gap: '10px' } }, h('h3', 'Bab'), chapters)),
    h('section', { class: 'stack', 'aria-labelledby': `steps-h-${role.key}` }, h('h2', { id: `steps-h-${role.key}` }, 'Langkah tertulis'), h('div', { id: `steps-${role.key}` }, steps)),
  );
  return box;
}

export async function panduan() {
  const want = new URLSearchParams(location.hash.split('?')[1] || '').get('peran');
  let current = ROLES.find((r) => r.key === want) ?? ROLES[0];
  const area = h('div');
  const tabs = h('div', { class: 'guide-tabs', role: 'tablist', 'aria-label': 'Pilih peran' });

  async function show(role, focus = false) {
    current = role;
    history.replaceState(null, '', `#/panduan?peran=${role.key}`);
    for (const t of tabs.children) {
      const on = t.dataset.key === role.key;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      if (on && focus) t.focus();
    }
    clear(area);
    area.append(await panel(role));
  }
  ROLES.forEach((r, i) => {
    const t = h('button', { type: 'button', role: 'tab', id: `tab-${r.key}`, 'aria-controls': `panel-${r.key}`, dataset: { key: r.key } }, r.label);
    t.addEventListener('click', () => show(r));
    t.addEventListener('keydown', (e) => {
      const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (d) show(ROLES[(i + d + ROLES.length) % ROLES.length], true);
    });
    tabs.append(t);
  });
  await show(current);

  return h(
    'div',
    { class: 'partner' },
    h(
      'div',
      { class: 'partner-top', style: { maxWidth: '1100px' } },
      h('a', { class: 'brand', href: '#/masuk', translate: 'no' }, h('img', { src: '/img/logo-64.png', alt: '', width: 34, height: 34 }), 'Uji Jelajah'),
      h('a', { class: 'btn small secondary', href: '#/masuk' }, 'Masuk'),
    ),
    h(
      'article',
      { class: 'partner-card guide', style: { maxWidth: '1100px' } },
      h('h1', 'Cara pakai Uji Jelajah'),
      h('p', { class: 'muted' }, 'Video direkam langsung dari aplikasi ini dengan akun demo dan data simulasi.'),
      tabs,
      area,
      h('p', { class: 'auth-legal' }, h('a', { href: '#/ketentuan' }, 'Ketentuan layanan'), h('a', { href: '#/privasi' }, 'Kebijakan privasi')),
    ),
  );
}
