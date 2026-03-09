const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  storage: {
    get: (key) => ipcRenderer.invoke('storage:get', key),
    set: (key, value) => ipcRenderer.invoke('storage:set', key, value),
  },
  gas: {
    getPrice: () => ipcRenderer.invoke('gas:getPrice'),
  },
  backup: {
    restore: () => ipcRenderer.invoke('backup:restore'),
    getInfo: () => ipcRenderer.invoke('backup:getInfo'),
    openDir: () => ipcRenderer.invoke('backup:openDir'),
  },
  updater: {
    onAvailable: (cb) => ipcRenderer.on('update:available', () => cb()),
    downloadAndInstall: () => ipcRenderer.invoke('updater:downloadAndInstall'),
  },
  audit: {
    log:      (entry)   => ipcRenderer.invoke('audit:log', entry),
    query:    (filters) => ipcRenderer.invoke('audit:query', filters),
    deviceId: ()        => ipcRenderer.invoke('audit:deviceId'),
  },
});
