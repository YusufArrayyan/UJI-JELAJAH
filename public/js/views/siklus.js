// Tiga tahap siklus: Dugaan, Uji, Tinjau.
import { h, icon, busy, clear } from '../dom.js';
import { get, post } from '../api.js';
import { field, choices, selectField, stageTag, notice, formMessage, toast, kv, quote, meter, emptyState } from '../ui.js';
import { dateShort, dateLong, time, slotLabel, minutes, VERDICT, DECISION, STAGE } from '../format.js';

async function loadCycle(id) {
  const s = await get('/api/my/state');
  const c = s.cycles.find((x) => String(x.id) === String(id));
  return { s, c };
}

function head(c, stage, title, lede) {
  return h('header', { class: 'page-head' }, h('a', { class: 'back-link', href: '#/beranda' }, icon('arrowLeft'), 'Beranda'), h('div', stageTag(stage, `Siklus ${c.n} · ${STAGE[stage]}`)), h('h1', title), lede && h('p', { class: 'lede' }, lede));
}

function notHere(c, s) {
  if (!c) return emptyState('alert', 'Siklus tidak ditemukan', 'Mungkin tautannya lama. Buka siklusmu dari Beranda.', h('a', { class: 'btn', href: '#/beranda' }, 'Ke Beranda'));
  if (c.locked) return emptyState('lock', `Siklus ${c.n} masih terkunci`, `Selesaikan siklus ${c.n - 1} dulu.`, h('a', { class: 'btn', href: '#/beranda' }, 'Ke Beranda'));
  return null;
}

const redirectFor = (c) => (c.stage === 'dugaan' ? `/dugaan/${c.id}` : c.stage === 'uji' ? `/uji/${c.id}` : `/tinjau/${c.id}`);

// ======================= DUGAAN =======================
export async function dugaan({ params, go, reload }) {
  const { s, c } = await loadCycle(params.id);
  const miss = notHere(c, s);
  if (miss) return miss;
  if (c.stage !== 'dugaan') return go(redirectFor(c));

  let chat = await post(`/api/cycles/${c.id}/chat`);
  const steps = h('div', { class: 'steps', role: 'img' });
  const chatBox = h('div', { class: 'chat', 'aria-live': 'polite' });
  const below = h('div', { class: 'stack' });
  const draftBox = h('div');

  function paintSteps() {
    clear(steps);
    for (let i = 0; i < chat.total; i++) steps.append(h('i', { class: i < chat.answered ? 'on' : '' }));
    steps.setAttribute('aria-label', `${chat.answered} dari ${chat.total} pertanyaan terjawab`);
  }
  function paintChat() {
    clear(chatBox);
    for (const m of chat.messages) {
      chatBox.append(h('div', { class: `bubble ${m.sender === 'ai' ? 'ai' : 'me'}` }, h('span', { class: 'who-label' }, m.sender === 'ai' ? 'Pendamping AI' : 'Kamu'), h('p', m.text)));
    }
  }
  function paintBelow() {
    clear(below);
    if (!chat.done) {
      const ans = field({ label: `Jawabanmu untuk pertanyaan ${chat.answered + 1}`, name: 'answer', textarea: true, rows: 3, maxlength: 1000, hint: 'Tulis seadanya. Tekan Ctrl+Enter untuk mengirim.' });
      const send = h('button', { class: 'btn', type: 'submit' }, 'Kirim jawaban');
      const msg = formMessage();
      const form = h('form', { class: 'chat-form', novalidate: true }, ans, msg, h('div', { class: 'row' }, send));
      ans.input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) form.requestSubmit();
      });
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        busy(send, async () => {
          const v = ans.input.value.trim();
          if (v.length < 2) return ans.setError('Jawabanmu masih kosong. Satu kalimat pun cukup.');
          try {
            chat = await post(`/api/cycles/${c.id}/chat`, { answer: v });
            paintSteps();
            paintChat();
            paintBelow();
            below.querySelector('textarea, button')?.focus();
          } catch (err) {
            msg.show('err', err.message);
          }
        })();
      });
      below.append(form);
    } else if (!draftBox.hasChildNodes()) {
      const mk = h('button', { class: 'btn', type: 'button' }, icon('sparkle'), 'Susun draf dugaan');
      const msg = formMessage();
      mk.addEventListener('click', busy(mk, async () => {
        try {
          const d = await post(`/api/cycles/${c.id}/draft`);
          clear(below);
          paintDraft(d.draft, d.fallback);
          draftBox.querySelector('textarea')?.focus();
        } catch (err) {
          msg.show('err', err.message);
        }
      }));
      below.append(h('div', { class: 'chat-form' }, h('p', 'Kelima pertanyaan sudah terjawab. Pendamping AI akan menyusun draf dari kata-katamu sendiri, lalu kamu yang menyuntingnya.'), msg, h('div', mk)));
    }
    const reset = h('button', { class: 'link-btn small', type: 'button' }, 'Ulangi dari awal');
    reset.addEventListener('click', async () => {
      if (!reset.dataset.armed) {
        reset.dataset.armed = '1';
        reset.textContent = 'Yakin? Jawaban dan draf akan dihapus. Tekan lagi untuk mengulang.';
        return;
      }
      chat = await post(`/api/cycles/${c.id}/chat`, { reset: true });
      clear(draftBox);
      paintSteps();
      paintChat();
      paintBelow();
    });
    if (chat.answered > 0) below.append(h('div', reset));
  }

  function paintDraft(d, fallback) {
    clear(draftBox);
    const st = field({ label: 'Dugaanku', name: 'statement', textarea: true, rows: 5, value: d.statement, maxlength: 800, minlength: 20, counter: true });
    const rs = field({ label: 'Alasanku menduga begitu', name: 'reason', textarea: true, rows: 3, value: d.reason, maxlength: 800 });
    const sg = field({ label: 'Tanda dugaanku benar atau salah', name: 'signal', textarea: true, rows: 3, value: d.signal, maxlength: 800 });
    const msg = formMessage();
    const save = h('button', { class: 'btn', type: 'submit' }, 'Simpan dugaan');
    const form = h('form', { class: 'stack', novalidate: true }, st, rs, sg, msg, h('div', save));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      busy(save, async () => {
        if (st.input.value.trim().length < 20) return st.setError('Dugaanmu terlalu pendek. Tulis minimal 20 karakter supaya bisa diuji.'), st.input.focus();
        try {
          const out = await post(`/api/cycles/${c.id}/hypothesis`, { statement: st.input.value, reason: rs.input.value, signal: sg.input.value });
          toast(out.edited ? 'Dugaanmu tersimpan, lengkap dengan suntinganmu.' : 'Dugaanmu tersimpan.');
          go(`/uji/${c.id}`);
        } catch (err) {
          msg.show('err', err.message);
        }
      })();
    });
    draftBox.append(
      h(
        'section',
        { class: 'card stack', 'aria-labelledby': 'draft-h' },
        h('div', { class: 'row between' }, h('h2', { id: 'draft-h' }, 'Draf dugaanmu'), h('span', { class: 'tag ai' }, icon('sparkle'), 'Draf dari Pendamping AI')),
        fallback
          ? notice('warn', 'Pendamping AI tidak bisa menyusun draf kali ini, jadi kami memakai templat. Ganti bagian dalam kurung siku dengan kata-katamu.')
          : h('p', { class: 'hint' }, 'Kamu bebas mengubahnya. Dugaan yang baik bisa diuji dalam paling lama 6 jam. Fasilitatormu melihat versi AI dan versimu.'),
        form,
      ),
    );
  }

  paintSteps();
  paintChat();
  if (c.hypothesis?.ai_draft) paintDraft(c.hypothesis.ai_draft, false);
  paintBelow();

  return h(
    'div',
    { class: 'stack-lg' },
    head(c, 'dugaan', 'Tulis satu dugaan tentang pekerjaan', 'Jawab lima pertanyaan singkat. Jawabanmu tidak dinilai.'),
    steps,
    h(
      'section',
      { class: 'card stack', 'aria-label': 'Percakapan dengan Pendamping AI' },
      chatBox,
      below,
      h('p', { class: 'tiny muted' }, `Pendamping AI hanya bertanya dan merangkum. Ia tidak menilai dan tidak memberi saran karier. Penyedia: ${s.ai_provider === 'mock' ? 'simulasi (tanpa model sungguhan)' : s.ai_provider}.`),
    ),
    draftBox,
  );
}

// ======================= UJI =======================
const TYPES = [
  { value: 'wawancara', label: 'Wawancara praktisi', sub: 'Ngobrol 1 jam dengan orang yang menjalaninya' },
  { value: 'bayangan', label: 'Membayangi kerja', sub: 'Ikut mengamati satu pagi atau satu shift' },
  { value: 'proyek_mini', label: 'Proyek mini', sub: 'Kerjakan satu tugas kecil khas pekerjaan itu' },
  { value: 'kelas_terbuka', label: 'Kelas atau acara terbuka', sub: 'Ikut kelas, lokakarya, atau seminar praktis' },
  { value: 'relawan', label: 'Relawan singkat', sub: 'Bantu kegiatan nyata di bidang itu' },
];
const DURATIONS = [15, 30, 45, 60, 90, 120, 180, 240, 300, 360];
const pad = (n) => String(n).padStart(2, '0');
const hms = (sec) => `${pad(Math.floor(sec / 3600))}:${pad(Math.floor((sec % 3600) / 60))}:${pad(sec % 60)}`;

export async function uji({ params, go, reload }) {
  const { s, c } = await loadCycle(params.id);
  const miss = notHere(c, s);
  if (miss) return miss;
  if (c.stage !== 'uji') return go(redirectFor(c));
  const x = c.experiment;
  const partners = (await get('/api/coord/partners')).partners;

  const hyp = h('section', { class: 'card soft' }, kv('Dugaanku', quote(c.hypothesis?.statement)));

  // --- Formulir rencana ---
  function planForm(onCancel) {
    const type = choices({ legend: 'Jenis percobaan', name: 'type', options: TYPES, value: x?.type });
    const title = field({ label: 'Judul percobaan', hint: 'Satu kalimat, misalnya “Wawancara satu analis data selama satu jam”.', name: 'title', value: x?.title ?? '', maxlength: 140 });
    const partner = selectField({
      label: 'Mitra dari bank mitra (opsional)',
      hint: 'Mitra yang sudah bersedia menerima percobaan mahasiswa. Semua nama di prototipe fiktif.',
      name: 'partner',
      value: x?.partner_id ?? '',
      options: [{ value: '', label: 'Tanpa mitra dari bank / mitraku sendiri' }, ...partners.map((p) => ({ value: p.id, label: `${p.name} · ${p.field}` }))],
    });
    const note = field({ label: 'Mitramu sendiri (opsional)', hint: 'Tulis peran saja, misalnya “Kakak tingkat yang kerja di bank”. Tanpa nomor atau kontak.', name: 'partner_note', value: x?.partner_note ?? '', maxlength: 140 });
    const dur = selectField({ label: 'Durasi rencana', hint: 'Paling sebentar 15 menit, paling lama 6 jam.', name: 'planned', value: x?.planned_minutes ?? 60, options: DURATIONS.map((m) => ({ value: m, label: minutes(m) })) });
    const msg = formMessage();
    const save = h('button', { class: 'btn', type: 'submit' }, x ? 'Simpan perubahan' : 'Simpan rencana');
    const form = h('form', { class: 'stack-lg', novalidate: true }, type, title, h('div', { class: 'grid-2' }, partner, note), dur, msg, h('div', { class: 'row' }, save, onCancel && h('button', { class: 'btn ghost', type: 'button', onclick: onCancel }, 'Batal')));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      busy(save, async () => {
        if (!type.value()) return msg.show('err', 'Pilih jenis percobaan dulu.');
        if (title.input.value.trim().length < 5) return title.setError('Judul minimal 5 karakter.'), title.input.focus();
        try {
          await post(`/api/cycles/${c.id}/experiment`, { type: type.value(), title: title.input.value, partner_id: partner.input.value || null, partner_note: note.input.value, planned_minutes: Number(dur.input.value) });
          toast('Rencana percobaanmu tersimpan.');
          reload();
        } catch (err) {
          msg.show('err', err.message);
        }
      })();
    });
    return h('section', { class: 'card stack', 'aria-labelledby': 'plan-h' }, h('h2', { id: 'plan-h' }, x ? 'Ubah rencana percobaan' : 'Rancang percobaanmu'), h('p', { class: 'muted' }, 'Pilih satu percobaan kecil yang bisa kamu lakukan di sela kuliah. Total waktu tercatat paling banyak 6 jam.'), form);
  }

  if (!x) return h('div', { class: 'stack-lg' }, head(c, 'uji', 'Ujilah dugaanmu', null), hyp, planForm());

  // --- Ringkasan rencana ---
  const running = !!x.timer_started_at;
  const left = 360 - x.logged_minutes;
  const summary = h(
    'section',
    { class: 'card stack', 'aria-labelledby': 'exp-h' },
    h('div', { class: 'card-head' }, h('div', { class: 'stack', style: { gap: '4px' } }, h('p', { class: 'label' }, x.type_label), h('h2', { id: 'exp-h' }, x.title)), h('div', { class: 'row', style: { gap: '8px', flexWrap: 'nowrap' } }, h('span', { class: `tag ${running ? 'uji' : 'plain'}` }, running ? 'Berjalan' : 'Direncanakan'))),
    x.partner_name || x.partner_note ? h('p', { class: 'muted' }, `Mitra: ${[x.partner_name, x.partner_note].filter(Boolean).join(' · ')}`) : null,
    h('div', { class: 'stack', style: { gap: '8px' } }, h('div', { class: 'row between small' }, h('b', `${minutes(x.logged_minutes)} tercatat`), h('span', { class: 'muted' }, `rencana ${minutes(x.planned_minutes)} · batas 6 jam`)), meter(x.logged_minutes / 360, x.planned_minutes / 360, { label: `${x.logged_minutes} dari 360 menit tercatat, rencana ${x.planned_minutes} menit` })),
  );
  const edit = h('button', { class: 'btn ghost small', type: 'button' }, 'Ubah rencana');
  edit.addEventListener('click', () => summary.replaceWith(planForm(() => reload())));
  summary.querySelector('.card-head > .row').append(edit);

  // --- Penghitung waktu ---
  const clock = h('p', { class: `clock${running ? ' running' : ''}`, 'aria-live': 'off' }, '00:00:00');
  const tmsg = formMessage();
  const toggle = h('button', { class: running ? 'btn danger' : 'btn', type: 'button', disabled: !running && left <= 0 }, icon(running ? 'stop' : 'play'), running ? 'Berhenti' : 'Mulai');
  toggle.addEventListener('click', busy(toggle, async () => {
    try {
      const out = await post(`/api/experiments/${x.id}/${running ? 'stop' : 'start'}`);
      if (running) toast(out.capped ? 'Waktu dibulatkan ke batas 6 jam.' : `${out.added} menit ditambahkan.`);
      reload();
    } catch (err) {
      tmsg.show('err', err.message);
    }
  }));
  if (running) {
    const started = Date.parse(x.timer_started_at);
    let mounted = false;
    const tick = () => {
      if (clock.isConnected) mounted = true;
      else if (mounted) return clearInterval(iv);
      clock.textContent = hms(Math.max(0, Math.floor((Date.now() - started) / 1000)));
    };
    const iv = setInterval(tick, 1000);
    tick();
  }
  const manual = field({ label: 'Catat manual (menit)', name: 'minutes', type: 'number', inputmode: 'numeric', min: 5, max: left, step: 5, value: '' });
  const logBtn = h('button', { class: 'btn secondary', type: 'submit', disabled: running }, 'Catat waktu');
  const logForm = h('form', { class: 'inline-form', novalidate: true }, manual, logBtn);
  logForm.addEventListener('submit', (e) => {
    e.preventDefault();
    busy(logBtn, async () => {
      const m = Number(manual.input.value);
      if (!Number.isInteger(m) || m < 5) return manual.setError('Catat minimal 5 menit, dalam angka bulat.');
      if (m > left) return manual.setError(`Sisa waktumu ${left} menit. Total paling banyak 6 jam per siklus.`);
      try {
        await post(`/api/experiments/${x.id}/log`, { minutes: m });
        toast(`${m} menit dicatat.`);
        reload();
      } catch (err) {
        manual.setError(err.message);
      }
    })();
  });
  const timer = h(
    'section',
    { class: 'card stack', 'aria-labelledby': 'tm-h' },
    h('h2', { id: 'tm-h' }, 'Catat waktu'),
    h('div', { class: 'row between' }, h('div', { class: 'row', style: { gap: '4px' } }, running && h('span', { class: 'pulse', 'aria-hidden': 'true' }), clock), toggle),
    running ? h('p', { class: 'hint' }, `Berjalan sejak ${time(x.timer_started_at)} WIB. Tekan Berhenti bila percobaanmu selesai.`) : h('p', { class: 'hint' }, left > 0 ? `Sisa waktumu ${minutes(left)} dari batas 6 jam.` : 'Waktumu sudah mencapai batas 6 jam.'),
    tmsg,
    logForm,
  );

  // --- Konfirmasi mitra ---
  const link = `${location.origin}/#/konfirmasi/${x.confirm_token}`;
  const linkInput = h('input', { class: 'input mono', readonly: true, value: link, 'aria-label': 'Tautan konfirmasi mitra', style: { fontSize: '14px' } });
  linkInput.addEventListener('focus', () => linkInput.select());
  const copy = h('button', { class: 'btn secondary small', type: 'button' }, icon('copy'), 'Salin tautan');
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast('Tautan tersalin. Kirim ke mitramu.');
    } catch {
      linkInput.focus();
      linkInput.select();
      toast('Salin manual: tautan sudah terpilih.', 'err');
    }
  });
  const confirm = h(
    'section',
    { class: 'card stack', 'aria-labelledby': 'cf-h' },
    h('h2', { id: 'cf-h' }, 'Konfirmasi mitra (opsional)'),
    h('p', { class: 'muted' }, `Kirim tautan ini ke mitramu. Mitra cukup membukanya dan menekan satu tombol, tanpa akun. Berlaku sampai ${dateShort(x.token_expires_at)}.`),
    linkInput,
    h('div', { class: 'row' }, copy, x.confirmed_at ? h('span', { class: 'tag ok' }, icon('check'), `Dikonfirmasi ${dateShort(x.confirmed_at)}`) : h('span', { class: 'tag plain' }, 'Menunggu konfirmasi')),
  );

  // --- Selesaikan ---
  const canFinish = !running && x.logged_minutes >= 15;
  const fmsg = formMessage();
  const finish = h('button', { class: 'btn', type: 'button', disabled: !canFinish }, 'Selesaikan percobaan');
  finish.addEventListener('click', busy(finish, async () => {
    if (!finish.dataset.armed) {
      finish.dataset.armed = '1';
      finish.textContent = 'Ya, selesaikan dan lanjut ke Tinjau';
      fmsg.show('warn', `Setelah selesai, waktu tidak bisa ditambah lagi. Total tercatat: ${minutes(x.logged_minutes)}.`);
      return;
    }
    try {
      await post(`/api/experiments/${x.id}/finish`);
      toast('Percobaan selesai. Sekarang tinjau hasilnya.');
      go(`/tinjau/${c.id}`);
    } catch (err) {
      fmsg.show('err', err.message);
    }
  }));
  const done = h(
    'section',
    { class: 'card stack', 'aria-labelledby': 'fin-h' },
    h('h2', { id: 'fin-h' }, 'Sudah selesai mencoba?'),
    h('p', { class: 'muted' }, canFinish ? 'Selesaikan percobaan untuk menulis refleksi dan menjadwalkan sesi Tinjau.' : running ? 'Hentikan penghitung waktu dulu.' : `Percobaan bisa diselesaikan setelah minimal 15 menit tercatat. Saat ini ${minutes(x.logged_minutes)}.`),
    fmsg,
    h('div', finish),
  );

  return h('div', { class: 'stack-lg' }, head(c, 'uji', 'Ujilah dugaanmu', null), hyp, summary, timer, confirm, done);
}

// ======================= TINJAU =======================
const DECISIONS = [
  { value: 'lanjut', label: 'Lanjutkan dugaan', sub: 'Uji lebih dalam bidang yang sama di siklus berikutnya' },
  { value: 'ubah', label: 'Ubah dugaan', sub: 'Geser ke bagian atau bidang yang ternyata lebih menarik' },
  { value: 'tinggalkan', label: 'Tinggalkan dugaan', sub: 'Sudah cukup tahu; coba bidang lain' },
];

export async function tinjau({ params, go, reload }) {
  const { s, c } = await loadCycle(params.id);
  const miss = notHere(c, s);
  if (miss) return miss;
  if (c.stage === 'dugaan' || c.stage === 'uji') return go(redirectFor(c));
  const r = c.reflection;
  const ses = c.session;
  const x = c.experiment;

  const recap = h(
    'section',
    { class: 'card soft' },
    kv('Dugaanku', quote(c.hypothesis?.statement)),
    x &&
      kv(
        'Percobaanku',
        h('p', { class: 'row', style: { gap: '8px' } }, `${x.title} · ${minutes(x.logged_minutes)}`, x.confirmed_at ? h('span', { class: 'tag ok' }, icon('check'), 'Dikonfirmasi mitra') : null),
      ),
  );

  // --- Refleksi ---
  function reflectionForm(onCancel) {
    const what = field({ label: 'Apa yang terjadi saat kamu mencoba?', hint: 'Ceritakan apa yang kamu lihat, kerjakan, dan rasakan. Minimal 20 karakter.', name: 'what', textarea: true, rows: 5, value: r?.what_happened ?? '', maxlength: 1500, minlength: 20, counter: true });
    const sur = field({ label: 'Apa yang mengejutkanmu? (opsional)', name: 'surprise', textarea: true, rows: 3, value: r?.surprise ?? '', maxlength: 800 });
    const ver = choices({ legend: 'Menurutmu, dugaanmu…', name: 'verdict', cols: 3, value: r?.verdict, options: [{ value: 'terbukti', label: 'Terbukti' }, { value: 'sebagian', label: 'Terbukti sebagian' }, { value: 'tidak', label: 'Tidak terbukti' }] });
    const msg = formMessage();
    const send = h('button', { class: 'btn', type: 'submit' }, r ? 'Kirim ulang refleksi' : 'Kirim refleksi');
    const form = h('form', { class: 'stack-lg', novalidate: true }, what, sur, ver, msg, h('div', { class: 'row' }, send, onCancel && h('button', { class: 'btn ghost', type: 'button', onclick: onCancel }, 'Batal')));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      busy(send, async () => {
        if (what.input.value.trim().length < 20) return what.setError('Ceritamu masih terlalu pendek. Tulis minimal 20 karakter.'), what.input.focus();
        if (!ver.value()) return msg.show('err', 'Pilih penilaianmu: terbukti, terbukti sebagian, atau tidak terbukti.');
        try {
          const out = await post(`/api/cycles/${c.id}/reflection`, { what_happened: what.input.value, surprise: sur.input.value, verdict: ver.value() });
          toast(out.fallback ? 'Refleksi terkirim. Ringkasan memakai templat; tulis ulang dengan kata-katamu.' : 'Refleksi terkirim. Periksa ringkasannya.');
          reload();
        } catch (err) {
          msg.show('err', err.message);
        }
      })();
    });
    return h('section', { class: 'card stack', 'aria-labelledby': 'rf-h' }, h('h2', { id: 'rf-h' }, 'Tulis refleksimu'), h('p', { class: 'muted' }, 'Setelah kamu kirim, Pendamping AI merangkumnya dengan kata-katamu sendiri.'), form);
  }

  const parts = [head(c, c.stage === 'selesai' ? 'selesai' : 'tinjau', c.stage === 'selesai' ? `Catatan siklus ${c.n}` : 'Tinjau hasil percobaanmu', null), recap];

  if (!r) {
    parts.push(reflectionForm());
    return h('div', { class: 'stack-lg' }, parts);
  }

  // --- Ringkasan ---
  const decided = !!r.decision;
  const sumField = field({ label: 'Ringkasanku', name: 'summary', textarea: true, rows: 5, value: r.summary_final ?? r.ai_summary ?? '', maxlength: 1500 });
  const smsg = formMessage();
  const sbtn = h('button', { class: 'btn secondary', type: 'submit' }, 'Simpan ringkasan');
  const sform = h('form', { class: 'stack', novalidate: true }, sumField, smsg, h('div', sbtn));
  sform.addEventListener('submit', (e) => {
    e.preventDefault();
    busy(sbtn, async () => {
      if (sumField.input.value.trim().length < 10) return sumField.setError('Ringkasanmu terlalu pendek. Tulis minimal 10 karakter.');
      try {
        await post(`/api/cycles/${c.id}/summary`, { text: sumField.input.value });
        smsg.show('ok', 'Ringkasanmu sudah tersimpan.');
      } catch (err) {
        smsg.show('err', err.message);
      }
    })();
  });
  const summaryCard = h(
    'section',
    { class: 'card stack', 'aria-labelledby': 'sm-h' },
    h('div', { class: 'row between' }, h('h2', { id: 'sm-h' }, 'Ringkasan refleksimu'), h('span', { class: 'tag ai' }, icon('sparkle'), 'Ringkasan dari Pendamping AI')),
    kv('Yang terjadi', h('p', r.what_happened)),
    r.surprise ? kv('Yang mengejutkan', h('p', r.surprise)) : null,
    kv('Penilaianmu', h('p', VERDICT[r.verdict])),
    decided
      ? kv('Ringkasan akhir', quote(r.summary_final ?? r.ai_summary))
      : h('div', { class: 'stack' }, h('p', { class: 'hint' }, 'Periksa dan ubah sampai sesuai maksudmu. Fasilitatormu melihat versi AI dan versimu.'), sform),
  );
  if (!ses && !decided) {
    const again = h('button', { class: 'btn ghost small', type: 'button' }, 'Ubah refleksi');
    again.addEventListener('click', () => summaryCard.replaceWith(reflectionForm(() => reload())));
    summaryCard.firstChild.append(again);
  }
  parts.push(summaryCard);

  // --- Sesi ---
  if (!ses) {
    let slotData;
    try {
      slotData = await get('/api/slots');
    } catch (err) {
      parts.push(notice('err', err.message));
      return h('div', { class: 'stack-lg' }, parts);
    }
    const msg = formMessage();
    const book = h('button', { class: 'btn', type: 'submit', disabled: !slotData.slots.length }, icon('calendar'), 'Jadwalkan sesi');
    const grid = h('div', { class: 'slots' });
    let lastDay = '';
    for (const sl of slotData.slots) {
      const day = dateLong(sl);
      if (day !== lastDay) {
        grid.append(h('p', { class: 'slot-day' }, day));
        lastDay = day;
      }
      grid.append(h('label', { class: 'choice' }, h('input', { type: 'radio', name: 'slot', value: sl, 'aria-label': slotLabel(sl) }), h('span', `${time(sl)} WIB`)));
    }
    const form = h(
      'form',
      { class: 'stack', novalidate: true },
      h('fieldset', { class: 'stack' }, h('legend', { class: 'visually-hidden' }, 'Pilih jam sesi'), slotData.slots.length ? grid : emptyState('calendar', 'Belum ada jam kosong', 'Semua jam fasilitatormu dalam 7 hari ke depan sudah terisi. Coba lagi besok, atau laporkan kendala di Beranda.')),
      msg,
      h('div', book),
    );
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      busy(book, async () => {
        const v = form.querySelector('input[name=slot]:checked')?.value;
        if (!v) return msg.show('err', 'Pilih satu jam dulu.');
        try {
          await post(`/api/cycles/${c.id}/session`, { slot_at: v });
          toast('Sesi terjadwal.');
          reload();
        } catch (err) {
          msg.show('err', err.message);
        }
      })();
    });
    parts.push(
      h('section', { class: 'card stack', 'aria-labelledby': 'ses-h' }, h('h2', { id: 'ses-h' }, `Jadwalkan sesi 30 menit dengan ${slotData.facilitator}`), h('p', { class: 'muted' }, 'Hari kerja, pukul 09.00, 13.00, atau 15.30 WIB, dalam 7 hari ke depan.'), form),
    );
  } else if (ses.status === 'terjadwal') {
    parts.push(
      h(
        'section',
        { class: 'card stack', 'aria-labelledby': 'ses-h' },
        h('div', { class: 'row between' }, h('h2', { id: 'ses-h' }, 'Sesi Tinjau terjadwal'), h('span', { class: 'tag tinjau' }, 'Terjadwal')),
        h('p', { class: 'row', style: { gap: '8px', color: 'var(--ink)', fontWeight: 600 } }, icon('calendar'), `${slotLabel(ses.slot_at)} · dengan ${ses.facilitator_name}`),
        h(
          'ul',
          { class: 'stack', style: { gap: '6px', paddingLeft: '20px', margin: 0 } },
          h('li', 'Baca lagi ringkasanmu. Ubah bila ada yang belum pas.'),
          h('li', 'Siapkan satu hal yang paling ingin kamu bahas.'),
          h('li', 'Kamu tidak perlu sudah tahu jawabannya. Keputusan diambil setelah sesi.'),
        ),
        notice('info', 'Pilihan keputusan terbuka setelah fasilitatormu menutup sesi.'),
        h('p', { class: 'hint' }, 'Sesi ini membahas karier, bukan konseling. Bila kamu sedang merasa berat, hubungi layanan konseling kampusmu; fasilitator juga bisa membantu menghubungkan.'),
      ),
    );
  } else if (!decided) {
    const dec = choices({ legend: 'Apa keputusanmu untuk dugaan ini?', name: 'decision', options: DECISIONS });
    const note = field({ label: 'Catatan untuk dirimu sendiri (opsional)', name: 'note', textarea: true, rows: 3, maxlength: 500 });
    const msg = formMessage();
    const save = h('button', { class: 'btn', type: 'submit' }, 'Simpan keputusan');
    const form = h('form', { class: 'stack-lg', novalidate: true }, dec, note, msg, h('div', save));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      busy(save, async () => {
        if (!dec.value()) return msg.show('err', 'Pilih salah satu: lanjutkan, ubah, atau tinggalkan.');
        try {
          await post(`/api/cycles/${c.id}/decision`, { decision: dec.value(), note: note.input.value });
          toast(c.n < 3 ? `Siklus ${c.n} selesai. Siklus ${c.n + 1} sekarang terbuka.` : 'Tiga siklus selesai. Saatnya postes.');
          go('/beranda');
        } catch (err) {
          msg.show('err', err.message);
        }
      })();
    });
    parts.push(
      h(
        'section',
        { class: 'card stack', 'aria-labelledby': 'dc-h' },
        h('h2', { id: 'dc-h' }, 'Putuskan nasib dugaanmu'),
        h('p', { class: 'muted' }, `Sesi dengan ${ses.facilitator_name} selesai pada ${dateShort(ses.slot_at)}. Keputusan ini milikmu; tidak ada pilihan yang salah.`),
        form,
      ),
    );
  } else {
    parts.push(
      h(
        'section',
        { class: 'card stack', 'aria-labelledby': 'dc-h' },
        h('h2', { id: 'dc-h' }, 'Keputusanmu'),
        h('p', { class: 'row', style: { gap: '8px' } }, h('span', { class: 'tag ok' }, icon('check'), DECISION[r.decision])),
        r.decision_note ? quote(r.decision_note) : null,
        h('p', { class: 'hint' }, `Sesi Tinjau bersama ${ses.facilitator_name}, ${dateShort(ses.slot_at)}.`),
        h('div', h('a', { class: 'btn secondary', href: '#/beranda' }, 'Ke Beranda')),
      ),
    );
  }
  return h('div', { class: 'stack-lg' }, parts);
}
