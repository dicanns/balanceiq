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
    validateUrl:  (url) => ipcRenderer.invoke('url:validate', url),
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
    download:       (opts)     => ipcRenderer.invoke('docs:download', opts),
    openDownloaded: (filePath) => ipcRenderer.invoke('file:openDownloaded', filePath),
    showInFolder:   (filePath) => ipcRenderer.invoke('file:showInFolder', filePath),
  },
  search: {
    global:      (params) => ipcRenderer.invoke('search:global', params),
    saveHistory: (params) => ipcRenderer.invoke('search:save-history', params),
  },
  forecast: {
    clearAll: () => ipcRenderer.invoke('forecast:clearAll'),
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
    imports: {
      getAll:       ()              => ipcRenderer.invoke('forecast:imports:getAll'),
      log:          (record)        => ipcRenderer.invoke('forecast:imports:log', record),
      delete:       (id)            => ipcRenderer.invoke('forecast:imports:delete', id),
      markReplaced: (date, byId)    => ipcRenderer.invoke('forecast:imports:markReplaced', date, byId),
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
  posScan: {
    selectFile: ()          => ipcRenderer.invoke('posScan:selectFile'),
    runOCR:    (b64)        => ipcRenderer.invoke('posScan:ocr', b64),
    templates: {
      getAll:        ()     => ipcRenderer.invoke('posScan:templates:getAll'),
      save:          (tpl)  => ipcRenderer.invoke('posScan:templates:save', tpl),
      delete:        (id)   => ipcRenderer.invoke('posScan:templates:delete', id),
      markUploaded:  (id)   => ipcRenderer.invoke('posScan:templates:markUploaded', id),
    },
    history: {
      save:         (entry) => ipcRenderer.invoke('posScan:history:save', entry),
      getRecent:    (limit) => ipcRenderer.invoke('posScan:history:getRecent', limit),
      getForDate:   (date)  => ipcRenderer.invoke('posScan:history:getForDate', date),
    },
  },
  upgradePrompt: {
    getDismissedAt: (key) => ipcRenderer.invoke('upgradePrompt:getDismissedAt', key),
    dismiss:        (key) => ipcRenderer.invoke('upgradePrompt:dismiss', key),
  },
  onboarding: {
    getAll:   ()    => ipcRenderer.invoke('onboarding:getAll'),
    markDone: (key) => ipcRenderer.invoke('onboarding:markDone', key),
    reset:    ()    => ipcRenderer.invoke('onboarding:reset'),
  },
  plPriceIntel: {
    record:    (r)              => ipcRenderer.invoke('plPriceIntel:record', r),
    getLast:   (key, excludeId) => ipcRenderer.invoke('plPriceIntel:getLast', key, excludeId),
    getRecent: (key, limit)     => ipcRenderer.invoke('plPriceIntel:getRecent', key, limit),
  },
  supabaseFetch: (opts) => ipcRenderer.invoke('supabase:fetch', opts),
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
  coa: {
    list:                 ()             => ipcRenderer.invoke('coa:list'),
    create:               (fields)       => ipcRenderer.invoke('coa:create', fields),
    update:               (id, fields)   => ipcRenderer.invoke('coa:update', id, fields),
    archive:              (id)           => ipcRenderer.invoke('coa:archive', id),
    unarchive:            (id)           => ipcRenderer.invoke('coa:unarchive', id),
    importCSV:            (csv)          => ipcRenderer.invoke('coa:importCSV', csv),
    exportCSV:            ()             => ipcRenderer.invoke('coa:exportCSV'),
    getMappingSuggestions:(names)        => ipcRenderer.invoke('coa:getMappingSuggestions', names),
  },
  ledger: {
    entry: {
      draft:   (data)                    => ipcRenderer.invoke('ledger:entry:draft', data),
      update:  (id, data)               => ipcRenderer.invoke('ledger:entry:update', id, data),
      post:    (id)                     => ipcRenderer.invoke('ledger:entry:post', id),
      reverse: (id, reason)             => ipcRenderer.invoke('ledger:entry:reverse', id, reason),
      correct: (id, newData, reason)    => ipcRenderer.invoke('ledger:entry:correct', id, newData, reason),
      delete:  (id)                     => ipcRenderer.invoke('ledger:entry:delete', id),
      get:     (id)                     => ipcRenderer.invoke('ledger:entry:get', id),
      list:    (opts)                   => ipcRenderer.invoke('ledger:entry:list', opts),
    },
    account: {
      history: (accountId, opts)        => ipcRenderer.invoke('ledger:account:history', accountId, opts),
    },
    trialBalance: (asOfDate, opts)      => ipcRenderer.invoke('ledger:trial_balance', asOfDate, opts),
    audit:        { list: (opts)        => ipcRenderer.invoke('ledger:audit:list', opts) },
  },
  period: {
    list:   (opts)          => ipcRenderer.invoke('period:list', opts),
    open:   (data)          => ipcRenderer.invoke('period:open', data),
    close:  (id)            => ipcRenderer.invoke('period:close', id),
    reopen: (id, reason)    => ipcRenderer.invoke('period:reopen', id, reason),
  },
  bank: {
    accounts: {
      list:    ()             => ipcRenderer.invoke('bank:accounts:list'),
      create:  (fields)       => ipcRenderer.invoke('bank:accounts:create', fields),
      update:  (id, fields)   => ipcRenderer.invoke('bank:accounts:update', id, fields),
      archive: (id)           => ipcRenderer.invoke('bank:accounts:archive', id),
    },
    statement: {
      import: (opts)          => ipcRenderer.invoke('bank:statement:import', opts),
      list:   (bankAccountId) => ipcRenderer.invoke('bank:statement:list', bankAccountId),
    },
    transactions: {
      list:       (bankAccountId, opts)        => ipcRenderer.invoke('bank:transactions:list', bankAccountId, opts),
      match:      (txId, entityType, entityId) => ipcRenderer.invoke('bank:transactions:match', txId, entityType, entityId),
      unmatch:    (txId)                       => ipcRenderer.invoke('bank:transactions:unmatch', txId),
      categorize: (txId, coaId, notes)         => ipcRenderer.invoke('bank:transactions:categorize', txId, coaId, notes),
    },
    reconcile: {
      preview: (bankAccountId, asOf)           => ipcRenderer.invoke('bank:reconcile:preview', bankAccountId, asOf),
      close:   (bankAccountId, stmtId)         => ipcRenderer.invoke('bank:reconcile:close', bankAccountId, stmtId),
      reopen:  (bankAccountId, stmtId, reason) => ipcRenderer.invoke('bank:reconcile:reopen', bankAccountId, stmtId, reason),
    },
    learned: {
      list:   ()   => ipcRenderer.invoke('bank:learned:list'),
      delete: (id) => ipcRenderer.invoke('bank:learned:delete', id),
    },
  },
  tax: {
    period: {
      compute:    (start, end)                => ipcRenderer.invoke('tax:period:compute', start, end),
      save:       (data)                      => ipcRenderer.invoke('tax:period:save', data),
      markFiled:  (id, confirmNum, paidAmt)   => ipcRenderer.invoke('tax:period:markFiled', id, confirmNum, paidAmt),
      list:       ()                          => ipcRenderer.invoke('tax:period:list'),
    },
    suspense: {
      list:         (opts)                    => ipcRenderer.invoke('tax:suspense:list', opts),
      classifyCash: (txId, coaId, reason)     => ipcRenderer.invoke('tax:suspense:classifyCash', txId, coaId, reason),
      reverse:      (txId)                    => ipcRenderer.invoke('tax:suspense:reverse', txId),
    },
    profile: {
      list:   ()      => ipcRenderer.invoke('tax:profile:list'),
      upsert: (data)  => ipcRenderer.invoke('tax:profile:upsert', data),
      delete: (id)    => ipcRenderer.invoke('tax:profile:delete', id),
    },
  },
  bilan: {
    compute:  (asOfDate, opts) => ipcRenderer.invoke('bilan:compute', asOfDate, opts),
    blockers: (asOfDate)       => ipcRenderer.invoke('bilan:blockers', asOfDate),
    snapshot: {
      save: (data)  => ipcRenderer.invoke('bilan:snapshot:save', data),
      list: ()      => ipcRenderer.invoke('bilan:snapshot:list'),
      get:  (id)    => ipcRenderer.invoke('bilan:snapshot:get', id),
    },
  },
  supplierBills: {
    list:      (opts)          => ipcRenderer.invoke('supplier:bill:list', opts),
    create:    (data)          => ipcRenderer.invoke('supplier:bill:create', data),
    update:    (id, data)      => ipcRenderer.invoke('supplier:bill:update', id, data),
    markPaid:  (id, payData)   => ipcRenderer.invoke('supplier:bill:markPaid', id, payData),
    markUnpaid:(id)            => ipcRenderer.invoke('supplier:bill:markUnpaid', id),
  },
  supplierPayments: {
    list:   (billId) => ipcRenderer.invoke('supplier:payments:list', billId),
    create: (data)   => ipcRenderer.invoke('supplier:payments:create', data),
  },
  assets: {
    list:   (opts)        => ipcRenderer.invoke('asset:list', opts),
    create: (data)        => ipcRenderer.invoke('asset:create', data),
    update: (id, data)    => ipcRenderer.invoke('asset:update', id, data),
    delete: (id)          => ipcRenderer.invoke('asset:delete', id),
  },
  cca: {
    classes:  ()                  => ipcRenderer.invoke('cca:classes'),
    compute:  (assetId, year)     => ipcRenderer.invoke('cca:compute', assetId, year),
    schedule: (year)              => ipcRenderer.invoke('cca:schedule', year),
  },
  vault: {
    attach:     (opts)                        => ipcRenderer.invoke('vault:attach', opts),
    attachFile: (opts)                        => ipcRenderer.invoke('vault:attachFile', opts),
    list:       (entity_type, entity_id)      => ipcRenderer.invoke('vault:list', entity_type, entity_id),
    listAll:    (opts)                        => ipcRenderer.invoke('vault:listAll', opts),
    search:     (query)                       => ipcRenderer.invoke('vault:search', query),
    stats:      ()                            => ipcRenderer.invoke('vault:stats'),
    orphans:    ()                            => ipcRenderer.invoke('vault:orphans'),
    reassign:   (id, entity_type, entity_id)  => ipcRenderer.invoke('vault:reassign', id, entity_type, entity_id),
    openById:   (docId)                       => ipcRenderer.invoke('vault:openById', docId),
    delete:     (docId)                       => ipcRenderer.invoke('vault:delete', docId),
    exportYear: (year)                        => ipcRenderer.invoke('vault:exportYear', year),
    openRoot:   ()                            => ipcRenderer.invoke('vault:openRoot'),
  },
  recurring: {
    list:         (opts)      => ipcRenderer.invoke('recurring:list', opts),
    create:       (data)      => ipcRenderer.invoke('recurring:create', data),
    update:       (id, data)  => ipcRenderer.invoke('recurring:update', id, data),
    deactivate:   (id)        => ipcRenderer.invoke('recurring:deactivate', id),
    pending:      ()          => ipcRenderer.invoke('recurring:pending'),
    pendingCount: ()          => ipcRenderer.invoke('recurring:pendingCount'),
    approve:      (id)        => ipcRenderer.invoke('recurring:approve', id),
    skip:         (id)        => ipcRenderer.invoke('recurring:skip', id),
    history:      (ruleId)    => ipcRenderer.invoke('recurring:history', ruleId),
    checkDue:     (today)     => ipcRenderer.invoke('recurring:checkDue', today),
  },
});
