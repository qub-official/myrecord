/* MyRecord — app shell: top bar, shortcuts, welcome, export, save/open, live meters. */
(function () {
  const MR = window.MR, ui = MR.ui, h = MR.h;
  const P = () => MR.state.project;
  const $ = (id) => document.getElementById(id);

  // ---------- render orchestration ----------
  MR.renderAll = function () {
    MR.renderTopbar(); MR.renderBrowser(); MR.renderPatternPicker(); MR.renderView(); MR.renderInspector();
  };
  MR.onChange((what) => {
    if (what === 'params') { if (ui.view === 'mixer') MR.renderView(); return; }
    if (what === 'steps' || what === 'notes') { if (ui.view === 'rack' && what === 'notes') MR.renderView(); MR.renderTopbar(); return; }
    if (what === 'select') { MR.renderInspector(); if (ui.view !== 'rack') MR.renderView(); else document.querySelectorAll('.rack-row').forEach((r, i) => r.classList.toggle('sel', P().channels[i] && P().channels[i].id === P().selected)); return; }
    MR.renderAll();
  });

  MR.renderTopbar = function () {
    const p = P();
    if (document.activeElement !== $('projectName')) $('projectName').value = p.name;
    if (document.activeElement !== $('bpm')) $('bpm').value = p.bpm;
    $('keySel').value = p.key; $('scaleSel').value = p.scale;
    swingKnob.setValue(p.swing);
    $('undoBtn').disabled = !MR.state.undo.length; $('redoBtn').disabled = !MR.state.redo.length;
    document.title = (MR.state.dirty ? '• ' : '') + p.name + ' — MyRecord';
  };

  // ---------- top bar ----------
  $('logo').appendChild(MR.logo());
  MR.NOTE_NAMES.forEach((n, i) => $('keySel').appendChild(h('option', { value: i }, n)));
  Object.keys(MR.SCALES).forEach((s) => $('scaleSel').appendChild(h('option', { value: s }, s)));
  $('keySel').addEventListener('change', (e) => MR.edit((p) => (p.key = +e.target.value)));
  $('scaleSel').addEventListener('change', (e) => MR.edit((p) => (p.scale = e.target.value)));
  $('projectName').addEventListener('change', (e) => MR.edit((p) => (p.name = e.target.value.trim() || 'Untitled beat')));
  $('projectName').addEventListener('keydown', (e) => { if (e.key === 'Enter') e.target.blur(); });

  const bpm = $('bpm');
  bpm.addEventListener('change', () => MR.edit((p) => (p.bpm = Math.max(40, Math.min(240, Math.round(+bpm.value || 120))))));
  bpm.addEventListener('pointerdown', (e) => {
    if (document.activeElement === bpm) return;
    e.preventDefault(); MR.checkpoint();
    const y0 = e.clientY, b0 = P().bpm; let moved = false;
    const move = (ev) => { const d = Math.round((y0 - ev.clientY) / 3); if (d) moved = true; P().bpm = Math.max(40, Math.min(240, b0 + d)); bpm.value = P().bpm; };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); if (!moved) { MR.state.undo.pop(); bpm.focus(); bpm.select(); } else MR.emit('bpm'); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  });
  bpm.addEventListener('keydown', (e) => { if (e.key === 'Enter') bpm.blur(); });

  const swingKnob = MR.knob({ value: 0, min: 0, max: 0.8, step: 0.01, def: 0, title: 'Swing — drag up/down',
    onStart: MR.checkpoint, onInput: (x) => (P().swing = x), onEnd: () => MR.emit('params') });
  $('swingField').appendChild(swingKnob);

  document.querySelectorAll('#modeSeg button').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
  function setMode(m) {
    ui.mode = m;
    document.querySelectorAll('#modeSeg button').forEach((x) => x.classList.toggle('on', x.dataset.mode === m));
    if (MR.engine.playing) { MR.engine.stop(); togglePlay(true); }
  }
  ui.mode = 'pattern';
  function togglePlay(forceStart) {
    if (MR.engine.playing && !forceStart) { MR.engine.stop(); document.body.classList.remove('playing'); clearPlayheads(); return; }
    if (ui.mode === 'song' && MR.engine.songBars() === 0) MR.toast('The song is empty — playing the current pattern');
    if (!P().channels.length) { MR.toast('Add a sound or a starter beat first'); return; }
    MR.engine.start(ui.mode); document.body.classList.add('playing');
  }
  MR.togglePlay = togglePlay;
  $('playBtn').addEventListener('click', () => togglePlay());
  $('metroBtn').addEventListener('click', () => { ui.metronome = !ui.metronome; $('metroBtn').classList.toggle('on', ui.metronome); });
  $('undoBtn').addEventListener('click', () => MR.undo());
  $('redoBtn').addEventListener('click', () => MR.redo());
  $('fileBtn').addEventListener('click', (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    MR.menu({ preventDefault() {}, clientX: r.left, clientY: r.bottom + 6 }, [
      { label: 'New beat…    Ctrl+N', run: () => MR.showWelcome() },
      { label: 'Open…    Ctrl+O', run: openProject },
      '-',
      { label: 'Save    Ctrl+S', run: () => saveProject(false) },
      { label: 'Save as…    Ctrl+Shift+S', run: () => saveProject(true) },
      '-',
      { label: 'Export WAV…    Ctrl+E', run: showExport },
    ]);
  });
  $('saveBtn').addEventListener('click', () => saveProject(false));
  $('exportBtn').addEventListener('click', showExport);

  document.querySelectorAll('#viewTabs button').forEach((b) => b.addEventListener('click', () => { ui.view = b.dataset.view; MR.renderView(); }));
  document.querySelectorAll('#browserTabs button').forEach((b) => b.addEventListener('click', () => { ui.tab = b.dataset.tab; MR.renderBrowser(); }));
  $('search').addEventListener('input', (e) => { ui.search = e.target.value; MR.renderBrowser(); });
  $('fileInput').addEventListener('change', (e) => { MR.importFiles(Array.from(e.target.files)); e.target.value = ''; });

  // ---------- import ----------
  MR.importFiles = async function (files, replaceChId) {
    const audio = (files || []).filter((f) => /^audio\//.test(f.type) || /\.(wav|mp3|ogg|flac|m4a|aiff?)$/i.test(f.name));
    if (!audio.length) return MR.toast('Drop audio files (WAV, MP3, OGG, FLAC)');
    let n = 0;
    for (const f of audio) {
      try {
        const sid = await MR.loadSampleFromFile(f);
        const name = MR.samples[sid].name;
        if (replaceChId && n === 0) {
          const ch = MR.channel(replaceChId);
          MR.edit(() => { ch.inst = 'sample'; ch.sampleId = sid; ch.name = name; ch.params = MR.defaultParams('sample'); });
        } else MR.addChannel('sample', { sampleId: sid, name });
        n++;
      } catch (e) { console.warn(e); MR.toast('Could not read ' + f.name); }
    }
    if (n) { MR.toast(n === 1 ? 'Imported ' + audio[0].name : 'Imported ' + n + ' sounds', true); ui.view = 'rack'; MR.renderAll(); }
  };

  // ---------- save / open ----------
  async function saveProject(forceDialog) {
    const json = MR.serialize();
    if (window.native) {
      const path = await window.native.saveProject(json, P().name, forceDialog ? null : MR.state.filePath);
      if (path) { MR.state.filePath = path; MR.state.dirty = false; MR.renderTopbar(); MR.toast('Saved'); }
    } else {
      download(new Blob([json], { type: 'application/json' }), P().name + '.mrec'); MR.state.dirty = false; MR.renderTopbar();
    }
  }
  async function openProject() {
    try {
      if (window.native) {
        const r = await window.native.openProject(); if (!r) return;
        await MR.loadProject(r.json, r.filePath);
      } else {
        const inp = h('input', { type: 'file', accept: '.mrec,.json' });
        inp.onchange = async () => { const f = inp.files[0]; if (f) await MR.loadProject(await f.text()); MR.renderAll(); };
        inp.click(); return;
      }
      ui.view = 'rack'; MR.renderAll(); MR.toast('Opened ' + P().name);
    } catch (e) { MR.toast('That file isn’t a MyRecord project'); }
  }
  if (window.native) window.native.onOpenFile(async (json, path) => { try { await MR.loadProject(json, path); MR.closeModal(); MR.renderAll(); } catch (_) {} });
  function download(blob, name) {
    const a = h('a', { href: URL.createObjectURL(blob), download: name }); document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  // ---------- export ----------
  function showExport() {
    if (!P().channels.length) return MR.toast('Nothing to export yet');
    let mode = MR.engine.songBars() > 0 ? 'song' : 'pattern', loops = 4;
    const opt = (m, title, sub) => {
      const c = h('div', { class: 'radio-card' + (m === mode ? ' on' : '') }, h('span', { class: 'r' }), h('div', null, h('b', null, title), h('small', null, sub)));
      c.addEventListener('click', () => { mode = m; box.querySelectorAll('.radio-card').forEach((x) => x.classList.toggle('on', x === c)); });
      return c;
    };
    const songOk = MR.engine.songBars() > 0;
    const prog = h('div', { class: 'progress' }, h('i'));
    const go = h('button', { class: 'btn primary', onclick: async () => {
      go.disabled = true; go.textContent = 'Rendering…'; prog.style.display = 'block';
      try {
        const buf = await MR.renderAudio(mode, loops);
        const bytes = MR.encodeWav(buf);
        if (window.native) {
          const path = await window.native.exportAudio(bytes, P().name, 'wav');
          MR.closeModal();
          if (path) MR.toast('Exported ' + path.split(/[\\/]/).pop());
        } else { download(new Blob([bytes], { type: 'audio/wav' }), P().name + '.wav'); MR.closeModal(); }
      } catch (e) { console.error(e); MR.toast('Export failed: ' + e.message); go.disabled = false; go.textContent = 'Export WAV'; prog.style.display = 'none'; }
    } }, 'Export WAV');
    const box = h('div', null,
      h('h2', null, 'Export your beat'),
      h('p', { class: 'lead' }, '44.1 kHz · 16-bit stereo WAV. Ready for SoundCloud, YouTube or your DAW.'),
      h('div', { class: 'export-opts' },
        opt('pattern', 'Current pattern', MR.pattern().name + ' · looped 4 times'),
        songOk ? opt('song', 'Full song', MR.engine.songBars() + ' bars from the Song view') : null),
      prog,
      h('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '18px' } }, h('button', { class: 'btn ghost', onclick: MR.closeModal }, 'Cancel'), go));
    MR.modal(box, true);
  }

  // ---------- welcome ----------
  MR.showWelcome = function () {
    const grid = h('div', { class: 'tpl-grid' });
    MR.TEMPLATES.forEach((t) => {
      const c = MR.templateCard(t);
      c.addEventListener('click', () => { MR.closeModal(); MR.applyTemplateUI(t); });
      grid.appendChild(c);
    });
    const blank = h('div', { class: 'tpl-card blank' }, MR.icon('plus'), h('b', null, 'Empty project'), h('small', null, 'Start from scratch'));
    blank.querySelector('svg').style.width = '22px';
    blank.addEventListener('click', () => { MR.closeModal(); if (P().channels.length) MR.newProject(); MR.toast('Fresh start — drag sounds in from the Library', true); });
    grid.appendChild(blank);
    const box = h('div', null,
      h('div', { class: 'welcome-head' }, MR.mascot(), h('div', null, h('h2', null, 'Make a beat in seconds'), h('p', { class: 'lead' }, 'Pick a starter beat, hear it right away, then make it yours. Everything is drag and drop, and every change can be undone.'))),
      h('div', { class: 'steps-howto' },
        h('div', null, h('span', { class: 'n' }, '1'), h('b', null, 'Apply'), h('small', null, 'Drop a beat, sound, groove or effect from the Library.')),
        h('div', null, h('span', { class: 'n' }, '2'), h('b', null, 'Customize'), h('small', null, 'Click squares, draw notes, turn knobs on the right.')),
        h('div', null, h('span', { class: 'n' }, '3'), h('b', null, 'Export'), h('small', null, 'Arrange the song, then save it as a WAV.'))),
      grid,
      h('div', { class: 'modal-foot' }, h('span', null, 'Space play/stop · Ctrl+Z undo · Z–M keys play notes'), h('span', null, 'MyRecord 1.0')));
    MR.modal(box);
  };

  // ---------- keyboard ----------
  const KEYMAP = { z: 0, s: 1, x: 2, d: 3, c: 4, v: 5, g: 6, b: 7, h: 8, n: 9, j: 10, m: 11, ',': 12, q: 12, 2: 13, w: 14, 3: 15, e: 16, r: 17, 5: 18, t: 19, 6: 20, y: 21, 7: 22, u: 23, i: 24 };
  let octave = 0;
  document.addEventListener('keydown', (e) => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
    const k = e.key.toLowerCase();
    if (e.ctrlKey || e.metaKey) {
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); MR.undo(); }
      else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); MR.redo(); }
      else if (k === 's') { e.preventDefault(); saveProject(e.shiftKey); }
      else if (k === 'o') { e.preventDefault(); openProject(); }
      else if (k === 'e') { e.preventDefault(); showExport(); }
      else if (k === 'n') { e.preventDefault(); MR.showWelcome(); }
      return;
    }
    if (e.key === 'Escape') { MR.closeModal(); document.querySelectorAll('.ctx').forEach((m) => m.remove()); return; }
    if ($('modal').classList.contains('show')) return;
    if (e.code === 'Space') { e.preventDefault(); togglePlay(); return; }
    const views = { F5: 'playlist', F6: 'rack', F7: 'piano', F9: 'mixer' };
    if (views[e.key]) { e.preventDefault(); ui.view = views[e.key]; MR.renderView(); return; }
    if (e.key === 'ArrowUp' && e.altKey) { octave = Math.min(2, octave + 1); MR.toast('Keyboard octave ' + (4 + octave)); return; }
    if (e.key === 'ArrowDown' && e.altKey) { octave = Math.max(-3, octave - 1); MR.toast('Keyboard octave ' + (4 + octave)); return; }
    if (e.repeat) return;
    if (k in KEYMAP) { const ch = MR.selectedChannel(); if (ch) MR.engine.preview(ch, 60 + octave * 12 + KEYMAP[k], 0.85, 0.35); }
  });

  // ---------- live loop: meters, playheads, LCD ----------
  let lastStep = -1;
  function clearPlayheads() {
    if (ui.stepCols && ui.stepCols[lastStep]) ui.stepCols[lastStep].forEach((c) => c.classList.remove('now'));
    lastStep = -1;
    (ui.playheads || []).forEach((p) => (p.el.style.display = 'none'));
    (ui.notePreviews || []).forEach((p) => (p.style.display = 'none'));
    $('lcdPos').textContent = '1 . 1';
  }
  let wasPlaying = false;
  function loop() {
    if (wasPlaying !== MR.engine.playing) {
      wasPlaying = MR.engine.playing;
      document.body.classList.toggle('playing', wasPlaying);
      if (!wasPlaying) clearPlayheads();
    }
    const pos = MR.engine.position();
    if (pos) {
      const pat = MR.pattern();
      const s = MR.engine.mode === 'pattern' ? pos.patStep : -1;
      if (s !== lastStep && ui.stepCols) {
        if (ui.stepCols[lastStep]) ui.stepCols[lastStep].forEach((c) => c.classList.remove('now'));
        if (ui.stepCols[s]) ui.stepCols[s].forEach((c) => c.classList.add('now'));
        lastStep = s;
      }
      (ui.playheads || []).forEach((ph) => {
        if (ph.kind === 'pattern' && MR.engine.mode === 'pattern') { ph.el.style.display = 'block'; ph.el.style.left = pos.patStep * ph.cw + 'px'; }
        else if (ph.kind === 'song' && MR.engine.mode === 'song') { ph.el.style.display = 'block'; ph.el.style.left = pos.g * ph.cw + 'px'; }
        else ph.el.style.display = 'none';
      });
      (ui.notePreviews || []).forEach((ph) => { if (MR.engine.mode === 'pattern') { ph.style.display = 'block'; ph.style.left = (pos.patStep / pat.length) * 100 + '%'; } });
      const g = MR.engine.mode === 'pattern' ? pos.patStep : pos.g;
      $('lcdPos').textContent = (Math.floor(g / 16) + 1) + ' . ' + (Math.floor((g % 16) / 4) + 1);
    }
    const lv = MR.engine.levels();
    $('masterMeter').style.width = Math.min(100, lv.master * 100) + '%';
    if (ui.meterEls) {
      Object.keys(ui.meterEls).forEach((id) => {
        const v = id === '__master' ? lv.master : lv.strips[id] || 0;
        ui.meterEls[id].style.height = Math.min(100, v * 100) + '%';
      });
    }
    requestAnimationFrame(loop);
  }

  // ---------- status tips ----------
  const TIPS = [
    '<b>Drag</b> a beat from the Library onto the workspace to start instantly',
    '<b>Drop a sound</b> on an existing row to swap it but keep your rhythm',
    '<b>Drop a groove</b> on a row to fill it with a classic pattern',
    '<b>Scroll</b> on an active square to change how hard it hits',
    '<b>Right-click</b> squares or notes to erase · drag to erase many',
    '<b>Keys Z–M</b> play the selected sound like a piano · Alt+↑/↓ changes octave',
    '<b>Double-click</b> any knob to reset it',
    '<b>Drop audio files</b> from Windows Explorer to make your own sounds',
    '<b>Song view</b>: paint patterns onto tracks, then press Song + Play',
    '<b>Ctrl+Click</b> a sound’s light to solo it',
  ];
  let tipI = 0;
  function nextTip() { $('tip').innerHTML = TIPS[tipI++ % TIPS.length]; }
  nextTip(); setInterval(nextTip, 9000);

  // ---------- boot ----------
  (async function boot() {
    let restored = false;
    try {
      const saved = localStorage.getItem('mr.autosave');
      if (saved) { const p = JSON.parse(saved); if (p.channels && p.channels.length) { await MR.loadProject(saved); restored = true; } }
    } catch (_) {}
    MR.renderAll();
    requestAnimationFrame(loop);
    if (restored) MR.toast('Welcome back — your last beat is restored');
    else MR.showWelcome();
    let rz; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (ui.view === 'piano' || ui.view === 'rack') MR.renderView(); }, 120); });
  })();
})();
