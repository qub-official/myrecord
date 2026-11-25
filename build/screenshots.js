// Captures crisp 2x screenshots of the app into docs/assets for the landing page.
// Run with: npx electron build/screenshots.js
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'docs', 'assets');
const W = 1440, H = 900, SCALE = 2;

process.on('unhandledRejection', (e) => { console.error('ERR', e && e.stack || e); app.exit(1); });
app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const win = new BrowserWindow({
    width: 1200, height: 800, show: false,
    webPreferences: { preload: path.join(ROOT, 'preload.js'), contextIsolation: true, sandbox: true, autoplayPolicy: 'no-user-gesture-required' },
  });
  await win.loadFile(path.join(ROOT, 'src', 'index.html'));
  win.webContents.setZoomFactor(1); // Chromium remembers per-origin zoom; force 100%
  const dbg = win.webContents.debugger;
  dbg.attach('1.3');
  // Emulate an exact 1440x900 viewport at 2x pixel density, independent of the real screen.
  await dbg.sendCommand('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: SCALE, mobile: false });
  await new Promise((r) => setTimeout(r, 500));
  await win.webContents.executeJavaScript('MR.renderAll()');
  const { nativeImage } = require('electron');
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const run = (js) => win.webContents.executeJavaScript(js);
  const shot = async (name) => {
    await run(`document.getElementById('toast').classList.remove('show'); document.querySelectorAll('.ctx').forEach(m=>m.remove());`);
    await wait(450);
    const { data } = await dbg.sendCommand('Page.captureScreenshot', { format: 'png' });
    const img = nativeImage.createFromBuffer(Buffer.from(data, 'base64'));
    fs.writeFileSync(path.join(OUT, name + '.png'), img.toPNG());
    console.log('saved', name, img.getSize());
    return img;
  };
  const P = 'MR.state.project';
  await run('localStorage.clear()');
  await wait(800);

  // 1. Welcome screen
  await shot('welcome');

  // 2. Hero: Trap beat playing in the step sequencer, Bell's delay open in the inspector
  await run(`MR.closeModal(); MR.applyTemplateUI(MR.TEMPLATES.find(t=>t.id==='trap'));
    const bell = ${P}.channels[5]; MR.ui.selectedFx = { target: bell.id, id: bell.fx[0].id };
    ${P}.selected = ${P}.channels[0].id; MR.ui.tab='beats'; MR.renderAll(); MR.togglePlay();`);
  await wait(1900);
  const hero = await shot('hero');
  // Social preview 1200x630: crop the hero to the same aspect ratio, then scale (no stretching)
  const sz = hero.getSize(), cropH = Math.round(sz.width * 630 / 1200);
  fs.writeFileSync(path.join(OUT, 'og.png'), hero.crop({ x: 0, y: 0, width: sz.width, height: cropH }).resize({ width: 1200, height: 630, quality: 'best' }).toPNG());
  // Close-up of the step sequencer card (16:10 crop of the hero, never stretched)
  fs.writeFileSync(path.join(OUT, 'steps.png'), hero.crop({ x: 317 * SCALE, y: 148 * SCALE, width: 774 * SCALE, height: 484 * SCALE }).toPNG());
  await run('MR.togglePlay()');

  // 3. Piano roll: K-Pop lead melody
  await run(`MR.applyTemplateUI(MR.TEMPLATES.find(t=>t.id==='kpop'));
    ${P}.selected = ${P}.channels[3].id; MR.ui.tab='chords'; MR.ui.view='piano'; MR.ui.noteLen=2; MR.renderAll(); MR.togglePlay();`);
  await wait(1700);
  await shot('piano');
  await run('MR.togglePlay()');

  // 4. Song arrangement: intro / verse / chorus patterns over 3 tracks
  await run(`(() => {
    const p = ${P}; const base = p.patterns[0]; base.name = 'Verse';
    const mk = (name, color, keep) => { const c = JSON.parse(JSON.stringify(base)); c.id = MR.uid('p'); c.name = name; c.color = color;
      Object.keys(c.steps).forEach(k => { if (!keep(k)) delete c.steps[k]; }); Object.keys(c.notes).forEach(k => { if (!keep(k)) delete c.notes[k]; });
      p.patterns.push(c); return c; };
    const ids = p.channels.map(c => c.id);
    const intro = mk('Intro', '#B49A85', k => k === ids[3] || k === ids[2]);
    const chorus = mk('Chorus', '#B08A8A', () => true);
    const drop = mk('Drums', '#2E2F33', k => [ids[0], ids[1], ids[2]].includes(k));
    p.playlist.tracks[0].name = 'Melody'; p.playlist.tracks[1].name = 'Groove'; p.playlist.tracks[2].name = 'Drums';
    const C = (pat, track, bar, len) => ({ id: MR.uid('k'), pat: pat.id, track, bar, len });
    p.playlist.clips = [C(intro,0,0,4), C(base,1,4,4), C(chorus,0,8,4), C(chorus,0,12,4), C(drop,2,4,4), C(drop,2,12,4), C(base,1,16,2), C(intro,0,18,2)];
    p.currentPattern = chorus.id; MR.ui.view = 'playlist'; MR.ui.tab = 'sounds'; MR.renderAll();
    document.querySelectorAll('#modeSeg button')[1].click(); MR.togglePlay();
  })()`);
  await wait(2600);
  await shot('song');
  await run(`MR.togglePlay(); document.querySelectorAll('#modeSeg button')[0].click();`);

  // 5. Mixer: House beat playing, Warm Pad with Pump open
  await run(`MR.applyTemplateUI(MR.TEMPLATES.find(t=>t.id==='house'));
    const pad = ${P}.channels[5]; ${P}.selected = pad.id; MR.ui.selectedFx = { target: pad.id, id: pad.fx[1].id };
    MR.ui.view='mixer'; MR.ui.tab='fx'; MR.renderAll(); MR.togglePlay();`);
  await wait(1500);
  await shot('mixer');
  await run('MR.togglePlay()');

  await run('localStorage.clear()');
  app.quit();
});

