/* MyRecord — views: library, step sequencer, piano roll, song playlist, mixer, inspector. */
(function () {
  const MR = window.MR, ui = MR.ui, h = MR.h;
  const P = () => MR.state.project;
  const $ = (id) => document.getElementById(id);

  function dropZone(el, accept, fn) { el.dataset.accept = accept; el._onDrop = fn; return el; }
  MR.select = function (chId) { P().selected = chId; MR.emit('select'); };
  const isMelodic = (ch) => (MR.INSTRUMENTS[ch.inst] || {}).kind === 'melodic';

  // ======================= LIBRARY =======================
  MR.renderBrowser = function () {
    const list = $('browserList'); list.innerHTML = '';
    document.querySelectorAll('#browserTabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === ui.tab));
    const q = ui.search.trim().toLowerCase();
    const match = (...s) => !q || s.join(' ').toLowerCase().includes(q);
    const addBtn = (title, fn) => h('button', { class: 'add', title, onclick: (e) => { e.stopPropagation(); fn(); } }, MR.icon('plus'));

    if (ui.tab === 'beats') {
      list.appendChild(h('div', { class: 'group-label' }, 'Start from a beat'));
      MR.TEMPLATES.filter((t) => match(t.name, t.mood)).forEach((t) => {
        const card = templateCard(t);
        card.title = 'Drag into the workspace, or click to apply';
        card.addEventListener('click', () => applyTemplate(t));
        MR.draggable(card, { kind: 'template', id: t.id, label: t.name + ' beat' });
        list.appendChild(card);
      });
    }

    if (ui.tab === 'sounds') {
      const cats = {};
      Object.values(MR.INSTRUMENTS).filter((i) => i.id !== 'sample').forEach((i) => (cats[i.cat] = cats[i.cat] || []).push(i));
      const userSamples = Object.keys(MR.samples).map((id) => ({ id, name: MR.samples[id].name }));
      if (userSamples.length) cats['Your sounds'] = userSamples.map((s) => ({ id: 'sample', sampleId: s.id, name: s.name, cat: 'Your sounds' }));
      Object.keys(cats).forEach((cat) => {
        const items = cats[cat].filter((i) => match(i.name, cat)); if (!items.length) return;
        list.appendChild(h('div', { class: 'group-label' }, cat));
        items.forEach((i) => {
          const payload = { kind: 'sound', id: i.id, sampleId: i.sampleId, label: i.name };
          const el = h('div', { class: 'item', title: 'Drag onto the step sequencer' },
            h('span', { class: 'ico' }, MR.icon(MR.instIcon(i.id))),
            h('button', { class: 'play-mini', title: 'Listen', onclick: (e) => { e.stopPropagation(); audition(payload); } }, MR.svg(MR.ICONS.play)),
            h('span', { class: 'txt' }, h('b', null, i.name), h('small', null, MR.INSTRUMENTS[i.id].kind === 'melodic' ? 'Melodic · piano roll' : cat === 'Your sounds' ? 'Your sample' : 'One-shot')),
            addBtn('Add to beat', () => addSound(payload)));
          el.addEventListener('dblclick', () => addSound(payload));
          MR.draggable(el, payload); list.appendChild(el);
        });
      });
    }

    if (ui.tab === 'fx') {
      list.appendChild(h('div', { class: 'group-label' }, 'Drop on a sound or the mixer'));
      Object.values(MR.FX).filter((f) => match(f.name, f.desc)).forEach((f) => {
        const payload = { kind: 'fx', id: f.id, label: f.name };
        const el = h('div', { class: 'item' }, h('span', { class: 'ico' }, MR.icon(f.id)), h('span', { class: 'txt' }, h('b', null, f.name), h('small', null, f.desc)),
          addBtn('Add to selected', () => addFxToSelection(f.id)));
        el.addEventListener('dblclick', () => addFxToSelection(f.id));
        MR.draggable(el, payload); list.appendChild(el);
      });
    }

    if (ui.tab === 'grooves') {
      list.appendChild(h('div', { class: 'group-label' }, 'Drop on a sound row'));
      MR.GROOVES.filter((g) => match(g.name)).forEach((g) => {
        const grid = h('div', { class: 'mini-grid' }, MR.parseSteps(g.steps).map((v) => h('i', { class: v ? 'on g' : '' })));
        const el = h('div', { class: 'tpl-card', title: 'Drag onto a sound row, or click to apply to the selected sound' },
          h('div', { class: 'row' }, h('b', { style: { fontSize: '13px' } }, g.name), addBtn('Apply to selected', () => applyGroove(g))), grid);
        el.addEventListener('click', () => applyGroove(g));
        MR.draggable(el, { kind: 'groove', id: g.id, label: g.name }); list.appendChild(el);
      });
    }

    if (ui.tab === 'chords') {
      list.appendChild(h('div', { class: 'group-label' }, 'Chord progressions · in ' + MR.NOTE_NAMES[P().key] + ' ' + P().scale));
      MR.PROGRESSIONS.filter((c) => match(c.name, c.tag)).forEach((c) => {
        const el = h('div', { class: 'item' }, h('span', { class: 'ico' }, MR.icon('chord')), h('span', { class: 'txt' }, h('b', null, c.name), h('small', null, c.tag)),
          addBtn('Add to selected sound', () => applyChord(c)));
        el.addEventListener('dblclick', () => applyChord(c));
        MR.draggable(el, { kind: 'chord', id: c.id, label: c.name }); list.appendChild(el);
      });
      list.appendChild(h('div', { class: 'group-label' }, 'Melody helpers'));
      MR.MELODY_TOOLS.filter((t) => match(t.name, t.tag)).forEach((t) => {
        const el = h('div', { class: 'item' }, h('span', { class: 'ico' }, MR.icon('wand')), h('span', { class: 'txt' }, h('b', null, t.name), h('small', null, t.tag)),
          addBtn('Apply to selected sound', () => applyTool(t)));
        MR.draggable(el, { kind: 'tool', id: t.id, label: t.name }); list.appendChild(el);
      });
    }
    if (!list.children.length || list.children.length === 1) list.appendChild(h('div', { class: 'insp-empty' }, 'Nothing matches “' + ui.search + '”'));
  };

  function templateCard(t) {
    const tr = t.tracks.filter((x) => x.steps).slice(0, 3);
    const cls = ['', 'g', 'm'];
    const grid = h('div', { class: 'mini-grid' });
    tr.forEach((x, r) => MR.parseSteps(x.steps).slice(0, 16).forEach((v) => grid.appendChild(h('i', { class: v ? 'on ' + cls[r] : '' }))));
    return h('div', { class: 'tpl-card' }, h('div', { class: 'row' }, h('b', null, t.name), h('span', { class: 'pill gold' }, t.bpm + ' BPM')), h('small', null, t.mood.split('·')[0].trim() + ' · ' + t.tracks.length + ' sounds'), grid);
  }
  MR.templateCard = templateCard;

  function audition(payload) {
    if (payload.sampleId) { MR.engine.ctx(); const tmp = { id: '__a', inst: 'sample', params: MR.defaultParams('sample'), sampleId: payload.sampleId }; MR.INSTRUMENTS.sample.play(MR.engine.ctx(), MR.engine.ctx().destination, MR.engine.ctx().currentTime, 60, 0.8, 1, tmp.params, tmp); return; }
    MR.engine.previewSound(payload.id, MR.INSTRUMENTS[payload.id].kind === 'melodic' ? 60 : 60);
  }
  function addSound(payload, index) {
    const ch = MR.addChannel(payload.id, payload.sampleId ? { sampleId: payload.sampleId, name: payload.label } : null, index);
    MR.engine.preview(ch, 60, 0.8, 0.3);
    MR.toast('Added ' + ch.name, true);
    if (ui.view !== 'rack' && ui.view !== 'piano') { ui.view = 'rack'; MR.renderAll(); }
    return ch;
  }
  MR.addSound = addSound;
  function applyTemplate(t) {
    MR.applyTemplate(t);
    ui.view = 'rack'; MR.renderAll();
    MR.toast(t.name + ' beat loaded — press Space to play', true);
  }
  MR.applyTemplateUI = applyTemplate;
  function addFxToSelection(fxId) {
    const target = ui.inspTab === 'master' ? 'master' : (MR.selectedChannel() || {}).id;
    if (!target) return MR.toast('Add a sound first, then its effects');
    MR.addFx(target, fxId); MR.toast(MR.FX[fxId].name + ' added to ' + (target === 'master' ? 'Master' : MR.channel(target).name), true);
  }
  function applyGroove(g, chId) {
    const ch = chId ? MR.channel(chId) : MR.selectedChannel();
    if (!ch) return MR.toast('Select a sound first');
    MR.applyGroove(ch.id, g); MR.toast(g.name + ' → ' + ch.name, true);
  }
  function applyChord(c, chId) {
    let ch = chId ? MR.channel(chId) : MR.selectedChannel();
    if (!ch || !isMelodic(ch)) {
      ch = P().channels.find((x) => isMelodic(x) && !/bass/i.test(x.inst)) || null;
      if (!ch) ch = MR.addChannel('softKeys');
    }
    MR.edit(() => {
      const pat = MR.pattern();
      pat.notes[ch.id] = MR.buildProgression(c, P().key, P().scale, pat.length);
      P().selected = ch.id;
    });
    ui.view = 'piano'; MR.renderAll();
    MR.toast(c.name + ' added to ' + ch.name, true);
  }
  function applyTool(t, chId) {
    const ch = chId ? MR.channel(chId) : MR.selectedChannel();
    if (!ch) return MR.toast('Select a sound first');
    const pat = MR.pattern();
    if (!(pat.notes[ch.id] || []).length) return MR.toast('Add some notes or a chord to ' + ch.name + ' first');
    MR.applyMelodyTool(ch.id, t.id); MR.toast(t.name + ' applied', true);
  }

  // ======================= PATTERN PICKER =======================
  MR.renderPatternPicker = function () {
    const box = $('patternPicker'); box.innerHTML = '';
    const sel = h('select', { title: 'Current pattern', onchange: (e) => { P().currentPattern = e.target.value; MR.emit('pattern'); } },
      P().patterns.map((p) => h('option', { value: p.id, selected: p.id === P().currentPattern ? true : null }, p.name)));
    box.append(sel,
      h('button', { class: 'btn line sm', title: 'New empty pattern', onclick: () => { MR.addPattern(); MR.toast('New pattern'); } }, MR.icon('plus'), h('span', { class: 'lbl' }, 'Pattern')),
      h('button', { class: 'icon-btn', title: 'Pattern options', onclick: (e) => MR.menu(e, [
        { label: 'Duplicate pattern', run: () => MR.clonePattern() },
        { label: 'Rename pattern', run: () => renamePattern() },
        { label: 'Clear pattern', run: () => MR.edit(() => { const p = MR.pattern(); p.steps = {}; p.notes = {}; }) },
        '-',
        { label: 'Delete pattern', danger: true, run: () => MR.deletePattern(P().currentPattern) },
      ]) }, MR.icon('dots')));
  };
  function renamePattern() {
    const pat = MR.pattern();
    const input = h('input', { value: pat.name, class: 'tool-select', style: { width: '100%', height: '40px', fontSize: '14px', margin: '18px 0' } });
    const box = h('div', null, h('h2', null, 'Rename pattern'), input,
      h('div', { style: { display: 'flex', gap: '8px', justifyContent: 'flex-end' } },
        h('button', { class: 'btn ghost', onclick: MR.closeModal }, 'Cancel'),
        h('button', { class: 'btn primary', onclick: () => { MR.edit(() => (pat.name = input.value || pat.name)); MR.closeModal(); } }, 'Save')));
    MR.modal(box, true); input.focus(); input.select();
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { MR.edit(() => (pat.name = input.value || pat.name)); MR.closeModal(); } });
  }

  // ======================= VIEWS =======================
  MR.renderView = function () {
    const v = $('view'); v.innerHTML = '';
    document.querySelectorAll('#viewTabs button').forEach((b) => b.classList.toggle('on', b.dataset.view === ui.view));
    ui.stepCols = null; ui.meterEls = {}; ui.playheads = [];
    ({ rack: renderRack, piano: renderPiano, playlist: renderPlaylist, mixer: renderMixer })[ui.view](v);
  };
  dropZone($('stage'), 'template', (pl) => { const t = MR.TEMPLATES.find((x) => x.id === pl.id); if (t) applyTemplate(t); });

  function head(title, sub, tools) {
    return h('div', { class: 'view-head' }, h('h3', null, title, sub ? h('small', null, sub) : null), h('div', { class: 'tools' }, tools || []));
  }
  function seg(options, value, onPick) {
    return h('div', { class: 'mini-seg' }, options.map(([v, label]) => h('button', { class: v === value ? 'on' : '', onclick: () => onPick(v) }, label)));
  }

  // ---------------- Step sequencer ----------------
  function renderRack(v) {
    const p = P(), pat = MR.pattern();
    v.appendChild(head('Step sequencer', pat.name + ' · ' + pat.length + ' steps', [
      seg([[16, '1 bar'], [32, '2 bars'], [64, '4 bars']], pat.length, (n) => MR.setPatternLength(n)),
      h('button', { class: 'btn line sm', onclick: () => { MR.edit(() => { pat.steps = {}; pat.notes = {}; }); MR.toast('Pattern cleared', true); } }, 'Clear'),
    ]));
    const body = h('div', { class: 'view-body' });
    v.appendChild(body);
    if (!p.channels.length) {
      const empty = h('div', { class: 'empty' }, MR.mascot(),
        h('h4', null, 'Let’s make a beat'),
        h('p', null, 'Drag a beat from the Library to start instantly, or drop single sounds here and click the squares to build your own rhythm.'),
        h('div', { class: 'row' },
          h('button', { class: 'btn gold', onclick: () => { ui.tab = 'beats'; MR.renderBrowser(); MR.showWelcome(); } }, 'Pick a starter beat'),
          h('button', { class: 'btn line', onclick: () => { ui.tab = 'sounds'; MR.renderBrowser(); } }, 'Browse sounds')));
      dropZone(empty, 'sound file', onRackDrop(null));
      body.appendChild(empty);
      return;
    }
    const rack = h('div', { class: 'rack' }); body.appendChild(rack);
    dropZone(body, 'sound file', onRackDrop(null));
    const size = stepMetrics(pat.length, (v.clientWidth || 900) - 40 - 196 - 20 - 24 - 14);
    ui.stepCols = Array.from({ length: pat.length }, () => []);
    ui.notePreviews = [];

    p.channels.forEach((ch, idx) => {
      const row = h('div', { class: 'rack-row' + (ch.id === p.selected ? ' sel' : ''), style: { '--c': ch.color } });
      const led = h('button', { class: 'ch-led' + (ch.mute ? ' off' : ''), title: 'Mute (Ctrl+click: solo)', onclick: (e) => {
        MR.edit(() => { if (e.ctrlKey) { const solo = !ch.solo; p.channels.forEach((c) => (c.solo = false)); ch.solo = solo; } else ch.mute = !ch.mute; }, 'mix');
      } });
      if (ch.solo) led.style.borderColor = 'var(--gold)';
      const vol = MR.knob({ value: ch.vol, min: 0, max: 1, step: 0.01, def: 0.8, title: 'Volume',
        onStart: MR.checkpoint, onInput: (x) => { ch.vol = x; MR.engine.sync(); }, onEnd: () => MR.emit('params') });
      vol.classList.add('ch-vol');
      const name = h('div', { class: 'ch-name', title: 'Click to select · double-click to hear' },
        h('i', { class: 'dot', style: { background: ch.color } }), h('span', null, ch.name), h('small', null, isMelodic(ch) ? 'KEYS' : ''));
      name.addEventListener('click', () => { MR.select(ch.id); MR.engine.preview(ch, 60, 0.8, 0.25); });
      name.addEventListener('dblclick', () => { if (isMelodic(ch)) { MR.select(ch.id); ui.view = 'piano'; MR.renderAll(); } });
      name.addEventListener('contextmenu', (e) => rowMenu(e, ch));
      row.appendChild(h('div', { class: 'ch-head' }, led, name, vol));

      const notes = pat.notes[ch.id];
      if (notes && notes.length) {
        const np = h('div', { class: 'note-preview', title: 'Open in piano roll', style: { width: size.width + 'px' } });
        const lo = Math.min(...notes.map((n) => n.n)), hi = Math.max(...notes.map((n) => n.n)), span = Math.max(1, hi - lo);
        notes.forEach((n) => np.appendChild(h('i', { style: { left: (n.s / pat.length) * 100 + '%', width: Math.max(1, (n.l / pat.length) * 100 - 0.4) + '%', top: 5 + (1 - (n.n - lo) / span) * 24 + 'px', background: ch.color } })));
        np.appendChild(h('span', { class: 'np-label' }, 'PIANO ROLL'));
        const ph = h('div', { class: 'ph', style: { display: 'none' } }); np.appendChild(ph); ui.notePreviews.push(ph);
        np.addEventListener('click', () => { MR.select(ch.id); ui.view = 'piano'; MR.renderAll(); });
        row.appendChild(np);
      } else {
        row.appendChild(stepGrid(ch, pat, size));
      }
      row.appendChild(h('button', { class: 'row-menu', title: 'More', onclick: (e) => rowMenu(e, ch) }, MR.icon('dots')));
      dropZone(row, 'sound groove fx file', (pl, e) => {
        if (pl.kind === 'groove') return applyGroove(MR.GROOVES.find((g) => g.id === pl.id), ch.id);
        if (pl.kind === 'fx') { MR.addFx(ch.id, pl.id); return MR.toast(MR.FX[pl.id].name + ' → ' + ch.name, true); }
        if (pl.kind === 'sound') {
          if (pl.sampleId) MR.edit(() => { ch.inst = 'sample'; ch.sampleId = pl.sampleId; ch.name = pl.label; ch.params = MR.defaultParams('sample'); });
          else MR.replaceInstrument(ch.id, pl.id);
          MR.engine.preview(MR.channel(ch.id), 60); return MR.toast('Swapped to ' + pl.label + ' — your pattern is kept', true);
        }
        if (pl.kind === 'file') MR.importFiles(pl.files, ch.id);
      });
      rack.appendChild(row);
    });
    const add = h('button', { class: 'add-row', onclick: () => { ui.tab = 'sounds'; MR.renderBrowser(); MR.toast('Drag a sound from the Library onto the sequencer'); } },
      MR.icon('plus'), 'Add a sound');
    rack.appendChild(add);
  }
  // Fit the step grid to the available width (cells between 9 and 40px).
  function stepMetrics(len, avail) {
    const beats = len / 4;
    const gi = len <= 16 ? 5 : len <= 32 ? 3 : 2, gb = len <= 16 ? 12 : len <= 32 ? 8 : 5;
    const cell = Math.max(9, Math.min(40, Math.floor((avail - (len - beats) * gi - (beats - 1) * gb) / len)));
    return { cell, gi, gb, width: len * cell + (len - beats) * gi + (beats - 1) * gb };
  }
  function onRackDrop(index) {
    return (pl) => {
      if (pl.kind === 'sound') addSound(pl, index);
      if (pl.kind === 'file') MR.importFiles(pl.files);
    };
  }
  function stepGrid(ch, pat, size) {
    const arr = pat.steps[ch.id] || [];
    const wrap = h('div', { class: 'steps' + (size.cell < 18 ? ' small' : ''), style: { '--cell': size.cell + 'px', '--gi': size.gi + 'px', '--gb': size.gb + 'px' } });
    let beat;
    const cells = [];
    for (let i = 0; i < pat.length; i++) {
      if (i % 4 === 0) { beat = h('div', { class: 'beat' }); wrap.appendChild(beat); }
      const v = arr[i] || 0;
      const c = h('div', { class: 'step' + (v ? ' on' : ''), 'data-i': i });
      if (v) c.style.background = ch.color;
      c.appendChild(h('i', { class: 'vel', style: { transform: `scaleX(${v || 0})`, display: v ? '' : 'none' } }));
      beat.appendChild(c); cells.push(c); ui.stepCols[i].push(c);
    }
    const setCell = (i, v) => {
      if (!pat.steps[ch.id]) pat.steps[ch.id] = Array(pat.length).fill(0);
      pat.steps[ch.id][i] = v;
      const c = cells[i]; c.classList.toggle('on', !!v); c.style.background = v ? ch.color : '';
      const bar = c.firstChild; bar.style.display = v ? '' : 'none'; bar.style.transform = `scaleX(${v})`;
    };
    let paint = null;
    wrap.addEventListener('pointerdown', (e) => {
      const c = e.target.closest('.step'); if (!c) return;
      e.preventDefault();
      const i = +c.dataset.i, cur = (pat.steps[ch.id] || [])[i] || 0;
      MR.checkpoint();
      paint = e.button === 2 ? 0 : cur ? 0 : 1;
      if (paint && !MR.engine.playing) MR.engine.preview(ch, 60, 0.8, 0.2);
      setCell(i, paint);
      if (P().selected !== ch.id) { P().selected = ch.id; MR.renderInspector(); document.querySelectorAll('.rack-row').forEach((r) => r.classList.remove('sel')); wrap.closest('.rack-row').classList.add('sel'); }
      const move = (ev) => {
        const el = document.elementFromPoint(ev.clientX, ev.clientY); const cc = el && el.closest('.step');
        if (cc && cells.includes(cc)) { const j = +cc.dataset.i; if (((pat.steps[ch.id] || [])[j] || 0) !== paint) setCell(j, paint); }
      };
      const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); paint = null; MR.emit('steps'); };
      window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
    });
    wrap.addEventListener('contextmenu', (e) => e.preventDefault());
    wrap.addEventListener('wheel', (e) => {
      const c = e.target.closest('.step'); if (!c) return;
      const i = +c.dataset.i, cur = (pat.steps[ch.id] || [])[i] || 0; if (!cur) return;
      e.preventDefault(); MR.checkpoint();
      setCell(i, Math.max(0.1, Math.min(1, +(cur + (e.deltaY < 0 ? 0.1 : -0.1)).toFixed(2))));
      MR.emit('steps');
    }, { passive: false });
    wrap.title = 'Click or drag to paint · right-click to erase · scroll to set velocity';
    return wrap;
  }
  function rowMenu(e, ch) {
    const pat = MR.pattern();
    MR.menu(e, [
      { label: 'Edit in piano roll', run: () => { MR.select(ch.id); ui.view = 'piano'; MR.renderAll(); } },
      { label: 'Duplicate', run: () => duplicateChannel(ch) },
      { label: 'Fill every beat', run: () => applyGroove(MR.GROOVES[0], ch.id) },
      { label: 'Clear notes & steps', run: () => MR.edit(() => { delete pat.steps[ch.id]; delete pat.notes[ch.id]; }) },
      '-',
      { label: 'Move up', run: () => moveChannel(ch, -1) },
      { label: 'Move down', run: () => moveChannel(ch, 1) },
      '-',
      { label: 'Delete sound', danger: true, run: () => { MR.removeChannel(ch.id); MR.toast('Deleted ' + ch.name, true); } },
    ]);
  }
  function moveChannel(ch, d) {
    MR.edit((p) => { const i = p.channels.indexOf(p.channels.find((c) => c.id === ch.id)), j = i + d; if (j < 0 || j >= p.channels.length) return; p.channels.splice(j, 0, p.channels.splice(i, 1)[0]); });
  }
  function duplicateChannel(ch) {
    MR.edit((p) => {
      const c = JSON.parse(JSON.stringify(ch)); c.id = MR.uid('c'); c.name = ch.name + ' 2';
      c.fx.forEach((f) => (f.id = MR.uid('f')));
      p.channels.splice(p.channels.indexOf(p.channels.find((x) => x.id === ch.id)) + 1, 0, c);
      p.patterns.forEach((pt) => { if (pt.steps[ch.id]) pt.steps[c.id] = pt.steps[ch.id].slice(); if (pt.notes[ch.id]) pt.notes[c.id] = JSON.parse(JSON.stringify(pt.notes[ch.id])); });
      p.selected = c.id;
    });
    MR.engine.rebuildFx();
  }
  MR.duplicateChannel = duplicateChannel;

  // ---------------- Piano roll ----------------
  const LO = 24, HI = 96, ROW = 20; // C1..C7
  function renderPiano(v) {
    const p = P(), pat = MR.pattern(), ch = MR.selectedChannel();
    const chSel = h('select', { class: 'tool-select', onchange: (e) => MR.select(e.target.value) },
      p.channels.map((c) => h('option', { value: c.id, selected: ch && c.id === ch.id ? true : null }, c.name)));
    v.appendChild(head('Piano roll', ch ? ch.name + ' · ' + MR.NOTE_NAMES[p.key] + ' ' + p.scale : '', ch ? [
      chSel,
      seg([[1, '1/16'], [2, '1/8'], [4, '1/4'], [8, '1/2'], [16, 'Bar']], ui.noteLen, (n) => { ui.noteLen = n; MR.renderView(); }),
      h('button', { class: 'btn line sm', title: 'Chord progressions & melody tools', onclick: (e) => MR.menu(e,
        MR.PROGRESSIONS.map((c) => ({ label: '♪  ' + c.name + '  ·  ' + c.tag, run: () => applyChord(c, ch.id) })).concat(['-'], MR.MELODY_TOOLS.map((t) => ({ label: '✦  ' + t.name, run: () => applyTool(t, ch.id) })))) },
        MR.icon('wand'), 'Chords & tools'),
      h('button', { class: 'btn line sm', onclick: () => MR.edit(() => { delete pat.notes[ch.id]; }) }, 'Clear'),
    ] : []));
    const body = h('div', { class: 'view-body' }); v.appendChild(body);
    if (!ch) {
      body.appendChild(h('div', { class: 'empty' }, MR.mascot('calm'), h('h4', null, 'No instrument yet'), h('p', null, 'Add a melodic sound (Keys, Synth or Bass) from the Library, then write notes here.')));
      return;
    }
    const avail = (v.clientWidth || 900) - 72 - 30;
    const cw = Math.max(18, Math.min(64, Math.floor(avail / pat.length)));
    const rows = HI - LO + 1, W = pat.length * cw, H = rows * ROW;
    const scale = MR.SCALES[p.scale] || MR.SCALES.Minor;
    const inScale = (m) => scale.includes(((m - p.key) % 12 + 12) % 12);
    const black = (m) => [1, 3, 6, 8, 10].includes(m % 12);

    const wrap = h('div', { class: 'pr-wrap' });
    const ruler = h('div', { class: 'pr-ruler' }, h('div', { class: 'corner' }));
    const marks = h('div', { class: 'marks', style: { width: W + 'px' } });
    for (let s = 0; s < pat.length; s += 4) marks.appendChild(h('span', { style: { left: s * cw + 4 + 'px' } }, (Math.floor(s / 16) + 1) + '.' + ((s % 16) / 4 + 1)));
    ruler.appendChild(marks); wrap.appendChild(ruler);

    const pr = h('div', { class: 'pr' });
    const keys = h('div', { class: 'pr-keys' });
    const grid = h('div', { class: 'pr-grid', style: { width: W + 'px', height: H + 'px' } });
    const rowsEl = h('div', { class: 'pr-rows' });
    for (let m = HI; m >= LO; m--) {
      const k = h('div', { class: 'pr-key' + (black(m) ? ' black' : '') + (m % 12 === 0 ? ' c' : '') + (inScale(m) ? '' : ' out') }, m % 12 === 0 || !black(m) && m % 12 === 0 ? MR.noteName(m) : m % 12 === 0 ? '' : '');
      if (m % 12 === 0) k.textContent = MR.noteName(m);
      k.addEventListener('pointerdown', () => { MR.engine.preview(ch, m, 0.8, 0.4); k.classList.add('hit'); setTimeout(() => k.classList.remove('hit'), 200); });
      keys.appendChild(k);
      rowsEl.appendChild(h('div', { class: 'pr-row' + (black(m) ? ' black' : '') + (inScale(m) && p.scale !== 'Chromatic' ? ' inscale' : '') + ((m - p.key) % 12 === 0 ? ' root' : '') }));
    }
    const cols = h('div', { class: 'pr-cols' });
    for (let s = 0; s <= pat.length; s++) cols.appendChild(h('i', { class: s % 16 === 0 ? 'bar' : s % 4 === 0 ? 'beat' : '', style: { left: s * cw + 'px' } }));
    grid.append(rowsEl, cols);
    const playhead = h('div', { class: 'pr-playhead' }); grid.appendChild(playhead);
    ui.playheads.push({ el: playhead, cw, kind: 'pattern' });

    const notes = () => pat.notes[ch.id] || (pat.notes[ch.id] = []);
    const noteEls = new Map();
    function place(n) {
      let el = noteEls.get(n);
      if (!el) { el = h('div', { class: 'note' }); el.style.background = ch.color; noteEls.set(n, el); grid.appendChild(el); el._n = n; }
      el.style.left = n.s * cw + 'px'; el.style.width = Math.max(6, n.l * cw - 2) + 'px'; el.style.top = (HI - n.n) * ROW + 'px';
      el.style.opacity = 0.45 + n.v * 0.55; el.textContent = n.l * cw > 34 ? MR.noteName(n.n) : '';
    }
    notes().forEach(place);
    const velBars = h('div', { class: 'bars', style: { width: W + 'px' } });
    function drawVel() { velBars.innerHTML = ''; notes().forEach((n) => velBars.appendChild(h('i', { style: { left: n.s * cw + 2 + 'px', height: Math.max(3, n.v * 44) + 'px', background: ch.color } }))); }
    drawVel();

    const at = (e) => { const r = grid.getBoundingClientRect(); return { s: Math.floor((e.clientX - r.left) / cw), n: HI - Math.floor((e.clientY - r.top) / ROW), x: e.clientX - r.left }; };
    grid.addEventListener('contextmenu', (e) => e.preventDefault());
    grid.addEventListener('pointerdown', (e) => {
      if (e.button === 1) return;
      e.preventDefault();
      const pos = at(e), target = e.target.closest('.note');
      if (e.button === 2) { // erase (drag to erase more)
        MR.checkpoint();
        const erase = (ev) => { const el = document.elementFromPoint(ev.clientX, ev.clientY); const t = el && el.closest('.note'); if (t && t._n) { pat.notes[ch.id] = notes().filter((x) => x !== t._n); t.remove(); noteEls.delete(t._n); } };
        erase(e);
        const up = () => { window.removeEventListener('pointermove', erase); window.removeEventListener('pointerup', up); drawVel(); MR.emit('notes'); };
        window.addEventListener('pointermove', erase); window.addEventListener('pointerup', up);
        return;
      }
      MR.checkpoint();
      let n, mode = 'move';
      if (target) {
        n = target._n;
        const r = target.getBoundingClientRect();
        if (e.clientX > r.right - 8) mode = 'resize';
      } else {
        if (pos.s < 0 || pos.s >= pat.length || pos.n < LO || pos.n > HI) return;
        n = { s: pos.s, n: pos.n, l: Math.min(ui.noteLen, pat.length - pos.s), v: 0.8 };
        notes().push(n); place(n);
      }
      if (mode === 'move') MR.engine.preview(ch, n.n, n.v, 0.25);
      const s0 = n.s, n0 = n.n, l0 = n.l, start = pos;
      let lastPitch = n.n;
      const move = (ev) => {
        const q = at(ev);
        if (mode === 'resize') n.l = Math.max(1, Math.min(pat.length - n.s, l0 + (q.s - start.s)));
        else {
          n.s = Math.max(0, Math.min(pat.length - n.l, s0 + (q.s - start.s)));
          n.n = Math.max(LO, Math.min(HI, n0 + (q.n - start.n)));
          if (n.n !== lastPitch) { lastPitch = n.n; MR.engine.preview(ch, n.n, n.v, 0.18); }
        }
        place(n);
      };
      const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); ui.noteLen = n.l; drawVel(); MR.emit('notes'); };
      window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
    });
    grid.addEventListener('dblclick', (e) => {
      const t = e.target.closest('.note'); if (!t) return;
      MR.edit(() => { pat.notes[ch.id] = notes().filter((x) => x !== t._n); }, 'notes');
    });
    dropZone(grid, 'chord', (pl) => {
      if (pl.kind === 'chord') applyChord(MR.PROGRESSIONS.find((c) => c.id === pl.id), ch.id);
      else applyTool(MR.MELODY_TOOLS.find((t) => t.id === pl.id), ch.id);
    });
    pr.append(keys, grid); wrap.appendChild(pr);

    const lane = h('div', { class: 'vel-lane' }, h('div', { class: 'corner' }, 'VEL'), velBars);
    velBars.addEventListener('pointerdown', (e) => {
      e.preventDefault(); MR.checkpoint();
      const setV = (ev) => {
        const r = velBars.getBoundingClientRect(); const s = Math.floor((ev.clientX - r.left) / cw);
        const v = Math.max(0.05, Math.min(1, 1 - (ev.clientY - r.top - 6) / 48));
        notes().filter((n) => n.s === s).forEach((n) => { n.v = +v.toFixed(2); place(n); });
        drawVel();
      };
      setV(e);
      const up = () => { window.removeEventListener('pointermove', setV); window.removeEventListener('pointerup', up); MR.emit('notes'); };
      window.addEventListener('pointermove', setV); window.addEventListener('pointerup', up);
    });
    wrap.appendChild(lane);
    body.appendChild(wrap);
    // scroll to the notes (or around C4)
    const ns = notes(); const center = ns.length ? (Math.max(...ns.map((n) => n.n)) + Math.min(...ns.map((n) => n.n))) / 2 : 62;
    requestAnimationFrame(() => { body.scrollTop = (HI - center) * ROW - body.clientHeight / 2 + 26; });
  }

  // ---------------- Song / playlist ----------------
  const BAR_W = 64, TRACK_H = 52;
  function renderPlaylist(v) {
    const p = P();
    const chips = h('div', { class: 'pat-chips' }, p.patterns.map((pt) => {
      const c = h('div', { class: 'pat-chip' + (pt.id === p.currentPattern ? ' on' : ''), title: 'Drag onto the song, or click to select' }, h('i', { style: { background: pt.color } }), pt.name);
      c.addEventListener('click', () => { p.currentPattern = pt.id; MR.emit('pattern'); });
      MR.draggable(c, { kind: 'pattern', id: pt.id, label: pt.name });
      return c;
    }));
    v.appendChild(head('Song', 'Drag patterns onto tracks · click to paint · right-click to remove', [chips,
      h('button', { class: 'btn line sm', onclick: () => MR.edit(() => (p.playlist.clips = [])) }, 'Clear song')]));
    const body = h('div', { class: 'view-body' }); v.appendChild(body);
    const bars = Math.max(32, MR.engine.songBars() + 8);
    const W = bars * BAR_W, tracks = p.playlist.tracks;

    const ruler = h('div', { class: 'pl-ruler' }, h('div', { class: 'corner' }));
    const marks = h('div', { class: 'marks', style: { width: W + 'px' } });
    for (let b = 0; b < bars; b++) marks.appendChild(h('span', { style: { left: b * BAR_W + 'px' } }, b + 1));
    ruler.appendChild(marks);
    const pl = h('div', { class: 'pl' });
    const heads = h('div', { class: 'pl-heads' }, tracks.map((t, i) => h('div', { class: 'pl-head' },
      h('input', { value: t.name, onchange: (e) => MR.edit(() => (t.name = e.target.value)) }),
      h('button', { class: 'mute' + (t.mute ? ' on' : ''), title: 'Mute track', onclick: () => MR.edit(() => (t.mute = !t.mute)) }, 'M'))));
    const grid = h('div', { class: 'pl-grid', style: { width: W + 'px', height: tracks.length * TRACK_H + 'px' } });
    tracks.forEach(() => grid.appendChild(h('div', { class: 'pl-track' })));
    const cols = h('div', { class: 'pl-cols' });
    for (let b = 0; b <= bars; b++) cols.appendChild(h('i', { class: b % 4 === 0 ? 'bar4' : '', style: { left: b * BAR_W + 'px' } }));
    grid.appendChild(cols);
    const playhead = h('div', { class: 'pl-playhead' }); grid.appendChild(playhead);
    ui.playheads.push({ el: playhead, cw: BAR_W / 16, kind: 'song' });

    const clipEls = new Map();
    function placeClip(c) {
      const pt = p.patterns.find((x) => x.id === c.pat); if (!pt) return;
      let el = clipEls.get(c);
      if (!el) {
        el = h('div', { class: 'clip' }); el._c = c; clipEls.set(c, el); grid.appendChild(el);
        el.appendChild(h('span', null, pt.name));
        const mini = h('div', { class: 'mini' }); el.appendChild(mini);
        // mini preview of the pattern
        const evs = [];
        p.channels.forEach((ch, ci) => { (pt.notes[ch.id] || []).forEach((n) => evs.push([n.s, n.l, ci])); (pt.steps[ch.id] || []).forEach((s, i) => s && evs.push([i, 0.6, ci])); });
        el._mini = { mini, evs, len: pt.length, rows: Math.max(1, p.channels.length) };
      }
      el.style.left = c.bar * BAR_W + 1 + 'px'; el.style.width = c.len * BAR_W - 2 + 'px'; el.style.top = c.track * TRACK_H + 'px';
      el.style.background = pt.color; el.style.opacity = tracks[c.track] && tracks[c.track].mute ? 0.35 : 1;
      const m = el._mini; m.mini.innerHTML = '';
      const total = c.len * 16;
      for (let off = 0; off < total; off += m.len) m.evs.forEach(([s, l, r]) => { if (off + s < total) m.mini.appendChild(h('i', { style: { left: ((off + s) / total) * 100 + '%', width: Math.max(0.6, (l / total) * 100) + '%', top: (r / m.rows) * 22 + 'px' } })); });
    }
    p.playlist.clips.forEach(placeClip);
    const at = (e) => { const r = grid.getBoundingClientRect(); return { bar: Math.floor((e.clientX - r.left) / BAR_W), track: Math.floor((e.clientY - r.top) / TRACK_H) }; };
    grid.addEventListener('contextmenu', (e) => e.preventDefault());
    grid.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const t = e.target.closest('.clip'), pos = at(e);
      if (e.button === 2) {
        if (t) MR.edit(() => (p.playlist.clips = p.playlist.clips.filter((c) => c !== t._c)));
        return;
      }
      if (pos.track < 0 || pos.track >= tracks.length || pos.bar < 0) return;
      MR.checkpoint();
      let c, mode = 'move';
      if (t) { c = t._c; if (e.clientX > t.getBoundingClientRect().right - 9) mode = 'resize'; }
      else {
        const pt = MR.pattern();
        c = { id: MR.uid('k'), pat: pt.id, track: pos.track, bar: pos.bar, len: Math.ceil(pt.length / 16) };
        p.playlist.clips.push(c); placeClip(c);
      }
      const b0 = c.bar, t0 = c.track, l0 = c.len;
      const move = (ev) => {
        const q = at(ev);
        if (mode === 'resize') c.len = Math.max(1, l0 + q.bar - pos.bar);
        else { c.bar = Math.max(0, b0 + q.bar - pos.bar); c.track = Math.max(0, Math.min(tracks.length - 1, t0 + q.track - pos.track)); }
        placeClip(c);
      };
      const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); MR.emit('song'); };
      window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
    });
    grid.addEventListener('dblclick', (e) => {
      const t = e.target.closest('.clip'); if (!t) return;
      p.currentPattern = t._c.pat; ui.view = 'rack'; MR.renderAll();
    });
    dropZone(grid, 'pattern', (pl, e) => {
      const pos = at(e), pt = p.patterns.find((x) => x.id === pl.id); if (!pt) return;
      MR.edit(() => p.playlist.clips.push({ id: MR.uid('k'), pat: pt.id, track: Math.max(0, Math.min(tracks.length - 1, pos.track)), bar: Math.max(0, pos.bar), len: Math.ceil(pt.length / 16) }));
    });
    pl.append(heads, grid);
    body.append(ruler, pl);
    if (!p.playlist.clips.length) {
      const hint = h('div', { class: 'empty', style: { position: 'absolute', inset: '80px 0 0 168px', height: 'auto', pointerEvents: 'none' } },
        h('p', null, 'Your song is empty. Drag a pattern chip from above onto a track, or click on the grid to paint “' + MR.pattern().name + '”. Switch the top bar to “Song” to play the arrangement.'));
      body.appendChild(hint);
    }
  }

  // ---------------- Mixer ----------------
  function renderMixer(v) {
    const p = P();
    v.appendChild(head('Mixer', 'Drop effects on any strip', [h('button', { class: 'btn line sm', onclick: () => MR.edit(() => p.channels.forEach((c) => { c.mute = false; c.solo = false; }), 'mix') }, 'Reset mute / solo')]));
    const body = h('div', { class: 'view-body' }); v.appendChild(body);
    const mixer = h('div', { class: 'mixer' }); body.appendChild(mixer);
    mixer.appendChild(strip(null));
    p.channels.forEach((c) => mixer.appendChild(strip(c)));
    if (!p.channels.length) mixer.appendChild(h('div', { class: 'empty', style: { height: 'auto' } }, h('p', null, 'Add sounds and they’ll appear here as mixer strips.')));
  }
  function strip(ch) {
    const p = P(), isM = !ch;
    const target = isM ? 'master' : ch.id;
    const sel = isM ? ui.inspTab === 'master' : ui.inspTab !== 'master' && p.selected === ch.id;
    const el = h('div', { class: 'strip' + (isM ? ' master' : '') + (sel ? ' sel' : '') });
    el.addEventListener('click', (e) => {
      if (e.target.closest('input,button,.knob')) return;
      if (isM) { ui.inspTab = 'master'; MR.renderAll(); } else { ui.inspTab = 'channel'; MR.select(ch.id); }
    });
    el.appendChild(h('div', { class: 's-name' }, isM ? null : h('i', { class: 'dot', style: { background: ch.color } }), isM ? 'Master' : ch.name));
    const slots = h('div', { class: 'fx-slots' });
    const list = MR.fxList(target);
    list.forEach((f) => {
      const s = h('div', { class: 'fx-slot' + (f.on === false ? ' off' : ''), title: 'Edit in inspector' }, MR.FX[f.type].name);
      s.addEventListener('click', (e) => { e.stopPropagation(); ui.selectedFx = { target, id: f.id }; ui.inspTab = isM ? 'master' : 'channel'; if (!isM) P().selected = ch.id; MR.renderAll(); });
      slots.appendChild(s);
    });
    for (let i = list.length; i < 3; i++) slots.appendChild(h('div', { class: 'fx-slot empty' }, i === list.length ? '+ drop FX' : ''));
    el.appendChild(slots);
    const pan = MR.knob({ value: isM ? 0 : ch.pan, min: -1, max: 1, step: 0.01, def: 0, title: 'Pan',
      onStart: MR.checkpoint, onInput: (x) => { if (!isM) { ch.pan = x; MR.engine.sync(); } }, onEnd: () => MR.emit('params') });
    if (isM) pan.style.visibility = 'hidden';
    el.appendChild(pan);
    const fader = h('input', { class: 'fader', type: 'range', min: 0, max: 1, step: 0.005, value: isM ? p.masterVol : ch.vol, title: 'Volume' });
    const label = h('span', { class: 'vol-label' });
    const fmtDb = (x) => (x <= 0.001 ? '-∞' : (20 * Math.log10(x * x)).toFixed(1)) + ' dB';
    label.textContent = fmtDb(+fader.value);
    fader.addEventListener('pointerdown', MR.checkpoint);
    fader.addEventListener('input', () => { const x = +fader.value; if (isM) p.masterVol = x; else ch.vol = x; label.textContent = fmtDb(x); MR.engine.sync(); });
    fader.addEventListener('change', () => MR.emit('params'));
    fader.addEventListener('dblclick', () => { MR.checkpoint(); fader.value = isM ? 0.85 : 0.8; fader.dispatchEvent(new Event('input')); MR.emit('params'); });
    const meter = h('div', { class: 'meter-v' }, h('i')); ui.meterEls[isM ? '__master' : ch.id] = meter.firstChild;
    el.appendChild(h('div', { class: 'fader-wrap' }, fader, meter));
    el.appendChild(label);
    if (!isM) {
      el.appendChild(h('div', { class: 'ms' },
        h('button', { class: 'm' + (ch.mute ? ' on' : ''), title: 'Mute', onclick: () => MR.edit(() => (ch.mute = !ch.mute), 'mix') }, 'M'),
        h('button', { class: 's' + (ch.solo ? ' on' : ''), title: 'Solo', onclick: () => MR.edit(() => (ch.solo = !ch.solo), 'mix') }, 'S')));
    } else el.appendChild(h('div', { class: 'ms', style: { visibility: 'hidden' } }, h('button', null, 'M')));
    dropZone(el, 'fx', (pl) => { MR.addFx(target, pl.id); MR.toast(MR.FX[pl.id].name + ' → ' + (isM ? 'Master' : ch.name), true); });
    return el;
  }

  // ======================= INSPECTOR =======================
  MR.renderInspector = function () {
    const box = $('inspector'); box.innerHTML = '';
    const p = P();
    box.appendChild(h('div', { class: 'insp-tabs' },
      h('button', { class: ui.inspTab !== 'master' ? 'on' : '', onclick: () => { ui.inspTab = 'channel'; MR.renderAll(); } }, 'Sound'),
      h('button', { class: ui.inspTab === 'master' ? 'on' : '', onclick: () => { ui.inspTab = 'master'; MR.renderAll(); } }, 'Master')));

    if (ui.inspTab === 'master') {
      box.appendChild(h('div', { class: 'insp-title' }, h('span', { class: 'badge', style: { background: 'var(--ink-soft)' } }, MR.icon('fx')),
        h('div', null, h('input', { value: 'Master', disabled: true }), h('small', null, 'Everything you hear passes through here'))));
      const sec = section('Output');
      const knobs = h('div', { class: 'knobs' });
      knobs.appendChild(knobCell({ key: 'vol', label: 'Volume', min: 0, max: 1, step: 0.01, def: 0.85 }, p.masterVol, (x) => { p.masterVol = x; MR.engine.sync(); }));
      sec.appendChild(knobs); box.appendChild(sec);
      box.appendChild(fxSection('master'));
      return;
    }
    const ch = MR.selectedChannel();
    if (!ch) {
      box.appendChild(h('div', { class: 'insp-empty' }, MR.mascot('calm'), h('b', null, 'Nothing selected'), h('br'), 'Click a sound to shape it here: tune it, add effects, and set its level.'));
      return;
    }
    const inst = MR.INSTRUMENTS[ch.inst];
    const nameIn = h('input', { value: ch.name, title: 'Rename', onchange: (e) => MR.edit(() => (ch.name = e.target.value || ch.name)) });
    box.appendChild(h('div', { class: 'insp-title' }, h('span', { class: 'badge', style: { background: ch.color } }, MR.icon(MR.instIcon(ch.inst))),
      h('div', { style: { minWidth: 0, flex: 1 } }, nameIn, h('small', null, (ch.inst === 'sample' ? 'Sample · ' + ((MR.samples[ch.sampleId] || {}).name || 'missing') : inst.name + ' · ' + inst.cat)))));

    // instrument swap
    const swap = h('select', { class: 'tool-select', style: { width: '100%', marginTop: '14px', height: '34px' }, onchange: (e) => {
      const val = e.target.value;
      if (val.startsWith('sample:')) { const sid = val.slice(7); MR.edit(() => { ch.inst = 'sample'; ch.sampleId = sid; ch.name = MR.samples[sid].name; ch.params = MR.defaultParams('sample'); }); }
      else MR.replaceInstrument(ch.id, val);
      MR.engine.preview(MR.channel(ch.id), 60);
    } });
    const cats = {};
    Object.values(MR.INSTRUMENTS).filter((i) => i.id !== 'sample').forEach((i) => (cats[i.cat] = cats[i.cat] || []).push(i));
    Object.keys(cats).forEach((c) => swap.appendChild(h('optgroup', { label: c }, cats[c].map((i) => h('option', { value: i.id, selected: ch.inst === i.id ? true : null }, i.name)))));
    const sids = Object.keys(MR.samples);
    if (sids.length) swap.appendChild(h('optgroup', { label: 'Your sounds' }, sids.map((id) => h('option', { value: 'sample:' + id, selected: ch.sampleId === id ? true : null }, MR.samples[id].name))));
    box.appendChild(swap);

    const sec = section('Sound', h('button', { class: 'link', onclick: () => MR.edit(() => (ch.params = MR.defaultParams(ch.inst))) }, 'Reset'));
    const knobs = h('div', { class: 'knobs' });
    inst.params.forEach((pr) => knobs.appendChild(knobCell(pr, ch.params[pr.key], (x) => (ch.params[pr.key] = x), () => { if (!MR.engine.playing) MR.engine.preview(ch, isMelodic(ch) ? 60 : 60, 0.8, 0.3); })));
    sec.appendChild(knobs); box.appendChild(sec);

    const mix = section('Mix');
    const mk = h('div', { class: 'knobs' });
    mk.appendChild(knobCell({ key: 'vol', label: 'Volume', min: 0, max: 1, step: 0.01, def: 0.8 }, ch.vol, (x) => { ch.vol = x; MR.engine.sync(); }));
    mk.appendChild(knobCell({ key: 'pan', label: 'Pan', min: -1, max: 1, step: 0.01, def: 0, unit: 'pan' }, ch.pan, (x) => { ch.pan = x; MR.engine.sync(); }));
    const colors = h('div', { class: 'knob-cell' }, h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(4, 14px)', gap: '5px', marginTop: '6px' } },
      MR.COLORS.map((c) => h('button', { title: 'Color', style: { width: '14px', height: '14px', borderRadius: '5px', background: c, outline: c === ch.color ? '2px solid var(--ink-soft)' : 'none', outlineOffset: '1px' }, onclick: () => MR.edit(() => (ch.color = c)) }))), h('label', null, 'Color'));
    mk.appendChild(colors);
    mix.appendChild(mk); box.appendChild(mix);
    box.appendChild(fxSection(ch.id));
    box.appendChild(h('div', { class: 'insp-actions' },
      h('button', { class: 'btn line sm', onclick: () => MR.engine.preview(ch, 60, 0.85, 0.5) }, MR.svg(MR.ICONS.play.replace('<path', '<path fill="currentColor"')), 'Preview'),
      h('button', { class: 'btn line sm', onclick: () => duplicateChannel(ch) }, 'Duplicate'),
      h('button', { class: 'btn line sm', style: { color: '#B4554A' }, onclick: () => { MR.removeChannel(ch.id); MR.toast('Deleted ' + ch.name, true); } }, 'Delete')));
  };

  function section(title, right) {
    return h('div', { class: 'section' }, h('div', { class: 'section-head' }, h('h5', null, title), right || null));
  }
  function knobCell(pr, value, onInput, onEnd) {
    if (pr.options) {
      return h('div', { class: 'opt-row' }, h('label', null, pr.label), h('div', { class: 'mini-seg' }, pr.options.map((o) => h('button', { class: o === value ? 'on' : '', onclick: (e) => {
        MR.checkpoint(); onInput(o); e.target.parentNode.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === e.target)); MR.engine.sync(); MR.emit('params');
      } }, o))));
    }
    const v = h('span', { class: 'v' });
    const fmt = (x) => (pr.unit === 'pan' ? (Math.abs(x) < 0.02 ? 'C' : (x < 0 ? 'L' : 'R') + Math.round(Math.abs(x) * 100)) : pr.key === 'vol' ? Math.round(x * 100) + '%' : MR.fmt(pr, x));
    const k = MR.knob({ value, min: pr.min, max: pr.max, step: pr.step, def: pr.def, label: v, format: fmt, title: pr.label + ' — drag, scroll, double-click to reset',
      onStart: MR.checkpoint, onInput: (x) => { onInput(x); MR.engine.sync(); }, onEnd: (x) => { onEnd && onEnd(x); MR.emit('params'); } });
    return h('div', { class: 'knob-cell' }, k, h('label', null, pr.label), v);
  }

  function fxSection(target) {
    const list = MR.fxList(target);
    const addMenu = (e) => MR.menu(e, Object.values(MR.FX).map((f) => ({ label: f.name + '  ·  ' + f.desc, run: () => MR.addFx(target, f.id) })));
    const sec = section('Effects', h('button', { class: 'link', onclick: addMenu }, '+ Add'));
    list.forEach((f, i) => {
      const def = MR.FX[f.type];
      const open = ui.selectedFx && ui.selectedFx.id === f.id;
      const card = h('div', { class: 'fx-card' + (f.on === false ? ' off' : '') });
      const sw = h('button', { class: 'switch' + (f.on !== false ? ' on' : ''), title: 'Bypass', onclick: (e) => { e.stopPropagation(); MR.edit(() => (f.on = f.on === false)); } });
      const x = h('button', { class: 'x-btn', title: 'Remove', onclick: (e) => { e.stopPropagation(); MR.edit((p) => { const l = MR.fxList(target); l.splice(l.indexOf(f), 1); }); MR.toast(def.name + ' removed', true); } }, MR.icon('x'));
      const hd = h('div', { class: 'fx-card-head' }, h('span', { class: 'ico' }, MR.icon(f.type)), h('b', null, def.name, h('small', null, def.desc)), sw, x);
      hd.addEventListener('click', () => { ui.selectedFx = open ? null : { target, id: f.id }; MR.renderInspector(); });
      hd.addEventListener('contextmenu', (e) => MR.menu(e, [
        { label: 'Move up', run: () => i > 0 && MR.edit(() => { const l = MR.fxList(target); l.splice(i - 1, 0, l.splice(i, 1)[0]); }) },
        { label: 'Move down', run: () => i < list.length - 1 && MR.edit(() => { const l = MR.fxList(target); l.splice(i + 1, 0, l.splice(i, 1)[0]); }) },
        { label: 'Reset', run: () => MR.edit(() => (f.params = MR.defaultFxParams(f.type))) },
      ]));
      card.appendChild(hd);
      if (open) {
        const body = h('div', { class: 'fx-card-body' }); const kn = h('div', { class: 'knobs' });
        def.params.forEach((pr) => kn.appendChild(knobCell(pr, f.params[pr.key], (x) => (f.params[pr.key] = x))));
        body.appendChild(kn); card.appendChild(body);
      }
      sec.appendChild(card);
    });
    const zone = h('div', { class: 'fx-drop' }, h('b', null, list.length ? 'Drop another effect' : 'Drop an effect here'), 'Reverb, delay, lo-fi and more from the Effects tab');
    dropZone(zone, 'fx', (pl) => { MR.addFx(target, pl.id); MR.toast(MR.FX[pl.id].name + ' added', true); });
    zone.addEventListener('click', addMenu); zone.style.cursor = 'pointer';
    sec.appendChild(zone);
    return sec;
  }
})();
