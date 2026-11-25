/* MyRecord — synthesized instruments (no sample packs needed).
   Every instrument exposes play(ctx, out, time, midi, vel, dur, params). */
(function () {
  const MR = (window.MR = window.MR || {});

  const noiseCache = new WeakMap();
  function noise(ctx) {
    let b = noiseCache.get(ctx);
    if (!b) {
      b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      noiseCache.set(ctx, b);
    }
    return b;
  }
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const st = (s) => Math.pow(2, s / 12);

  function driveCurve(amount) {
    const k = amount * 60, n = 1024, c = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      c[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
    }
    return c;
  }
  const curveCache = {};
  function shaper(ctx, amount) {
    const ws = ctx.createWaveShaper();
    const key = Math.round(amount * 50);
    ws.curve = curveCache[key] || (curveCache[key] = driveCurve(key / 50));
    ws.oversample = '2x';
    return ws;
  }

  function noiseSrc(ctx, t, len) {
    const s = ctx.createBufferSource();
    s.buffer = noise(ctx);
    s.start(t, Math.random() * 1.5, len + 0.05);
    return s;
  }
  function env(g, t, peak, attack, decay, curve) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + Math.max(0.001, attack));
    if (curve === 'lin') g.gain.linearRampToValueAtTime(0.0001, t + attack + decay);
    else g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }
  function stopAll(nodes, t) { nodes.forEach((n) => { try { n.stop(t); } catch (_) {} }); }

  // ---------- Drums ----------
  const P = (key, label, min, max, step, def, unit) => ({ key, label, min, max, step, def, unit: unit || '' });

  const drumKick = (startF, endF, defDecay, click) => ({
    params: [P('pitch', 'Pitch', -12, 12, 1, 0, 'st'), P('decay', 'Decay', 0.05, 2.5, 0.01, defDecay, 's'),
      P('punch', 'Punch', 0, 1, 0.01, 0.5), P('drive', 'Drive', 0, 1, 0.01, 0.15)],
    play(ctx, out, t, midi, vel, dur, p) {
      const k = st(p.pitch + (midi - 60));
      const o = ctx.createOscillator(); o.type = 'sine';
      const g = ctx.createGain();
      const sweep = 0.02 + (1 - p.punch) * 0.12;
      o.frequency.setValueAtTime(startF * k * (1 + p.punch), t);
      o.frequency.exponentialRampToValueAtTime(endF * k, t + sweep);
      env(g, t, vel, 0.001, p.decay);
      const ws = shaper(ctx, p.drive);
      o.connect(ws).connect(g).connect(out);
      o.start(t); o.stop(t + p.decay + 0.1);
      if (click) {
        const n = noiseSrc(ctx, t, 0.02), hp = ctx.createBiquadFilter(), ng = ctx.createGain();
        hp.type = 'highpass'; hp.frequency.value = 3000;
        env(ng, t, vel * click * (0.4 + p.punch), 0.0005, 0.015);
        n.connect(hp).connect(ng).connect(out);
      }
    },
  });

  const snare = {
    params: [P('pitch', 'Pitch', -12, 12, 1, 0, 'st'), P('decay', 'Decay', 0.05, 1, 0.01, 0.2, 's'),
      P('tone', 'Tone', 0, 1, 0.01, 0.5), P('snappy', 'Snappy', 0, 1, 0.01, 0.7)],
    play(ctx, out, t, midi, vel, dur, p) {
      const k = st(p.pitch + (midi - 60));
      const o = ctx.createOscillator(); o.type = 'triangle';
      o.frequency.setValueAtTime(240 * k, t); o.frequency.exponentialRampToValueAtTime(170 * k, t + 0.05);
      const og = ctx.createGain(); env(og, t, vel * (1 - p.snappy * 0.5), 0.001, p.decay * 0.5);
      o.connect(og).connect(out); o.start(t); o.stop(t + p.decay + 0.1);
      const n = noiseSrc(ctx, t, p.decay + 0.05), f = ctx.createBiquadFilter(), ng = ctx.createGain();
      f.type = 'highpass'; f.frequency.value = 800 + p.tone * 4000;
      env(ng, t, vel * (0.4 + p.snappy * 0.6), 0.001, p.decay);
      n.connect(f).connect(ng).connect(out);
    },
  };

  const clap = {
    params: [P('decay', 'Decay', 0.05, 1, 0.01, 0.25, 's'), P('tone', 'Tone', 0, 1, 0.01, 0.5),
      P('spread', 'Spread', 0, 1, 0.01, 0.5), P('pitch', 'Pitch', -12, 12, 1, 0, 'st')],
    play(ctx, out, t, midi, vel, dur, p) {
      const f = ctx.createBiquadFilter(); f.type = 'bandpass';
      f.frequency.value = (900 + p.tone * 1500) * st(p.pitch + (midi - 60)); f.Q.value = 1.2;
      const g = ctx.createGain();
      const gap = 0.006 + p.spread * 0.012;
      g.gain.setValueAtTime(0.0001, t);
      for (let i = 0; i < 3; i++) {
        const tt = t + i * gap;
        g.gain.setValueAtTime(vel, tt);
        g.gain.exponentialRampToValueAtTime(vel * 0.2, tt + gap * 0.9);
      }
      g.gain.setValueAtTime(vel, t + 3 * gap);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 3 * gap + p.decay);
      const n = noiseSrc(ctx, t, p.decay + 0.1);
      n.connect(f).connect(g).connect(out);
    },
  };

  const hat = (defDecay) => ({
    params: [P('decay', 'Decay', 0.01, 1.5, 0.01, defDecay, 's'), P('tone', 'Tone', 0, 1, 0.01, 0.6),
      P('pitch', 'Pitch', -12, 12, 1, 0, 'st')],
    play(ctx, out, t, midi, vel, dur, p) {
      const k = st(p.pitch + (midi - 60));
      const n = noiseSrc(ctx, t, p.decay + 0.05);
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = (5000 + p.tone * 4000) * k;
      const bp = ctx.createBiquadFilter(); bp.type = 'peaking'; bp.frequency.value = 10000 * k; bp.gain.value = 6;
      const g = ctx.createGain(); env(g, t, vel * 0.8, 0.0008, p.decay);
      n.connect(hp).connect(bp).connect(g).connect(out);
    },
  });

  const simpleTone = (type, freq, defDecay, drop) => ({
    params: [P('pitch', 'Pitch', -24, 24, 1, 0, 'st'), P('decay', 'Decay', 0.01, 1.5, 0.01, defDecay, 's'),
      P('tone', 'Tone', 0, 1, 0.01, 0.6)],
    play(ctx, out, t, midi, vel, dur, p) {
      const k = st(p.pitch + (midi - 60));
      const o = ctx.createOscillator(); o.type = type;
      o.frequency.setValueAtTime(freq * k, t);
      if (drop) o.frequency.exponentialRampToValueAtTime(freq * k * drop, t + p.decay);
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 800 + p.tone * 9000;
      const g = ctx.createGain(); env(g, t, vel, 0.001, p.decay);
      o.connect(f).connect(g).connect(out); o.start(t); o.stop(t + p.decay + 0.05);
    },
  });

  const cowbell = {
    params: [P('pitch', 'Pitch', -12, 12, 1, 0, 'st'), P('decay', 'Decay', 0.05, 1, 0.01, 0.25, 's')],
    play(ctx, out, t, midi, vel, dur, p) {
      const k = st(p.pitch + (midi - 60));
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2600 * k; bp.Q.value = 0.8;
      const g = ctx.createGain(); env(g, t, vel * 0.6, 0.001, p.decay);
      const os = [540, 800].map((f) => { const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = f * k; o.connect(bp); o.start(t); return o; });
      bp.connect(g).connect(out); stopAll(os, t + p.decay + 0.05);
    },
  };

  const noiseHit = (type, freq, q, defDecay, attack) => ({
    params: [P('decay', 'Decay', 0.01, 2, 0.01, defDecay, 's'), P('tone', 'Tone', 0, 1, 0.01, 0.5),
      P('pitch', 'Pitch', -12, 12, 1, 0, 'st')],
    play(ctx, out, t, midi, vel, dur, p) {
      const n = noiseSrc(ctx, t, p.decay + attack + 0.05);
      const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
      f.frequency.value = freq * (0.5 + p.tone) * st(p.pitch + (midi - 60));
      const g = ctx.createGain(); env(g, t, vel * 0.7, attack, p.decay);
      n.connect(f).connect(g).connect(out);
    },
  });

  // ---------- Melodic ----------
  const MEL = [P('octave', 'Octave', -2, 2, 1, 0), P('attack', 'Attack', 0.001, 2, 0.001, 0.005, 's'),
    P('release', 'Release', 0.01, 4, 0.01, 0.3, 's'), P('cutoff', 'Cutoff', 0, 1, 0.01, 0.6),
    P('reso', 'Resonance', 0, 1, 0.01, 0.15), P('detune', 'Detune', 0, 1, 0.01, 0.2)];
  const mel = (over) => MEL.map((x) => (over[x.key] !== undefined ? { ...x, def: over[x.key] } : x));

  function voice(ctx, out, t, dur, vel, p, oscs, opts) {
    opts = opts || {};
    const f = ctx.createBiquadFilter(); f.type = 'lowpass';
    const base = 120 + Math.pow(p.cutoff, 2) * 14000;
    f.Q.value = p.reso * 18;
    const g = ctx.createGain();
    const atk = Math.max(0.001, p.attack), rel = Math.max(0.01, p.release);
    const end = t + Math.max(dur, atk);
    const sustain = opts.sustain !== undefined ? opts.sustain : 0.8;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vel, t + atk);
    if (opts.decay) g.gain.setTargetAtTime(vel * sustain, t + atk, opts.decay);
    g.gain.setTargetAtTime(0.0001, end, rel / 4);
    if (opts.filterEnv) {
      f.frequency.setValueAtTime(Math.min(18000, base * (1 + opts.filterEnv * 6)), t);
      f.frequency.setTargetAtTime(base, t + atk, opts.filterDecay || 0.15);
    } else f.frequency.value = base;
    oscs.forEach((o) => o.connect(f));
    let tail = f;
    if (opts.drive) { const ws = shaper(ctx, opts.drive); f.connect(ws); tail = ws; }
    tail.connect(g).connect(out);
    oscs.forEach((o) => { o.start(t); o.stop(end + rel + 0.1); });
  }
  function osc(ctx, type, freq, detuneCents) {
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq; o.detune.value = detuneCents || 0; return o;
  }
  function gained(ctx, node, amount) { const g = ctx.createGain(); g.gain.value = amount; node.connect(g); g.start = (t) => node.start(t); g.stop = (t) => node.stop(t); return g; }

  const synth = {
    bass808: {
      params: [P('octave', 'Octave', -2, 2, 1, 0), P('release', 'Length', 0.05, 4, 0.01, 1.2, 's'),
        P('drive', 'Drive', 0, 1, 0.01, 0.3), P('punch', 'Punch', 0, 1, 0.01, 0.4), P('cutoff', 'Tone', 0, 1, 0.01, 0.7)],
      play(ctx, out, t, midi, vel, dur, p) {
        const fr = mtof(midi + p.octave * 12);
        const o = ctx.createOscillator(); o.type = 'sine';
        o.frequency.setValueAtTime(fr * (1 + p.punch * 2), t);
        o.frequency.exponentialRampToValueAtTime(fr, t + 0.04);
        const ws = shaper(ctx, p.drive);
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 200 + p.cutoff * 6000;
        const g = ctx.createGain();
        const len = Math.max(dur, 0.05);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(vel, t + 0.003);
        g.gain.setTargetAtTime(vel * 0.15, t + 0.01, p.release);
        g.gain.setTargetAtTime(0.0001, t + len, 0.03);
        o.connect(ws).connect(lp).connect(g).connect(out);
        o.start(t); o.stop(t + len + 0.5);
      },
    },
    subBass: {
      params: mel({ release: 0.15, cutoff: 0.3, detune: 0 }),
      play(ctx, out, t, midi, vel, dur, p) {
        const fr = mtof(midi + p.octave * 12);
        voice(ctx, out, t, dur, vel, p, [osc(ctx, 'sine', fr), gained(ctx, osc(ctx, 'triangle', fr), 0.3)]);
      },
    },
    sawBass: {
      params: mel({ release: 0.1, cutoff: 0.35, reso: 0.3, detune: 0.3 }),
      play(ctx, out, t, midi, vel, dur, p) {
        const fr = mtof(midi + p.octave * 12);
        voice(ctx, out, t, dur, vel * 0.6, p, [osc(ctx, 'sawtooth', fr, -p.detune * 15), osc(ctx, 'sawtooth', fr, p.detune * 15), gained(ctx, osc(ctx, 'sine', fr / 2), 1.2)],
          { filterEnv: 0.8, filterDecay: 0.08 });
      },
    },
    softKeys: {
      params: mel({ release: 0.6, cutoff: 0.55, detune: 0.1 }),
      play(ctx, out, t, midi, vel, dur, p) {
        const fr = mtof(midi + p.octave * 12);
        const car = osc(ctx, 'sine', fr), mod = osc(ctx, 'sine', fr * 2), mg = ctx.createGain();
        mg.gain.setValueAtTime(fr * 1.5, t); mg.gain.exponentialRampToValueAtTime(fr * 0.05, t + 0.6);
        mod.connect(mg).connect(car.frequency);
        mod.start(t); mod.stop(t + dur + p.release + 0.2);
        voice(ctx, out, t, dur, vel * 0.5, p, [car, gained(ctx, osc(ctx, 'triangle', fr, p.detune * 8), 0.4)], { decay: 0.8, sustain: 0.35 });
      },
    },
    piano: {
      params: mel({ release: 0.4, cutoff: 0.75, detune: 0.05 }),
      play(ctx, out, t, midi, vel, dur, p) {
        const fr = mtof(midi + p.octave * 12);
        voice(ctx, out, t, dur, vel * 0.35, p, [osc(ctx, 'triangle', fr), gained(ctx, osc(ctx, 'sawtooth', fr, p.detune * 10), 0.25), gained(ctx, osc(ctx, 'sine', fr * 2), 0.3)],
          { filterEnv: 0.6, filterDecay: 0.3, decay: 0.5, sustain: 0.25 });
      },
    },
    pluck: {
      params: mel({ release: 0.25, cutoff: 0.35, reso: 0.2, detune: 0.25 }),
      play(ctx, out, t, midi, vel, dur, p) {
        const fr = mtof(midi + p.octave * 12);
        voice(ctx, out, t, dur, vel * 0.4, p, [osc(ctx, 'sawtooth', fr, -p.detune * 12), osc(ctx, 'sawtooth', fr, p.detune * 12)],
          { filterEnv: 1.2, filterDecay: 0.07, decay: 0.15, sustain: 0.15 });
      },
    },
    pad: {
      params: mel({ attack: 0.5, release: 1.5, cutoff: 0.4, detune: 0.5 }),
      play(ctx, out, t, midi, vel, dur, p) {
        const fr = mtof(midi + p.octave * 12), d = p.detune * 22;
        voice(ctx, out, t, dur, vel * 0.22, p, [osc(ctx, 'sawtooth', fr, -d), osc(ctx, 'sawtooth', fr, d), osc(ctx, 'sawtooth', fr, 0), gained(ctx, osc(ctx, 'triangle', fr / 2), 0.6)]);
      },
    },
    lead: {
      params: mel({ release: 0.15, cutoff: 0.65, reso: 0.25, detune: 0.2 }),
      play(ctx, out, t, midi, vel, dur, p) {
        const fr = mtof(midi + p.octave * 12);
        const a = osc(ctx, 'square', fr), b = osc(ctx, 'sawtooth', fr, p.detune * 14);
        const lfo = osc(ctx, 'sine', 5.5), lg = ctx.createGain();
        lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(12, t + 0.4);
        lfo.connect(lg); lg.connect(a.detune); lg.connect(b.detune);
        lfo.start(t); lfo.stop(t + dur + p.release + 0.2);
        voice(ctx, out, t, dur, vel * 0.25, p, [a, b], { filterEnv: 0.4 });
      },
    },
    bell: {
      params: mel({ release: 1.2, cutoff: 0.8, detune: 0.1 }),
      play(ctx, out, t, midi, vel, dur, p) {
        const fr = mtof(midi + p.octave * 12);
        const car = osc(ctx, 'sine', fr, p.detune * 6), mod = osc(ctx, 'sine', fr * 3.5), mg = ctx.createGain();
        mg.gain.setValueAtTime(fr * 2.2, t); mg.gain.exponentialRampToValueAtTime(fr * 0.01, t + 1.2);
        mod.connect(mg).connect(car.frequency);
        mod.start(t); mod.stop(t + dur + p.release + 0.2);
        voice(ctx, out, t, dur, vel * 0.45, p, [car], { decay: 0.5, sustain: 0.2 });
      },
    },
    organ: {
      params: mel({ release: 0.08, cutoff: 0.7, detune: 0.1 }),
      play(ctx, out, t, midi, vel, dur, p) {
        const fr = mtof(midi + p.octave * 12);
        voice(ctx, out, t, dur, vel * 0.22, p, [osc(ctx, 'sine', fr), gained(ctx, osc(ctx, 'sine', fr * 2, p.detune * 5), 0.7), gained(ctx, osc(ctx, 'sine', fr * 3), 0.45), gained(ctx, osc(ctx, 'sine', fr * 4), 0.3)]);
      },
    },
    strings: {
      params: mel({ attack: 0.25, release: 0.9, cutoff: 0.5, detune: 0.35 }),
      play(ctx, out, t, midi, vel, dur, p) {
        const fr = mtof(midi + p.octave * 12), d = p.detune * 16;
        const a = osc(ctx, 'sawtooth', fr, -d), b = osc(ctx, 'sawtooth', fr, d);
        const lfo = osc(ctx, 'sine', 5), lg = ctx.createGain(); lg.gain.value = 6;
        lfo.connect(lg); lg.connect(a.detune); lg.connect(b.detune);
        lfo.start(t); lfo.stop(t + dur + p.release + 0.2);
        voice(ctx, out, t, dur, vel * 0.25, p, [a, b]);
      },
    },
  };

  // ---------- Sample player ----------
  const samplePlayer = {
    params: [P('pitch', 'Pitch', -24, 24, 1, 0, 'st'), P('start', 'Start', 0, 0.95, 0.01, 0),
      P('length', 'Length', 0.02, 1, 0.01, 1), P('fade', 'Fade out', 0, 1, 0.01, 0.05), P('reverse', 'Reverse', 0, 1, 1, 0)],
    play(ctx, out, t, midi, vel, dur, p, ch) {
      const buf = MR.getSampleBuffer && MR.getSampleBuffer(ch.sampleId, !!p.reverse);
      if (!buf) return;
      const s = ctx.createBufferSource(); s.buffer = buf;
      s.playbackRate.value = st(p.pitch + (midi - 60));
      const off = buf.duration * p.start;
      const len = Math.max(0.01, (buf.duration - off) * p.length) / s.playbackRate.value;
      const g = ctx.createGain();
      g.gain.setValueAtTime(vel, t);
      const fade = Math.max(0.005, len * p.fade);
      g.gain.setValueAtTime(vel, t + Math.max(0, len - fade));
      g.gain.linearRampToValueAtTime(0.0001, t + len);
      s.connect(g).connect(out);
      s.start(t, off, len * s.playbackRate.value + 0.01);
    },
  };

  // ---------- Catalog ----------
  // kind: 'drum' (step sequencer first) or 'melodic' (piano roll first)
  const D = (id, name, cat, def, extra) => ({ id, name, cat, kind: 'drum', ...def, ...(extra || {}) });
  const M = (id, name, cat, def) => ({ id, name, cat, kind: 'melodic', ...def });

  MR.INSTRUMENTS = {
    kick808: D('kick808', '808 Kick', 'Drums', drumKick(140, 42, 0.9, 0.3)),
    kickPunch: D('kickPunch', 'Punch Kick', 'Drums', drumKick(180, 50, 0.35, 0.9)),
    kickSoft: D('kickSoft', 'Soft Kick', 'Drums', drumKick(110, 48, 0.4, 0.15)),
    snare: D('snare', 'Snare', 'Drums', snare),
    snareTight: D('snareTight', 'Tight Snare', 'Drums', { ...snare, params: snare.params.map((x) => (x.key === 'decay' ? { ...x, def: 0.1 } : x.key === 'pitch' ? { ...x, def: 4 } : x)) }),
    clap: D('clap', 'Clap', 'Drums', clap),
    hatClosed: D('hatClosed', 'Closed Hat', 'Drums', hat(0.05)),
    hatOpen: D('hatOpen', 'Open Hat', 'Drums', hat(0.35)),
    rim: D('rim', 'Rimshot', 'Drums', simpleTone('triangle', 1700, 0.04)),
    tom: D('tom', 'Tom', 'Drums', simpleTone('sine', 180, 0.35, 0.6)),
    crash: D('crash', 'Crash', 'Drums', noiseHit('highpass', 5000, 0.5, 1.4, 0.001)),
    cowbell: D('cowbell', 'Cowbell', 'Percussion', cowbell),
    shaker: D('shaker', 'Shaker', 'Percussion', noiseHit('bandpass', 7000, 1.5, 0.06, 0.012)),
    snap: D('snap', 'Finger Snap', 'Percussion', noiseHit('bandpass', 2600, 4, 0.06, 0.001)),
    wood: D('wood', 'Woodblock', 'Percussion', simpleTone('sine', 900, 0.06)),
    conga: D('conga', 'Conga', 'Percussion', simpleTone('sine', 320, 0.22, 0.85)),
    bass808: M('bass808', '808 Bass', 'Bass', synth.bass808),
    subBass: M('subBass', 'Sub Bass', 'Bass', synth.subBass),
    sawBass: M('sawBass', 'Saw Bass', 'Bass', synth.sawBass),
    piano: M('piano', 'Piano', 'Keys', synth.piano),
    softKeys: M('softKeys', 'Soft Keys', 'Keys', synth.softKeys),
    organ: M('organ', 'Organ', 'Keys', synth.organ),
    pluck: M('pluck', 'Pluck', 'Synth', synth.pluck),
    pad: M('pad', 'Warm Pad', 'Synth', synth.pad),
    lead: M('lead', 'Lead', 'Synth', synth.lead),
    bell: M('bell', 'Bell', 'Synth', synth.bell),
    strings: M('strings', 'Strings', 'Synth', synth.strings),
    sample: { id: 'sample', name: 'Sample', cat: 'Samples', kind: 'drum', ...samplePlayer },
  };

  MR.defaultParams = function (instId) {
    const inst = MR.INSTRUMENTS[instId]; const o = {};
    (inst ? inst.params : []).forEach((p) => (o[p.key] = p.def));
    return o;
  };
  MR.mtof = mtof;
  MR.shaper = shaper;
  MR.noiseBuffer = noise;
})();
