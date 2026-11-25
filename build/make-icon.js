// Renders the MyRecord logo to build/icon.png (256px) and build/icon.ico.
// Run with: npx electron build/make-icon.js
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="256" height="256">
<rect width="40" height="40" rx="11" fill="#0C0F14"/>
<path d="M10.5 20C10.5 10.5 29.5 10.5 29.5 20" fill="none" stroke="#A87C3A" stroke-width="2.8" stroke-linecap="round"/>
<rect x="7.6" y="18.2" width="4.2" height="7.6" rx="2.1" fill="#A87C3A"/><rect x="28.2" y="18.2" width="4.2" height="7.6" rx="2.1" fill="#A87C3A"/>
<ellipse cx="16" cy="22.4" rx="2.2" ry="2.6" fill="#F5F4F2"/><ellipse cx="24" cy="22.4" rx="2.2" ry="2.6" fill="#F5F4F2"/>
<path d="M17.4 27.6q2.6 2.2 5.2 0" fill="none" stroke="#FDEBB0" stroke-width="2" stroke-linecap="round"/></svg>`;

function ico(pngs) { // ICO container with embedded PNGs (Vista+)
  const header = Buffer.alloc(6); header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(pngs.length, 4);
  const dir = Buffer.alloc(16 * pngs.length); let offset = 6 + dir.length;
  pngs.forEach(({ size, data }, i) => {
    const o = i * 16;
    dir.writeUInt8(size >= 256 ? 0 : size, o); dir.writeUInt8(size >= 256 ? 0 : size, o + 1);
    dir.writeUInt8(0, o + 2); dir.writeUInt8(0, o + 3); dir.writeUInt16LE(1, o + 4); dir.writeUInt16LE(32, o + 6);
    dir.writeUInt32LE(data.length, o + 8); dir.writeUInt32LE(offset, o + 12); offset += data.length;
  });
  return Buffer.concat([header, dir, ...pngs.map((p) => p.data)]);
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 256, height: 256, show: false, frame: false, transparent: true, useContentSize: true, webPreferences: { offscreen: true } });
  const html = `<html><body style="margin:0;background:transparent;overflow:hidden">${SVG}</body></html>`;
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  await new Promise((r) => setTimeout(r, 400));
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: 256, height: 256 });
  const base = img.resize({ width: 256, height: 256, quality: 'best' });
  const out = __dirname;
  fs.writeFileSync(path.join(out, 'icon.png'), base.toPNG());
  const sizes = [16, 24, 32, 48, 64, 128, 256].map((s) => ({ size: s, data: s === 256 ? base.toPNG() : base.resize({ width: s, height: s, quality: 'best' }).toPNG() }));
  fs.writeFileSync(path.join(out, 'icon.ico'), ico(sizes));
  console.log('icons written to', out);
  app.quit();
});
