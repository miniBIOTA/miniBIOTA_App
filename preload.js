const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  reindexMedia: (folder) => ipcRenderer.invoke('reindex-media', folder),
  onReindexProgress: (cb) => ipcRenderer.on('reindex-progress', (_e, data) => cb(data)),
  removeReindexProgress: () => ipcRenderer.removeAllListeners('reindex-progress')
});
