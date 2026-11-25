/* MyRecord — audio engine: mixer graph, look-ahead scheduler, offline export. */
(function () {
  const MR = (window.MR = window.MR || {});
  const proj = () => MR.state.project;
  const stepDurOf = (p) => 60 / p.bpm / 4;

  // ---------------- Samples ----------------
  MR.samples = {}; // id -> { name, dataUrl, buffer, reversed }
  MR.getSampleBuffer = function (id, reversed) {
    const s = MR.samples[id]; if (!s || !s.buffer) return null;
    if (!reversed) return s.buffer;
    if (!s.reversed) {
      const b = s.buffer, r = new AudioBuffer({ length: b.length, numberOfChannels: b.numberOfChannels, sampleRate: b.sampleRate });
      for (let c = 0; c < b.numberOfChannels; c++) { const d = b.getChannelData(c).slice().reverse(); r.copyToChannel(d, c); }
      s.reversed = r;
    }
    return s.reversed;
  };
  MR.loadSampleFromFile = function (file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onerror = () => reject(fr.error);
      fr.onload = async () => {
        try {
          const id = 's' + Math.random().toString(36).slice(2, 9);
          await MR.registerSample(id, file.name.replace(/\.[^.]+$/, ''), fr.result);
          resolve(id);
        } catch (e) { reject(e); }
      };
      fr.readAsDataURL(file);
    });
  };
  MR.registerSample = async function (id, name, dataUrl) {
    const bin = atob(dataUrl.split(',')[1]); const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const buffer = await engine.ctx().decodeAudioData(bytes.buffer);
    MR.samples[id] = { name, dataUrl, buffer, reversed: null };
    return id;
  };

  // ---------------- Graph ----------------
  function buildFxChain(ctx, list, env) {
    return (list || []).filter((f) => f.on !== false && MR.FX[f.type]).map((f) => {
      const node = MR.FX[f.type].create(ctx, f.params, env); node.set(f.params); node.uid = f.id; return node;
    });
  }

  class Strip {
    constructor(ctx, dest, env) {
      this.ctx = ctx; this.env = env;
      this.input = ctx.createGain();
      this.pan = ctx.createStereoPanner();
      this.gain = ctx.createGain();
      this.meter = ctx.createAnalyser(); this.meter.fftSize = 512;
      this.pan.connect(this.gain); this.gain.connect(this.meter); if (dest) this.gain.connect(dest);
      this.fx = []; this.fxKey = null;
      this.input.connect(this.pan);
    }
    setFx(list) {
      const key = JSON.stringify((list || []).map((f) => [f.id, f.type, f.on !== false]));
      if (key === this.fxKey) { // same structure: just update params
        (list || []).filter((f) => f.on !== false).forEach((f) => { const n = this.fx.find((x) => x.uid === f.id); if (n) n.set(f.params); });
        return;
      }
      this.fxKey = key;
      this.input.disconnect();
      this.fx.forEach((n) => { try { n.output.disconnect(); } catch (_) {} });
      this.fx = buildFxChain(this.ctx, list, this.env);
      let prev = this.input;
      this.fx.forEach((n) => { prev.connect(n.input); prev = n.output; });
      prev.connect(this.pan);
    }
    level() {
      const a = new Float32Array(this.meter.fftSize); this.meter.getFloatTimeDomainData(a);
      let m = 0; for (let i = 0; i < a.length; i++) { const v = Math.abs(a[i]); if (v > m) m = v; } return m;
    }
    dispose() { try { this.gain.disconnect(); this.input.disconnect(); } catch (_) {} }
  }

  function buildGraph(ctx, p, env) {
    const master = new Strip(ctx, null, env);
    master.gain.disconnect(); // re-route: gain -> limiter -> meter + speakers
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -1.5; limiter.knee.value = 0; limiter.ratio.value = 20; limiter.attack.value = 0.002; limiter.release.value = 0.1;
    master.gain.connect(limiter); limiter.connect(master.meter); limiter.connect(ctx.destination);
    const g = { master, strips: {} };
    applyMix(g, p);
    return g;
  }
  function applyMix(g, p) {
    const anySolo = p.channels.some((c) => c.solo);
    p.channels.forEach((c) => {
      let s = g.strips[c.id];
      if (!s) s = g.strips[c.id] = new Strip(g.master.ctx, g.master.input, g.master.env);
      const audible = !c.mute && (!anySolo || c.solo);
      s.gain.gain.setTargetAtTime(audible ? c.vol * c.vol : 0, s.ctx.currentTime, 0.01);
      s.pan.pan.setTargetAtTime(c.pan, s.ctx.currentTime, 0.01);
      s.setFx(c.fx);
    });
    Object.keys(g.strips).forEach((id) => { if (!p.channels.find((c) => c.id === id)) { g.strips[id].dispose(); delete g.strips[id]; } });
    g.master.gain.gain.setTargetAtTime(p.masterVol * p.masterVol, g.master.ctx.currentTime, 0.01);
    g.master.setFx(p.masterFx);
  }

  // ---------------- Events ----------------
  function patternEvents(p, pat, step) {
    const out = [];
    p.channels.forEach((c) => {
      const notes = pat.notes[c.id];
      if (notes && notes.length) {
        notes.forEach((n) => { if (n.s === step) out.push({ ch: c, midi: n.n, vel: n.v, len: n.l }); });
      } else {
        const st = pat.steps[c.id]; const v = st && st[step];
        if (v) out.push({ ch: c, midi: 60, vel: v, len: 1 });
      }
    });
    return out;
  }
  function songBars(p) {
    let end = 0; p.playlist.clips.forEach((c) => (end = Math.max(end, c.bar + c.len))); return end;
  }
  function eventsAt(p, mode, g) {
    if (mode === 'pattern') {
      const pat = p.patterns.find((x) => x.id === p.currentPattern) || p.patterns[0];
      return { events: patternEvents(p, pat, g % pat.length), patStep: g % pat.length };
    }
    const bar = Math.floor(g / 16), out = [];
    p.playlist.clips.forEach((cl) => {
      if (bar < cl.bar || bar >= cl.bar + cl.len) return;
      const tr = p.playlist.tracks[cl.track]; if (tr && tr.mute) return;
      const pat = p.patterns.find((x) => x.id === cl.pat); if (!pat) return;
      const local = (g - cl.bar * 16) % pat.length;
      patternEvents(p, pat, local).forEach((e) => out.push(e));
    });
    return { events: out, patStep: g % 16 };
  }
  function play(ctx, graph, e, time, stepDur) {
    const inst = MR.INSTRUMENTS[e.ch.inst], strip = graph.strips[e.ch.id];
    if (!inst || !strip) return;
    try { inst.play(ctx, strip.input, time, e.midi, Math.max(0.02, e.vel), e.len * stepDur, e.ch.params, e.ch); } catch (err) { console.warn(err); }
  }
  function swingOffset(p, g, stepDur) { return g % 2 === 1 ? p.swing * stepDur * 0.5 : 0; }
  function triggerPumps(graph, time, g, stepDur) {
    const all = [graph.master, ...Object.values(graph.strips)];
    all.forEach((s) => s.fx.forEach((n) => n.pump && n.trigger(time, g, stepDur)));
  }

  // ---------------- Live engine ----------------
  let ctx = null, graph = null, timer = null;
  const live = { playing: false, mode: 'pattern', g: 0, nextTime: 0, queue: [], startedAt: 0 };
  const env = { stepDur: () => stepDurOf(proj()) };

  const engine = (MR.engine = {
    ctx() {
      if (!ctx) {
        ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
        graph = buildGraph(ctx, proj(), env);
      }
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    },
    sync() { if (graph) applyMix(graph, proj()); },
    rebuildFx() { if (!graph) return; Object.values(graph.strips).forEach((s) => (s.fxKey = null)); graph.master.fxKey = null; applyMix(graph, proj()); },
    get playing() { return live.playing; },
    get mode() { return live.mode; },
    start(mode) {
      this.ctx(); this.sync();
      live.mode = mode === 'song' && songBars(proj()) > 0 ? 'song' : 'pattern';
      live.playing = true; live.g = 0; live.queue = [];
      live.nextTime = ctx.currentTime + 0.06; live.startedAt = live.nextTime;
      clearInterval(timer); timer = setInterval(tick, 25); tick();
    },
    stop() {
      live.playing = false; clearInterval(timer); timer = null; live.queue = [];
      if (graph) { // quick fade so tails don't ring forever
        const now = ctx.currentTime; Object.values(graph.strips).forEach((s) => { s.input.gain.cancelScheduledValues(now); s.input.gain.setTargetAtTime(0, now, 0.03); s.input.gain.setTargetAtTime(1, now + 0.25, 0.01); });
      }
    },
    position() { // -> { g, patStep } for UI playhead
      if (!live.playing || !ctx) return null;
      const now = ctx.currentTime; let cur = null;
      while (live.queue.length && live.queue[0].time <= now) cur = live.queue.shift();
      if (cur) live.cur = cur;
      return live.cur || null;
    },
    preview(ch, midi, vel, dur) {
      this.ctx(); this.sync();
      const s = graph.strips[ch.id]; if (!s) return;
      const inst = MR.INSTRUMENTS[ch.inst];
      try { inst.play(ctx, s.input, ctx.currentTime + 0.005, midi == null ? 60 : midi, vel || 0.85, dur || 0.3, ch.params, ch); } catch (e) { console.warn(e); }
    },
    previewSound(instId, midi) { // browser audition (not yet a channel)
      this.ctx();
      const inst = MR.INSTRUMENTS[instId]; if (!inst) return;
      try { inst.play(ctx, graph.master.input, ctx.currentTime + 0.005, midi || (inst.kind === 'melodic' ? 60 : 60), 0.8, 0.4, MR.defaultParams(instId), {}); } catch (e) { console.warn(e); }
    },
    levels() {
      if (!graph) return { master: 0, strips: {} };
      const strips = {}; Object.keys(graph.strips).forEach((id) => (strips[id] = graph.strips[id].level()));
      return { master: graph.master.level(), strips };
    },
    songBars: () => songBars(proj()),
  });

  function tick() {
    const p = proj(), sd = stepDurOf(p);
    while (live.nextTime < ctx.currentTime + 0.12) {
      let g = live.g;
      if (live.mode === 'song') { const total = songBars(p) * 16; if (total === 0) { engine.stop(); return; } g = g % total; }
      const t = live.nextTime + swingOffset(p, g, sd);
      const { events, patStep } = eventsAt(p, live.mode, g);
      events.forEach((e) => play(ctx, graph, e, t, sd));
      triggerPumps(graph, t, g, sd);
      if (MR.ui && MR.ui.metronome && g % 4 === 0) click(t, g % 16 === 0);
      live.queue.push({ time: t, g, patStep, bar: Math.floor(g / 16) });
      live.nextTime += sd; live.g++;
    }
  }
  function click(t, accent) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = accent ? 1760 : 1320; g.gain.setValueAtTime(0.25, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + 0.06);
  }

  // ---------------- Export ----------------
  MR.renderAudio = async function (mode, loops) {
    const p = proj(), sd = stepDurOf(p);
    let steps;
    if (mode === 'song' && songBars(p) > 0) steps = songBars(p) * 16;
    else { mode = 'pattern'; const pat = p.patterns.find((x) => x.id === p.currentPattern) || p.patterns[0]; steps = pat.length * (loops || 4); }
    const rate = 44100, tail = 2.5;
    const off = new OfflineAudioContext(2, Math.ceil((steps * sd + tail) * rate), rate);
    const oenv = { stepDur: () => sd };
    const og = buildGraph(off, p, oenv);
    for (let g = 0; g < steps; g++) {
      const t = 0.02 + g * sd + swingOffset(p, g, sd);
      eventsAt(p, mode, g).events.forEach((e) => play(off, og, e, t, sd));
      triggerPumps(og, t, g, sd);
    }
    return off.startRendering();
  };
  MR.encodeWav = function (buf) {
    const ch = buf.numberOfChannels, len = buf.length, rate = buf.sampleRate;
    const data = new DataView(new ArrayBuffer(44 + len * ch * 2));
    const w = (o, s) => { for (let i = 0; i < s.length; i++) data.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); data.setUint32(4, 36 + len * ch * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
    data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, ch, true);
    data.setUint32(24, rate, true); data.setUint32(28, rate * ch * 2, true); data.setUint16(32, ch * 2, true); data.setUint16(34, 16, true);
    w(36, 'data'); data.setUint32(40, len * ch * 2, true);
    const chans = []; for (let c = 0; c < ch; c++) chans.push(buf.getChannelData(c));
    let peak = 0; chans.forEach((d) => { for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; } });
    const gain = peak > 0.97 ? 0.97 / peak : 1; // never clip the exported file
    let o = 44;
    for (let i = 0; i < len; i++) for (let c = 0; c < ch; c++) {
      const s = Math.max(-1, Math.min(1, chans[c][i] * gain)); data.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2;
    }
    return new Uint8Array(data.buffer);
  };
})();
