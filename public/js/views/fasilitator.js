// Layar fasilitator: Kelompokku dan Detail peserta.
import { h, busy, clear } from '../dom.js';
import { get, post } from '../api.js';
import { field, stageTag, notice, formMessage, toast, pageHead, kv, quote, emptyState, calendarButton } from '../ui.js';
import { dateShort, dateTime, slotLabel, minutes, num, VERDICT, DECISION, STATUS, STAGE } from '../format.js';

function resolveButton(issue, onDone) {
  const b = h('button', { class: 'btn secondary small', type: 'button' }, 'Tandai selesai');
  b.addEventListener('click', busy(b, async () => {
    try {
      await post(`/api/issues/${issue.id}/resolve`);
      toast('Kendala ditandai selesai.');
      onDone();
    } catch (err) {
      toast(err.message, 'err');
    }
  }));
  return b;
}

function stageCell(p) {
  if (p.status === 'terdaftar') return h('span', { class: 'tag plain' }, p.consent ? 'Belum pretes' : 'Belum setuju');
  if (p.status === 'postes') return h('span', { class: 'tag' }, 'Postes');
  if (p.status === 'selesai') return h('span', { class: 'tag ok' }, 'Selesai');
  return stageTag(p.cycle.stage, `Siklus ${p.cycle.n} · ${STAGE[p.cycle.stage]}`);
}

export async function kelompok({ reload, go }) {
  const d = await get('/api/fac/participants');
  if (!d.participants.length) {
    return h('div', { class: 'stack-lg' }, pageHead('Kelompokku', null), emptyState('users', 'Belum ada peserta di kelompokmu', 'Koordinator akan menugaskan peserta kepadamu. Halaman ini terisi otomatis setelahnya.'));
  }
  const now = Date.now();
  const sessions = d.participants.filter((p) => p.session?.status === 'terjadwal').sort((a, b) => a.session.slot_at.localeCompare(b.session.slot_at));

  // Filter
  // Saringan disimpan di URL (#/kelompok?saring=…) supaya bisa dibagikan dan bertahan saat muat ulang.
  const fromUrl = new URLSearchParams(location.hash.split('?')[1] || '').get('saring');
  let filter = ['perhatian', 'sesi'].includes(fromUrl) ? fromUrl : 'semua';
  const FILTERS = [
    ['semua', `Semua (${d.participants.length})`],
    ['perhatian', `Perlu perhatian (${d.stats.attention})`],
    ['sesi', `Sesi terjadwal (${d.stats.sessions})`],
  ];
  const tbody = h('tbody');
  const pills = h('div', { class: 'row', role: 'group', 'aria-label': 'Saring peserta', style: { gap: '6px' } });
  function paint() {
    clear(pills);
    for (const [k, label] of FILTERS) {
      const b = h('button', { class: `btn small ${filter === k ? '' : 'secondary'}`, type: 'button', 'aria-pressed': String(filter === k) }, label);
      b.addEventListener('click', () => {
        filter = k;
        history.replaceState(null, '', k === 'semua' ? '#/kelompok' : `#/kelompok?saring=${k}`);
        paint();
        pills.querySelector('[aria-pressed="true"]')?.focus();
      });
      pills.append(b);
    }
    clear(tbody);
    const rows = d.participants.filter((p) => filter === 'semua' || (filter === 'perhatian' ? p.open_issues > 0 || p.cycle?.overdue : p.session?.status === 'terjadwal'));
    for (const p of rows) {
      const tr = h(
        'tr',
        { class: 'clickable' },
        h('td', { class: 'primary', 'data-label': 'Peserta' }, h('a', { class: 'row-link', href: `#/peserta/${p.id}` }, p.name), h('span', { class: 'cell-sub mono' }, p.code)),
        h('td', { 'data-label': 'Tahap' }, stageCell(p)),
        h('td', { 'data-label': 'Jam percobaan', class: 'nowrap' }, p.minutes ? `${minutes(p.minutes.logged)} / ${minutes(p.minutes.planned)}` : '–'),
        h('td', { 'data-label': 'Sesi', class: 'nowrap' }, p.session ? (p.session.status === 'selesai' ? 'Selesai' : dateTime(p.session.slot_at)) : '–'),
        h('td', { 'data-label': 'Tenggat siklus', class: 'nowrap' }, p.cycle ? h('span', { class: p.cycle.overdue ? 'tag warn' : '' }, p.cycle.overdue ? `Lewat ${dateShort(p.cycle.due_on)}` : dateShort(p.cycle.due_on)) : '–'),
        h('td', { 'data-label': 'Kendala', class: 'num' }, p.open_issues ? h('span', { class: 'tag warn' }, String(p.open_issues)) : '0'),
      );
      tr.addEventListener('click', (e) => { if (!e.target.closest('a')) go(`/peserta/${p.id}`); });
      tbody.append(tr);
    }
    if (!rows.length) tbody.append(h('tr', h('td', { colspan: 6 }, h('p', { class: 'muted', style: { padding: '12px 0' } }, 'Tidak ada peserta untuk saringan ini.'))));
  }
  paint();

  return h(
    'div',
    { class: 'stack-lg' },
    pageHead('Kelompokku', `${d.participants.length} peserta. Setiap kali kamu membuka detail peserta, aksesnya dicatat di log.`),
    h('div', { class: 'stats' }, h('div', { class: 'stat' }, h('b', String(d.stats.total)), h('span', 'Peserta')), h('div', { class: 'stat' }, h('b', String(d.stats.sessions)), h('span', 'Sesi terjadwal')), h('div', { class: 'stat' }, h('b', String(d.stats.attention)), h('span', 'Perlu perhatian'))),
    h(
      'div',
      { class: 'grid-2' },
      h(
        'section',
        { class: 'card stack', 'aria-labelledby': 'up-h' },
        h('h2', { id: 'up-h' }, 'Sesi Tinjau'),
        sessions.length
          ? h(
              'ul',
              { class: 'stack', style: { listStyle: 'none', padding: 0, margin: 0, gap: '10px' } },
              sessions.slice(0, 6).map((p) =>
                h(
                  'li',
                  { class: 'row between' },
                  h('div', h('a', { class: 'row-link', href: `#/peserta/${p.id}`, style: { color: 'var(--ink)', fontWeight: 600 } }, p.name), h('span', { class: 'cell-sub' }, slotLabel(p.session.slot_at))),
                  Date.parse(p.session.slot_at) < now ? h('span', { class: 'tag warn' }, 'Perlu ditutup') : h('span', { class: 'tag tinjau' }, `Siklus ${p.cycle.n}`),
                ),
              ),
            )
          : h('p', { class: 'muted' }, 'Belum ada sesi terjadwal. Peserta memilih jam setelah menulis refleksi.'),
      ),
      h(
        'section',
        { class: 'card stack', 'aria-labelledby': 'is-h' },
        h('h2', { id: 'is-h' }, 'Kendala terbuka'),
        d.issues.length
          ? h(
              'ul',
              { class: 'stack', style: { listStyle: 'none', padding: 0, margin: 0, gap: '14px' } },
              d.issues.map((i) => h('li', { class: 'stack', style: { gap: '6px' } }, h('p', h('b', i.name), h('span', { class: 'muted small' }, ` · ${dateShort(i.created_at)}`)), quote(i.text), h('div', resolveButton(i, reload)))),
            )
          : h('p', { class: 'muted' }, 'Tidak ada kendala terbuka.'),
      ),
    ),
    h(
      'section',
      { class: 'stack', 'aria-labelledby': 'tb-h' },
      h('div', { class: 'row between' }, h('h2', { id: 'tb-h' }, 'Semua peserta'), pills),
      h(
        'div',
        { class: 'table-wrap' },
        h('table', { class: 'responsive' }, h('thead', h('tr', h('th', 'Peserta'), h('th', 'Tahap'), h('th', 'Jam percobaan'), h('th', 'Sesi'), h('th', 'Tenggat siklus'), h('th', { class: 'num' }, 'Kendala'))), tbody),
      ),
    ),
  );
}

export async function detail({ params, reload }) {
  const p = await get(`/api/fac/participants/${encodeURIComponent(params.id)}`);
  const r = p.responses;
  const scoreCard = (title, k) =>
    h('div', { class: 'stat' }, h('span', { class: 'label' }, title), h('p', { style: { color: 'var(--ink)', fontSize: '16px' } }, `Pretes ${num(r.pretes[k], 2)} · Postes ${num(r.postes[k], 2)}`));

  const open = p.issues.filter((i) => !i.resolved);
  const panels = p.cycles.map((c, idx) => cyclePanel(c, idx > 0 && p.cycles[idx - 1].stage !== 'selesai', reload));

  return h(
    'div',
    { class: 'stack-lg' },
    h(
      'header',
      { class: 'page-head' },
      h('a', { class: 'back-link', href: '#/kelompok' }, 'Kembali ke kelompok'),
      h('h1', p.name),
      h('p', { class: 'lede' }, h('span', { class: 'mono' }, p.code), ` · ${p.cohort} · ${STATUS[p.status]}`),
    ),
    h('div', { class: 'grid-2' }, scoreCard('Adaptabilitas karier', 'adaptabilitas'), scoreCard('Efikasi keputusan karier', 'efikasi')),
    open.length
      ? h(
          'section',
          { class: 'card stack', 'aria-labelledby': 'iss-h' },
          h('h2', { id: 'iss-h' }, 'Kendala terbuka'),
          open.map((i) => h('div', { class: 'stack', style: { gap: '6px' } }, quote(i.text), h('div', { class: 'row' }, h('span', { class: 'tiny muted' }, dateShort(i.created_at)), resolveButton(i, reload)))),
        )
      : null,
    p.cycles.length ? panels : emptyState('info', 'Siklus belum dimulai', p.status === 'terdaftar' ? 'Peserta belum menyelesaikan persetujuan atau pretes.' : null),
  );
}

function cyclePanel(c, locked, reload) {
  const body = h('div', { class: 'body' });
  const panel = h('section', { class: `cycle-panel ${locked ? '' : c.stage}`, 'aria-labelledby': `cp-${c.id}` }, h('header', h('h2', { id: `cp-${c.id}` }, `Siklus ${c.n}`), locked ? h('span', { class: 'tag plain' }, 'Terkunci') : stageTag(c.stage)), body);
  const hy = c.hypothesis;
  if (!hy?.saved) {
    body.append(h('p', { class: 'empty' }, locked ? 'Terbuka setelah siklus sebelumnya selesai.' : 'Belum ada dugaan.'));
    return panel;
  }
  // Dugaan: versi AI dan versi peserta berdampingan bila disunting
  body.append(
    kv(
      'Dugaan',
      hy.edited && hy.ai_draft
        ? h('div', { class: 'compare' }, h('div', { class: 'ai-side' }, h('span', { class: 'tag ai', style: { justifySelf: 'start' } }, 'Draf Pendamping AI'), h('p', hy.ai_draft.statement)), h('div', { class: 'me-side' }, h('span', { class: 'tag plain', style: { justifySelf: 'start' } }, 'Versi peserta (disunting)'), h('p', hy.statement)))
        : h('div', { class: 'stack', style: { gap: '6px' } }, quote(hy.statement), h('p', { class: 'tiny muted' }, 'Peserta menyimpan draf Pendamping AI tanpa mengubahnya.')),
    ),
  );
  if (hy.reason) body.append(kv('Alasan', h('p', hy.reason)));
  if (hy.signal) body.append(kv('Tanda benar atau salah', h('p', hy.signal)));

  const x = c.experiment;
  if (x) {
    body.append(
      kv(
        'Uji',
        h(
          'p',
          { class: 'row', style: { gap: '8px' } },
          `${x.title} · ${x.type_label} · ${minutes(x.logged_minutes)} dari ${minutes(x.planned_minutes)}`,
          x.confirmed_at ? h('span', { class: 'tag ok' }, 'Dikonfirmasi mitra') : h('span', { class: 'tag plain' }, 'Belum dikonfirmasi mitra'),
        ),
      ),
    );
  }
  const rf = c.reflection;
  if (rf) {
    body.append(kv('Refleksi peserta', h('div', { class: 'stack', style: { gap: '6px' } }, quote(rf.what_happened), rf.surprise ? h('p', { class: 'small muted' }, `Yang mengejutkan: ${rf.surprise}`) : null, h('div', h('span', { class: 'tag tinjau' }, VERDICT[rf.verdict])))));
    body.append(
      kv(
        'Ringkasan',
        h(
          'div',
          { class: 'stack', style: { gap: '8px' } },
          h(
            'div',
            { class: 'compare' },
            h('div', { class: 'ai-side' }, h('span', { class: 'tag ai', style: { justifySelf: 'start' } }, 'Versi Pendamping AI'), h('p', rf.ai_summary ?? '–')),
            h('div', { class: 'me-side' }, h('span', { class: 'tag plain', style: { justifySelf: 'start' } }, rf.summary_final && rf.summary_final !== rf.ai_summary ? 'Versi peserta (disunting)' : 'Versi peserta'), h('p', rf.summary_final ?? 'Peserta belum menyimpan versinya.')),
          ),
          h('p', { class: 'tiny muted' }, 'Periksa dulu. Ringkasan AI bisa meleset dari yang peserta maksud.'),
        ),
      ),
    );
  }
  const s = c.session;
  if (s?.status === 'terjadwal') body.append(closeSessionForm(s, reload));
  else if (s?.status === 'selesai') {
    body.append(kv('Sesi Tinjau', h('div', { class: 'stack', style: { gap: '6px' } }, h('p', `Selesai · ${slotLabel(s.slot_at)}`), s.note ? quote(s.note) : null, h('div', h('span', { class: `tag ${s.summary_checked ? 'ok' : 'warn'}` }, s.summary_checked ? 'Ringkasan diperiksa' : 'Ringkasan tidak dicentang diperiksa')))));
  }
  if (rf?.decision) body.append(kv('Keputusan peserta', h('div', { class: 'stack', style: { gap: '6px' } }, h('div', h('span', { class: 'tag ok' }, DECISION[rf.decision])), rf.decision_note ? h('p', { class: 'small muted' }, rf.decision_note) : null)));
  return panel;
}

function closeSessionForm(s, reload) {
  const note = field({ label: 'Catatan sesi', hint: 'Tulis apa yang dibahas dan apa yang peserta temukan. Jangan catat hal pribadi di luar topik karier.', name: 'note', textarea: true, rows: 4, maxlength: 1500, minlength: 10, counter: true, placeholder: 'Contoh: peserta menemukan bahwa kerja lapangan lebih cocok daripada dugaannya. Disepakati menguji lagi dengan satu praktisi lain…' });
  const chk = h('input', { type: 'checkbox', id: `chk-${s.id}` });
  const msg = formMessage();
  const btn = h('button', { class: 'btn', type: 'submit' }, 'Tandai sesi selesai');
  const form = h(
    'form',
    { class: 'card stack', novalidate: true, style: { background: 'var(--canvas)' } },
    h('div', { class: 'row between' }, h('h3', `Sesi Tinjau ${slotLabel(s.slot_at)}`), calendarButton(`/api/sessions/${s.id}/session.ics`)),
    note,
    h('label', { class: 'check', for: `chk-${s.id}` }, chk, h('span', 'Aku sudah memeriksa ringkasan Pendamping AI dan mencocokkannya dengan cerita peserta.')),
    msg,
    h('div', btn),
  );
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    busy(btn, async () => {
      if (note.input.value.trim().length < 10) return note.setError('Catatan sesi minimal 10 karakter.'), note.input.focus();
      try {
        await post(`/api/sessions/${s.id}/complete`, { note: note.input.value, summary_checked: chk.checked });
        toast('Sesi ditutup. Peserta sekarang bisa mencatat keputusannya.');
        reload();
      } catch (err) {
        msg.show('err', err.message);
      }
    })();
  });
  return form;
}
