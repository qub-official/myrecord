const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');

let win;

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#F5F4F2',
    title: 'MyRecord',
    icon: path.join(__dirname, 'build', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      autoplayPolicy: 'no-user-gesture-required',
      backgroundThrottling: false,
    },
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'src', 'index.html'));

  // Open external links in the default browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Project file passed on the command line (double-click a .mrec file).
  const fileArg = process.argv.find((a) => a.toLowerCase().endsWith('.mrec'));
  if (fileArg) {
    win.webContents.once('did-finish-load', () => {
      try {
        win.webContents.send('project:open-file', fs.readFileSync(fileArg, 'utf8'), fileArg);
      } catch (_) { /* ignore unreadable file */ }
    });
  }
}

ipcMain.handle('project:save', async (_e, { json, suggestedName, filePath }) => {
  let target = filePath;
  if (!target) {
    const r = await dialog.showSaveDialog(win, {
      title: 'Save project',
      defaultPath: (suggestedName || 'My Beat') + '.mrec',
      filters: [{ name: 'MyRecord Project', extensions: ['mrec'] }],
    });
    if (r.canceled || !r.filePath) return null;
    target = r.filePath;
  }
  fs.writeFileSync(target, json, 'utf8');
  return target;
});

ipcMain.handle('project:open', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: 'Open project',
    properties: ['openFile'],
    filters: [{ name: 'MyRecord Project', extensions: ['mrec', 'json'] }],
  });
  if (r.canceled || !r.filePaths[0]) return null;
  return { json: fs.readFileSync(r.filePaths[0], 'utf8'), filePath: r.filePaths[0] };
});

ipcMain.handle('audio:export', async (_e, { bytes, suggestedName, ext }) => {
  const e = ext || 'wav';
  const r = await dialog.showSaveDialog(win, {
    title: 'Export audio',
    defaultPath: (suggestedName || 'My Beat') + '.' + e,
    filters: [{ name: e.toUpperCase() + ' audio', extensions: [e] }],
  });
  if (r.canceled || !r.filePath) return null;
  fs.writeFileSync(r.filePath, Buffer.from(bytes));
  return r.filePath;
});

ipcMain.handle('shell:show', async (_e, p) => { shell.showItemInFolder(p); });

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  });
  app.whenReady().then(createWindow);
  app.on('window-all-closed', () => app.quit());
}
