// Layar peserta: Beranda, Persetujuan, Kuesioner, Perjalananku, Pengaturan.
import { h, busy } from '../dom.js';
import { get, post, del, download } from '../api.js';
import { field, choices, stageTag, notice, formMessage, toast, pageHead, kv, quote, emptyState, route, gauge, compassMotif, calendarButton } from '../ui.js';
import { dateShort, slotLabel, minutes, num, firstName, VERDICT, DECISION, PHASE, STAGE } from '../format.js';

const stageHref = (c) => (c.stage === 'dugaan' ? `#/dugaan/${c.id}` : c.stage === 'uji' ? `#/uji/${c.id}` : `#/tinjau/${c.id}`);

// ---------------- Beranda ----------------
export async function beranda({ user, reload }) {
  const s = await get('/api/my/state');
  const n = s.next;
  const next = h(
    'section',
    { class: 'next', 'aria-labelledby': 'next-h' },
    h('p', { class: 'label' }, 'Langkah berikutnya'),
    h('h2', { id: 'next-h' }, n.title),
    n.slot_at && h('p', { class: 'when' }, slotLabel(n.slot_at)),
    h('p', n.body),
    n.slot_at
      ? h('div', { class: 'row', style: { marginTop: '8px' } }, h('a', { class: 'btn', href: n.href }, n.cta), calendarButton(`/api/cycles/${n.href.split('/').pop()}/session.ics`))
      : h('a', { class: 'btn', href: n.href }, n.cta),
  );

  // Sebelum pretes, siklus belum dibuat: tampilkan rute kosong yang terkunci.
  const cycles = s.cycles.length
    ? s.cycles.map((c) => ({ ...c, href: stageHref(c) }))
    : [1, 2, 3].map((k) => ({ n: k, stage: 'dugaan', locked: true, lockedNote: k === 1 ? 'Terbuka setelah pretes selesai.' : null }));

  const fac = s.enrollment.facilitator ? `Fasilitatormu: ${s.enrollment.facilitator}.` : 'Fasilitatormu belum ditetapkan koordinator.';

  // Minggu ke berapa dari program enam minggu, dihitung dari mulainya siklus 1.
  const start = s.cycles[0]?.starts_on;
  const week = start ? Math.min(6, Math.max(1, Math.floor((Date.now() - Date.parse(start + 'T00:00:00+07:00')) / (7 * 86400e3)) + 1)) : null;

  // Cincin di sisi kanan: jam percobaan bila sedang Uji, selain itu jumlah siklus selesai.
  const cur = s.cycles.find((c) => c.stage !== 'selesai');
  const done = s.cycles.filter((c) => c.stage === 'selesai').length;
  const x = cur?.stage === 'uji' ? cur.experiment : null;
  const side = x
    ? [gauge(x.logged_minutes, x.planned_minutes, String(x.logged_minutes), `dari ${x.planned_minutes} menit`, `${x.logged_minutes} dari ${x.planned_minutes} menit percobaan tercatat`), h('p', `Waktu percobaan siklus ${cur.n} yang sudah tercatat. Batasnya 6 jam.`)]
    : [gauge(done, 3, `${done}/3`, 'siklus selesai', `${done} dari 3 siklus selesai`), h('p', s.cycles.length ? 'Setiap siklus: dugaan, percobaan paling lama 6 jam, lalu sesi Tinjau.' : 'Siklus pertama terbuka setelah persetujuan dan pretes.')];

  const hero = h(
    'section',
    { class: 'hero', 'aria-labelledby': 'hero-h' },
    compassMotif('hero-motif'),
    h(
      'div',
      { class: 'hero-main' },
      h('p', { class: 'hero-kicker' }, week ? h('b', `Minggu ${week} dari 6`) : h('b', 'Belum mulai'), h('span', s.enrollment.cohort)),
      h('div', { class: 'stack', style: { gap: '8px' } }, h('h1', { id: 'hero-h' }, `Halo, ${firstName(user.name)}.`), h('p', { class: 'hero-sub' }, fac)),
      next,
    ),
    h('div', { class: 'hero-side' }, side),
  );
  return h(
    'div',
    { class: 'stack-lg' },
    hero,
    h('section', { class: 'stack', 'aria-labelledby': 'cyc-h' }, h('h2', { id: 'cyc-h' }, 'Rute enam minggumu'), route(cycles)),
    s.enrollment.consent_at ? issueCard(s.issues, reload) : null,
  );
}

function issueCard(issues, reload) {
  const text = field({ label: 'Ceritakan kendalamu', hint: 'Fasilitatormu akan membacanya. Nomor ponsel, email, dan NPM otomatis disamarkan.', name: 'issue', textarea: true, rows: 3, maxlength: 500, minlength: 5, counter: true });
  const msg = formMessage();
  const btn = h('button', { class: 'btn secondary', type: 'submit' }, 'Kirim ke fasilitator');
  const form = h('form', { class: 'stack', novalidate: true }, text, msg, h('div', btn));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    busy(btn, async () => {
      const v = text.input.value.trim();
      if (v.length < 5) return text.setError('Tulis minimal 5 karakter supaya fasilitatormu paham kendalanya.');
      try {
        await post('/api/my/issues', { text: v });
        toast('Kendalamu terkirim ke fasilitator.');
        reload();
      } catch (err) {
        msg.show('err', err.message);
      }
    })();
  });
  const open = issues.filter((i) => !i.resolved);
  return h(
    'section',
    { class: 'card', 'aria-labelledby': 'iss-h' },
    h('div', { class: 'card-head' }, h('h2', { id: 'iss-h' }, 'Ada kendala?'), open.length ? h('span', { class: 'tag warn' }, `${open.length} terbuka`) : null),
    issues.length
      ? h(
          'ul',
          { class: 'stack', style: { listStyle: 'none', padding: 0, margin: '0 0 16px' } },
          issues.slice(0, 4).map((i) => h('li', { class: 'row between' }, h('span', { style: { flex: '1 1 260px' } }, i.text), h('span', { class: `tag ${i.resolved ? 'ok' : 'warn'}` }, i.resolved ? 'Sudah ditangani' : 'Menunggu fasilitator'))),
        )
      : h('p', { class: 'muted', style: { marginBottom: '16px' } }, 'Jadwal bentrok, mitra membatalkan, atau bingung langkah berikutnya? Laporkan di sini.'),
    form,
  );
}

// ---------------- Persetujuan ----------------
export async function persetujuan({ go }) {
  const s = await get('/api/my/state');
  const sections = [
    ['Data yang kami kumpulkan', 'Jawaban kuesioner (pretes, postes, tindak lanjut), dugaan, rencana dan jam percobaan, refleksi, keputusanmu, serta kendala yang kamu laporkan. Kami tidak mengumpulkan lokasi, nomor ponsel, atau media sosial.'],
    ['Siapa yang bisa melihat', 'Kamu melihat semua datamu. Fasilitator sebaya hanya melihat peserta di kelompoknya, dan setiap aksesnya dicatat. Koordinator hanya melihat angka gabungan; angka dari kurang dari 10 orang disembunyikan.'],
    ['Peran Pendamping AI', 'AI hanya menanyakan lima pertanyaan baku dan merangkum kata-katamu. AI tidak mendiagnosis, tidak menilai kepribadian, dan tidak merekomendasikan pekerjaan. Semua keluarannya berupa draf yang bisa kamu ubah. Nomor ponsel, email, dan NPM disamarkan sebelum diproses.'],
    ['Hak-hakmu', 'Kamu bisa mengunduh semua datamu, menghapus akun beserta seluruh datanya, dan berhenti kapan saja tanpa pengaruh pada nilai kuliahmu.'],
  ];
  const done = !!s.enrollment.consent_at;
  const box = h('input', { type: 'checkbox', id: 'agree', checked: done, disabled: done });
  const btn = h('button', { class: 'btn', type: 'submit', disabled: !done }, done ? 'Ke Beranda' : 'Setuju dan lanjut');
  box.addEventListener('change', () => (btn.disabled = !box.checked));
  const msg = formMessage();
  const form = h(
    'form',
    { class: 'card stack' },
    h('label', { class: 'check', for: 'agree' }, box, h('span', 'Aku sudah membaca ketentuan di atas dan setuju dataku dipakai seperti yang dijelaskan.')),
    msg,
    h('div', btn),
  );
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (done) return go('/beranda');
    busy(btn, async () => {
      try {
        await post('/api/my/consent', { agree: true });
        toast('Terima kasih. Sekarang isi pretes.');
        go('/instrumen/pretes');
      } catch (err) {
        msg.show('err', err.message);
      }
    })();
  });
  return h(
    'div',
    { class: 'stack-lg' },
    pageHead('Sebelum mulai, baca ini dulu', 'Kami tidak menerima data apa pun darimu sebelum kamu setuju.'),
    done ? notice('ok', `Kamu sudah memberi persetujuan pada ${dateShort(s.enrollment.consent_at)}.`) : null,
    h('div', { class: 'card stack-lg' }, sections.map(([t, b]) => h('section', { class: 'stack', style: { gap: '6px' } }, h('h2', { style: { fontSize: '17px' } }, t), h('p', b)))),
    notice('warn', 'Uji Jelajah bukan layanan konseling. Bila kamu sedang merasa berat atau butuh bantuan untuk hal di luar karier, hubungi layanan konseling kampusmu. Fasilitator juga bisa membantu menghubungkan.', 'info'),
    form,
  );
}

// ---------------- Kuesioner ----------------
export async function instrumen({ params, go }) {
  const fase = params.fase;
  if (!PHASE[fase]) return go('/beranda');
  const s = await get('/api/my/state');
  const need = { pretes: 'terdaftar', postes: 'postes', tindak_lanjut: 'selesai' }[fase];
  if (!s.enrollment.consent_at) return go('/persetujuan');
  const already = s.responses[fase];
  if (s.enrollment.status !== need || (already.adaptabilitas != null && already.efikasi != null)) {
    return h(
      'div',
      { class: 'stack-lg' },
      pageHead(PHASE[fase], null),
      emptyState('check', `${PHASE[fase]} tidak perlu diisi sekarang`, already.adaptabilitas != null ? 'Kamu sudah mengisinya. Jawaban tidak dapat diubah.' : 'Kuesioner ini dibuka pada tahap lain programmu.', h('a', { class: 'btn', href: '#/beranda' }, 'Ke Beranda')),
    );
  }
  const keys = ['adaptabilitas', 'efikasi'].filter((k) => already[k] == null);
  const insts = await Promise.all(keys.map((k) => get(`/api/instruments/${k}`)));
  const total = insts.reduce((a, i) => a + i.items.length, 0);

  const progressText = h('p', { class: 'small muted', 'aria-live': 'polite' });
  const bar = h('div', { class: 'meter', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': total, 'aria-label': 'Butir terjawab' }, h('i'));
  const update = () => {
    const done = form.querySelectorAll('input[type=radio]:checked').length;
    progressText.textContent = `${done} dari ${total} butir terjawab`;
    bar.style.setProperty('--v', done / total);
    bar.setAttribute('aria-valuenow', done);
  };

  const groups = insts.map((inst) =>
    h(
      'section',
      { class: 'card stack', 'aria-labelledby': `h-${inst.key}` },
      h('div', h('h2', { id: `h-${inst.key}` }, inst.title), h('p', { class: 'hint' }, `${inst.hint} ${inst.items.length} butir.`)),
      h(
        'div',
        inst.items.map((q, i) => {
          const name = `${inst.key}-${i}`;
          return h(
            'fieldset',
            { class: 'likert', id: `q-${name}` },
            h('legend', { class: 'likert-q' }, `${i + 1}. ${q}`),
            h('div', { class: 'likert-opts' }, inst.scale.map((o) => h('label', { class: 'choice' }, h('input', { type: 'radio', name, value: o.value, 'aria-label': `${o.value}, ${o.label}` }), h('span', h('b', String(o.value)), h('small', o.label))))),
            h('div', { class: 'likert-ends', 'aria-hidden': 'true' }, h('span', '1 Sangat tidak sesuai'), h('span', '5 Sangat sesuai')),
          );
        }),
      ),
    ),
  );
  const msg = formMessage();
  const btn = h('button', { class: 'btn', type: 'submit' }, `Kirim ${PHASE[fase].toLowerCase()}`);
  const form = h('form', { class: 'stack-lg', novalidate: true }, groups, msg, h('div', { class: 'row' }, btn, h('p', { class: 'hint' }, 'Setelah dikirim, jawaban tidak dapat diubah.')));
  form.addEventListener('change', update);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    busy(btn, async () => {
      msg.clear();
      for (const inst of insts) {
        for (let i = 0; i < inst.items.length; i++) {
          if (!form.querySelector(`input[name="${inst.key}-${i}"]:checked`)) {
            msg.show('err', `Butir ${i + 1} ${inst.title.toLowerCase()} belum dijawab. Semua butir wajib diisi.`);
            const fs = form.querySelector(`#q-${inst.key}-${i}`);
            fs.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
            fs.querySelector('input').focus({ preventScroll: true });
            return;
          }
        }
      }
      try {
        for (const inst of insts) {
          const answers = inst.items.map((_, i) => Number(form.querySelector(`input[name="${inst.key}-${i}"]:checked`).value));
          await post('/api/my/responses', { instrument: inst.key, phase: fase, answers });
        }
        toast(`${PHASE[fase]} terkirim. Terima kasih.`);
        go(fase === 'tindak_lanjut' ? '/perjalanan' : '/beranda');
      } catch (err) {
        msg.show('err', err.message);
      }
    })();
  });
  queueMicrotask(update);

  const lede = {
    pretes: 'Dua kuesioner singkat sebelum siklus pertama. Tidak ada jawaban benar atau salah; jawablah sesuai keadaanmu sekarang.',
    postes: 'Kuesioner yang sama dengan pretes, supaya perubahanmu terlihat.',
    tindak_lanjut: 'Idealnya diisi tiga bulan setelah program selesai, untuk melihat apakah perubahan bertahan.',
  }[fase];
  return h(
    'div',
    { class: 'stack-lg' },
    pageHead(PHASE[fase], lede),
    h('div', { class: 'progress-sticky' }, bar, progressText),
    notice('info', 'Butir di prototipe ini adalah contoh, bukan instrumen baku. Skornya belum bermakna psikometrik.'),
    form,
  );
}

// ---------------- Perjalananku ----------------
export async function perjalanan() {
  const s = await get('/api/my/state');
  const r = s.responses;
  const score = (ph) =>
    r[ph].adaptabilitas == null
      ? null
      : h(
          'div',
          { class: 'score-pair' },
          h('div', h('b', num(r[ph].adaptabilitas, 2)), h('span', 'Adaptabilitas')),
          h('div', h('b', num(r[ph].efikasi, 2)), h('span', 'Efikasi keputusan')),
        );
  const delta = (k) => {
    if (r.pretes[k] == null || r.postes[k] == null) return null;
    const d = r.postes[k] - r.pretes[k];
    return h('span', { class: d > 0 ? 'delta-up' : 'delta-down' }, `${d > 0 ? '+' : ''}${num(d, 2)}`);
  };
  const item = (dotCls, dotContent, title, body) => h('li', { class: 'tl-item' }, h('div', { class: `tl-dot ${dotCls}` }, dotContent), h('div', { class: 'stack', style: { gap: '6px' } }, h('h3', title), body));

  const items = [];
  items.push(item(s.enrollment.consent_at ? 'done' : '', s.enrollment.consent_at ? '' : '·', 'Persetujuan data', h('p', { class: 'small muted' }, s.enrollment.consent_at ? `Diberikan ${dateShort(s.enrollment.consent_at)}` : 'Belum diberikan')));
  items.push(item(r.pretes.adaptabilitas != null ? 'done' : '', r.pretes.adaptabilitas != null ? '' : '·', 'Pretes', score('pretes') ?? h('p', { class: 'small muted' }, 'Belum diisi')));
  for (const c of s.cycles) {
    const body = [];
    if (c.hypothesis?.saved) body.push(quote(c.hypothesis.statement));
    if (c.experiment) body.push(h('p', { class: 'small' }, `${c.experiment.type_label}: ${c.experiment.title} · ${minutes(c.experiment.logged_minutes)} tercatat`, c.experiment.confirmed_at ? ' · dikonfirmasi mitra' : ''));
    if (c.reflection) body.push(h('p', { class: 'small' }, `Penilaianmu: ${VERDICT[c.reflection.verdict]}`));
    if (c.reflection?.decision) body.push(h('p', { class: 'small' }, h('b', DECISION[c.reflection.decision]), c.reflection.decision_note ? ` · ${c.reflection.decision_note}` : ''));
    if (!body.length) body.push(h('p', { class: 'small muted' }, c.locked ? 'Masih terkunci.' : 'Belum dimulai.'));
    if (!c.locked) body.push(h('a', { href: stageHref(c), class: 'small' }, c.stage === 'selesai' ? 'Baca catatan lengkap' : `Buka tahap ${STAGE[c.stage]}`));
    items.push(item(c.stage === 'selesai' ? 'done' : c.locked ? '' : c.stage, c.stage === 'selesai' ? '' : String(c.n), `Siklus ${c.n} · ${c.stage === 'selesai' ? 'Selesai' : c.locked ? 'Terkunci' : STAGE[c.stage]}`, body));
  }
  if (!s.cycles.length) items.push(item('', '1–3', 'Tiga siklus', h('p', { class: 'small muted' }, 'Terbuka setelah pretes.')));
  items.push(
    item(
      r.postes.adaptabilitas != null ? 'done' : '',
      r.postes.adaptabilitas != null ? '' : '·',
      'Postes',
      r.postes.adaptabilitas != null ? h('div', { class: 'stack', style: { gap: '4px' } }, score('postes'), h('p', { class: 'small' }, 'Perubahan dari pretes: adaptabilitas ', delta('adaptabilitas'), ', efikasi ', delta('efikasi'))) : h('p', { class: 'small muted' }, 'Dibuka setelah tiga siklus selesai.'),
    ),
  );
  items.push(item(r.tindak_lanjut.adaptabilitas != null ? 'done' : '', r.tindak_lanjut.adaptabilitas != null ? '' : '·', 'Tindak lanjut', score('tindak_lanjut') ?? h('p', { class: 'small muted' }, 'Tiga bulan setelah program selesai.')));

  return h(
    'div',
    { class: 'stack-lg' },
    pageHead('Perjalananku', 'Semua yang sudah kamu coba dan putuskan, dari awal sampai sekarang. Skor 1 sampai 5; makin tinggi makin sesuai.'),
    explorationMap(s.cycles),
    h('section', { class: 'stack', 'aria-labelledby': 'tl-h' }, h('h2', { id: 'tl-h' }, 'Catatan lengkap'), h('ol', { class: 'timeline', style: { listStyle: 'none', padding: 0, margin: 0 } }, items)),
  );
}

// ---------------- Peta jelajah ----------------
const LINK = { lanjut: 'Lanjut, menggali lebih dalam', ubah: 'Ubah arah', tinggalkan: 'Pindah bidang' };
/** Ringkas dugaan jadi label simpul: buang pembuka umum, ambil sekitar sembilan kata. */
function shortHypothesis(t) {
  const words = String(t).replace(/^(aku (menduga|penasaran dengan)( aku akan menikmati)?|dugaanku,?)\s*/i, '').split(/\s+/);
  const s = words.slice(0, 9).join(' ').replace(/[.,;]$/, '');
  return (s.charAt(0).toUpperCase() + s.slice(1)) + (words.length > 9 ? '…' : '');
}
/** Peta jelajah: siklus sebagai simpul, keputusan sebagai penghubung. Dibangun dari data yang sudah ada. */
function explorationMap(cycles) {
  const started = cycles.filter((c) => c.hypothesis?.saved);
  if (!started.length) {
    return h('section', { class: 'map-card', 'aria-labelledby': 'map-h' }, h('h2', { id: 'map-h' }, 'Peta jelajahmu'), h('p', { class: 'muted' }, 'Peta ini terisi setelah kamu menyimpan dugaan pertamamu. Setiap siklus jadi satu titik, dan keputusanmu jadi jalur ke titik berikutnya.'));
  }
  const parts = [];
  cycles.forEach((c, i) => {
    const r = c.reflection;
    parts.push(
      c.hypothesis?.saved
        ? h(
            'li',
            { class: `map-node ${c.stage === 'selesai' ? 'done' : 'active'}` },
            h('span', { class: 'map-n' }, `Siklus ${c.n}`),
            h('p', { class: 'map-q' }, shortHypothesis(c.hypothesis.statement)),
            h('div', { class: 'row', style: { gap: '6px' } }, r ? h('span', { class: `tag ${r.verdict === 'tidak' ? 'warn' : 'ok'}` }, VERDICT[r.verdict]) : stageTag(c.stage)),
          )
        : h('li', { class: 'map-node empty' }, h('span', { class: 'map-n' }, `Siklus ${c.n}`), h('p', c.locked ? 'Belum terbuka' : 'Belum ada dugaan')),
    );
    // Penghubung selalu ada di antara dua simpul supaya urutan grid simpul-penghubung-simpul tetap.
    if (i < cycles.length - 1) {
      const d = r?.decision;
      parts.push(h('li', { class: `map-link ${d ?? 'open'}`, 'aria-label': d ? `Keputusan: ${LINK[d]}` : 'Belum ada keputusan' }, h('span', d ? LINK[d] : 'Menunggu keputusan')));
    }
  });
  const decided = cycles.filter((c) => c.reflection?.decision);
  const changes = decided.filter((c) => c.reflection.decision !== 'lanjut').length;
  return h(
    'section',
    { class: 'map-card', 'aria-labelledby': 'map-h' },
    h('div', { class: 'row between' }, h('h2', { id: 'map-h' }, 'Peta jelajahmu'), h('span', { class: 'muted small' }, `${started.length} dugaan diuji · ${changes} kali berubah arah`)),
    h('ol', { class: 'map' }, parts),
    h('p', { class: 'hint' }, 'Setiap perubahan arah berarti percobaanmu memberi informasi baru tentang dirimu.'),
  );
}

// ---------------- Pengaturan ----------------
export async function pengaturan({ user, go }) {
  const s = await get('/api/my/state');
  const dl = h('button', { class: 'btn secondary', type: 'button' }, 'Unduh dataku (JSON)');
  dl.addEventListener('click', busy(dl, async () => {
    try {
      const name = await download('/api/my/export');
      toast(`Berkas ${name} terunduh.`);
    } catch (err) {
      toast(err.message, 'err');
    }
  }));

  const confirmF = field({ label: 'Ketik HAPUS untuk mengonfirmasi', name: 'confirm', autocomplete: 'off' });
  const delBtn = h('button', { class: 'btn danger', type: 'submit', disabled: true }, 'Hapus akun dan semua data');
  confirmF.input.addEventListener('input', () => (delBtn.disabled = confirmF.input.value !== 'HAPUS'));
  const msg = formMessage();
  const delForm = h('form', { class: 'stack', novalidate: true }, confirmF, msg, h('div', delBtn));
  delForm.addEventListener('submit', (e) => {
    e.preventDefault();
    busy(delBtn, async () => {
      try {
        await del('/api/my/account', { confirm: confirmF.input.value });
        toast('Akun dan seluruh datamu sudah dihapus.');
        location.hash = '/masuk';
        location.reload();
      } catch (err) {
        msg.show('err', err.message);
      }
    })();
  });

  return h(
    'div',
    { class: 'stack-lg' },
    pageHead('Pengaturan', null),
    h(
      'section',
      { class: 'card', 'aria-labelledby': 'acc-h' },
      h('h2', { id: 'acc-h', style: { marginBottom: '16px' } }, 'Akunmu'),
      h('dl', { class: 'dl' }, h('dt', 'Nama'), h('dd', user.name), h('dt', 'Email'), h('dd', user.email), h('dt', 'Kode peserta'), h('dd', { class: 'mono' }, user.code ?? '–'), h('dt', 'Kohort'), h('dd', s.enrollment.cohort), h('dt', 'Fasilitator'), h('dd', s.enrollment.facilitator ?? 'Belum ditetapkan')),
      h('p', { class: 'hint', style: { marginTop: '14px' } }, 'Laporan ke koordinator hanya memakai kode peserta, bukan nama atau email.'),
    ),
    h(
      'section',
      { class: 'card stack', 'aria-labelledby': 'help-h' },
      h('h2', { id: 'help-h' }, 'Butuh bantuan lebih dari soal karier?'),
      h('p', 'Uji Jelajah bukan layanan konseling, dan fasilitatormu adalah mahasiswa sebaya, bukan konselor. Bila kamu sedang merasa berat, hubungi layanan konseling kampusmu. Kamu juga boleh berhenti dari program kapan saja tanpa pengaruh pada nilai.'),
    ),
    h(
      'section',
      { class: 'card stack', 'aria-labelledby': 'data-h' },
      h('h2', { id: 'data-h' }, 'Unduh dataku'),
      h('p', { class: 'muted' }, 'Satu berkas JSON berisi akun, jawaban kuesioner, dugaan, percakapan dengan Pendamping AI, percobaan, refleksi, keputusan, dan kendala.'),
      h('div', dl),
    ),
    h(
      'section',
      { class: 'danger-zone', 'aria-labelledby': 'del-h' },
      h('h2', { id: 'del-h' }, 'Hapus akun'),
      h('p', 'Semua datamu akan terhapus dan tidak bisa dikembalikan, termasuk dugaan, refleksi, dan jawaban kuesioner. Unduh datamu dulu bila ingin menyimpannya.'),
      delForm,
    ),
  );
}
