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
    onAvailable: (cb) => ipcRenderer.on('update:available', (_e, payload) => cb(payload)),
    onStatus: (cb) => ipcRenderer.on('update:status', (_e, msg) => cb(msg)),
    check: () => ipcRenderer.invoke('updater:check'),
    checkNow: () => ipcRenderer.invoke('updater:checkNow'),
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
  checklist: {
    getTemplates:    ()           => ipcRenderer.invoke('checklist:getTemplates'),
    saveTemplate:    (t)          => ipcRenderer.invoke('checklist:saveTemplate', t),
    deleteTemplate:  (id)         => ipcRenderer.invoke('checklist:deleteTemplate', id),
    getEntries:      (date)       => ipcRenderer.invoke('checklist:getEntries', date),
    getEntriesRange: (from, to)   => ipcRenderer.invoke('checklist:getEntriesRange', from, to),
    saveEntry:       (entry)      => ipcRenderer.invoke('checklist:saveEntry', entry),
  },
  ingredients: {
    getAll:       ()           => ipcRenderer.invoke('ingredients:getAll'),
    save:         (p)          => ipcRenderer.invoke('ingredients:save', p),
    delete:       (id)         => ipcRenderer.invoke('ingredients:delete', id),
    aliasesGet:   (id)         => ipcRenderer.invoke('ingredients:aliasesGet', id),
    aliasSave:    (a)          => ipcRenderer.invoke('ingredients:aliasSave', a),
    aliasDelete:  (id)         => ipcRenderer.invoke('ingredients:aliasDelete', id),
    aliasFind:    (alias, s)   => ipcRenderer.invoke('ingredients:aliasFind', alias, s),
  },
  priceHistory: {
    get:     (id)       => ipcRenderer.invoke('priceHistory:get', id),
    getLast: (id, s)    => ipcRenderer.invoke('priceHistory:getLast', id, s),
    save:    (r)        => ipcRenderer.invoke('priceHistory:save', r),
  },
  recipes: {
    getAll:          ()         => ipcRenderer.invoke('recipes:getAll'),
    save:            (r)        => ipcRenderer.invoke('recipes:save', r),
    delete:          (id)       => ipcRenderer.invoke('recipes:delete', id),
    ingredientsGet:  (id)       => ipcRenderer.invoke('recipes:ingredientsGet', id),
    ingredientsSet:  (id, list) => ipcRenderer.invoke('recipes:ingredientsSetAll', id, list),
  },
  invoiceLines: {
    save:          (items) => ipcRenderer.invoke('invoiceLines:save', items),
    getForInvoice: (ref)   => ipcRenderer.invoke('invoiceLines:getForInvoice', ref),
    getRecent:     ()      => ipcRenderer.invoke('invoiceLines:getRecent'),
  },
  waste: {
    getRange: (f, to)   => ipcRenderer.invoke('waste:getRange', f, to),
    save:     (entry)   => ipcRenderer.invoke('waste:save', entry),
    delete:   (id)      => ipcRenderer.invoke('waste:delete', id),
  },
  tipPool: {
    config: {
      get:  ()    => ipcRenderer.invoke('tipPool:config:get'),
      save: (cfg) => ipcRenderer.invoke('tipPool:config:save', cfg),
    },
    session: {
      get:      (date)    => ipcRenderer.invoke('tipPool:session:get', date),
      getRange: (f, to)   => ipcRenderer.invoke('tipPool:session:getRange', f, to),
      save:     (session) => ipcRenderer.invoke('tipPool:session:save', session),
    },
  },
  tray: {
    updateSales: (data) => ipcRenderer.invoke('tray:updateSales', data),
  },
  eco: {
    items: {
      getAll: ()       => ipcRenderer.invoke('eco:items:getAll'),
      upsert: (item)   => ipcRenderer.invoke('eco:items:upsert', item),
      delete: (id)     => ipcRenderer.invoke('eco:items:delete', id),
    },
    config: {
      get:  ()    => ipcRenderer.invoke('eco:config:get'),
      save: (cfg) => ipcRenderer.invoke('eco:config:save', cfg),
    },
    rates: {
      getForYear: (year)  => ipcRenderer.invoke('eco:rates:getForYear', year),
      upsert:     (rate)  => ipcRenderer.invoke('eco:rates:upsert', rate),
    },
    usage: {
      getForYear: (year)             => ipcRenderer.invoke('eco:usage:getForYear', year),
      upsert:     (usage)            => ipcRenderer.invoke('eco:usage:upsert', usage),
      delete:     (y, pid, lid)      => ipcRenderer.invoke('eco:usage:delete', y, pid, lid),
    },
  },
});
