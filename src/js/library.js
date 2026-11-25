/* MyRecord — drag-and-drop content: templates, grooves, chord progressions, scales. */
(function () {
  const MR = (window.MR = window.MR || {});

  MR.COLORS = ['#A87C3A', '#B08A8A', '#B49A85', '#2E2F33', '#C69B57', '#8E7A6A', '#9C8585', '#5E5A55'];
  MR.NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  MR.noteName = (m) => MR.NOTE_NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
  function nn(s) { // "C#4" -> midi
    const m = /^([A-G])(#|b)?(-?\d)$/.exec(s); if (!m) return 60;
    let v = MR.NOTE_NAMES.indexOf(m[1]) + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
    return v + (parseInt(m[3], 10) + 1) * 12;
  }
  MR.parseSteps = (str) => str.replace(/\s/g, '').split('').map((c) => (c === 'x' ? 1 : c === 'o' ? 0.55 : c === '-' ? 0.3 : 0));
  // "0:C2:4 8:D#2:2" (step:note:length[:vel]); a chord: "0:C4+E4+G4:16"
  MR.parseNotes = (str) => {
    const out = [];
    str.trim().split(/\s+/).forEach((tok) => {
      if (!tok) return;
      const [s, n, l, v] = tok.split(':');
      n.split('+').forEach((x) => out.push({ s: +s, n: nn(x), l: +(l || 1), v: v ? +v : 0.8 }));
    });
    return out;
  };

  MR.SCALES = {
    'Major': [0, 2, 4, 5, 7, 9, 11],
    'Minor': [0, 2, 3, 5, 7, 8, 10],
    'Dorian': [0, 2, 3, 5, 7, 9, 10],
    'Pentatonic minor': [0, 3, 5, 7, 10],
    'Pentatonic major': [0, 2, 4, 7, 9],
    'Harmonic minor': [0, 2, 3, 5, 7, 8, 11],
    'Chromatic': [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  };

  // ---------- Grooves: drop onto a channel row ----------
  MR.GROOVES = [
    { id: 'four', name: 'Four on the floor', steps: 'x...x...x...x...' },
    { id: 'backbeat', name: 'Backbeat 2 & 4', steps: '....x.......x...' },
    { id: 'halftime', name: 'Half-time snare', steps: '........x.......' },
    { id: 'offbeat', name: 'Offbeat', steps: '..x...x...x...x.' },
    { id: 'eighths', name: '8th notes', steps: 'x.x.x.x.x.x.x.x.' },
    { id: 'sixteenths', name: '16th notes', steps: 'xoxoxoxoxoxoxoxo' },
    { id: 'trapRoll', name: 'Trap hat roll', steps: 'x.x.x.x.x.xxxxxx' },
    { id: 'boomKick', name: 'Boom bap kick', steps: 'x......x..x.....' },
    { id: 'trapKick', name: 'Trap kick', steps: 'x......x..x...x.' },
    { id: 'dembow', name: 'Dembow', steps: '...x..x....x..x.' },
    { id: 'clave', name: 'Clave 3-3-2', steps: 'x..x..x...x.x...' },
    { id: 'shuffle', name: 'Shuffle', steps: 'x..xx..xx..xx..x' },
  ];

  // ---------- Chord progressions: drop onto the piano roll ----------
  // degrees are semitone offsets from the key root; voiced around octave 4
  MR.PROGRESSIONS = [
    { id: 'pop', name: 'I–V–vi–IV', tag: 'Pop', chords: [[0, 4, 7], [7, 11, 14], [9, 12, 16], [5, 9, 12]] },
    { id: 'sad', name: 'vi–IV–I–V', tag: 'Emotional', chords: [[-3, 0, 4], [-7, -3, 0], [0, 4, 7], [-5, -1, 2]] },
    { id: 'jazz', name: 'ii–V–I', tag: 'Jazz / R&B', chords: [[2, 5, 9, 12], [-5, -1, 2, 5], [0, 4, 7, 11], [0, 4, 7, 11]] },
    { id: 'lofi', name: 'IVmaj7–iii7', tag: 'Lo-fi', chords: [[5, 9, 12, 16], [4, 7, 11, 14], [5, 9, 12, 16], [4, 7, 11, 14]] },
    { id: 'epic', name: 'i–VI–III–VII', tag: 'Epic minor', chords: [[0, 3, 7], [-4, 0, 3], [3, 7, 10], [-2, 2, 5]] },
    { id: 'dark', name: 'i–iv–v–i', tag: 'Dark trap', chords: [[0, 3, 7], [5, 8, 12], [7, 10, 14], [0, 3, 7]] },
    { id: 'kpop', name: 'IV–V–iii–vi', tag: 'K-pop', chords: [[5, 9, 12], [7, 11, 14], [4, 7, 11], [9, 12, 16]] },
    { id: 'single', name: 'Single chord', tag: 'Root triad', chords: [[0, 4, 7]] },
  ];
  MR.buildProgression = function (prog, key, scaleName, length) {
    const minor = /minor|Dorian/i.test(scaleName);
    const per = Math.max(1, Math.floor(length / prog.chords.length));
    const notes = [];
    prog.chords.forEach((ch, i) => {
      ch.forEach((d) => {
        let deg = d;
        if (minor && prog.id !== 'epic' && prog.id !== 'dark') { // major-key progression played in the relative major
          deg = d + 3 > 14 ? d - 9 : d + 3;
        }
        notes.push({ s: i * per, l: per, n: 60 + key + deg, v: 0.7 });
      });
    });
    return notes;
  };
  MR.MELODY_TOOLS = [
    { id: 'arpUp', name: 'Arpeggiate ↑', tag: 'Turns chords into arps' },
    { id: 'arpDown', name: 'Arpeggiate ↓', tag: 'Downward arp' },
    { id: 'bassline', name: 'Bassline from chords', tag: 'Root notes, one octave down' },
    { id: 'humanize', name: 'Humanize', tag: 'Natural velocity' },
  ];

  // ---------- Templates: drop on the workspace to start a whole beat ----------
  const T = (o) => o;
  MR.TEMPLATES = [
    T({
      id: 'trap', name: 'Trap', bpm: 140, swing: 0, key: 0, scale: 'Minor', len: 32, mood: 'Hard · 140 BPM',
      tracks: [
        { inst: 'kick808', steps: 'x......x..x..... x.........x..x..' },
        { inst: 'clap', steps: '........x....... ........x.......', fx: [['reverb', { mix: 0.15, size: 1.2 }]] },
        { inst: 'hatClosed', steps: 'x.x.x.x.x.x.x.x. x.x.x.x.xxxxx.x.', params: { decay: 0.04 } },
        { inst: 'hatOpen', steps: '..............x. ......x.........' },
        { inst: 'bass808', notes: '0:C2:7 7:C2:3 10:D#2:6 16:C2:10 26:G1:3 29:A#1:3', fx: [['drive', { amount: 0.3 }]] },
        { inst: 'bell', notes: '0:C5:2 4:D#5:2 8:G5:2 12:D#5:2 16:A#4:2 20:D#5:2 24:G5:2 28:F5:2', vol: 0.62, fx: [['delay', { mix: 0.2 }], ['reverb', { mix: 0.3 }]] },
      ],
      master: [['compressor', { threshold: -14, ratio: 3, makeup: 3 }]],
    }),
    T({
      id: 'lofi', name: 'Lo-fi', bpm: 82, swing: 0.45, key: 5, scale: 'Major', len: 32, mood: 'Chill · 82 BPM',
      tracks: [
        { inst: 'kickSoft', steps: 'x......x..x..... x.........x.....' },
        { inst: 'snare', steps: '....x.......x... ....x.......x..o', params: { tone: 0.3, decay: 0.15 } },
        { inst: 'hatClosed', steps: 'x.o.x.o.x.o.x.o. x.o.x.o.x.o.x.oo', vol: 0.55 },
        { inst: 'softKeys', notes: '0:F3+A3+C4+E4:14 16:E3+G3+B3+D4:14', fx: [['chorus', { mix: 0.35 }], ['reverb', { mix: 0.35 }]] },
        { inst: 'subBass', notes: '0:F2:6 8:F2:4 12:C2:3 16:E2:6 24:E2:4 28:B1:3' },
      ],
      master: [['lofi', {}], ['compressor', { threshold: -16, ratio: 2.5, makeup: 2 }]],
    }),
    T({
      id: 'house', name: 'House', bpm: 124, swing: 0.1, key: 9, scale: 'Minor', len: 16, mood: 'Groovy · 124 BPM',
      tracks: [
        { inst: 'kickPunch', steps: 'x...x...x...x...' },
        { inst: 'clap', steps: '....x.......x...' },
        { inst: 'hatOpen', steps: '..x...x...x...x.', params: { decay: 0.18 } },
        { inst: 'hatClosed', steps: 'oxoooxoooxoooxoo', vol: 0.5 },
        { inst: 'sawBass', notes: '2:A1:2 6:A1:2 10:A1:2 14:C2:2', fx: [['pump', {}]] },
        { inst: 'pad', notes: '0:A3+C4+E4+G4:16', vol: 0.6, fx: [['pump', {}], ['reverb', { mix: 0.3 }]] },
      ],
      master: [['compressor', { threshold: -12, ratio: 3, makeup: 3 }]],
    }),
    T({
      id: 'boombap', name: 'Boom Bap', bpm: 90, swing: 0.3, key: 2, scale: 'Minor', len: 32, mood: 'Classic · 90 BPM',
      tracks: [
        { inst: 'kickPunch', steps: 'x.....x..x...... x.x.......x.....', params: { decay: 0.4 } },
        { inst: 'snare', steps: '....x.......x... ....x.......x...', params: { decay: 0.22 } },
        { inst: 'hatClosed', steps: 'x.x.x.x.x.x.x.x. x.x.x.x.x.x.x.x.', vol: 0.6 },
        { inst: 'piano', notes: '0:D4+F4+A4:6 8:D4+F4+A4:4 16:A#3+D4+F4:6 24:A3+C#4+E4:6', fx: [['lofi', { crackle: 0.15, wobble: 0.2 }], ['reverb', { mix: 0.2 }]] },
        { inst: 'subBass', notes: '0:D2:6 8:D2:4 16:A#1:6 24:A1:6' },
      ],
      master: [['compressor', { threshold: -16, ratio: 3, makeup: 3 }]],
    }),
    T({
      id: 'kpop', name: 'K-Pop', bpm: 118, swing: 0, key: 0, scale: 'Major', len: 32, mood: 'Bright · 118 BPM',
      tracks: [
        { inst: 'kickPunch', steps: 'x...x...x...x... x...x...x..xx...' },
        { inst: 'clap', steps: '....x.......x... ....x.......x.x.' },
        { inst: 'hatClosed', steps: 'x.x.x.x.x.x.x.x. x.x.x.x.x.x.x.x.', vol: 0.55 },
        { inst: 'pluck', notes: '0:F4+A4+C5:6 8:G4+B4+D5:6 16:E4+G4+B4:6 24:A4+C5+E5:6', fx: [['delay', { mix: 0.18 }], ['reverb', { mix: 0.25 }]] },
        { inst: 'sawBass', notes: '0:F2:2 2:F2:2 4:F2:2 6:F2:2 8:G2:2 10:G2:2 12:G2:2 14:G2:2 16:E2:2 18:E2:2 20:E2:2 22:E2:2 24:A2:2 26:A2:2 28:A2:2 30:A2:2', fx: [['pump', { depth: 0.5 }]] },
        { inst: 'lead', notes: '0:C5:3 4:A4:2 6:C5:2 8:D5:4 16:B4:3 20:G4:2 22:B4:2 24:E5:6', vol: 0.55, fx: [['reverb', { mix: 0.2 }]] },
      ],
      master: [['compressor', { threshold: -12, ratio: 3, makeup: 3 }]],
    }),
    T({
      id: 'afro', name: 'Afrobeats', bpm: 104, swing: 0.15, key: 7, scale: 'Major', len: 16, mood: 'Warm · 104 BPM',
      tracks: [
        { inst: 'kickSoft', steps: 'x.....x...x.....' },
        { inst: 'rim', steps: 'x..x..x...x.x...' },
        { inst: 'shaker', steps: 'xoooxoooxoooxooo', vol: 0.55 },
        { inst: 'clap', steps: '........x.......' },
        { inst: 'conga', steps: '...x.x.....x.x.x', vol: 0.6 },
        { inst: 'softKeys', notes: '0:G3+B3+D4:3 6:G3+B3+D4:2 8:C4+E4+G4:3 14:D4+F#4+A4:2', fx: [['reverb', { mix: 0.25 }]] },
        { inst: 'subBass', notes: '0:G2:3 6:G2:2 8:C2:3 14:D2:2' },
      ],
      master: [['compressor', { threshold: -14, ratio: 2.5, makeup: 2 }]],
    }),
    T({
      id: 'drill', name: 'Drill', bpm: 142, swing: 0, key: 1, scale: 'Minor', len: 32, mood: 'Dark · 142 BPM',
      tracks: [
        { inst: 'kick808', steps: 'x.........x..... ..x.......x.....' },
        { inst: 'snareTight', steps: '........x.....x. ........x.......' },
        { inst: 'hatClosed', steps: 'x..x..x.x..x..x. x..x..x.x.x.x..x', params: { decay: 0.035 } },
        { inst: 'bass808', notes: '0:C#2:6 10:C#2:4 16:A1:6 26:G#1:6', fx: [['drive', { amount: 0.45 }]] },
        { inst: 'strings', notes: '0:C#4+E4+G#4:16 16:A3+C#4+E4:16', vol: 0.5, fx: [['reverb', { mix: 0.35 }]] },
      ],
      master: [['compressor', { threshold: -14, ratio: 3, makeup: 3 }]],
    }),
    T({
      id: 'reggaeton', name: 'Reggaeton', bpm: 95, swing: 0, key: 4, scale: 'Minor', len: 16, mood: 'Dance · 95 BPM',
      tracks: [
        { inst: 'kickPunch', steps: 'x...x...x...x...' },
        { inst: 'snareTight', steps: '...x..x....x..x.' },
        { inst: 'hatClosed', steps: 'x.x.x.x.x.x.x.x.', vol: 0.5 },
        { inst: 'subBass', notes: '0:E2:3 6:E2:2 8:C2:3 14:D2:2' },
        { inst: 'pluck', notes: '0:E4+G4+B4:3 6:E4+G4+B4:2 8:C4+E4+G4:3 14:D4+F#4+A4:2', fx: [['reverb', { mix: 0.25 }]] },
      ],
      master: [['compressor', { threshold: -14, ratio: 3, makeup: 3 }]],
    }),
  ];
})();
