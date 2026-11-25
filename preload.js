const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('native', {
  saveProject: (json, suggestedName, filePath) =>
    ipcRenderer.invoke('project:save', { json, suggestedName, filePath }),
  openProject: () => ipcRenderer.invoke('project:open'),
  exportAudio: (bytes, suggestedName, ext) =>
    ipcRenderer.invoke('audio:export', { bytes, suggestedName, ext }),
  showInFolder: (p) => ipcRenderer.invoke('shell:show', p),
  onOpenFile: (cb) => ipcRenderer.on('project:open-file', (_e, json, p) => cb(json, p)),
});
