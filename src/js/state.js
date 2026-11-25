/* MyRecord — project state, undo/redo, high-level actions. */
(function () {
  const MR = (window.MR = window.MR || {});
  const uid = (p) => (p || 'x') + Math.random().toString(36).slice(2, 9);
  MR.uid = uid;

  function newPattern(n, len) {
    return { id: uid('p'), name: 'Pattern ' + n, length: len || 16, color: MR.COLORS[(n - 1) % MR.COLORS.length], steps: {}, notes: {} };
  }
  MR.newPattern = newPattern;

  function newProject() {
    const pat = newPattern(1, 16);
    return {
      version: 1, name: 'Untitled beat', bpm: 120, swing: 0, key: 0, scale: 'Minor', masterVol: 0.85, masterFx: [],
      channels: [], patterns: [pat], currentPattern: pat.id, selected: null,
      playlist: { tracks: Array.from({ length: 8 }, (_, i) => ({ name: 'Track ' + (i + 1), mute: false })), clips: [] },
    };
  }

  const state = (MR.state = { project: newProject(), undo: [], redo: [], filePath: null, dirty: false });
  const listeners = [];
  MR.onChange = (fn) => listeners.push(fn);
  function emit(what) { listeners.forEach((fn) => fn(what)); MR.engine && MR.engine.sync(); scheduleAutosave(); }
  MR.emit = emit;

  // ---------- serialization ----------
  const snapshot = () => JSON.stringify(state.project);
  MR.checkpoint = function () {
    state.undo.push(snapshot()); if (state.undo.length > 150) state.undo.shift(); state.redo = []; state.dirty = true;
  };
  MR.edit = function (fn, what) { MR.checkpoint(); fn(state.project); emit(what || 'all'); };
  MR.undo = function () { if (!state.undo.length) return false; state.redo.push(snapshot()); state.project = JSON.parse(state.undo.pop()); MR.engine.rebuildFx(); emit('all'); return true; };
  MR.redo = function () { if (!state.redo.length) return false; state.undo.push(snapshot()); state.project = JSON.parse(state.redo.pop()); MR.engine.rebuildFx(); emit('all'); return true; };

  MR.serialize = function () {
    const p = JSON.parse(snapshot());
    const used = new Set(p.channels.map((c) => c.sampleId).filter(Boolean));
    p.samples = {}; used.forEach((id) => { const s = MR.samples[id]; if (s) p.samples[id] = { name: s.name, dataUrl: s.dataUrl }; });
    return JSON.stringify(p);
  };
  MR.loadProject = async function (json, filePath) {
    const p = JSON.parse(json);
    if (!p || !Array.isArray(p.channels) || !Array.isArray(p.patterns)) throw new Error('Not a MyRecord project');
    const samples = p.samples || {}; delete p.samples;
    for (const id of Object.keys(samples)) { try { await MR.registerSample(id, samples[id].name, samples[id].dataUrl); } catch (_) {} }
    MR.engine.stop();
    state.project = Object.assign(newProject(), p); state.undo = []; state.redo = []; state.filePath = filePath || null; state.dirty = false;
    MR.engine.rebuildFx(); emit('all');
  };
  MR.newProject = function () { MR.engine.stop(); MR.checkpoint(); state.project = newProject(); state.filePath = null; MR.engine.rebuildFx(); emit('all'); };

  let saveTimer = null;
  function scheduleAutosave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { try { localStorage.setItem('mr.autosave', MR.serialize()); } catch (_) { try { localStorage.setItem('mr.autosave', snapshot()); } catch (__) {} } }, 800);
  }

  // ---------- getters ----------
  MR.pattern = () => state.project.patterns.find((p) => p.id === state.project.currentPattern) || state.project.patterns[0];
  MR.channel = (id) => state.project.channels.find((c) => c.id === id);
  MR.selectedChannel = () => MR.channel(state.project.selected) || state.project.channels[0] || null;

  // ---------- actions ----------
  MR.makeChannel = function (instId, opts) {
    opts = opts || {};
    const inst = MR.INSTRUMENTS[instId];
    const n = state.project.channels.length;
    return {
      id: uid('c'), name: opts.name || inst.name, inst: instId, params: Object.assign(MR.defaultParams(instId), opts.params || {}),
      color: MR.COLORS[n % MR.COLORS.length], vol: opts.vol != null ? opts.vol : 0.8, pan: 0, mute: false, solo: false,
      fx: (opts.fx || []).map(([type, prm]) => ({ id: uid('f'), type, on: true, params: Object.assign(MR.defaultFxParams(type), prm || {}) })),
      sampleId: opts.sampleId || null,
    };
  };
  MR.addChannel = function (instId, opts, index) {
    let ch;
    MR.edit((p) => {
      ch = MR.makeChannel(instId, opts);
      if (index == null || index > p.channels.length) p.channels.push(ch); else p.channels.splice(index, 0, ch);
      p.selected = ch.id;
    });
    return ch;
  };
  MR.replaceInstrument = function (chId, instId) {
    MR.edit((p) => {
      const c = p.channels.find((x) => x.id === chId); if (!c) return;
      c.inst = instId; c.name = MR.INSTRUMENTS[instId].name; c.params = MR.defaultParams(instId); c.sampleId = null;
    });
  };
  MR.removeChannel = function (chId) {
    MR.edit((p) => {
      p.channels = p.channels.filter((c) => c.id !== chId);
      p.patterns.forEach((pt) => { delete pt.steps[chId]; delete pt.notes[chId]; });
      if (p.selected === chId) p.selected = p.channels[0] ? p.channels[0].id : null;
    });
  };
  MR.addFx = function (target, fxId, index) { // target: channel id or 'master'
    MR.edit((p) => {
      const list = target === 'master' ? p.masterFx : (p.channels.find((c) => c.id === target) || {}).fx;
      if (!list) return;
      const f = { id: uid('f'), type: fxId, on: true, params: MR.defaultFxParams(fxId) };
      if (index == null) list.push(f); else list.splice(index, 0, f);
      MR.ui && (MR.ui.selectedFx = { target, id: f.id });
    });
  };
  MR.fxList = (target) => (target === 'master' ? state.project.masterFx : (MR.channel(target) || {}).fx || []);

  MR.applyGroove = function (chId, groove) {
    MR.edit((p) => {
      const pat = MR.pattern(), arr = MR.parseSteps(groove.steps), out = [];
      for (let i = 0; i < pat.length; i++) out.push(arr[i % arr.length]);
      pat.steps[chId] = out; delete pat.notes[chId];
    });
  };

  MR.applyTemplate = function (t) {
    MR.engine.stop();
    MR.edit((p) => {
      p.bpm = t.bpm; p.swing = t.swing; p.key = t.key; p.scale = t.scale; p.name = t.name + ' beat';
      p.channels = []; p.masterFx = [];
      const pat = newPattern(1, t.len); pat.name = t.name;
      t.tracks.forEach((tr) => {
        const ch = MR.makeChannel(tr.inst, { params: tr.params, vol: tr.vol, fx: tr.fx });
        ch.color = MR.COLORS[p.channels.length % MR.COLORS.length];
        p.channels.push(ch);
        if (tr.steps) pat.steps[ch.id] = MR.parseSteps(tr.steps).slice(0, t.len);
        if (tr.notes) pat.notes[ch.id] = MR.parseNotes(tr.notes);
      });
      p.masterFx = (t.master || []).map(([type, prm]) => ({ id: uid('f'), type, on: true, params: Object.assign(MR.defaultFxParams(type), prm || {}) }));
      p.patterns = [pat]; p.currentPattern = pat.id; p.selected = p.channels[0].id;
      const bars = Math.ceil(t.len / 16);
      p.playlist.clips = [0, 1, 2, 3].map((i) => ({ id: uid('k'), pat: pat.id, track: 0, bar: i * bars, len: bars }));
    });
    MR.engine.rebuildFx();
  };

  MR.addPattern = function (len) {
    let pat;
    MR.edit((p) => { pat = newPattern(p.patterns.length + 1, len || MR.pattern().length); p.patterns.push(pat); p.currentPattern = pat.id; });
    return pat;
  };
  MR.clonePattern = function () {
    MR.edit((p) => {
      const src = MR.pattern(), c = JSON.parse(JSON.stringify(src));
      c.id = uid('p'); c.name = src.name + ' copy'; c.color = MR.COLORS[p.patterns.length % MR.COLORS.length];
      p.patterns.push(c); p.currentPattern = c.id;
    });
  };
  MR.deletePattern = function (id) {
    if (state.project.patterns.length < 2) return;
    MR.edit((p) => {
      p.patterns = p.patterns.filter((x) => x.id !== id);
      p.playlist.clips = p.playlist.clips.filter((c) => c.pat !== id);
      if (p.currentPattern === id) p.currentPattern = p.patterns[0].id;
    });
  };
  MR.setPatternLength = function (len) {
    MR.edit(() => {
      const pat = MR.pattern(), old = pat.length; pat.length = len;
      Object.keys(pat.steps).forEach((k) => {
        const a = pat.steps[k]; const out = [];
        for (let i = 0; i < len; i++) out.push(i < old ? a[i] || 0 : a[i % old] || 0);
        pat.steps[k] = out;
      });
      Object.keys(pat.notes).forEach((k) => {
        if (len > old) { const extra = []; for (let off = old; off < len; off += old) pat.notes[k].forEach((n) => { if (n.s + off < len) extra.push({ ...n, s: n.s + off }); }); pat.notes[k] = pat.notes[k].concat(extra); }
        else pat.notes[k] = pat.notes[k].filter((n) => n.s < len);
      });
    });
  };

  MR.applyMelodyTool = function (chId, tool) {
    MR.edit(() => {
      const pat = MR.pattern(); let notes = (pat.notes[chId] || []).slice();
      if (!notes.length) return;
      if (tool === 'humanize') notes = notes.map((n) => ({ ...n, v: Math.max(0.3, Math.min(1, 0.72 + (Math.random() - 0.5) * 0.35)) }));
      if (tool === 'bassline') {
        const byStep = {}; notes.forEach((n) => { if (!byStep[n.s] || n.n < byStep[n.s].n) byStep[n.s] = n; });
        notes = Object.values(byStep).map((n) => ({ ...n, n: n.n - 12, v: 0.85 }));
      }
      if (tool === 'arpUp' || tool === 'arpDown') {
        const groups = {}; notes.forEach((n) => (groups[n.s] = groups[n.s] || []).push(n));
        const out = [];
        Object.values(groups).forEach((g) => {
          g.sort((a, b) => (tool === 'arpUp' ? a.n - b.n : b.n - a.n));
          const len = g[0].l;
          for (let s = 0, i = 0; s < len; s += 2, i++) out.push({ s: g[0].s + s, l: 2, n: g[i % g.length].n, v: 0.75 });
        });
        notes = out.filter((n) => n.s < pat.length);
      }
      pat.notes[chId] = notes;
    });
  };
})();
