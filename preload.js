const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  storage: {
    get: (key) => ipcRenderer.invoke('storage:get', key),
    set: (key, value) => ipcRenderer.invoke('storage:set', key, value),
  },
  gas: {
    getPrice: (opts) => ipcRenderer.invoke('gas:getPrice', opts),
  },
  backup: {
    restore: () => ipcRenderer.invoke('backup:restore'),
    getInfo: () => ipcRenderer.invoke('backup:getInfo'),
    openDir: () => ipcRenderer.invoke('backup:openDir'),
  },
  pdf: {
    print: (html) => ipcRenderer.invoke('pdf:print', html),
    toPDF: (html) => ipcRenderer.invoke('pdf:toPDF', html),
  },
  email: {
    sendResend: (opts) => ipcRenderer.invoke('email:sendResend', opts),
  },
  updater: {
    onAvailable: (cb) => ipcRenderer.on('update:available', () => cb()),
    check: () => ipcRenderer.invoke('updater:check'),
    downloadAndInstall: () => ipcRenderer.invoke('updater:downloadAndInstall'),
  },
  audit: {
    log:      (entry)   => ipcRenderer.invoke('audit:log', entry),
    query:    (filters) => ipcRenderer.invoke('audit:query', filters),
    deviceId: ()        => ipcRenderer.invoke('audit:deviceId'),
  },
  snapshot: {
    save:       (date, data) => ipcRenderer.invoke('snapshot:save', date, data),
    getByDate:  (date)       => ipcRenderer.invoke('snapshot:getByDate', date),
    getLatest:  (date)       => ipcRenderer.invoke('snapshot:getLatest', date),
    listDates:  ()           => ipcRenderer.invoke('snapshot:listDates'),
  },
  shell: {
    openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  },
  pos: {
    getCredentials:   ()                          => ipcRenderer.invoke('pos:getCredentials'),
    startOAuth:       (posType, shopDomain)       => ipcRenderer.invoke('pos:startOAuth', posType, shopDomain),
    saveManualToken:  (posType, token, shopDomain)=> ipcRenderer.invoke('pos:saveManualToken', posType, token, shopDomain),
    disconnect:       (posType)                   => ipcRenderer.invoke('pos:disconnect', posType),
    testConnection:   (posType)                   => ipcRenderer.invoke('pos:testConnection', posType),
    fetchDailySales:  (posType, date)             => ipcRenderer.invoke('pos:fetchDailySales', posType, date),
    onOAuthResult:    (cb) => ipcRenderer.on('pos:oauth-result', (_e, data) => cb(data)),
    offOAuthResult:   (cb) => ipcRenderer.removeListener('pos:oauth-result', cb),
  },
  ocr: {
    selectImage: () => ipcRenderer.invoke('ocr:selectImage'),
  },
  delivery: {
    watchDownloads: () => ipcRenderer.invoke('delivery:watchDownloads'),
    stopWatch:      () => ipcRenderer.invoke('delivery:stopWatch'),
    openPortal:     (platform) => ipcRenderer.invoke('delivery:openPortal', platform),
    onFileDetected: (cb) => ipcRenderer.on('delivery:file-detected', (_e, data) => cb(data)),
    offFileDetected:(cb) => ipcRenderer.removeListener('delivery:file-detected', cb),
  },
  subscription: {
    onPlanRefresh: (cb) => ipcRenderer.on('subscription:planRefresh', () => cb()),
  },
  docs: {
    download: (opts) => ipcRenderer.invoke('docs:download', opts),
  },
  forecast: {
    products: {
      getAll:   ()    => ipcRenderer.invoke('forecast:products:getAll'),
      upsert:   (p)   => ipcRenderer.invoke('forecast:products:upsert', p),
    },
    sales: {
      getForDate:    (date)           => ipcRenderer.invoke('forecast:sales:getForDate', date),
      getForProduct: (id, limit)      => ipcRenderer.invoke('forecast:sales:getForProduct', id, limit),
      getRange:      (from, to)       => ipcRenderer.invoke('forecast:sales:getRange', from, to),
      upsert:        (record)         => ipcRenderer.invoke('forecast:sales:upsert', record),
      deleteForDate: (date)           => ipcRenderer.invoke('forecast:sales:deleteForDate', date),
    },
    weather: {
      getRange: (from, to) => ipcRenderer.invoke('forecast:weather:getRange', from, to),
      upsert:   (record)   => ipcRenderer.invoke('forecast:weather:upsert', record),
    },
    csvMappings: {
      getAll: ()        => ipcRenderer.invoke('forecast:csvMappings:getAll'),
      save:   (mapping) => ipcRenderer.invoke('forecast:csvMappings:save', mapping),
    },
    patterns: {
      getAll: () => ipcRenderer.invoke('forecast:patterns:getAll'),
      upsert: (p) => ipcRenderer.invoke('forecast:patterns:upsert', p),
    },
    accuracy: {
      getAll: () => ipcRenderer.invoke('forecast:accuracy:getAll'),
      getForProduct: (id) => ipcRenderer.invoke('forecast:accuracy:getForProduct', id),
      upsert: (r) => ipcRenderer.invoke('forecast:accuracy:upsert', r),
    },
    insights: {
      getAll: () => ipcRenderer.invoke('forecast:insights:getAll'),
      getUnreadCount: () => ipcRenderer.invoke('forecast:insights:getUnreadCount'),
      upsert: (ins) => ipcRenderer.invoke('forecast:insights:upsert', ins),
      markRead: (id) => ipcRenderer.invoke('forecast:insights:markRead', id),
      markAllRead: () => ipcRenderer.invoke('forecast:insights:markAllRead'),
    },
  },
});
