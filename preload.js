const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  reindexMedia: (folder) => ipcRenderer.invoke('reindex-media', folder),
  onReindexProgress: (cb) => ipcRenderer.on('reindex-progress', (_e, data) => cb(data)),
  removeReindexProgress: () => ipcRenderer.removeAllListeners('reindex-progress'),

  monitoringConnect: () => ipcRenderer.invoke('monitoring-connect'),
  monitoringDisconnect: () => ipcRenderer.invoke('monitoring-disconnect'),
  onMonitoringTelemetry: (cb) => ipcRenderer.on('monitoring-telemetry', (_e, data) => cb(data)),
  removeMonitoringTelemetry: () => ipcRenderer.removeAllListeners('monitoring-telemetry'),
  onMonitoringStatus: (cb) => ipcRenderer.on('monitoring-status', (_e, data) => cb(data)),
  removeMonitoringStatus: () => ipcRenderer.removeAllListeners('monitoring-status'),
});
