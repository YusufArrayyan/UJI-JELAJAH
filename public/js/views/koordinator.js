// Layar koordinator: hanya angka gabungan, tanpa isi pribadi peserta.
import { h, busy, clear } from '../dom.js';
import { get, post, download } from '../api.js';
import { field, selectField, notice, formMessage, toast, pageHead, meter, emptyState } from '../ui.js';
import { dateTime, num } from '../format.js';

const STAGE_COLOR = { Terdaftar: 'var(--ink-3)', 'Siklus 1': 'var(--dugaan)', 'Siklus 2': 'var(--cobalt)', 'Siklus 3': 'var(--tinjau)', Postes: 'var(--uji)', Selesai: 'var(--navy)' };

const KPI_DEF = {
  K1: 'Peserta yang menuntaskan tiga siklus, dibagi peserta yang tenggat siklus 3-nya sudah lewat.',
  K2: 'Peserta dengan skor postes adaptabilitas lebih tinggi dari pretes.',
  K3: 'Peserta dengan skor postes efikasi lebih tinggi dari pretes.',
  K4: 'Dari peserta yang punya minimal satu sesi Tinjau selesai, yang semua sesinya sudah diikuti keputusan.',
};

function kpiCard(k) {
  const status = k.hidden
    ? h('span', { class: 'tag plain' }, 'Disembunyikan, kurang dari 10 peserta')
    : k.met
      ? h('span', { class: 'tag ok' }, 'Target tercapai')
      : h('span', { class: 'tag warn' }, 'Belum mencapai target');
  return h(
    'article',
    { class: 'kpi', 'aria-labelledby': `kpi-${k.code}` },
    h('div', { class: 'kpi-top' }, h('h3', { id: `kpi-${k.code}` }, k.label), h('span', { class: 'kpi-code' }, k.code)),
    k.hidden
      ? h('div', { class: 'kpi-value' }, h('span', { class: 'hidden-val' }, '<10'), h('span', `target ≥ ${k.target}%`))
      : h('div', { class: 'kpi-value' }, h('b', `${num(k.value)}%`), h('span', `${k.num} dari ${k.den} peserta · target ≥ ${k.target}%`)),
    k.hidden ? null : meter(k.value / 100, k.target / 100, { label: `${num(k.value)} persen, target ${k.target} persen` }),
    h('p', { class: 'kpi-def' }, KPI_DEF[k.code]),
    h('div', status),
  );
}

export async function ringkasan({ go }) {
  const cohort = new URLSearchParams(location.hash.split('?')[1] || '').get('kohort') || 'semua';
  const d = await get(`/api/coord/summary?cohort=${encodeURIComponent(cohort)}`);
  const sel = selectField({ label: 'Kohort', name: 'cohort', value: cohort, options: [{ value: 'semua', label: 'Semua kohort' }, ...d.cohorts.map((c) => ({ value: c.id, label: `${c.name} · ${c.n} peserta` }))] });
  sel.input.addEventListener('change', () => go(`/ringkasan${sel.input.value === 'semua' ? '' : '?kohort=' + sel.input.value}`));
  sel.style.minWidth = '260px';

  const k5 = d.kpis.k5;
  const maxStage = Math.max(1, ...d.stages.map((s) => s.n ?? 0));
  const csv = h('button', { class: 'btn secondary', type: 'button' }, 'Unduh CSV anonim');
  csv.addEventListener('click', busy(csv, async () => {
    try {
      const name = await download(`/api/coord/export.csv?cohort=${encodeURIComponent(cohort)}`);
      toast(`${name} terunduh. Pengunduhan dicatat di log akses.`);
    } catch (err) {
      toast(err.message, 'err');
    }
  }));

  return h(
    'div',
    { class: 'stack-lg' },
    h('div', { class: 'page-head-row' }, pageHead('Ringkasan program', `${d.total} peserta terdaftar. Hanya angka gabungan yang tampil di sini.`), sel),
    notice('warn', 'Catatan jujur: semua angka berasal dari data simulasi yang dibangkitkan program. Angka ini menunjukkan perhitungannya berjalan, bukan bukti dampak.', 'info'),
    h('div', { class: 'legend', 'aria-hidden': 'true' }, h('span', h('i'), 'Garis tegak = target')),
    h('div', { class: 'kpis' }, [d.kpis.k1, d.kpis.k2, d.kpis.k3, d.kpis.k4].map(kpiCard)),
    h(
      'div',
      { class: 'grid-2' },
      h(
        'section',
        { class: 'card stack', 'aria-labelledby': 'k5-h' },
        h('div', { class: 'kpi-top' }, h('h2', { id: 'k5-h' }, 'Ketahanan efek'), h('span', { class: 'kpi-code' }, 'K5')),
        k5.hidden
          ? h('div', { class: 'kpi-value' }, h('span', { class: 'hidden-val' }, '<10'), h('span', 'peserta sudah mengisi tindak lanjut'))
          : h(
              'div',
              { class: 'stack', style: { gap: '8px' } },
              h('div', { class: 'kpi-value' }, h('b', `${num(k5.followMean, 2)}`), h('span', `rerata tindak lanjut, dari skala 5`)),
              h('p', { class: 'muted' }, `Rerata pretes peserta yang sama ${num(k5.preMean, 2)}. ${k5.n} peserta sudah mengisi tindak lanjut tiga bulan setelah program.`),
              h('div', h('span', { class: `tag ${k5.met ? 'ok' : 'warn'}` }, k5.met ? 'Masih di atas pretes' : 'Tidak lagi di atas pretes')),
            ),
      ),
      h(
        'section',
        { class: 'card stack', 'aria-labelledby': 'st-h' },
        h('h2', { id: 'st-h' }, 'Sebaran tahap'),
        h(
          'div',
          { class: 'bars' },
          d.stages.map((s) => {
            const tr = h('div', { class: `track${s.n == null ? ' hidden' : ''}` }, h('i'));
            tr.style.setProperty('--c', STAGE_COLOR[s.label] ?? 'var(--cobalt)');
            if (s.n != null) requestAnimationFrame(() => requestAnimationFrame(() => tr.firstChild.style.setProperty('--v', s.n / maxStage)));
            return h('div', { class: 'bar-row' }, h('span', s.label), tr, h('span', { class: 'n' }, s.n == null ? '<10' : String(s.n)));
          }),
        ),
        h('p', { class: 'hint' }, 'Angka di bawah 10 ditulis “<10” agar peserta tidak bisa dikenali.'),
      ),
    ),
    h('section', { class: 'card soft row between', 'aria-labelledby': 'csv-h' }, h('div', { class: 'stack', style: { gap: '4px', flex: '1 1 320px' } }, h('h2', { id: 'csv-h' }, 'Data anonim untuk analisis'), h('p', { class: 'muted small' }, 'CSV hanya memuat kode peserta dan skor, tanpa nama atau email. Untuk pembandingan dengan kelompok daftar tunggu di luar sistem.')), csv),
  );
}

export async function fasilitator({ reload }) {
  const d = await get('/api/coord/facilitators');
  const btn = h('button', { class: 'btn', type: 'button', disabled: !d.unassigned }, 'Tugaskan otomatis');
  btn.addEventListener('click', busy(btn, async () => {
    try {
      const out = await post('/api/coord/facilitators/assign-auto');
      toast(out.assigned ? `${out.assigned} peserta ditugaskan ke fasilitator dengan beban paling ringan.` : 'Tidak ada peserta yang perlu ditugaskan.');
      reload();
    } catch (err) {
      toast(err.message, 'err');
    }
  }));
  const max = Math.max(1, ...d.facilitators.map((f) => f.active));
  return h(
    'div',
    { class: 'stack-lg' },
    pageHead('Fasilitator', 'Rasio yang dianjurkan sekitar 1 fasilitator untuk 20 peserta.'),
    h(
      'section',
      { class: 'card row between' },
      h('div', { class: 'stack', style: { gap: '4px', flex: '1 1 300px' } }, h('h2', d.unassigned ? `${d.unassigned} peserta belum punya fasilitator` : 'Semua peserta sudah punya fasilitator'), h('p', { class: 'muted small' }, 'Penugasan otomatis memberi peserta ke fasilitator dengan peserta aktif paling sedikit. Peserta yang sudah ditugaskan tidak dipindah.')),
      btn,
    ),
    h(
      'div',
      { class: 'table-wrap' },
      h(
        'table',
        { class: 'responsive' },
        h('thead', h('tr', h('th', 'Fasilitator'), h('th', 'Beban aktif'), h('th', { class: 'num' }, 'Total peserta'), h('th', { class: 'num' }, 'Sesi terjadwal'))),
        h(
          'tbody',
          d.facilitators.map((f) =>
            h(
              'tr',
              h('td', { class: 'primary', 'data-label': 'Fasilitator' }, h('b', { style: { color: 'var(--ink)' } }, f.name), h('span', { class: 'cell-sub' }, f.email)),
              h('td', { 'data-label': 'Beban aktif' }, h('div', { class: 'row', style: { gap: '10px', flexWrap: 'nowrap' } }, h('div', { style: { flex: '1 1 120px', minWidth: '80px' } }, meter(f.active / Math.max(max, 20), 20 / Math.max(max, 20), { label: `${f.active} peserta aktif`, over: f.active > 20 })), h('span', { class: 'nowrap' }, `${f.active} aktif`))),
              h('td', { class: 'num', 'data-label': 'Total peserta' }, String(f.total)),
              h('td', { class: 'num', 'data-label': 'Sesi terjadwal' }, String(f.sessions)),
            ),
          ),
        ),
      ),
    ),
  );
}

export async function mitra({ reload }) {
  const d = await get('/api/coord/partners');
  const name = field({ label: 'Nama mitra', name: 'name', maxlength: 120, hint: 'Orang atau tempat kerja. Di prototipe, pakai nama fiktif.' });
  const fieldF = field({ label: 'Bidang', name: 'field', maxlength: 120, placeholder: 'Misalnya: Analisis data…' });
  const offer = field({ label: 'Yang bisa ditawarkan (opsional)', name: 'offer', maxlength: 200, placeholder: 'Misalnya: Wawancara 1 jam lewat daring…' });
  const msg = formMessage();
  const add = h('button', { class: 'btn', type: 'submit' }, 'Tambah mitra');
  const form = h('form', { class: 'stack', novalidate: true }, h('div', { class: 'grid-2' }, name, fieldF), offer, msg, h('div', add));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    busy(add, async () => {
      if (name.input.value.trim().length < 3) return name.setError('Nama minimal 3 karakter.'), name.input.focus();
      if (fieldF.input.value.trim().length < 3) return fieldF.setError('Bidang minimal 3 karakter.'), fieldF.input.focus();
      try {
        await post('/api/coord/partners', { name: name.input.value, field: fieldF.input.value, offer: offer.input.value });
        toast('Mitra ditambahkan dan langsung bisa dipilih peserta.');
        reload();
      } catch (err) {
        msg.show('err', err.message);
      }
    })();
  });
  const rows = d.partners.map((p) => {
    const t = h('button', { class: 'btn secondary small', type: 'button' }, p.active ? 'Nonaktifkan' : 'Aktifkan');
    t.addEventListener('click', busy(t, async () => {
      try {
        await post(`/api/coord/partners/${p.id}/toggle`);
        toast(p.active ? `${p.name} dinonaktifkan. Peserta tidak bisa lagi memilihnya.` : `${p.name} aktif kembali.`);
        reload();
      } catch (err) {
        toast(err.message, 'err');
      }
    }));
    return h(
      'tr',
      h('td', { class: 'primary', 'data-label': 'Mitra' }, h('b', { style: { color: p.active ? 'var(--ink)' : 'var(--slate)' } }, p.name), h('span', { class: 'cell-sub' }, p.offer || '–')),
      h('td', { 'data-label': 'Bidang' }, p.field),
      h('td', { class: 'num', 'data-label': 'Dipakai' }, `${p.used}×`),
      h('td', { 'data-label': 'Status' }, h('span', { class: `tag ${p.active ? 'ok' : 'plain'}` }, p.active ? 'Aktif' : 'Nonaktif')),
      h('td', { 'data-label': '' }, t),
    );
  });
  return h(
    'div',
    { class: 'stack-lg' },
    pageHead('Bank mitra', 'Praktisi dan tempat kerja yang bersedia menerima percobaan. Mitra nonaktif tidak bisa dipilih peserta.'),
    h('section', { class: 'card stack', 'aria-labelledby': 'add-h' }, h('h2', { id: 'add-h' }, 'Tambah mitra'), form),
    d.partners.length
      ? h('div', { class: 'table-wrap' }, h('table', { class: 'responsive' }, h('thead', h('tr', h('th', 'Mitra'), h('th', 'Bidang'), h('th', { class: 'num' }, 'Dipakai'), h('th', 'Status'), h('th', h('span', { class: 'visually-hidden' }, 'Aksi')))), h('tbody', rows)))
      : emptyState('handshake', 'Bank mitra masih kosong', 'Tambahkan mitra pertama lewat formulir di atas.'),
  );
}

const pct = (a, b) => (b ? (a / b) * 100 : 0);
export async function ai() {
  const d = await get('/api/coord/ai');
  const a = d.all;
  const stat = (value, label, sub, ok) => h('div', { class: 'stat' }, h('b', value), h('span', label), sub && h('span', { class: `tag ${ok == null ? 'plain' : ok ? 'ok' : 'warn'}`, style: { justifySelf: 'start', marginTop: '6px' } }, sub));
  const passRate = pct(a.passed, a.runs);
  const fbRate = pct(a.fallback, a.runs);
  const editRate = pct(a.edited, a.runs);
  const REASON = { kosong: 'Keluaran kosong', lebih_dari_80_kata: 'Lebih dari 80 kata', diagnosis_atau_saran: 'Diagnosis atau saran', data_pribadi: 'Memuat data pribadi', tidak_berpijak: 'Tidak berpijak pada tulisan peserta' };
  const kindRow = (label, k) => h('tr', h('td', { class: 'primary', 'data-label': 'Jenis' }, label), h('td', { class: 'num', 'data-label': 'Proses' }, String(k.runs)), h('td', { class: 'num', 'data-label': 'Lolos' }, `${num(pct(k.passed, k.runs))}%`), h('td', { class: 'num', 'data-label': 'Cadangan' }, `${num(pct(k.fallback, k.runs))}%`), h('td', { class: 'num', 'data-label': 'Diubah peserta' }, `${num(pct(k.edited, k.runs))}%`), h('td', { class: 'num', 'data-label': 'Latensi' }, `${k.latency} ms`));

  return h(
    'div',
    { class: 'stack-lg' },
    pageHead('Pendamping AI', `Penyedia: ${d.provider === 'mock' ? 'simulasi (deterministik, tanpa jaringan)' : d.provider} · prompt ${d.prompt_version}. Dasbor ini hanya memuat metadata, bukan isi tulisan peserta.`),
    h(
      'div',
      { class: 'stats', style: { gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' } },
      stat(String(a.runs), 'Proses AI'),
      stat(`${num(passRate)}%`, 'Lolos pemeriksa', 'target ≥ 95%', passRate >= 95),
      stat(`${num(fbRate)}%`, 'Memakai cadangan', 'target ≤ 5%', fbRate <= 5),
      stat(`${num(editRate)}%`, 'Draf diubah peserta', 'dipantau, bukan target'),
      stat(`${a.latency} ms`, 'Rerata latensi'),
    ),
    h(
      'div',
      { class: 'table-wrap' },
      h('table', { class: 'responsive' }, h('thead', h('tr', h('th', 'Jenis'), h('th', { class: 'num' }, 'Proses'), h('th', { class: 'num' }, 'Lolos'), h('th', { class: 'num' }, 'Cadangan'), h('th', { class: 'num' }, 'Diubah peserta'), h('th', { class: 'num' }, 'Latensi'))), h('tbody', kindRow('Draf dugaan', d.draft), kindRow('Ringkasan refleksi', d.summary))),
    ),
    h(
      'div',
      { class: 'grid-2' },
      h(
        'section',
        { class: 'card stack', 'aria-labelledby': 'rj-h' },
        h('h2', { id: 'rj-h' }, 'Alasan penolakan pemeriksa'),
        d.reasons.length
          ? h('ul', { class: 'stack', style: { listStyle: 'none', padding: 0, margin: 0, gap: '8px' } }, d.reasons.map((r) => h('li', { class: 'row between' }, h('span', REASON[r.reason] ?? r.reason), h('b', String(r.n)))))
          : h('p', { class: 'muted' }, 'Belum ada keluaran yang ditolak.'),
        h('p', { class: 'hint' }, 'Keluaran yang ditolak diganti templat simulasi, sehingga alur peserta tidak berhenti.'),
      ),
      h(
        'section',
        { class: 'card stack', 'aria-labelledby': 'pg-h' },
        h('h2', { id: 'pg-h' }, 'Pagar pengaman'),
        h(
          'ul',
          { class: 'stack', style: { gap: '6px', paddingLeft: '20px', margin: 0 } },
          h('li', 'Lima pertanyaan baku, bukan hasil model.'),
          h('li', 'NPM, nomor ponsel, dan email disamarkan sebelum disimpan atau dikirim.'),
          h('li', 'Keluaran lebih dari 80 kata, berisi diagnosis atau saran karier, atau memuat data pribadi ditolak.'),
          h('li', 'Peserta menyunting draf; fasilitator melihat versi AI dan versi peserta.'),
        ),
        h('p', { class: 'hint' }, 'Sebelum rintisan: tinjau manual 30 sampel keluaran.'),
      ),
    ),
    h(
      'section',
      { class: 'stack', 'aria-labelledby': 'rc-h' },
      h('h2', { id: 'rc-h' }, '20 proses terakhir'),
      h(
        'div',
        { class: 'table-wrap' },
        h(
          'table',
          { class: 'responsive' },
          h('thead', h('tr', h('th', 'Waktu'), h('th', 'Jenis'), h('th', 'Hasil'), h('th', 'Diubah'), h('th', { class: 'num' }, 'Latensi'))),
          h(
            'tbody',
            d.recent.map((r) =>
              h(
                'tr',
                h('td', { class: 'primary nowrap', 'data-label': 'Waktu' }, dateTime(r.created_at.includes('T') ? r.created_at : r.created_at.replace(' ', 'T') + 'Z')),
                h('td', { 'data-label': 'Jenis' }, r.kind === 'draft' ? 'Draf dugaan' : 'Ringkasan'),
                h('td', { 'data-label': 'Hasil' }, r.passed ? h('span', { class: 'tag ok' }, 'Lolos') : h('span', { class: 'tag warn', title: r.reject_reason ?? '' }, 'Cadangan')),
                h('td', { 'data-label': 'Diubah' }, r.edited_by_user ? 'Ya' : 'Tidak'),
                h('td', { class: 'num', 'data-label': 'Latensi' }, `${r.latency_ms} ms`),
              ),
            ),
          ),
        ),
      ),
    ),
  );
}

const ACTIONS = {
  lihat_daftar_kelompok: 'Membuka daftar kelompok',
  lihat_detail_peserta: 'Membuka detail peserta',
  tutup_sesi: 'Menutup sesi Tinjau',
  tandai_kendala_selesai: 'Menandai kendala selesai',
  ekspor_csv: 'Mengunduh CSV anonim',
  penugasan_otomatis: 'Penugasan otomatis',
  tambah_mitra: 'Menambah mitra',
  aktifkan_mitra: 'Mengaktifkan mitra',
  nonaktifkan_mitra: 'Menonaktifkan mitra',
  mitra_konfirmasi: 'Mitra mengonfirmasi percobaan',
  hapus_akun: 'Peserta menghapus akun',
};
export async function audit() {
  const d = await get('/api/coord/audit');
  return h(
    'div',
    { class: 'stack-lg' },
    pageHead('Log akses', '60 kejadian terakhir. Peserta ditulis dengan kode, bukan nama.'),
    d.events.length
      ? h(
          'div',
          { class: 'table-wrap' },
          h(
            'table',
            { class: 'responsive' },
            h('thead', h('tr', h('th', 'Waktu'), h('th', 'Pelaku'), h('th', 'Tindakan'), h('th', 'Sasaran'))),
            h(
              'tbody',
              d.events.map((e) =>
                h(
                  'tr',
                  h('td', { class: 'primary nowrap', 'data-label': 'Waktu' }, dateTime(e.created_at.includes('T') ? e.created_at : e.created_at.replace(' ', 'T') + 'Z')),
                  h('td', { 'data-label': 'Pelaku' }, e.actor_label),
                  h('td', { 'data-label': 'Tindakan' }, ACTIONS[e.action] ?? e.action),
                  h('td', { 'data-label': 'Sasaran', class: 'mono' }, e.target ?? '–'),
                ),
              ),
            ),
          ),
        )
      : emptyState('list', 'Belum ada kejadian', 'Akses fasilitator dan ekspor data akan tercatat di sini.'),
  );
}
