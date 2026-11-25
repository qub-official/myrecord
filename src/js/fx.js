/* MyRecord — effects. create(ctx, params, env) -> { input, output, set(params), trigger?(time, stepDur) } */
(function () {
  const MR = (window.MR = window.MR || {});
  const P = (key, label, min, max, step, def, unit) => ({ key, label, min, max, step, def, unit: unit || '' });
  const S = (key, label, options, def) => ({ key, label, options, def });

  function mixer(ctx) {
    const input = ctx.createGain(), output = ctx.createGain(), dry = ctx.createGain(), wet = ctx.createGain();
    input.connect(dry).connect(output); wet.connect(output);
    return { input, output, dry, wet, setMix(m) { dry.gain.value = Math.cos(m * Math.PI / 2); wet.gain.value = Math.sin(m * Math.PI / 2); } };
  }

  function impulse(ctx, seconds, decay) {
    const rate = ctx.sampleRate, len = Math.max(1, Math.floor(rate * seconds));
    const b = ctx.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return b;
  }

  const DIVS = ['1/16', '1/8', '1/8.', '1/4', '1/2'];
  const DIV_STEPS = { '1/16': 1, '1/8': 2, '1/8.': 3, '1/4': 4, '1/2': 8 };

  MR.FX = {
    reverb: {
      id: 'reverb', name: 'Reverb', desc: 'Space & air',
      params: [P('size', 'Size', 0.2, 6, 0.1, 2.2, 's'), P('decay', 'Decay', 1, 8, 0.1, 3), P('tone', 'Tone', 0, 1, 0.01, 0.6), P('mix', 'Mix', 0, 1, 0.01, 0.3)],
      create(ctx, p) {
        const m = mixer(ctx), conv = ctx.createConvolver(), lp = ctx.createBiquadFilter(), pre = ctx.createDelay(0.2);
        lp.type = 'lowpass'; pre.delayTime.value = 0.015;
        m.input.connect(pre).connect(conv).connect(lp).connect(m.wet);
        let key = '';
        return {
          input: m.input, output: m.output,
          set(p) {
            const k = p.size.toFixed(1) + '/' + p.decay.toFixed(1);
            if (k !== key) { key = k; conv.buffer = impulse(ctx, p.size, p.decay); }
            lp.frequency.value = 1500 + p.tone * 14000; m.setMix(p.mix);
          },
        };
      },
    },
    delay: {
      id: 'delay', name: 'Delay', desc: 'Tempo-synced echo',
      params: [S('time', 'Time', DIVS, '1/8.'), P('feedback', 'Feedback', 0, 0.9, 0.01, 0.35), P('tone', 'Tone', 0, 1, 0.01, 0.5), P('mix', 'Mix', 0, 1, 0.01, 0.25)],
      create(ctx, p, env) {
        const m = mixer(ctx), d = ctx.createDelay(4), fb = ctx.createGain(), lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        m.input.connect(d); d.connect(lp).connect(fb).connect(d); lp.connect(m.wet);
        return {
          input: m.input, output: m.output,
          set(p) {
            d.delayTime.value = Math.min(3.9, (DIV_STEPS[p.time] || 2) * env.stepDur());
            fb.gain.value = p.feedback; lp.frequency.value = 800 + p.tone * 12000; m.setMix(p.mix);
          },
        };
      },
    },
    filter: {
      id: 'filter', name: 'Filter', desc: 'Sweep the highs or lows',
      params: [S('type', 'Type', ['lowpass', 'highpass', 'bandpass'], 'lowpass'), P('cutoff', 'Cutoff', 0, 1, 0.005, 0.6), P('reso', 'Resonance', 0, 1, 0.01, 0.2)],
      create(ctx) {
        const f = ctx.createBiquadFilter();
        return { input: f, output: f, set(p) { f.type = p.type; f.frequency.value = 30 * Math.pow(600, p.cutoff); f.Q.value = 0.5 + p.reso * 15; } };
      },
    },
    drive: {
      id: 'drive', name: 'Drive', desc: 'Warm saturation',
      params: [P('amount', 'Amount', 0, 1, 0.01, 0.35), P('tone', 'Tone', 0, 1, 0.01, 0.7), P('mix', 'Mix', 0, 1, 0.01, 1)],
      create(ctx) {
        const m = mixer(ctx), lp = ctx.createBiquadFilter(), g = ctx.createGain(); lp.type = 'lowpass';
        let ws = null, last = -1;
        return {
          input: m.input, output: m.output,
          set(p) {
            if (p.amount !== last) {
              last = p.amount;
              if (ws) { m.input.disconnect(ws); ws.disconnect(); }
              ws = MR.shaper(ctx, p.amount); m.input.connect(ws); ws.connect(lp);
            }
            lp.connect(g).connect(m.wet);
            lp.frequency.value = 1000 + p.tone * 16000; g.gain.value = 1 / (1 + p.amount * 1.5); m.setMix(p.mix);
          },
        };
      },
    },
    compressor: {
      id: 'compressor', name: 'Compressor', desc: 'Glue & punch',
      params: [P('threshold', 'Threshold', -60, 0, 1, -18, 'dB'), P('ratio', 'Ratio', 1, 20, 0.5, 4), P('attack', 'Attack', 0, 0.2, 0.001, 0.01, 's'),
        P('release', 'Release', 0.02, 1, 0.01, 0.2, 's'), P('makeup', 'Makeup', 0, 24, 0.5, 4, 'dB')],
      create(ctx) {
        const c = ctx.createDynamicsCompressor(), g = ctx.createGain(); c.connect(g);
        return { input: c, output: g, set(p) { c.threshold.value = p.threshold; c.ratio.value = p.ratio; c.attack.value = p.attack; c.release.value = p.release; c.knee.value = 6; g.gain.value = Math.pow(10, p.makeup / 20); } };
      },
    },
    eq: {
      id: 'eq', name: 'EQ', desc: 'Shape low / mid / high',
      params: [P('low', 'Low', -18, 18, 0.5, 0, 'dB'), P('mid', 'Mid', -18, 18, 0.5, 0, 'dB'), P('midFreq', 'Mid freq', 0, 1, 0.01, 0.5), P('high', 'High', -18, 18, 0.5, 0, 'dB')],
      create(ctx) {
        const l = ctx.createBiquadFilter(), m = ctx.createBiquadFilter(), h = ctx.createBiquadFilter();
        l.type = 'lowshelf'; l.frequency.value = 140; m.type = 'peaking'; m.Q.value = 0.9; h.type = 'highshelf'; h.frequency.value = 7000;
        l.connect(m).connect(h);
        return { input: l, output: h, set(p) { l.gain.value = p.low; m.gain.value = p.mid; m.frequency.value = 200 * Math.pow(25, p.midFreq); h.gain.value = p.high; } };
      },
    },
    chorus: {
      id: 'chorus', name: 'Chorus', desc: 'Wide & shimmering',
      params: [P('rate', 'Rate', 0.1, 6, 0.1, 0.8, 'Hz'), P('depth', 'Depth', 0, 1, 0.01, 0.5), P('mix', 'Mix', 0, 1, 0.01, 0.4)],
      create(ctx) {
        const m = mixer(ctx), merger = ctx.createChannelMerger(2), lfo = ctx.createOscillator(), inv = ctx.createGain();
        const dl = ctx.createDelay(0.05), dr = ctx.createDelay(0.05), gl = ctx.createGain(), gr = ctx.createGain();
        dl.delayTime.value = dr.delayTime.value = 0.015; inv.gain.value = -1;
        m.input.connect(dl); m.input.connect(dr);
        lfo.connect(gl).connect(dl.delayTime); lfo.connect(inv).connect(gr).connect(dr.delayTime);
        dl.connect(merger, 0, 0); dr.connect(merger, 0, 1); merger.connect(m.wet);
        lfo.start();
        return { input: m.input, output: m.output, set(p) { lfo.frequency.value = p.rate; gl.gain.value = gr.gain.value = p.depth * 0.006; m.setMix(p.mix); } };
      },
    },
    lofi: {
      id: 'lofi', name: 'Lo-fi', desc: 'Vinyl, wobble & crunch',
      params: [P('crush', 'Crush', 0, 1, 0.01, 0.3), P('tone', 'Tone', 0, 1, 0.01, 0.45), P('wobble', 'Wobble', 0, 1, 0.01, 0.35), P('crackle', 'Vinyl', 0, 1, 0.01, 0.3)],
      create(ctx) {
        const input = ctx.createGain(), output = ctx.createGain(), ws = ctx.createWaveShaper(), lp = ctx.createBiquadFilter(), hp = ctx.createBiquadFilter();
        const dl = ctx.createDelay(0.1), lfo = ctx.createOscillator(), lg = ctx.createGain();
        lp.type = 'lowpass'; hp.type = 'highpass'; hp.frequency.value = 60; dl.delayTime.value = 0.012;
        lfo.frequency.value = 0.6; lfo.connect(lg).connect(dl.delayTime); lfo.start();
        input.connect(ws).connect(dl).connect(lp).connect(hp).connect(output);
        // vinyl crackle: sparse random clicks in a looping buffer
        const len = ctx.sampleRate * 3, cb = ctx.createBuffer(1, len, ctx.sampleRate), d = cb.getChannelData(0);
        for (let i = 0; i < len; i++) {
          d[i] = (Math.random() * 2 - 1) * 0.015;
          if (Math.random() < 0.0004) d[i] = (Math.random() * 2 - 1) * 0.8;
        }
        const cs = ctx.createBufferSource(), cg = ctx.createGain(), cf = ctx.createBiquadFilter();
        cs.buffer = cb; cs.loop = true; cf.type = 'bandpass'; cf.frequency.value = 3000; cf.Q.value = 0.5;
        cs.connect(cf).connect(cg).connect(output); cs.start();
        let lastCrush = -1;
        return {
          input, output,
          set(p) {
            if (p.crush !== lastCrush) {
              lastCrush = p.crush;
              const steps = Math.max(3, Math.round(Math.pow(2, 12 - p.crush * 9))), n = 4096, c = new Float32Array(n);
              for (let i = 0; i < n; i++) { const x = (i * 2) / n - 1; c[i] = Math.round(x * steps) / steps; }
              ws.curve = c;
            }
            lp.frequency.value = 1200 + p.tone * 12000; lg.gain.value = p.wobble * 0.0025; cg.gain.value = p.crackle * 0.6;
          },
        };
      },
    },
    pump: {
      id: 'pump', name: 'Pump', desc: 'Sidechain-style ducking',
      params: [S('rate', 'Rate', ['1/4', '1/8', '1/2'], '1/4'), P('depth', 'Depth', 0, 1, 0.01, 0.7), P('release', 'Release', 0.1, 1, 0.01, 0.6)],
      create(ctx) {
        const g = ctx.createGain(); let prm = {};
        return {
          input: g, output: g, pump: true,
          set(p) { prm = p; },
          trigger(time, step, stepDur) {
            const every = DIV_STEPS[prm.rate] || 4;
            if (step % every !== 0) return;
            const len = every * stepDur * prm.release, low = 1 - prm.depth;
            g.gain.cancelScheduledValues(time);
            g.gain.setTargetAtTime(low, time, 0.004);
            g.gain.setTargetAtTime(1, time + 0.02, len / 3);
          },
        };
      },
    },
  };

  MR.defaultFxParams = function (fxId) {
    const o = {}; (MR.FX[fxId] ? MR.FX[fxId].params : []).forEach((p) => (o[p.key] = p.def)); return o;
  };
})();
