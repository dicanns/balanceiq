const { app, BrowserWindow, ipcMain, net, dialog, shell, nativeImage, Tray, Menu } = require('electron');
const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { autoUpdater } = require('electron-updater');
const Sentry = require('@sentry/electron/main');
// Load .env in development only (not available in packaged builds)
if (!app.isPackaged) { try { require('dotenv').config(); } catch(_) {} }

Sentry.init({
  dsn: process.env.SENTRY_DSN || '',
  environment: app.isPackaged ? 'production' : 'development',
});
const {
  storageGet, storageSet, storageGetAll,
  getAllTablesForBackup, restoreAllTablesFromBackup,
  syncQueuePush, syncQueuePeek, syncQueueDelete, syncQueueIncrementAttempts, syncQueueLength,
  auditInsert, auditQuery, getDeviceId,
  snapshotSave, snapshotGetByDate, snapshotGetLatest, snapshotListDates,
  forecastClearAll,
  forecastProductsGetAll, forecastProductUpsert,
  forecastSalesGetForDate, forecastSalesGetForProduct, forecastSalesGetRange, forecastSalesUpsert, forecastSalesDeleteForDate,
  forecastImportsGetAll, forecastImportLog, forecastImportDelete, forecastImportMarkReplaced,
  forecastWeatherGetRange, forecastWeatherUpsert,
  forecastCsvMappingsGetAll, forecastCsvMappingSave,
  learnedPatternsGetAll, learnedPatternUpsert,
  predAccuracyGetAll, predAccuracyGetForProduct, predAccuracyUpsert,
  insightsGetAll, insightsGetUnreadCount, insightUpsert, insightMarkRead, insightMarkAllRead,
  checklistTemplatesGetAll, checklistTemplateUpsert, checklistTemplateDelete,
  checklistEntriesGetForDate, checklistEntriesGetRange, checklistEntryUpsert,
  ingredientsGetAll, ingredientUpsert, ingredientDelete,
  ingredientAliasesGetForIngredient, ingredientAliasUpsert, ingredientAliasDelete, ingredientAliasFindMatch,
  priceHistoryGetForIngredient, priceHistoryGetLastPrice, priceHistorySave,
  recipesGetAll, recipeUpsert, recipeDelete,
  recipeIngredientsGet, recipeIngredientsSetAll,
  invoiceLineItemsSave, invoiceLineItemsGetForInvoice, invoiceLineItemsGetRecent,
  wasteGetRange, wasteSave, wasteDelete,
  tipPoolConfigGet, tipPoolConfigSave,
  tipPoolSessionGet, tipPoolSessionGetRange, tipPoolSessionSave,
  ecoItemsGetAll, ecoItemUpsert, ecoItemDelete,
  ecoConfigGet, ecoConfigSave,
  ecoRatesGetForYear, ecoRateUpsert,
  ecoUsageGetForYear, ecoUsageUpsert, ecoUsageDelete,
  posScanTemplatesGetAll, posScanTemplateSave, posScanTemplateDelete, posScanTemplateMarkUploaded,
  posScanHistorySave, posScanHistoryGetRecent, posScanHistoryGetForDate,
  upgradePromptGetDismissedAt, upgradePromptDismiss,
  onboardingGetAll, onboardingMarkDone, onboardingReset,
  plInvoiceHistoryRecord, plInvoiceHistoryGetLast, plInvoiceHistoryGetRecent,
  searchIngredients, searchForecastProducts, searchHistoryGet, searchHistorySave,
  searchWasteEntries,
  storageGetByPrefix,
  coaList, coaCreate, coaUpdate, coaArchive, coaUnarchive, coaImportCSV, coaExportCSV, coaMappingSuggestions,
  glDraftEntry, glUpdateDraft, glPostEntry, glReverseEntry, glCorrectEntry, glDeleteDraft,
  glGetEntry, glListEntries, glGetAccountHistory,
  trialBalance,
  periodList, periodOpen, periodClose, periodReopen,
  glAuditLogList,
  bankAccountsList, bankAccountCreate, bankAccountUpdate, bankAccountArchive,
  bankStatementImport, bankStatementsList,
  bankTransactionsList, bankTransactionMatch, bankTransactionUnmatch, bankTransactionCategorize,
  bankReconcilePreview, bankReconcileClose, bankReconcileReopen,
  bankLearnedRulesList, bankLearnedRuleDelete,
  taxPeriodCompute, taxPeriodSave, taxPeriodMarkFiled, taxPeriodList,
  taxSuspenseList, taxSuspenseClassifyAsCashExpense, taxSuspenseReverseCategorization,
  taxProfileList, taxProfileUpsert, taxProfileDelete,
  supplierBillList, supplierBillCreate, supplierBillUpdate, supplierBillMarkPaid, supplierBillMarkUnpaid,
  supplierPaymentsList, supplierPaymentCreate,
  assetList, assetCreate, assetUpdate, assetDelete,
  ccaClassesList, ccaComputeForAsset, ccaScheduleForYear,
  buildBalanceSheet, getBalanceSheetBlockers,
  balanceSheetSnapshotSave, balanceSheetSnapshotList, balanceSheetSnapshotGet,
  vaultAttach, vaultList, vaultListAll, vaultSearch, vaultDelete, vaultGetOrphans, vaultReassign, vaultGetStats,
  recurringRuleList, recurringRuleCreate, recurringRuleUpdate, recurringRuleDeactivate,
  recurringPendingList, recurringApprove, recurringSkip, recurringHistoryList,
  recurringCheckDue, recurringPendingCount,
  reminderLadderList, reminderLadderCreate, reminderLadderUpdate, reminderLadderDelete,
  reminderStepList, reminderStepCreate, reminderStepUpdate, reminderStepDelete,
  reminderLogList, reminderLogCreate, reminderCheckDue,
  depositScheduleList, depositScheduleCreate, depositScheduleUpdate, depositScheduleDelete, depositScheduleMarkGenerated,
  docNumRegister, docNumCheckConflicts, docNumList,
  paymentPlanCreate, paymentPlanGet, paymentPlanUpdate, paymentPlanCancel,
  inventoryDeductUpsert, inventoryDeductDeleteByInvoice, inventoryDeductListByProduct, inventoryDeductSummaryByDate,
  closePolicyGet, closePolicySave,
  closeSessionGet, closeSessionList, closeSessionCreateOrLoad,
  closeVarianceReveal,
  closeExceptionList, closeExceptionAcknowledge,
  evaluateCloseAssurance,
  registerClosureSave,
} = require('./src/db/database.js');

const BACKUP_DIR = () => path.join(app.getPath('userData'), 'Backups');
const BACKUP_KEEP_DAYS = 30;

// ── URL SAFETY ────────────────────────────────────────────────────────────────
// Exact-match allowlist only — no suffix/wildcard matching.
// To allow a new subdomain, add it explicitly.
const ALLOWED_URL_SCHEMES = ['https:'];
const ALLOWED_URL_DOMAINS = [
  // BalanceIQ properties
  'balanceiq.ca',
  'www.balanceiq.ca',

  // GitHub (releases, repo links)
  'github.com',

  // Supabase — ONLY our specific project, not the whole supabase.com platform.
  // Suffix matching would allow any attacker-controlled *.supabase.co project.
  'etiwnesxjypdwhxqnqqq.supabase.co',

  // Stripe — billing portal and checkout only (not stripe.com broadly)
  'checkout.stripe.com',
  'billing.stripe.com',

  // Anthropic — API key setup and docs
  'console.anthropic.com',
  'docs.anthropic.com',

  // Delivery portals
  'www.doordash.com',
  'merchants.ubereats.com',
  'restaurants.skipthedishes.com',
];

function isUrlSafe(urlString) {
  try {
    const parsed = new URL(urlString);
    if (!ALLOWED_URL_SCHEMES.includes(parsed.protocol)) return false;
    // Exact match only — no endsWith/suffix matching.
    return ALLOWED_URL_DOMAINS.includes(parsed.hostname);
  } catch {
    return false;
  }
}
// ─────────────────────────────────────────────────────────────────────────────

// Module-level window reference (needed for pos:oauth-result events)
let mainWindow = null;
let biqTray = null;

// POS secrets — main process only, never sent to renderer
const POS_SECRETS = {
  square: {
    sandbox:    { appSecret: process.env.SQUARE_SANDBOX_APP_SECRET || '' },
    production: { appSecret: process.env.SQUARE_APP_SECRET || '' },
  },
  clover: {
    sandbox:    { appSecret: process.env.CLOVER_SANDBOX_APP_SECRET || '' },
    production: { appSecret: process.env.CLOVER_APP_SECRET || '' },
  },
  shopify: {
    clientSecret: process.env.SHOPIFY_CLIENT_SECRET || '',
  },
};

// POS base URLs (env-aware)
function posBaseUrl(posType) {
  const isDev = !app.isPackaged;
  const map = {
    square:  isDev ? 'https://connect.squareupsandbox.com' : 'https://connect.squareup.com',
    clover:  isDev ? 'https://sandbox.dev.clover.com'     : 'https://api.clover.com',
  };
  return map[posType] || '';
}

// Simple HTTP helper using Electron net module
function netRequest(opts) {
  return new Promise((resolve) => {
    const req = net.request(opts);
    req.on('response', (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try {
          const body = Buffer.concat(chunks).toString('utf-8');
          resolve({ status: res.statusCode, body: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, body: {} });
        }
      });
      res.on('error', () => resolve({ status: 0, body: {} }));
    });
    req.on('error', () => resolve({ status: 0, body: {} }));
    if (opts.data) req.write(opts.data);
    req.end();
  });
}

// Exchange OAuth code for access token
async function exchangePosOAuthCode(posType, code, shopDomain) {
  const isDev = !app.isPackaged;
  const env = isDev ? 'sandbox' : 'production';

  if (posType === 'square') {
    const secret = POS_SECRETS.square[env].appSecret;
    const appId  = isDev ? 'sandbox-sq0idb-vKGF3m-aVqnfr2d9YPC9cA' : 'sq0idp-8_k0M7m_P8VYYIYZbbF_nA';
    const body = JSON.stringify({
      client_id: appId, client_secret: secret,
      code, grant_type: 'authorization_code',
      redirect_uri: 'https://etiwnesxjypdwhxqnqqq.supabase.co/functions/v1/pos-oauth-callback',
    });
    const res = await netRequest({
      method: 'POST',
      url: `${posBaseUrl('square')}/oauth2/token`,
      headers: { 'Content-Type': 'application/json', 'Square-Version': '2024-02-28' },
      data: body,
    });
    if (res.status === 200 && res.body.access_token) {
      return { accessToken: res.body.access_token, merchantId: res.body.merchant_id };
    }
    return { error: res.body.message || `Square token exchange failed (${res.status})` };
  }

  if (posType === 'clover') {
    const secret = POS_SECRETS.clover[env].appSecret;
    const appId  = '5GTA1NCXTO5YY';
    const params = new URLSearchParams({ client_id: appId, client_secret: secret, code });
    const res = await netRequest({
      method: 'GET',
      url: `${posBaseUrl('clover')}/oauth/token?${params}`,
    });
    if (res.status === 200 && res.body.access_token) {
      return { accessToken: res.body.access_token, merchantId: res.body.merchant_id };
    }
    return { error: `Clover token exchange failed (${res.status})` };
  }

  if (posType === 'shopify' && shopDomain) {
    const shop = shopDomain.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const body = JSON.stringify({
      client_id: 'a728cf71c0b64c5d7e0694567a085d0d',
      client_secret: POS_SECRETS.shopify.clientSecret,
      code,
    });
    const res = await netRequest({
      method: 'POST',
      url: `https://${shop}/admin/oauth/access_token`,
      headers: { 'Content-Type': 'application/json' },
      data: body,
    });
    if (res.status === 200 && res.body.access_token) {
      return { accessToken: res.body.access_token, shopDomain: shop };
    }
    return { error: `Shopify token exchange failed (${res.status})` };
  }

  return { error: 'Unknown POS type' };
}

// Handle OAuth deep link callback (balanceiq://oauth/{posType}?code=xxx&state=posType:nonce)
async function handlePosOAuthCallback(url) {
  try {
    const parsed = new URL(url);
    const posType = parsed.hostname === 'oauth' ? parsed.pathname.replace('/', '') : null;
    const shopDomain = parsed.searchParams.get('shop') || null;
    // balanceiq://oauth/square?code=xxx  OR  balanceiq://oauth/shopify?code=xxx&shop=xxx
    const [, , rawPos] = parsed.pathname.split('/'); // /oauth/square → square
    const pos  = rawPos || posType || parsed.host;
    const code = parsed.searchParams.get('code');
    if (!pos || !code) return;

    // Verify the state nonce to prevent CSRF
    const returnedState = parsed.searchParams.get('state') || '';
    const [, returnedNonce] = returnedState.split(':');
    const expectedNonce = _pendingOAuthNonce[pos];
    delete _pendingOAuthNonce[pos]; // consume nonce regardless
    if (!expectedNonce || returnedNonce !== expectedNonce) {
      mainWindow?.webContents.send('pos:oauth-result', { posType: pos, error: 'OAuth state mismatch — possible CSRF. Please try connecting again.' });
      return;
    }

    const result = await exchangePosOAuthCode(pos, code, shopDomain);
    if (result.error) {
      mainWindow?.webContents.send('pos:oauth-result', { posType: pos, error: result.error });
      return;
    }

    // Fetch merchant info and save credentials
    await savePosToken(pos, result);
    const creds = getPosCredentialsMeta();
    mainWindow?.webContents.send('pos:oauth-result', { posType: pos, success: true, credentials: creds });
  } catch (err) {
    mainWindow?.webContents.send('pos:oauth-result', { error: err.message });
  }
}

// Save POS token to SQLite (never expose raw token to renderer)
async function savePosToken(posType, tokenData) {
  const stored = JSON.parse(storageGet('pos-credentials')?.value || '{}');
  const meta   = { connectedAt: new Date().toISOString(), hasToken: true, connected: true };

  if (posType === 'square') {
    // Fetch merchant info — use list endpoint when merchantId is not yet known
    let merchantName = 'Square Merchant';
    let resolvedMerchantId = tokenData.merchantId;
    let locations = [];
    try {
      if (!tokenData.merchantId || tokenData.merchantId === 'manual' || tokenData.merchantId === null) {
        // List merchants (returns the merchant associated with this token)
        const listRes = await netRequest({
          method: 'GET',
          url: `${posBaseUrl('square')}/v2/merchants`,
          headers: { Authorization: `Bearer ${tokenData.accessToken}`, 'Square-Version': '2024-02-28' },
        });
        const first = listRes.body?.merchants?.[0];
        if (first) { merchantName = first.business_name || merchantName; resolvedMerchantId = first.id; }
      } else {
        const merchantRes = await netRequest({
          method: 'GET',
          url: `${posBaseUrl('square')}/v2/merchants/${tokenData.merchantId}`,
          headers: { Authorization: `Bearer ${tokenData.accessToken}`, 'Square-Version': '2024-02-28' },
        });
        merchantName = merchantRes.body?.merchant?.business_name || merchantName;
      }
      const locsRes = await netRequest({
        method: 'GET',
        url: `${posBaseUrl('square')}/v2/locations`,
        headers: { Authorization: `Bearer ${tokenData.accessToken}`, 'Square-Version': '2024-02-28' },
      });
      locations = (locsRes.body?.locations || []).map(l => ({ id: l.id, name: l.name }));
      // Fall back to first location name if merchant name still unknown
      if (merchantName === 'Square Merchant' && locations[0]?.name) merchantName = locations[0].name;
    } catch (_) { /* network error — save anyway with defaults */ }
    stored.square = { ...meta, accessToken: tokenData.accessToken, merchantId: resolvedMerchantId, merchantName, locations, connected: true };
  }

  if (posType === 'clover') {
    let merchantName = 'Clover Merchant';
    let resolvedMerchantId = tokenData.merchantId;
    try {
      // /v3/merchant resolves the merchant tied to this token without needing a merchant ID
      const mRes = await netRequest({
        method: 'GET',
        url: `${posBaseUrl('clover')}/v3/merchant`,
        headers: { Authorization: `Bearer ${tokenData.accessToken}` },
      });
      if (mRes.status === 200 && mRes.body?.id) {
        resolvedMerchantId = mRes.body.id;
        merchantName = mRes.body.name || merchantName;
      }
    } catch (_) {}
    stored.clover = { ...meta, accessToken: tokenData.accessToken, merchantId: resolvedMerchantId, merchantName, connected: true };
  }

  if (posType === 'shopify') {
    let shopName = tokenData.shopDomain || 'Shopify POS';
    try {
      const shopRes = await netRequest({
        method: 'GET',
        url: `https://${tokenData.shopDomain}/admin/api/2024-01/shop.json`,
        headers: { 'X-Shopify-Access-Token': tokenData.accessToken },
      });
      shopName = shopRes.body?.shop?.name || shopName;
    } catch (_) {}
    stored.shopify = { ...meta, accessToken: tokenData.accessToken, shopDomain: tokenData.shopDomain, shopName, connected: true };
  }

  storageSet('pos-credentials', JSON.stringify(stored));
}

// Return credentials metadata (no raw tokens) for renderer
function getPosCredentialsMeta() {
  const stored = JSON.parse(storageGet('pos-credentials')?.value || '{}');
  const safe = {};
  for (const [k, v] of Object.entries(stored)) {
    if (v?.hasToken) {
      // Strip access token before sending to renderer
      const { accessToken: _, ...rest } = v;
      safe[k] = rest;
    }
  }
  return safe;
}

async function performAutoBackup() {
  const dir = BACKUP_DIR();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const today = new Date().toISOString().slice(0, 10);
  const filepath = path.join(dir, `balanceiq-${today}.json`);
  if (fs.existsSync(filepath)) return; // already backed up today

  const { schemaVersion, sqlite } = getAllTablesForBackup();
  const all = storageGetAll();

  const data = {
    schemaVersion,
    legacy: {
      liveData:  all['dicann-v7']          || {},
      roster:    all['dicann-roster']       || [],
      empRoster: all['dicann-emp-roster']   || [],
      suppliers: all['dicann-suppliers-v2'] || [],
      apiConfig: all['dicann-api-config']   || {},
      plData: {},
    },
    sqlite,
    createdAt: new Date().toISOString(),
  };

  Object.entries(all).forEach(([key, val]) => {
    if (key.startsWith('dicann-pl-')) {
      data.legacy.plData[key.replace('dicann-pl-', '')] = val;
    }
  });

  fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf-8');

  // Delete backups older than BACKUP_KEEP_DAYS
  try {
    fs.readdirSync(dir)
      .filter(f => /^balanceiq-\d{4}-\d{2}-\d{2}\.json$/.test(f))
      .forEach(f => {
        const d = new Date(f.slice(10, 20));
        const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - BACKUP_KEEP_DAYS);
        if (d < cutoff) fs.unlinkSync(path.join(dir, f));
      });
  } catch (_) {}
}

// IPC handlers — daily snapshots (append-only, never update/delete)
ipcMain.handle('snapshot:save', (event, date, data) => {
  return snapshotSave(date, data);
});

ipcMain.handle('snapshot:getByDate', (event, date) => {
  return snapshotGetByDate(date);
});

ipcMain.handle('snapshot:getLatest', (event, date) => {
  return snapshotGetLatest(date);
});

ipcMain.handle('snapshot:listDates', () => {
  return snapshotListDates();
});

// IPC handlers — audit log (append-only, never update/delete)
ipcMain.handle('audit:log', (event, entry) => {
  return auditInsert(entry);
});

ipcMain.handle('audit:query', (event, filters) => {
  return auditQuery(filters || {});
});

ipcMain.handle('audit:deviceId', () => {
  return getDeviceId();
});

// IPC handlers for storage
ipcMain.handle('storage:get', (event, key) => {
  return storageGet(key);
});

ipcMain.handle('storage:set', (event, key, value) => {
  return storageSet(key, value);
});

// IPC handler — restore from backup
ipcMain.handle('backup:restore', async () => {
  const win = BrowserWindow.getFocusedWindow();

  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: 'Restaurer depuis backup',
    filters: [{ name: 'BalanceIQ Backup', extensions: ['json'] }],
    properties: ['openFile'],
  });

  if (canceled || filePaths.length === 0) return { cancelled: true };

  let data;
  try {
    const content = fs.readFileSync(filePaths[0], 'utf-8');
    data = JSON.parse(content);
  } catch {
    return { error: "Fichier invalide — vérifier que c'est un backup BalanceIQ" };
  }

  // Support both new format (schemaVersion + sqlite) and legacy format
  const isNewFormat = data.schemaVersion !== undefined && data.sqlite !== undefined;
  const isLegacyFormat = !isNewFormat && data.liveData !== undefined;
  if (!isNewFormat && !isLegacyFormat) {
    return { error: "Fichier invalide — vérifier que c'est un backup BalanceIQ" };
  }

  if (isNewFormat) {
    const { schemaVersion: currentVersion } = getAllTablesForBackup();
    if (data.schemaVersion !== currentVersion) {
      return {
        error: `Version de schéma incompatible (backup: ${data.schemaVersion}, app: ${currentVersion}). Mettez à jour l'application avant de restaurer.`,
      };
    }
  }

  const { response } = await dialog.showMessageBox(win, {
    type: 'warning',
    buttons: ['Annuler', 'Restaurer'],
    defaultId: 1,
    cancelId: 0,
    title: 'Restaurer backup',
    message: 'Ceci va remplacer toutes vos données actuelles. Êtes-vous sûr?',
  });

  if (response === 0) return { cancelled: true };

  const legacy = isNewFormat ? (data.legacy || {}) : data;

  if (legacy.liveData !== undefined)  storageSet('dicann-v7', JSON.stringify(legacy.liveData));
  if (legacy.roster !== undefined)    storageSet('dicann-roster', JSON.stringify(legacy.roster));
  if (legacy.empRoster !== undefined) storageSet('dicann-emp-roster', JSON.stringify(legacy.empRoster));
  if (legacy.suppliers !== undefined) storageSet('dicann-suppliers-v2', JSON.stringify(legacy.suppliers));
  if (legacy.apiConfig)               storageSet('dicann-api-config', JSON.stringify(legacy.apiConfig));
  if (legacy.plData) {
    Object.entries(legacy.plData).forEach(([month, val]) => {
      storageSet(`dicann-pl-${month}`, JSON.stringify(val));
    });
  }

  if (isNewFormat && data.sqlite) {
    try {
      restoreAllTablesFromBackup(data, data.schemaVersion);
    } catch (e) {
      console.error('backup:restore sqlite error:', e);
      return { error: `Erreur lors de la restauration SQLite: ${e.message}` };
    }
  }

  await dialog.showMessageBox(win, {
    type: 'info',
    buttons: ['OK'],
    title: 'BalanceIQ',
    message: '✓ Données restaurées avec succès',
  });

  win.webContents.reload();
  return { success: true };
});

// IPC handlers — auto-backup info + open folder
ipcMain.handle('backup:getInfo', () => {
  const dir = BACKUP_DIR();
  let lastBackup = null;
  let count = 0;
  try {
    const files = fs.existsSync(dir)
      ? fs.readdirSync(dir).filter(f => /^balanceiq-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort()
      : [];
    count = files.length;
    if (files.length) lastBackup = files[files.length - 1].slice(10, 20);
  } catch (_) {}
  return { dir, lastBackup, count };
});

ipcMain.handle('backup:openDir', () => {
  const dir = BACKUP_DIR();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  shell.openPath(dir);
});

// IPC handler — render HTML to PDF bytes (base64) using Chromium's print engine
ipcMain.handle('pdf:toPDF', async (event, html) => {
  const tmpFile = path.join(os.tmpdir(), `balanceiq-topdf-${Date.now()}.html`);
  fs.writeFileSync(tmpFile, html, 'utf-8');
  const pdfWin = new BrowserWindow({
    width: 900, height: 1200, show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });
  try {
    await pdfWin.loadFile(tmpFile);
    const pdfData = await pdfWin.webContents.printToPDF({
      printBackground: true,
      pageSize: 'Letter',
      margins: { marginType: 'default' },
    });
    pdfWin.close();
    try { fs.unlinkSync(tmpFile); } catch (_) {}
    return { data: pdfData.toString('base64') };
  } catch (err) {
    try { pdfWin.close(); } catch (_) {}
    try { fs.unlinkSync(tmpFile); } catch (_) {}
    return { error: err.message };
  }
});

// IPC handler — open print dialog for a document HTML string
ipcMain.handle('pdf:print', async (event, html) => {
  const tmpFile = path.join(os.tmpdir(), `balanceiq-print-${Date.now()}.html`);
  fs.writeFileSync(tmpFile, html, 'utf-8');
  const printWin = new BrowserWindow({
    width: 900, height: 1100,
    title: 'BalanceIQ — Impression',
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });
  await printWin.loadFile(tmpFile);
  printWin.webContents.print({}, () => {
    try { fs.unlinkSync(tmpFile); } catch (_) {}
  });
  return { success: true };
});

// IPC handler — send email via Resend API
ipcMain.handle('email:sendResend', async (event, {apiKey, from, to, subject, html, attachments}) => {
  return new Promise((resolve) => {
    const body = JSON.stringify({from, to, subject, html, attachments});
    const req = net.request({
      method: 'POST',
      url: 'https://api.resend.com/emails',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });
    req.on('response', (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        try {
          const json = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
          if (response.statusCode >= 200 && response.statusCode < 300) {
            resolve({ success: true, id: json.id });
          } else {
            resolve({ error: json.message || `Erreur ${response.statusCode}` });
          }
        } catch {
          resolve({ error: 'Réponse invalide du serveur courriel.' });
        }
      });
      response.on('error', () => resolve({ error: 'Erreur réseau — courriel.' }));
    });
    req.on('error', () => resolve({ error: 'Erreur réseau — courriel.' }));
    req.write(body);
    req.end();
  });
});

// ── IPC handler — gas price (Régie de l'énergie du Québec, location-aware)
//
// Fallback chain:
//   1. Régie de l'énergie — relevé quotidien PDF (updates daily, uses weather location)
//   2. Régie de l'énergie — bulletin hebdomadaire PDF (weekly, same region targeting)
//   3. CAA Canada HTML scraper (original source — kept as last-resort fallback)
//
// TODO: Régie de l'énergie announced real-time station-level prices API for
//       April 2026 launch (regie-energie.qc.ca). Switch to that API once live
//       — it will give per-city prices without PDF parsing and region guessing.
//
// Cache: 24h in-memory, keyed by region so different locations get different prices.
// Rollback: to restore original CAA-only behaviour, comment out the Régie
//   blocks below (steps 1 & 2) and the cache check, leaving only step 3.

const _gasPriceCache = {}; // { [regionKey]: { price, source, fetchedAt } }

// Map lat/lon → ordered list of PDF search terms for the Régie region.
// Terms are tried in order; first match wins in parseRegiePDF().
// Coordinates use signed decimals (negative = West / South).
function coordsToRegieSearchTerms(lat, lon) {
  if (!lat || !lon) return ['Montréal'];

  // Outaouais / Gatineau — west of -75.5°
  if (lon <= -75.5 && lat >= 45.0 && lat <= 47.0) return ['Outaouais', 'Gatineau'];

  // Abitibi-Témiscamingue — far northwest
  if (lon <= -76.0 && lat >= 47.0) return ['Abitibi', 'Val-d\'Or', 'Rouyn'];

  // Nord-du-Québec / Côte-Nord — very northern or far northeast
  if (lat >= 50.0) return ['Côte-Nord', 'Nord-du-Québec', 'Sept-Îles'];

  // Saguenay – Lac-Saint-Jean — lat 47.5–51, lon -69.5 to -76
  if (lat >= 47.5 && lat <= 51.0 && lon >= -76.0 && lon <= -69.5) return ['Saguenay', 'Chicoutimi', 'Lac-Saint-Jean'];

  // Bas-Saint-Laurent / Gaspésie — eastern Quebec, lon > -70.5
  if (lat >= 47.0 && lon >= -70.5) return ['Gaspésie', 'Bas-Saint-Laurent', 'Rimouski', 'Matane'];

  // Québec City / Chaudière-Appalaches — lat 46.3–47.5, lon -70.5 to -72.5
  if (lat >= 46.3 && lat <= 47.5 && lon >= -72.5 && lon <= -70.5) return ['Québec', 'Lévis', 'Sainte-Marie'];

  // Mauricie / Centre-du-Québec — lat 45.8–47, lon -72.5 to -73.8
  if (lat >= 45.8 && lat <= 47.0 && lon >= -73.8 && lon <= -72.5) return ['Mauricie', 'Trois-Rivières', 'Centre-du-Québec'];

  // Estrie / Sherbrooke — lat 45.0–46.3, lon -71.5 to -72.5
  if (lat >= 45.0 && lat <= 46.3 && lon >= -72.5 && lon <= -71.5) return ['Estrie', 'Sherbrooke'];

  // Lanaudière / Laurentides — north of Montréal, lat 45.7–47, lon -73.5 to -75
  if (lat >= 45.7 && lat <= 47.5 && lon >= -75.0 && lon <= -73.5) return ['Laurentides', 'Lanaudière', 'Montréal'];

  // Default: Montréal / Laval / Montérégie
  return ['Montréal', 'Laval', 'Montérégie'];
}

// Fetch a URL using Electron net, return Buffer
function fetchBuffer(url) {
  return new Promise((resolve, reject) => {
    const req = net.request({
      url,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; BalanceIQ/1.0)',
        'Accept': 'application/pdf,*/*',
      },
    });
    req.on('response', (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve(Buffer.concat(chunks)));
      response.on('error', reject);
    });
    req.on('error', reject);
    req.end();
  });
}

// Extract all text from a PDF buffer using pdfjs-dist (Node.js / Electron main process).
async function extractRegiePDFText(buffer) {
  const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
  pdfjsLib.GlobalWorkerOptions.workerSrc = false;
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
  let text = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map(s => s.str).join(' ') + '\n';
  }
  return text;
}

// Parse Régie PDF buffer — extract "Essence ordinaire" price (¢/L) for the target region.
// searchTerms: ordered array of strings to search near (e.g. ['Montréal','Laval']).
// Returns price in ¢/L (integer or float), or null if parsing failed.
//
// PDF row format (per region):  "N.  RegionName  P_mon  P_tue  P_wed  MOYENNE"
// The second-to-last price in the row = most recent day's price (before the average).
async function parseRegiePDF(buffer, searchTerms = ['Montréal']) {
  const rawText = await extractRegiePDFText(buffer);

  // Normalise: collapse whitespace for consistent matching
  const norm = rawText.replace(/\s+/g, ' ');

  // Price pattern: 3-digit number optionally followed by decimal (¢/L, 100–250 range)
  const priceReG = /\b(1[0-9]\d(?:[.,]\d{1,2})?)\b/g;

  // Strategy A: find the location-specific term, collect all prices in the next ~300 chars,
  // take the second-to-last (= today's price; last = MOYENNE).
  for (const term of searchTerms) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(escaped, 'i');
    const idx = norm.search(re);
    if (idx === -1) continue;
    const slice = norm.slice(idx, idx + 120);
    const prices = [];
    let m;
    const localRe = new RegExp(priceReG.source, 'g');
    while ((m = localRe.exec(slice)) !== null) {
      const v = parseFloat(m[1].replace(',', '.'));
      if (v >= 100 && v <= 250) prices.push(v);
    }
    if (prices.length >= 2) {
      // second-to-last = today's actual price; last = weekly average
      return prices[prices.length - 2];
    }
    if (prices.length === 1) return prices[0];
  }

  // Strategy B: last resort — first plausible price in the whole document
  const globalRe = /\b(1[0-9]\d(?:[.,]\d{1,2})?)\b/;
  const globalMatch = norm.match(globalRe);
  if (globalMatch) {
    const v = parseFloat(globalMatch[1].replace(',', '.'));
    if (v >= 100 && v <= 250) return v;
  }

  return null; // parse failed
}

ipcMain.handle('gas:getPrice', async (event, opts = {}) => {
  const { lat, lon } = opts;
  const searchTerms = coordsToRegieSearchTerms(lat, lon);
  const regionKey = searchTerms[0]; // cache key per region

  // ── 24h cache check (per region) ────────────────────────────────────────
  const cached = _gasPriceCache[regionKey];
  if (cached && (Date.now() - cached.fetchedAt) < 24 * 60 * 60 * 1000) {
    return { price: cached.price, source: cached.source, cached: true };
  }

  // ── Step 1: Régie de l'énergie — relevé quotidien ────────────────────────
  try {
    const buf = await fetchBuffer(
      'https://www.regie-energie.qc.ca/storage/app/media/consommateurs/informations-pratiques/prix-petrole/publications/Publications-quotidiennes/releve-quotidien/rqe.pdf'
    );
    const cents = await parseRegiePDF(buf, searchTerms);
    if (cents) {
      const result = {
        price: (cents / 100).toFixed(3),
        source: `Régie de l'énergie du Québec — ${regionKey} (daily report)`,
        fetchedAt: Date.now(),
      };
      _gasPriceCache[regionKey] = result;
      return { price: result.price, source: result.source };
    }
  } catch (_) { /* fall through */ }

  // ── Step 2: Régie de l'énergie — bulletin hebdomadaire ───────────────────
  try {
    const buf = await fetchBuffer(
      'https://www.regie-energie.qc.ca/storage/app/media/consommateurs/informations-pratiques/prix-petrole/publications/Publications-hebdomadaires/Bulletin/bulletin.pdf'
    );
    const cents = await parseRegiePDF(buf, searchTerms);
    if (cents) {
      const result = {
        price: (cents / 100).toFixed(3),
        source: `Régie de l'énergie du Québec — ${regionKey} (weekly bulletin)`,
        fetchedAt: Date.now(),
      };
      _gasPriceCache[regionKey] = result;
      return { price: result.price, source: result.source };
    }
  } catch (_) { /* fall through */ }

  // ── Step 3: CAA Canada fallback (original scraper — unchanged) ───────────
  try {
    const cheerio = require('cheerio');
    const buf = await fetchBuffer('https://www.caa.ca/gas-prices/');
    const html = buf.toString('utf-8');
    const $ = cheerio.load(html);
    let priceCents = null;

    const primaryText = $('div.national_single_price').first().text().trim();
    const primaryMatch = primaryText.match(/(\d{2,3}(?:\.\d{1,2})?)\s*\/L/);
    if (primaryMatch) priceCents = parseFloat(primaryMatch[1]);

    if (!priceCents) {
      $('[class*="single_price"]').each((_, el) => {
        if (priceCents) return;
        const m = $(el).text().match(/(\d{2,3}(?:\.\d{1,2})?)\s*\/L/);
        if (m) priceCents = parseFloat(m[1]);
      });
    }

    if (!priceCents) {
      const m = html.match(/\b(1[2-9]\d(?:\.\d{1,2})?)\s*\/L/);
      if (m) priceCents = parseFloat(m[1]);
    }

    if (priceCents && priceCents > 80 && priceCents < 350) {
      const result = {
        price: (priceCents / 100).toFixed(3),
        source: 'CAA Canada (national average — region unknown)',
        fetchedAt: Date.now(),
      };
      _gasPriceCache[regionKey] = result;
      return { price: result.price, source: result.source };
    }
  } catch (_) { /* fall through */ }

  return { error: 'Price unavailable — check internet connection.' };
});

function createWindow() {
  // Verify SQLite loads before creating the window — show a clear error if it fails
  try {
    const { storageGet } = require('./src/db/database.js');
    storageGet('__init_check__');
  } catch (err) {
    const { dialog: d } = require('electron');
    d.showErrorBox(
      'Erreur base de données — BalanceIQ',
      `Impossible d'initialiser la base de données SQLite.\n\n${err.message}\n\nSur Mac: exécutez dans Terminal:\n  xattr -cr /Applications/BalanceIQ.app\n\npuis relancez l'application.`
    );
    app.quit();
    return;
  }

  const win = mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    title: 'BalanceIQ',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const isDev = !app.isPackaged && process.env.NODE_ENV !== 'test';
  if (isDev) {
    win.loadURL('http://localhost:5173');
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }

  // ── SYSTEM TRAY ──────────────────────────────────────────────────────────
  try {
    const trayIconPath = path.join(__dirname, 'resources', 'tray-icon.png');
    let trayIcon;
    if (fs.existsSync(trayIconPath)) {
      trayIcon = nativeImage.createFromPath(trayIconPath).resize({ width: 16, height: 16 });
      if (process.platform === 'darwin') trayIcon.setTemplateImage(true);
    } else {
      trayIcon = nativeImage.createEmpty();
    }
    biqTray = new Tray(trayIcon);
    biqTray.setToolTip('BalanceIQ');
    // Double-click restores window (Windows behaviour)
    biqTray.on('double-click', () => { win.show(); win.focus(); });
  } catch (_e) {
    // Tray is non-critical — continue without it if icon is missing
  }
}

// IPC handler — trigger update download + install
ipcMain.handle('updater:downloadAndInstall', () => {
  autoUpdater.downloadUpdate().catch(() => {});
});

ipcMain.handle('shell:openExternal', (_event, url) => {
  if (!isUrlSafe(url)) {
    console.warn('Blocked unsafe external URL:', url);
    return Promise.resolve();
  }
  return shell.openExternal(url);
});

ipcMain.handle('url:validate', (_event, url) => isUrlSafe(url));

ipcMain.handle('tray:updateSales', (_event, { sales, date }) => {
  if (biqTray) biqTray.setToolTip(`BalanceIQ — ${date}: ${sales}`);
});

// ── POS INTEGRATION IPC ────────────────────────────────────────────────────

ipcMain.handle('pos:getCredentials', () => getPosCredentialsMeta());

const OAUTH_CALLBACK_URL = 'https://etiwnesxjypdwhxqnqqq.supabase.co/functions/v1/pos-oauth-callback';

// Pending OAuth nonces — keyed by posType. Cleared after use or on new flow start.
const _pendingOAuthNonce = {};

ipcMain.handle('pos:startOAuth', async (_event, posType, shopDomain) => {
  const isDev = !app.isPackaged;
  // Generate a random nonce to bind this OAuth flow to this session
  const nonce = crypto.randomUUID();
  _pendingOAuthNonce[posType] = nonce;
  const state = `${posType}:${nonce}`;

  let authUrl;
  if (posType === 'square') {
    const appId = isDev ? 'sandbox-sq0idb-vKGF3m-aVqnfr2d9YPC9cA' : 'sq0idp-8_k0M7m_P8VYYIYZbbF_nA';
    const base  = isDev ? 'https://connect.squareupsandbox.com' : 'https://connect.squareup.com';
    const p = new URLSearchParams({ client_id: appId, scope: 'PAYMENTS_READ ORDERS_READ MERCHANT_PROFILE_READ', redirect_uri: OAUTH_CALLBACK_URL, state });
    authUrl = `${base}/oauth2/authorize?${p}`;
  } else if (posType === 'clover') {
    const base = isDev ? 'https://sandbox.dev.clover.com' : 'https://www.clover.com';
    const p = new URLSearchParams({ client_id: '5GTA1NCXTO5YY', redirect_uri: OAUTH_CALLBACK_URL, state });
    authUrl = `${base}/oauth/authorize?${p}`;
  } else if (posType === 'shopify' && shopDomain) {
    const shop = shopDomain.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const p = new URLSearchParams({ client_id: 'a728cf71c0b64c5d7e0694567a085d0d', scope: 'read_orders,read_products', redirect_uri: OAUTH_CALLBACK_URL, state });
    authUrl = `https://${shop}/admin/oauth/authorize?${p}`;
  }
  if (authUrl) shell.openExternal(authUrl);
  return { started: !!authUrl };
});

ipcMain.handle('pos:saveManualToken', async (_event, posType, accessToken, shopDomain) => {
  try {
    await savePosToken(posType, { accessToken, merchantId: null, shopDomain });
    const creds = getPosCredentialsMeta();
    return { success: true, credentials: creds };
  } catch (err) {
    console.error('[pos:saveManualToken]', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('pos:disconnect', (_event, posType) => {
  const stored = JSON.parse(storageGet('pos-credentials')?.value || '{}');
  delete stored[posType];
  storageSet('pos-credentials', JSON.stringify(stored));
  return { success: true };
});

ipcMain.handle('pos:testConnection', async (_event, posType) => {
  const stored = JSON.parse(storageGet('pos-credentials')?.value || '{}');
  const cred = stored[posType];
  if (!cred?.accessToken) return { connected: false, error: 'No token stored' };
  try {
    if (posType === 'square') {
      const url = `${posBaseUrl('square')}/v2/locations`;
      console.log('[pos:testConnection] square url:', url, 'token prefix:', cred.accessToken?.slice(0,20));
      const res = await netRequest({ method: 'GET', url, headers: { Authorization: `Bearer ${cred.accessToken}`, 'Square-Version': '2024-02-28' } });
      console.log('[pos:testConnection] square status:', res.status, 'body keys:', Object.keys(res.body||{}));
      const ok = res.status === 200;
      const name = ok ? (res.body?.locations?.[0]?.name || cred.merchantName || 'Square') : undefined;
      if (!ok) return { connected: false, error: `HTTP ${res.status}: ${JSON.stringify(res.body).slice(0,200)}` };
      return { connected: ok, merchantName: name };
    }
    if (posType === 'clover') {
      const url = cred.merchantId
        ? `${posBaseUrl('clover')}/v3/merchants/${cred.merchantId}`
        : `${posBaseUrl('clover')}/v3/merchant`;
      const res = await netRequest({ method: 'GET', url, headers: { Authorization: `Bearer ${cred.accessToken}` } });
      if (!res.status === 200) return { connected: false, error: `HTTP ${res.status}: ${JSON.stringify(res.body).slice(0,200)}` };
      return { connected: res.status === 200, merchantName: res.body?.name };
    }
    if (posType === 'shopify') {
      const res = await netRequest({ method: 'GET', url: `https://${cred.shopDomain}/admin/api/2024-01/shop.json`, headers: { 'X-Shopify-Access-Token': cred.accessToken } });
      return { connected: res.status === 200, merchantName: res.body?.shop?.name };
    }
  } catch (err) { return { connected: false, error: err.message }; }
  return { connected: false };
});

ipcMain.handle('pos:fetchDailySales', async (_event, posType, dateStr) => {
  const stored = JSON.parse(storageGet('pos-credentials')?.value || '{}');
  const cred = stored[posType];
  if (!cred?.accessToken) return { error: 'POS not connected' };
  try {
    if (posType === 'square') {
      const begin = `${dateStr}T00:00:00-05:00`;
      const end   = `${dateStr}T23:59:59-05:00`;
      const registers = [];
      for (const loc of (cred.locations || [{ id: null, name: cred.merchantName }])) {
        const params = new URLSearchParams({ begin_time: begin, end_time: end, limit: '200' });
        if (loc.id) params.set('location_id', loc.id);
        const res = await netRequest({ method: 'GET', url: `${posBaseUrl('square')}/v2/payments?${params}`, headers: { Authorization: `Bearer ${cred.accessToken}`, 'Square-Version': '2024-02-28' } });
        const payments = (res.body?.payments || []).filter(p => p.status === 'COMPLETED');
        let totalCents = 0, deliveryCents = 0, tipCents = 0;
        let pVisa = 0, pMC = 0, pDebit = 0, pAmex = 0, pCash = 0, pOther = 0;
        const hourlyMap = {};
        for (const p of payments) {
          const amt = p.amount_money?.amount ?? 0;
          const tip = p.tip_money?.amount ?? 0;
          const net = amt - tip;
          totalCents += net;
          tipCents += tip;
          if (p.source_type === 'EXTERNAL' && p.external_details?.type === 'DELIVERY') deliveryCents += net;
          if (p.source_type === 'CASH') pCash += net;
          else if (p.source_type === 'CARD') {
            const brand = p.card_details?.card?.card_brand || '';
            if (brand === 'VISA') pVisa += net;
            else if (brand === 'MASTERCARD') pMC += net;
            else if (brand === 'INTERAC') pDebit += net;
            else if (brand === 'AMERICAN_EXPRESS') pAmex += net;
            else pOther += net;
          } else pOther += net;
          const hour = new Date(p.created_at).getHours();
          if (!hourlyMap[hour]) hourlyMap[hour] = { sales: 0, transactions: 0 };
          hourlyMap[hour].sales += net;
          hourlyMap[hour].transactions++;
        }
        const posVentes = totalCents / 100;
        const hourlySales = Object.entries(hourlyMap)
          .map(([h, d]) => ({ hour: parseInt(h), sales: Math.round(d.sales) / 100, transactions: d.transactions }))
          .sort((a, b) => a.hour - b.hour);
        registers.push({
          name: loc.name || `Caisse ${registers.length + 1}`,
          grossSales: posVentes, discounts: 0, refunds: 0, netSales: posVentes,
          taxableSales: posVentes, nonTaxableSales: 0,
          posVentes, posTPS: Math.round(posVentes * 0.05 * 100) / 100, posTVQ: Math.round(posVentes * 0.09975 * 100) / 100,
          payments: { visa: pVisa/100, mastercard: pMC/100, debit: pDebit/100, amex: pAmex/100, cash: pCash/100, other: pOther/100 },
          tips: tipCents / 100,
          deliveryOrders: { doordash: 0, ubereats: 0, skip: 0, other: deliveryCents / 100 },
          transactionCount: payments.length,
          hourlySales,
          posLivraisons: deliveryCents / 100,
        });
      }
      return { registers };
    }
    if (posType === 'clover') {
      const start = new Date(`${dateStr}T00:00:00-05:00`).getTime();
      const end   = new Date(`${dateStr}T23:59:59-05:00`).getTime();
      const res = await netRequest({ method: 'GET', url: `${posBaseUrl('clover')}/v3/merchants/${cred.merchantId}/orders?filter=createdTime>=${start}&limit=200`, headers: { Authorization: `Bearer ${cred.accessToken}` } });
      const orders = (res.body?.elements || []).filter(o => o.state === 'locked');
      let totalCents = 0, tipCents = 0, discountCents = 0;
      const hourlyMap = {};
      for (const o of orders) {
        const net = (o.total ?? 0) - (o.taxAmount ?? 0) - (o.tipAmount ?? 0);
        totalCents += net;
        tipCents += (o.tipAmount ?? 0);
        discountCents += (o.discountAmount ?? 0);
        const hour = new Date(o.createdTime).getHours();
        if (!hourlyMap[hour]) hourlyMap[hour] = { sales: 0, transactions: 0 };
        hourlyMap[hour].sales += net;
        hourlyMap[hour].transactions++;
      }
      const posVentes = totalCents / 100;
      const hourlySales = Object.entries(hourlyMap)
        .map(([h, d]) => ({ hour: parseInt(h), sales: Math.round(d.sales) / 100, transactions: d.transactions }))
        .sort((a, b) => a.hour - b.hour);
      return { registers: [{
        name: cred.merchantName || 'Clover',
        grossSales: (totalCents + discountCents) / 100, discounts: discountCents / 100, refunds: 0, netSales: posVentes,
        taxableSales: posVentes, nonTaxableSales: 0,
        posVentes, posTPS: Math.round(posVentes * 0.05 * 100) / 100, posTVQ: Math.round(posVentes * 0.09975 * 100) / 100,
        payments: { visa: 0, mastercard: 0, debit: 0, amex: 0, cash: 0, other: posVentes },
        tips: tipCents / 100,
        deliveryOrders: { doordash: 0, ubereats: 0, skip: 0, other: 0 },
        transactionCount: orders.length,
        hourlySales,
        posLivraisons: 0,
      }]};
    }
    if (posType === 'shopify') {
      const params = new URLSearchParams({ status: 'any', financial_status: 'paid', source_name: 'pos', created_at_min: `${dateStr}T00:00:00-05:00`, created_at_max: `${dateStr}T23:59:59-05:00`, limit: '250' });
      const res = await netRequest({ method: 'GET', url: `https://${cred.shopDomain}/admin/api/2024-01/orders.json?${params}`, headers: { 'X-Shopify-Access-Token': cred.accessToken } });
      const orders = res.body?.orders || [];
      let totalNet = 0, tipCents = 0, discountCents = 0, nonTaxable = 0;
      const hourlyMap = {};
      for (const o of orders) {
        const sub = parseFloat(o.subtotal_price ?? 0);
        totalNet += sub;
        tipCents += Math.round(parseFloat(o.total_tip_received ?? 0) * 100);
        discountCents += Math.round(parseFloat(o.total_discounts ?? 0) * 100);
        for (const item of (o.line_items || [])) {
          if (!item.taxable) nonTaxable += parseFloat(item.price ?? 0) * (parseInt(item.quantity) || 1);
        }
        const hour = new Date(o.created_at).getHours();
        if (!hourlyMap[hour]) hourlyMap[hour] = { sales: 0, transactions: 0 };
        hourlyMap[hour].sales += sub;
        hourlyMap[hour].transactions++;
      }
      const posVentes = Math.round(totalNet * 100) / 100;
      const hourlySales = Object.entries(hourlyMap)
        .map(([h, d]) => ({ hour: parseInt(h), sales: Math.round(d.sales * 100) / 100, transactions: d.transactions }))
        .sort((a, b) => a.hour - b.hour);
      return { registers: [{
        name: cred.shopName || 'Shopify POS',
        grossSales: posVentes + discountCents/100, discounts: discountCents/100, refunds: 0, netSales: posVentes,
        taxableSales: posVentes - Math.round(nonTaxable * 100) / 100, nonTaxableSales: Math.round(nonTaxable * 100) / 100,
        posVentes, posTPS: Math.round(posVentes * 0.05 * 100) / 100, posTVQ: Math.round(posVentes * 0.09975 * 100) / 100,
        payments: { visa: 0, mastercard: 0, debit: 0, amex: 0, cash: 0, other: posVentes },
        tips: tipCents / 100,
        deliveryOrders: { doordash: 0, ubereats: 0, skip: 0, other: 0 },
        transactionCount: orders.length,
        hourlySales,
        posLivraisons: 0,
      }]};
    }
  } catch (err) { return { error: err.message }; }
  return { error: 'Unknown POS type' };
});

// ── DELIVERY PAYOUT WATCHER ────────────────────────────────────────────────
const DELIVERY_PATTERNS = {
  doordash: [/doordash/i, /door.dash/i, /dd.payout/i, /merchant.payment/i],
  ubereats: [/uber.eats/i, /ubereats/i, /ue.payout/i, /eats.report/i],
  skip: [/skipthedishes/i, /skip.dishes/i, /skip.payout/i, /skip.report/i],
};
function detectDeliveryPlatform(filename) {
  for (const [platform, patterns] of Object.entries(DELIVERY_PATTERNS)) {
    if (patterns.some(p => p.test(filename))) return platform;
  }
  return null;
}
let deliveryWatcher = null;

ipcMain.handle('delivery:watchDownloads', () => {
  if (deliveryWatcher) return { ok: true };
  const downloadsDir = app.getPath('downloads');
  try {
    deliveryWatcher = fs.watch(downloadsDir, (event, filename) => {
      if (!filename || event !== 'rename') return;
      if (!filename.toLowerCase().endsWith('.csv')) return;
      const platform = detectDeliveryPlatform(filename);
      if (!platform) return;
      const fullPath = path.join(downloadsDir, filename);
      setTimeout(() => {
        try {
          if (!fs.existsSync(fullPath)) return;
          const stat = fs.statSync(fullPath);
          if (stat.size < 50) return;
          const content = fs.readFileSync(fullPath, 'utf-8');
          mainWindow?.webContents.send('delivery:file-detected', { platform, fileName: filename, content });
        } catch {}
      }, 1200);
    });
    return { ok: true, dir: downloadsDir };
  } catch (e) {
    return { error: e.message };
  }
});

ipcMain.handle('delivery:stopWatch', () => {
  if (deliveryWatcher) { deliveryWatcher.close(); deliveryWatcher = null; }
  return { ok: true };
});

ipcMain.handle('ocr:selectImage', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Sélectionner une facture',
    filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp'] }],
    properties: ['openFile'],
  });
  if (result.canceled || !result.filePaths.length) return null;
  const filePath = result.filePaths[0];

  // Load image and resize to max 1800px on longest side (plenty for OCR)
  let img = nativeImage.createFromPath(filePath);
  const { width, height } = img.getSize();
  const MAX_DIM = 1800;
  if (width > MAX_DIM || height > MAX_DIM) {
    const scale = MAX_DIM / Math.max(width, height);
    img = img.resize({ width: Math.round(width * scale), height: Math.round(height * scale) });
  }

  // Always output JPEG at quality 85 — consistent and compact
  const jpeg = img.toJPEG(85);
  return {
    base64: jpeg.toString('base64'),
    mimeType: 'image/jpeg',
    fileName: path.basename(filePath),
  };
});

ipcMain.handle('delivery:openPortal', (_event, platform) => {
  const urls = {
    doordash: 'https://www.doordash.com/merchant/financials/payouts',
    ubereats: 'https://merchants.ubereats.com/manager/reports',
    skip: 'https://restaurants.skipthedishes.com/',
  };
  const url = urls[platform];
  if (url) shell.openExternal(url);
  return { ok: !!url };
});

ipcMain.handle('docs:download', async (_event, { url, filename }) => {
  try {
    const downloadsDir = app.getPath('downloads');
    const safeName = path.basename(filename);
    if (!safeName || safeName === '.' || safeName === '..') {
      return { error: 'Invalid filename' };
    }
    const destPath = path.join(downloadsDir, safeName);
    const response = await new Promise((resolve, reject) => {
      const req = net.request({ method: 'GET', url });
      const chunks = [];
      req.on('response', res => {
        res.on('data', c => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      });
      req.on('error', reject);
      req.end();
    });
    fs.writeFileSync(destPath, response);
    // Do NOT auto-open: download-and-open is effectively download-and-execute.
    // Return the path and folder so the renderer can show a notification with
    // explicit "Open" / "Show in folder" buttons (user's choice).
    return { ok: true, path: destPath, folder: downloadsDir };
  } catch(e) {
    return { error: e.message };
  }
});

ipcMain.handle('file:openDownloaded', async (_event, filePath) => {
  // Verify the file is actually inside the downloads directory (defense in depth).
  const downloadsDir = app.getPath('downloads');
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(downloadsDir + path.sep) && resolved !== downloadsDir) {
    throw new Error('Cannot open files outside downloads directory');
  }
  return shell.openPath(resolved);
});

ipcMain.handle('file:showInFolder', (_event, filePath) => {
  const downloadsDir = app.getPath('downloads');
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(downloadsDir + path.sep) && resolved !== downloadsDir) {
    throw new Error('Cannot show files outside downloads directory');
  }
  shell.showItemInFolder(resolved);
});

// ── FORECAST IPC ──
ipcMain.handle('forecast:clearAll', () => forecastClearAll());
ipcMain.handle('forecast:products:getAll', () => forecastProductsGetAll());
ipcMain.handle('forecast:products:upsert', (_e, p) => forecastProductUpsert(p));

ipcMain.handle('forecast:sales:getForDate', (_e, date) => forecastSalesGetForDate(date));
ipcMain.handle('forecast:sales:getForProduct', (_e, productId, limit) => forecastSalesGetForProduct(productId, limit));
ipcMain.handle('forecast:sales:getRange', (_e, from, to) => forecastSalesGetRange(from, to));
ipcMain.handle('forecast:sales:upsert', (_e, record) => forecastSalesUpsert(record));
ipcMain.handle('forecast:sales:deleteForDate', (_e, date) => forecastSalesDeleteForDate(date));

ipcMain.handle('forecast:imports:getAll',        ()               => forecastImportsGetAll());
ipcMain.handle('forecast:imports:log',           (_e, record)     => forecastImportLog(record));
ipcMain.handle('forecast:imports:delete',        (_e, id)         => forecastImportDelete(id));
ipcMain.handle('forecast:imports:markReplaced',  (_e, date, byId) => forecastImportMarkReplaced(date, byId));

ipcMain.handle('forecast:weather:getRange', (_e, from, to) => forecastWeatherGetRange(from, to));
ipcMain.handle('forecast:weather:upsert', (_e, record) => forecastWeatherUpsert(record));

ipcMain.handle('forecast:csvMappings:getAll', () => forecastCsvMappingsGetAll());
ipcMain.handle('forecast:csvMappings:save', (_e, mapping) => forecastCsvMappingSave(mapping));

// Learned Patterns
ipcMain.handle('forecast:patterns:getAll', () => learnedPatternsGetAll());
ipcMain.handle('forecast:patterns:upsert', (_e, p) => learnedPatternUpsert(p));

// Prediction Accuracy
ipcMain.handle('forecast:accuracy:getAll', () => predAccuracyGetAll());
ipcMain.handle('forecast:accuracy:getForProduct', (_e, id) => predAccuracyGetForProduct(id));
ipcMain.handle('forecast:accuracy:upsert', (_e, r) => predAccuracyUpsert(r));

// Insights
ipcMain.handle('forecast:insights:getAll', () => insightsGetAll());
ipcMain.handle('forecast:insights:getUnreadCount', () => insightsGetUnreadCount());
ipcMain.handle('forecast:insights:upsert', (_e, ins) => insightUpsert(ins));
ipcMain.handle('forecast:insights:markRead', (_e, id) => insightMarkRead(id));
ipcMain.handle('forecast:insights:markAllRead', () => insightMarkAllRead());

// Checklist
ipcMain.handle('checklist:getTemplates',    ()          => checklistTemplatesGetAll());
ipcMain.handle('checklist:saveTemplate',    (_e, t)     => checklistTemplateUpsert(t));
ipcMain.handle('checklist:deleteTemplate',  (_e, id)    => checklistTemplateDelete(id));
ipcMain.handle('checklist:getEntries',      (_e, date)  => checklistEntriesGetForDate(date));
ipcMain.handle('checklist:getEntriesRange', (_e, f, to) => checklistEntriesGetRange(f, to));
ipcMain.handle('checklist:saveEntry',       (_e, entry) => checklistEntryUpsert(entry));

// ── Recipe Costing IPC ──────────────────────────────────────────────────────
ipcMain.handle('ingredients:getAll',           ()             => ingredientsGetAll());
ipcMain.handle('ingredients:save',             (_e, p)        => ingredientUpsert(p));
ipcMain.handle('ingredients:delete',           (_e, id)       => ingredientDelete(id));
ipcMain.handle('ingredients:aliasesGet',       (_e, id)       => ingredientAliasesGetForIngredient(id));
ipcMain.handle('ingredients:aliasSave',        (_e, a)        => ingredientAliasUpsert(a));
ipcMain.handle('ingredients:aliasDelete',      (_e, id)       => ingredientAliasDelete(id));
ipcMain.handle('ingredients:aliasFind',        (_e, alias, s) => ingredientAliasFindMatch(alias, s));
ipcMain.handle('priceHistory:get',             (_e, id)       => priceHistoryGetForIngredient(id));
ipcMain.handle('priceHistory:getLast',         (_e, id, s)    => priceHistoryGetLastPrice(id, s));
ipcMain.handle('priceHistory:save',            (_e, r)        => priceHistorySave(r));
ipcMain.handle('recipes:getAll',               ()             => recipesGetAll());
ipcMain.handle('recipes:save',                 (_e, r)        => recipeUpsert(r));
ipcMain.handle('recipes:delete',               (_e, id)       => recipeDelete(id));
ipcMain.handle('recipes:ingredientsGet',       (_e, id)       => recipeIngredientsGet(id));
ipcMain.handle('recipes:ingredientsSetAll',    (_e, id, list) => recipeIngredientsSetAll(id, list));
ipcMain.handle('invoiceLines:save',            (_e, items)    => invoiceLineItemsSave(items));
ipcMain.handle('invoiceLines:getForInvoice',   (_e, ref)      => invoiceLineItemsGetForInvoice(ref));
ipcMain.handle('invoiceLines:getRecent',       ()             => invoiceLineItemsGetRecent());

// ── Food Waste IPC ──────────────────────────────────────────────────────────
ipcMain.handle('waste:getRange',  (_e, f, to) => wasteGetRange(f, to));
ipcMain.handle('waste:save',      (_e, entry) => wasteSave(entry));
ipcMain.handle('waste:delete',    (_e, id)    => wasteDelete(id));

// ── Tip Pooling IPC ─────────────────────────────────────────────────────────
ipcMain.handle('tipPool:config:get',       ()             => tipPoolConfigGet());
ipcMain.handle('tipPool:config:save',      (_e, cfg)      => tipPoolConfigSave(cfg));
ipcMain.handle('tipPool:session:get',      (_e, date)     => tipPoolSessionGet(date));
ipcMain.handle('tipPool:session:getRange', (_e, f, to)    => tipPoolSessionGetRange(f, to));
ipcMain.handle('tipPool:session:save',     (_e, session)  => tipPoolSessionSave(session));

// ── Écocontribution IPC ──────────────────────────────────────────────────────
ipcMain.handle('eco:items:getAll',          ()              => ecoItemsGetAll());
ipcMain.handle('eco:items:upsert',          (_e, item)      => ecoItemUpsert(item));
ipcMain.handle('eco:items:delete',          (_e, id)        => ecoItemDelete(id));
ipcMain.handle('eco:config:get',            ()              => ecoConfigGet());
ipcMain.handle('eco:config:save',           (_e, cfg)       => ecoConfigSave(cfg));
ipcMain.handle('eco:rates:getForYear',      (_e, year)      => ecoRatesGetForYear(year));
ipcMain.handle('eco:rates:upsert',          (_e, rate)      => ecoRateUpsert(rate));
ipcMain.handle('eco:usage:getForYear',      (_e, year)      => ecoUsageGetForYear(year));
ipcMain.handle('eco:usage:upsert',          (_e, usage)     => ecoUsageUpsert(usage));
ipcMain.handle('eco:usage:delete',          (_e, y, pid, lid)=>ecoUsageDelete(y, pid, lid));

// Register balanceiq:// as protocol handler for OAuth callbacks
app.setAsDefaultProtocolClient('balanceiq');

// macOS: deep link via open-url event
app.on('open-url', (event, url) => {
  event.preventDefault();
  if (url.startsWith('balanceiq://oauth/')) handlePosOAuthCallback(url);
  if (url.startsWith('balanceiq://subscription-success') || url.startsWith('balanceiq://portal-return')) {
    if (mainWindow) mainWindow.webContents.send('subscription:planRefresh');
  }
});

// Windows: deep link arrives as second argv when app is already running
if (process.env.NODE_ENV !== 'test' && !app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    const url = argv.find(a => a.startsWith('balanceiq://'));
    if (url?.startsWith('balanceiq://oauth/')) handlePosOAuthCallback(url);
    if (url?.startsWith('balanceiq://subscription-success') || url?.startsWith('balanceiq://portal-return')) {
      if (mainWindow) mainWindow.webContents.send('subscription:planRefresh');
    }
    if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); }
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  // Auto-backup — runs on every launch, one file per day
  setTimeout(() => { performAutoBackup().catch(() => {}); }, 3000);

  // Auto-updater — GitHub API fetch (works without code signing)
  if (app.isPackaged) {
    const https = require('https');
    const currentVersion = app.getVersion();

    const fetchLatestVersion = () => new Promise((resolve, reject) => {
      const req = https.get(
        'https://api.github.com/repos/dicanns/balanceiq/releases/latest',
        { headers: { 'User-Agent': 'BalanceIQ-Updater' } },
        (res) => {
          let body = '';
          res.on('data', chunk => body += chunk);
          res.on('end', () => {
            try { resolve(JSON.parse(body)); }
            catch (e) { reject(e); }
          });
        }
      );
      req.on('error', reject);
      req.setTimeout(10000, () => { req.destroy(); reject(new Error('timeout')); });
    });

    // SECURITY NOTE: Update check trusts GitHub's release API and asset URLs.
    // The packaged app is code-signed (macOS) but there is no hash-pinned update
    // manifest or in-app signature verification. This is a known trust gap.
    // TODO: Implement signed update manifest when user base justifies the
    // infrastructure (see codex-review/codex_roadmap_LATER_2026-04-01.md).
    const checkForUpdate = async () => {
      try {
        const release = await fetchLatestVersion();
        const latest = (release.tag_name || '').replace(/^v/, '');
        const notify = (ch, p) => BrowserWindow.getAllWindows().forEach(w => {
          if (!w.isDestroyed()) w.webContents.send(ch, p);
        });
        if (latest && latest !== currentVersion) {
          const isWin = process.platform === 'win32';
          const url = release.assets?.find(a => isWin ? a.name.endsWith('.exe') : a.name.endsWith('.dmg'))?.browser_download_url
            || release.html_url;
          notify('update:available', { version: latest, url });
        } else {
          notify('update:status', 'up-to-date');
        }
      } catch (e) {
        BrowserWindow.getAllWindows().forEach(w => {
          if (!w.isDestroyed()) w.webContents.send('update:status', 'error: ' + e.message);
        });
      }
    };

    // Check 5s after launch
    setTimeout(checkForUpdate, 5000);

    ipcMain.handle('updater:check', () => false); // kept for compat
    ipcMain.handle('updater:checkNow', async () => {
      await checkForUpdate();
    });
  }
});

// ── POS Report Scan ──────────────────────────────────────────────────────────
// Tesseract OCR worker (created once, reused across IPC calls)
let _ocrWorker = null;
ipcMain.handle('posScan:ocr', async (_e, base64PNG) => {
  if (!_ocrWorker) {
    const { createWorker } = require('tesseract.js');
    _ocrWorker = await createWorker(['fra', 'eng']);
  }
  const buf = Buffer.from(base64PNG, 'base64');
  const { data: { text } } = await _ocrWorker.recognize(buf);
  return text;
});

ipcMain.handle('posScan:selectFile', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Sélectionner un rapport POS',
    filters: [
      { name: 'Rapports POS', extensions: ['pdf', 'png', 'jpg', 'jpeg'] },
    ],
    properties: ['openFile'],
  });
  if (result.canceled || !result.filePaths.length) return null;
  const filePath = result.filePaths[0];
  const ext = path.extname(filePath).toLowerCase().replace('.', '');
  const mimeMap = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg' };
  const mimeType = mimeMap[ext] || 'application/octet-stream';
  const fileBuffer = fs.readFileSync(filePath);
  const base64 = fileBuffer.toString('base64');
  return { base64, mimeType, fileName: path.basename(filePath) };
});

ipcMain.handle('posScan:templates:getAll', () => posScanTemplatesGetAll());
ipcMain.handle('posScan:templates:save', (_e, tpl) => posScanTemplateSave(tpl));
ipcMain.handle('posScan:templates:delete', (_e, id) => posScanTemplateDelete(id));
ipcMain.handle('posScan:templates:markUploaded', (_e, id) => posScanTemplateMarkUploaded(id));

ipcMain.handle('posScan:history:save', (_e, entry) => posScanHistorySave(entry));
ipcMain.handle('posScan:history:getRecent', (_e, limit) => posScanHistoryGetRecent(limit));
ipcMain.handle('posScan:history:getForDate', (_e, dateKey) => posScanHistoryGetForDate(dateKey));

// ── Upgrade Prompt Dismissals ──────────────────────────────────────────────
ipcMain.handle('upgradePrompt:getDismissedAt', (_e, key) => upgradePromptGetDismissedAt(key));
ipcMain.handle('upgradePrompt:dismiss',        (_e, key) => upgradePromptDismiss(key));

// ── Onboarding Checklist ──────────────────────────────────────────────────
ipcMain.handle('onboarding:getAll',   ()         => onboardingGetAll());
ipcMain.handle('onboarding:markDone', (_e, key)  => onboardingMarkDone(key));
ipcMain.handle('onboarding:reset',    ()         => onboardingReset());

// ── P&L Invoice History (Vendor Price Intelligence) ────────────────────────
ipcMain.handle('plPriceIntel:record',    (_e, r)              => plInvoiceHistoryRecord(r));
ipcMain.handle('plPriceIntel:getLast',   (_e, key, excludeId) => plInvoiceHistoryGetLast(key, excludeId));
ipcMain.handle('plPriceIntel:getRecent', (_e, key, limit)     => plInvoiceHistoryGetRecent(key, limit));

// ── Chart of Accounts ─────────────────────────────────────────────────────────
ipcMain.handle('coa:list',               ()                   => coaList());
ipcMain.handle('coa:create',             (_e, fields)         => coaCreate(fields));
ipcMain.handle('coa:update',             (_e, id, fields)     => coaUpdate(id, fields));
ipcMain.handle('coa:archive',            (_e, id)             => coaArchive(id));
ipcMain.handle('coa:unarchive',          (_e, id)             => coaUnarchive(id));
ipcMain.handle('coa:importCSV',          (_e, csv)            => coaImportCSV(csv));
ipcMain.handle('coa:exportCSV',          ()                   => coaExportCSV());
ipcMain.handle('coa:getMappingSuggestions', (_e, names)       => coaMappingSuggestions(names));

// ── General Ledger IPC ────────────────────────────────────────────────────────

// Create and immediately post a journal entry for an invoice finalization.
// Called by the renderer when a Facture transitions from Brouillon → Envoyée.
ipcMain.handle('ledger:invoice:post', async (_e, {
  invoiceId, invoiceDate, subtotalCents, tpsCents, tvqCents, totalCents, taxExempt,
}) => {
  const { coaList } = require('./src/db/database.js');
  const accounts = coaList();
  const find = (num) => accounts.find(a => a.account_number === num);
  const ar      = find('1100');
  const revenue = find('4000');
  const tpsAcc  = find('2100');
  const tvqAcc  = find('2110');

  if (!ar || !revenue) {
    return { ok: false, error: 'missing_coa_accounts', detail: 'Comptes 1100 ou 4000 introuvables' };
  }

  const lines = [];
  lines.push({ account_id: ar.id, debit_cents: totalCents, credit_cents: 0, memo: `Facture ${invoiceId}` });
  if (taxExempt) {
    lines.push({ account_id: revenue.id, debit_cents: 0, credit_cents: totalCents, memo: `Revenus (exonéré)` });
  } else {
    lines.push({ account_id: revenue.id, debit_cents: 0, credit_cents: subtotalCents, memo: 'Revenus' });
    if (tpsCents && tpsAcc) lines.push({ account_id: tpsAcc.id, debit_cents: 0, credit_cents: tpsCents, memo: 'TPS à payer' });
    if (tvqCents && tvqAcc) lines.push({ account_id: tvqAcc.id, debit_cents: 0, credit_cents: tvqCents, memo: 'TVQ à payer' });
  }

  const { entryId } = glDraftEntry({
    entry_date: invoiceDate,
    description: `Facture ${invoiceId}`,
    source_type: 'invoice',
    source_id: String(invoiceId),
    lines,
  });
  glPostEntry(entryId);
  return { ok: true, entryId };
});

ipcMain.handle('ledger:creditnote:post', async (_e, {
  creditNoteId, creditNoteDate, subtotalCents, tpsCents, tvqCents, totalCents, taxExempt,
}) => {
  const { coaList } = require('./src/db/database.js');
  const accounts = coaList();
  const find = (num) => accounts.find(a => a.account_number === num);
  const ar      = find('1100');
  const revenue = find('4000');
  const tpsAcc  = find('2100');
  const tvqAcc  = find('2110');

  if (!ar || !revenue) {
    return { ok: false, error: 'missing_coa_accounts' };
  }

  const lines = [];
  lines.push({ account_id: ar.id, debit_cents: 0, credit_cents: totalCents, memo: `Note de crédit ${creditNoteId}` });
  if (taxExempt) {
    lines.push({ account_id: revenue.id, debit_cents: totalCents, credit_cents: 0, memo: 'Contra-revenus (exonéré)' });
  } else {
    lines.push({ account_id: revenue.id, debit_cents: subtotalCents, credit_cents: 0, memo: 'Contra-revenus' });
    if (tpsCents && tpsAcc) lines.push({ account_id: tpsAcc.id, debit_cents: tpsCents, credit_cents: 0, memo: 'TPS – note de crédit' });
    if (tvqCents && tvqAcc) lines.push({ account_id: tvqAcc.id, debit_cents: tvqCents, credit_cents: 0, memo: 'TVQ – note de crédit' });
  }

  const { entryId } = glDraftEntry({
    entry_date: creditNoteDate,
    description: `Note de crédit ${creditNoteId}`,
    source_type: 'credit_note',
    source_id: String(creditNoteId),
    lines,
  });
  glPostEntry(entryId);
  return { ok: true, entryId };
});

ipcMain.handle('ledger:entry:draft',   (_e, data)              => glDraftEntry(data));
ipcMain.handle('ledger:entry:update',  (_e, id, data)          => glUpdateDraft(id, data));
ipcMain.handle('ledger:entry:post',    (_e, id)                => glPostEntry(id));
ipcMain.handle('ledger:entry:reverse', (_e, id, reason)        => glReverseEntry(id, reason));
ipcMain.handle('ledger:entry:correct', (_e, id, newData, reason) => glCorrectEntry(id, newData, reason));
ipcMain.handle('ledger:entry:delete',  (_e, id)                => glDeleteDraft(id));
ipcMain.handle('ledger:entry:get',     (_e, id)                => glGetEntry(id));
ipcMain.handle('ledger:entry:list',    (_e, opts)              => glListEntries(opts));
ipcMain.handle('ledger:account:history', (_e, accountId, opts) => glGetAccountHistory(accountId, opts));
ipcMain.handle('ledger:trial_balance', (_e, asOfDate, opts)    => trialBalance(asOfDate, opts));
ipcMain.handle('ledger:audit:list',    (_e, opts)              => glAuditLogList(opts));
ipcMain.handle('period:list',          (_e, opts)              => periodList(opts));
ipcMain.handle('period:open',          (_e, data)              => periodOpen(data));
ipcMain.handle('period:close',         (_e, id)                => periodClose(id));
ipcMain.handle('period:reopen',        (_e, id, reason)        => periodReopen(id, reason));

// ── Bank Reconciliation (Sprint 3) ────────────────────────────────────────────
ipcMain.handle('bank:accounts:list',       ()                          => bankAccountsList());
ipcMain.handle('bank:accounts:create',     (_e, fields)                => bankAccountCreate(fields));
ipcMain.handle('bank:accounts:update',     (_e, id, fields)            => bankAccountUpdate(id, fields));
ipcMain.handle('bank:accounts:archive',    (_e, id)                    => bankAccountArchive(id));

ipcMain.handle('bank:statement:import',    (_e, opts)                  => bankStatementImport(opts));
ipcMain.handle('bank:statement:list',      (_e, bankAccountId)         => bankStatementsList(bankAccountId));

ipcMain.handle('bank:transactions:list',   (_e, bankAccountId, opts)   => bankTransactionsList(bankAccountId, opts));
ipcMain.handle('bank:transactions:match',  (_e, txId, etype, eid)      => bankTransactionMatch(txId, etype, eid));
ipcMain.handle('bank:transactions:unmatch',(_e, txId)                  => bankTransactionUnmatch(txId));
ipcMain.handle('bank:transactions:categorize', (_e, txId, coaId, notes) => bankTransactionCategorize(txId, coaId, notes));

ipcMain.handle('bank:reconcile:preview',   (_e, bankAccountId, asOf)   => bankReconcilePreview(bankAccountId, asOf));
ipcMain.handle('bank:reconcile:close',     (_e, bankAccountId, stmtId) => bankReconcileClose(bankAccountId, stmtId));
ipcMain.handle('bank:reconcile:reopen',    (_e, bankAccountId, stmtId, reason) => bankReconcileReopen(bankAccountId, stmtId, reason));

ipcMain.handle('bank:learned:list',        ()                          => bankLearnedRulesList());
ipcMain.handle('bank:learned:delete',      (_e, id)                    => bankLearnedRuleDelete(id));

ipcMain.handle('tax:period:compute',            (_e, start, end)                        => taxPeriodCompute(start, end));
ipcMain.handle('tax:period:save',               (_e, data)                              => taxPeriodSave(data));
ipcMain.handle('tax:period:markFiled',          (_e, id, confirmNum, paidAmt)           => taxPeriodMarkFiled(id, confirmNum, paidAmt));
ipcMain.handle('tax:period:list',               ()                                      => taxPeriodList());
ipcMain.handle('tax:suspense:list',             (_e, opts)                              => taxSuspenseList(opts));
ipcMain.handle('tax:suspense:classifyCash',     (_e, txId, coaId, reason)               => taxSuspenseClassifyAsCashExpense(txId, coaId, reason));
ipcMain.handle('tax:suspense:reverse',          (_e, txId)                              => taxSuspenseReverseCategorization(txId));
ipcMain.handle('tax:profile:list',              ()                                      => taxProfileList());
ipcMain.handle('tax:profile:upsert',            (_e, data)                              => taxProfileUpsert(data));
ipcMain.handle('tax:profile:delete',            (_e, id)                                => taxProfileDelete(id));

// ── Bilan (Balance Sheet) — Sprint 6 ─────────────────────────────────────────
try {
ipcMain.handle('bilan:compute',          (_e, asOfDate, opts)  => buildBalanceSheet(asOfDate, opts || {}));
ipcMain.handle('bilan:blockers',         (_e, asOfDate)        => getBalanceSheetBlockers(asOfDate));
ipcMain.handle('bilan:snapshot:save',    (_e, data)            => balanceSheetSnapshotSave(data));
ipcMain.handle('bilan:snapshot:list',    ()                    => balanceSheetSnapshotList());
ipcMain.handle('bilan:snapshot:get',     (_e, id)              => balanceSheetSnapshotGet(id));

// ── Supplier Bills (AP) — Sprint 6 ───────────────────────────────────────────
ipcMain.handle('supplier:bill:list',     (_e, opts)            => supplierBillList(opts || {}));
ipcMain.handle('supplier:bill:create',   (_e, data)            => supplierBillCreate(data));
ipcMain.handle('supplier:bill:update',   (_e, id, data)        => supplierBillUpdate(id, data));
ipcMain.handle('supplier:bill:markPaid', (_e, id, payData)     => supplierBillMarkPaid(id, payData || {}));
ipcMain.handle('supplier:bill:markUnpaid',(_e, id)             => supplierBillMarkUnpaid(id));
ipcMain.handle('supplier:payments:list', (_e, billId)          => supplierPaymentsList(billId));
ipcMain.handle('supplier:payments:create',(_e, data)           => supplierPaymentCreate(data));

// ── Assets & CCA — Sprint 6 ───────────────────────────────────────────────────
ipcMain.handle('asset:list',   (_e, opts)              => assetList(opts || {}));
ipcMain.handle('asset:create', (_e, data)              => assetCreate(data));
ipcMain.handle('asset:update', (_e, id, data)          => assetUpdate(id, data));
ipcMain.handle('asset:delete', (_e, id)                => assetDelete(id));
ipcMain.handle('cca:classes',  ()                      => ccaClassesList());
ipcMain.handle('cca:compute',  (_e, assetId, year)     => ccaComputeForAsset(assetId, year));
ipcMain.handle('cca:schedule', (_e, year)              => ccaScheduleForYear(year));
} catch(e) { /* handlers already registered in hot-reload */ }

// ── Global Search — covers every data source in the app ───────────────────────
ipcMain.handle('search:global', async (_e, { query, limit = 5 }) => {
  if (!query || query.trim().length === 0) {
    return { results: {}, history: searchHistoryGet(5) };
  }

  const q = query.trim().toLowerCase();
  // Accent-normalized query — strips diacritics so "ete" matches "été", "caisse" matches "caïsse"
  const normalize = s => !s ? '' : String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const nq = normalize(q);
  const results = {};

  // ── kv_store helpers ──
  const readKV = (key) => {
    try {
      const row = storageGet(key);
      if (!row?.value) return [];
      const parsed = JSON.parse(row.value);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) { return []; }
  };

  const readKVObj = (key) => {
    try {
      const row = storageGet(key);
      return row?.value ? JSON.parse(row.value) : {};
    } catch (_) { return {}; }
  };

  // matchStr: accent-insensitive substring match. "ete" matches "été", "caisse" matches "caïsse".
  const matchStr = (str) => {
    if (!str) return false;
    const nt = normalize(str);
    return nt.includes(nq);
  };
  // scoreMatch: rank by match quality (3=exact, 2=starts-with, 1=contains, 0=no match)
  const scoreMatch = (str) => {
    if (!str) return 0;
    const nt = normalize(str);
    if (nt === nq) return 3;
    if (nt.startsWith(nq)) return 2;
    if (nt.includes(nq)) return 1;
    return 0;
  };

  // ── Numeric query parsing — handles French format (2 335,51) and English (2,335.51) ──
  const parseNumericQuery = (raw) => {
    let s = raw.replace(/[$\s]/g, ''); // strip $ and spaces (thousands sep in FR)
    // French decimal: comma followed by 1-2 digits at end → convert to period
    if (/,\d{1,2}$/.test(s)) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, ''); // English: comma is thousands separator
    }
    return parseFloat(s);
  };
  const numQ = parseNumericQuery(q);
  const isNumericSearch = !isNaN(numQ) && numQ > 0;

  // ── Clients (dicann-fac-clients) ──
  const clients = readKV('dicann-fac-clients');
  results.clients = clients
    .map(c => {
      const score = Math.max(scoreMatch(c.entreprise), scoreMatch(c.courriel), scoreMatch(c.telephone), scoreMatch(c.ville), scoreMatch(c.code), scoreMatch(c.adresse), scoreMatch(c.adresse2));
      return score > 0 ? { ...c, _score: score } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b._score - a._score)
    .slice(0, limit)
    .map(c => ({ id: c.id, entreprise: c.entreprise || '', courriel: c.courriel || '', ville: c.ville || '', code: c.code || '' }));

  // ── Invoices/Factures (dicann-fac-factures) — also soumissions, commandes, credit notes ──
  const factures = readKV('dicann-fac-factures');
  const soumissions = readKV('dicann-fac-soumissions');
  const commandes = readKV('dicann-fac-commandes');
  const creditNotes = readKV('dicann-fac-creditnotes');
  const allDocs = [...factures, ...soumissions, ...commandes, ...creditNotes];

  results.invoices = allDocs
    .map(f => {
      const cl = clients.find(c => c.id === f.clientId);
      const numericMatch = isNumericSearch && Math.abs((f.total || 0) - numQ) < 1;
      const score = Math.max(
        scoreMatch(f.numero), scoreMatch(f.referenceClient), scoreMatch(cl?.entreprise),
        (f.lignes || []).reduce((s, l) => Math.max(s, scoreMatch(l.description)), 0),
        numericMatch ? 1 : 0
      );
      return score > 0 ? { ...f, _score: score, _cl: cl } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b._score - a._score)
    .slice(0, limit)
    .map(f => {
      const total = typeof f.total === 'number' ? f.total
        : (f.lignes || []).reduce((s, l) => s + ((l.quantite || 1) * (l.prixUnitaire || 0)), 0);
      return { id: f.id, numero: f.numero || '', clientName: f._cl?.entreprise || '', total, date: f.date || '', statut: f.statut || '', type: f._type || 'facture' };
    });

  // ── Employees (dicann-emp-roster) ──
  const employees = readKV('dicann-emp-roster');
  results.employees = employees
    .map(e => {
      const fullName = `${e.prenom || ''} ${e.nom || ''}`.trim();
      const score = Math.max(scoreMatch(e.nom), scoreMatch(e.prenom), scoreMatch(fullName), scoreMatch(e.role));
      return score > 0 ? { ...e, _score: score } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b._score - a._score)
    .slice(0, limit)
    .map(e => ({ id: e.id, nom: `${e.prenom || ''} ${e.nom || ''}`.trim(), role: e.role || '' }));

  // ── Cashiers / Roster (dicann-roster) ──
  const roster = readKV('dicann-roster');
  results.cashiers = roster
    .filter(r => matchStr(r.name) || matchStr(r.nom))
    .slice(0, limit)
    .map(r => ({ id: r.id, name: r.name || r.nom || '' }));

  // ── Suppliers (dicann-suppliers-v2) ──
  const suppliersV2 = readKV('dicann-suppliers-v2');
  results.suppliers = suppliersV2
    .map(s => {
      const score = Math.max(scoreMatch(s.name), scoreMatch(s.category), scoreMatch(s.id));
      return score > 0 ? { ...s, _score: score } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b._score - a._score)
    .slice(0, limit)
    .map(s => ({ key: `sup_${s.id}`, name: s.name || '', category: s.category || '' }));

  // ── Daily totals (dicann-v7) — numeric search only ──
  // Checks: net sales (posVentes), gross total (posVentes+TPS+TVQ), manual count
  // (interac+finalCash+deposits) — both day-level and per-register.
  // Also checks dayObj.venteNet directly (present in demo/legacy data).
  results.dailyTotals = [];
  if (isNumericSearch) {
    try {
      const dailyRaw = storageGet('dicann-v7');
      if (dailyRaw?.value) {
        const dailyData = JSON.parse(dailyRaw.value);
        for (const [date, dayObj] of Object.entries(dailyData || {})) {
          let matched = false;

          // Legacy / demo data stores venteNet directly on the day object
          if (!matched && dayObj.venteNet && Math.abs(dayObj.venteNet - numQ) < 1) matched = true;

          // Compute from cashes array (real data) — field is "cashes" (not "caisses")
          if (!matched) {
            const cashes = Array.isArray(dayObj?.cashes) ? dayObj.cashes : [];
            let posVN = 0, grossT = 0, manT = 0;
            for (const c of cashes) {
              const pv = parseFloat(c.posVentes) || 0;
              const tps = parseFloat(c.posTPS) || 0;
              const tvq = parseFloat(c.posTVQ) || 0;
              const man = (parseFloat(c.interac) || 0) + (parseFloat(c.finalCash) || 0) + (parseFloat(c.deposits) || 0);
              posVN += pv; grossT += pv + tps + tvq; manT += man;

              // Per-register match
              if (!matched && (Math.abs(pv - numQ) < 1 || Math.abs(pv + tps + tvq - numQ) < 1 || Math.abs(man - numQ) < 1)) matched = true;
            }
            // Day-level sums
            if (!matched && posVN > 0 && Math.abs(posVN - numQ) < 1) matched = true;
            if (!matched && grossT > 0 && Math.abs(grossT - numQ) < 1) matched = true;
            if (!matched && manT > 0 && Math.abs(manT - numQ) < 1) matched = true;
          }

          if (matched) {
            // Compute display total (gross = posVentes+TPS+TVQ, fall back to venteNet)
            const cashes = Array.isArray(dayObj?.cashes) ? dayObj.cashes : [];
            const displayTotal = cashes.length > 0
              ? cashes.reduce((s, c) => s + (parseFloat(c.posVentes) || 0) + (parseFloat(c.posTPS) || 0) + (parseFloat(c.posTVQ) || 0), 0)
              : (dayObj.venteNet || 0);
            results.dailyTotals.push({ date, total: displayTotal || numQ });
            if (results.dailyTotals.length >= limit) break;
          }
        }
      }
    } catch (_) {}
  }

  // ── Ingredients (FTS5 — SQLite table) ──
  results.ingredients = searchIngredients(query, limit);

  // ── Forecast products (FTS5 — SQLite table) ──
  results.forecastProducts = searchForecastProducts(query, limit);

  // ── Daily text search — notes + cashier names (dicann-v7) ──
  results.dailyEntries = [];
  try {
    const dailyRaw = storageGet('dicann-v7');
    if (dailyRaw?.value) {
      const dailyData = JSON.parse(dailyRaw.value);
      const matches = [];
      for (const [date, dayObj] of Object.entries(dailyData || {})) {
        if (dayObj.notes && String(dayObj.notes).toLowerCase().includes(q)) {
          matches.push({ type: 'daily_note', date, reason: 'note', preview: String(dayObj.notes).substring(0, 80) });
        } else {
          const cashes = Array.isArray(dayObj?.cashes) ? dayObj.cashes : [];
          for (const c of cashes) {
            if (c.cashier && String(c.cashier).toLowerCase().includes(q)) {
              matches.push({ type: 'daily_cashier', date, reason: 'cashier', cashier: c.cashier });
              break;
            }
          }
        }
        if (matches.length >= limit) break;
      }
      results.dailyEntries = matches.slice(0, limit);
    }
  } catch (_) {}

  // ── P&L monthly bills — search all dicann-pl-* keys ──
  // Build supplier display-name lookup: P&L key = "sup_${s.id}", names from dicann-suppliers-v2
  results.plBills = [];
  try {
    const supplierNameMap = {};
    suppliersV2.forEach(s => {
      if (s.id) supplierNameMap[`sup_${s.id}`] = s.name || s.id;
    });
    // Also map expense items: P&L key = "exp_${item.id}", labels from dicann-pl-expense-items
    const expenseItems = readKV('dicann-pl-expense-items');
    expenseItems.forEach(item => {
      if (item.id) supplierNameMap[`exp_${item.id}`] = item.label || item.name || item.id;
    });

    const plRows = storageGetByPrefix('dicann-pl-');
    const plMatches = [];
    for (const row of plRows) {
      if (plMatches.length >= limit) break;
      try {
        const plData = JSON.parse(row.value);
        const month = row.key.replace('dicann-pl-', '');
        for (const [k, v] of Object.entries(plData)) {
          if (!k.endsWith('_bills') || !Array.isArray(v)) continue;
          const supplierKey = k.replace('_bills', '');
          const displayName = supplierNameMap[supplierKey] || supplierKey;
          const supplierMatches = matchStr(displayName) || matchStr(supplierKey);
          for (const bill of v) {
            const amtStr = bill.amount != null ? String(Number(bill.amount).toFixed(2)) : '';
            const billMatches = matchStr(bill.note) || matchStr(amtStr) ||
              (isNumericSearch && bill.amount != null && Math.abs(bill.amount - numQ) < 0.02);
            if (supplierMatches || billMatches) {
              plMatches.push({ type: 'pl_bill', month, supplierKey, supplierName: displayName, note: bill.note || '', amount: bill.amount || 0, date: bill.date || month });
              if (plMatches.length >= limit) break;
            }
          }
          if (plMatches.length >= limit) break;
        }
      } catch (_) {}
    }
    results.plBills = plMatches.slice(0, limit);
  } catch (_) {}

  // ── P&L expense categories (dicann-pl-expense-items) — search by label/name ──
  results.expenseItems = readKV('dicann-pl-expense-items')
    .map(item => {
      const score = Math.max(scoreMatch(item.label), scoreMatch(item.name));
      return score > 0 ? { ...item, _score: score } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b._score - a._score)
    .slice(0, limit)
    .map(item => ({ id: item.id, label: item.label || item.name || '' }));

  // ── Encaisse — sorties, autreEntrees, notes (dicann-encaisse) ──
  // Fix: sorties use field `categorie` (French) not `category`
  results.encaisseEntries = [];
  try {
    const encRaw = storageGet('dicann-encaisse');
    if (encRaw?.value) {
      const encData = JSON.parse(encRaw.value);
      const matches = [];
      for (const [date, dayObj] of Object.entries(encData || {})) {
        if (date.startsWith('_')) continue;
        let matched = false;
        if (dayObj.notes && String(dayObj.notes).toLowerCase().includes(q)) {
          matches.push({ type: 'encaisse_note', date, preview: String(dayObj.notes).substring(0, 80) });
          matched = true;
        }
        if (!matched) {
          for (const s of (Array.isArray(dayObj.sorties) ? dayObj.sorties : [])) {
            if (matchStr(s.categorie) || matchStr(s.description) || matchStr(s.note)) {
              matches.push({ type: 'encaisse_sortie', date, category: s.categorie || s.description || '', amount: s.montant || 0 });
              matched = true; break;
            }
          }
        }
        if (!matched) {
          for (const e of (Array.isArray(dayObj.autreEntrees) ? dayObj.autreEntrees : [])) {
            if (matchStr(e.description)) {
              matches.push({ type: 'encaisse_entree', date, description: e.description || '', amount: e.montant || 0 });
              matched = true; break;
            }
          }
        }
        if (matches.length >= limit) break;
      }
      results.encaisseEntries = matches.slice(0, limit);
    }
  } catch (_) {}

  // ── Delivery platforms (dicann-platforms) ──
  results.platforms = [];
  try {
    const platRaw = storageGet('dicann-platforms');
    if (platRaw?.value) {
      results.platforms = JSON.parse(platRaw.value)
        .filter(p => matchStr(p.name) || matchStr(p.id))
        .slice(0, limit)
        .map(p => ({ id: p.id, name: p.name, emoji: p.emoji || '' }));
    }
  } catch (_) {}

  // ── Facturation products catalog (dicann-fac-produits) ──
  results.facProducts = readKV('dicann-fac-produits')
    .filter(p => p.actif !== false && (matchStr(p.description) || matchStr(p.code) || matchStr(p.notes)))
    .slice(0, limit)
    .map(p => ({ id: p.id, code: p.code || '', description: p.description || '', prix: p.prixUnitaire || 0 }));

  // ── Facturation categories (dicann-fac-categories) ──
  results.facCategories = readKV('dicann-fac-categories')
    .filter(c => c.actif !== false && matchStr(c.nom))
    .slice(0, limit)
    .map(c => ({ id: c.id, nom: c.nom || '' }));

  // ── Recurring invoice templates (dicann-fac-recurrents) ──
  results.recurrents = [];
  try {
    const recurrents = readKV('dicann-fac-recurrents');
    const clients = readKV('dicann-fac-clients');
    results.recurrents = recurrents
      .filter(r => {
        if (!r.actif) return false;
        if (matchStr(r.description)) return true;
        const cl = clients.find(c => c.id === r.clientId);
        if (matchStr(cl?.entreprise)) return true;
        return (r.lignes || []).some(l => matchStr(l.description));
      })
      .slice(0, limit)
      .map(r => {
        const cl = clients.find(c => c.id === r.clientId);
        return { id: r.clientId, description: r.description || '', clientName: cl?.entreprise || '', frequence: r.frequence || '' };
      });
  } catch (_) {}

  // ── Franchise locations (balanceiq-locations) ──
  results.locations = readKV('balanceiq-locations')
    .filter(l => matchStr(l.nom) || matchStr(l.name) || matchStr(l.adresse) || matchStr(l.ville))
    .slice(0, limit)
    .map(l => ({ id: l.id, nom: l.nom || l.name || '', ville: l.ville || '' }));

  // ── Waste entries (SQLite waste_entries table) ──
  results.wasteEntries = searchWasteEntries(q, limit).map(w => ({
    id: w.id, date: w.date,
    ingredientName: w.name_fr || w.name_en || '',
    category: w.category || '', reason: w.reason || '',
    notes: w.notes || '', dollarValue: w.dollar_value || 0,
  }));

  return { results, history: [] };
});

ipcMain.handle('search:save-history', async (_e, { query, result_type, result_id }) => {
  searchHistorySave(query, result_type, result_id);
});

// ── Source Document Vault ─────────────────────────────────────────────────────
const crypto = require('crypto');

const VAULT_ROOT = () => path.join(os.homedir(), 'Documents', 'BalanceIQ Vault');

function vaultFilePath(year, month, sha256prefix, fileName) {
  const dir = path.join(VAULT_ROOT(), String(year), String(month).padStart(2, '0'));
  fs.mkdirSync(dir, { recursive: true });
  const safe = path.basename(fileName).replace(/[^a-zA-Z0-9._\-]/g, '_');
  return path.join(dir, `${sha256prefix.slice(0, 8)}_${safe}`);
}

ipcMain.handle('vault:attach', async (_e, { entity_type, entity_id, src_path, file_name, mime_type }) => {
  try {
    let filePath = src_path;
    if (!filePath) {
      const result = await dialog.showOpenDialog({ properties: ['openFile'], title: 'Sélectionner un document' });
      if (result.canceled || !result.filePaths.length) return { ok: false, error: 'cancelled' };
      filePath = result.filePaths[0];
    }
    const buf = fs.readFileSync(filePath);
    const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const fname = file_name || path.basename(filePath);
    const dest = vaultFilePath(year, month, sha256, fname);
    fs.copyFileSync(filePath, dest);
    const relPath = path.relative(VAULT_ROOT(), dest);
    const size_bytes = buf.length;
    const mimeType = mime_type || (fname.endsWith('.pdf') ? 'application/pdf' : fname.match(/\.(jpg|jpeg)$/i) ? 'image/jpeg' : fname.endsWith('.png') ? 'image/png' : 'application/octet-stream');
    const doc = vaultAttach({ entity_type, entity_id, file_name: fname, file_path: relPath, mime_type: mimeType, size_bytes, sha256 });
    return { ok: true, doc };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('vault:attachFile', async (_e, { entity_type, entity_id, file_name, mime_type, data_base64 }) => {
  try {
    const buf = Buffer.from(data_base64, 'base64');
    const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const dest = vaultFilePath(year, month, sha256, file_name);
    fs.writeFileSync(dest, buf);
    const relPath = path.relative(VAULT_ROOT(), dest);
    const doc = vaultAttach({ entity_type, entity_id, file_name, file_path: relPath, mime_type: mime_type || null, size_bytes: buf.length, sha256 });
    return { ok: true, doc };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('vault:list',    (_e, entity_type, entity_id) => vaultList(entity_type, entity_id));
ipcMain.handle('vault:listAll', (_e, opts) => vaultListAll(opts || {}));
ipcMain.handle('vault:search',  (_e, query) => vaultSearch(query));
ipcMain.handle('vault:stats',   () => vaultGetStats());
ipcMain.handle('vault:orphans', () => vaultGetOrphans());
ipcMain.handle('vault:reassign',(_e, id, entity_type, entity_id) => vaultReassign(id, entity_type, entity_id));

// Returns the resolved absolute path only if it stays inside the vault root.
// Guards all vault file ops against path traversal via malicious DB values or IPC args.
function resolveVaultPath(relOrAbs) {
  const root = path.resolve(VAULT_ROOT());
  const resolved = path.resolve(path.join(root, relOrAbs));
  if (!resolved.startsWith(root + path.sep) && resolved !== root) return null;
  return resolved;
}

ipcMain.handle('vault:open', (_e, docId) => {
  const { rows } = vaultListAll({ limit: 9999 });
  const doc = rows.find(d => d.id === docId);
  if (!doc) return { ok: false, error: 'Not found' };
  const abs = resolveVaultPath(doc.file_path);
  if (!abs) return { ok: false, error: 'Invalid document path' };
  if (!fs.existsSync(abs)) return { ok: false, error: 'File not found on disk' };
  shell.openPath(abs);
  return { ok: true };
});

ipcMain.handle('vault:openById', (_e, docId) => {
  const { rows } = vaultListAll({ limit: 9999 });
  const doc = rows.find(d => d.id === docId);
  if (!doc) return { ok: false, error: 'Not found' };
  const abs = resolveVaultPath(doc.file_path);
  if (!abs) return { ok: false, error: 'Invalid document path' };
  if (!fs.existsSync(abs)) return { ok: false, error: 'File not found on disk' };
  shell.openPath(abs);
  return { ok: true };
});

ipcMain.handle('vault:delete', async (_e, docId) => {
  try {
    const result = vaultDelete(docId);
    if (!result.ok) return result;
    if (result.file_path) {
      const abs = resolveVaultPath(result.file_path);
      if (abs && fs.existsSync(abs)) fs.unlinkSync(abs);
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('vault:exportYear', async (_e, year) => {
  try {
    // Reject anything that is not a 4-digit calendar year (2000-2099).
    const yearNum = parseInt(String(year), 10);
    if (isNaN(yearNum) || yearNum < 2000 || yearNum > 2099) {
      return { ok: false, error: 'Invalid year' };
    }
    const yearDir = resolveVaultPath(String(yearNum));
    if (!yearDir) return { ok: false, error: 'Invalid year path' };
    if (!fs.existsSync(yearDir)) return { ok: false, error: 'No vault documents for this year' };
    const { filePath } = await dialog.showSaveDialog({
      title: `Exporter les documents ${yearNum}`,
      defaultPath: `BalanceIQ_Vault_${yearNum}`,
      properties: ['createDirectory'],
    });
    if (!filePath) return { ok: false, error: 'cancelled' };
    fs.mkdirSync(filePath, { recursive: true });
    const copyDir = (src, dest) => {
      fs.mkdirSync(dest, { recursive: true });
      for (const entry of fs.readdirSync(src)) {
        const s = path.join(src, entry);
        const d = path.join(dest, entry);
        if (fs.statSync(s).isDirectory()) copyDir(s, d);
        else fs.copyFileSync(s, d);
      }
    };
    copyDir(yearDir, filePath);
    shell.showItemInFolder(filePath);
    return { ok: true, dest: filePath };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('vault:openRoot', () => {
  const root = VAULT_ROOT();
  fs.mkdirSync(root, { recursive: true });
  shell.openPath(root);
  return { ok: true };
});

// ── Recurring Rules ────────────────────────────────────────────────────────────

ipcMain.handle('recurring:list',       (_e, opts)      => recurringRuleList(opts || {}));
ipcMain.handle('recurring:create',     (_e, data)      => recurringRuleCreate(data));
ipcMain.handle('recurring:update',     (_e, id, data)  => recurringRuleUpdate(id, data));
ipcMain.handle('recurring:deactivate', (_e, id)        => recurringRuleDeactivate(id));
ipcMain.handle('recurring:pending',    ()              => recurringPendingList());
ipcMain.handle('recurring:pendingCount',()             => recurringPendingCount());
ipcMain.handle('recurring:approve',    (_e, id)        => recurringApprove(id));
ipcMain.handle('recurring:skip',       (_e, id)        => recurringSkip(id));
ipcMain.handle('recurring:history',    (_e, ruleId)    => recurringHistoryList(ruleId));
ipcMain.handle('recurring:checkDue',   (_e, today)     => recurringCheckDue(today));

// ── Reminder Ladder ────────────────────────────────────────────────────────────

ipcMain.handle('reminder:ladder:list',   ()                  => reminderLadderList());
ipcMain.handle('reminder:ladder:create', (_e, data)          => reminderLadderCreate(data));
ipcMain.handle('reminder:ladder:update', (_e, id, data)      => reminderLadderUpdate(id, data));
ipcMain.handle('reminder:ladder:delete', (_e, id)            => reminderLadderDelete(id));

ipcMain.handle('reminder:step:list',     (_e, ladderId)      => reminderStepList(ladderId));
ipcMain.handle('reminder:step:create',   (_e, data)          => reminderStepCreate(data));
ipcMain.handle('reminder:step:update',   (_e, id, data)      => reminderStepUpdate(id, data));
ipcMain.handle('reminder:step:delete',   (_e, id)            => reminderStepDelete(id));

ipcMain.handle('reminder:log:list',      (_e, opts)          => reminderLogList(opts || {}));
ipcMain.handle('reminder:log:create',    (_e, data)          => reminderLogCreate(data));

ipcMain.handle('reminder:check',         (_e, factures)      => reminderCheckDue(factures || []));

// ── Deposit Schedules ──────────────────────────────────────────────────────────

ipcMain.handle('deposit:list',           (_e, commandeId)    => depositScheduleList(commandeId));
ipcMain.handle('deposit:create',         (_e, data)          => depositScheduleCreate(data));
ipcMain.handle('deposit:update',         (_e, id, data)      => depositScheduleUpdate(id, data));
ipcMain.handle('deposit:delete',         (_e, id)            => depositScheduleDelete(id));
ipcMain.handle('deposit:markGenerated',  (_e, id, factureId) => depositScheduleMarkGenerated(id, factureId));

// ── Document Number Registry ──────────────────────────────────────────────
ipcMain.handle('docnum:register',        (_e, docType, number, entityId) => docNumRegister(docType, number, entityId));
ipcMain.handle('docnum:checkConflicts',  (_e, docType, numbersList)      => docNumCheckConflicts(docType, numbersList));
ipcMain.handle('docnum:list',            (_e, docType)                   => docNumList(docType));

// ── Payment Plans ─────────────────────────────────────────────────────────
ipcMain.handle('paymentPlan:create',     (_e, data)              => paymentPlanCreate(data));
ipcMain.handle('paymentPlan:get',        (_e, parentInvoiceId)   => paymentPlanGet(parentInvoiceId));
ipcMain.handle('paymentPlan:update',     (_e, parentInvoiceId, data) => paymentPlanUpdate(parentInvoiceId, data));
ipcMain.handle('paymentPlan:cancel',     (_e, parentInvoiceId)   => paymentPlanCancel(parentInvoiceId));
ipcMain.handle('inventory:deduct:upsert',   (_e, args)           => inventoryDeductUpsert(args));
ipcMain.handle('inventory:deduct:delete',   (_e, invoiceId)      => inventoryDeductDeleteByInvoice(invoiceId));
ipcMain.handle('inventory:deduct:byProduct',(_e, productId)      => inventoryDeductListByProduct(productId));
ipcMain.handle('inventory:deduct:byDate',   (_e, date)           => inventoryDeductSummaryByDate(date));

// ── Stripe Merchant Payments ───────────────────────────────────────────────
// Uses the restaurant owner's own Stripe secret key (stored in apiConfig).
// Desktop-safe: no inbound webhook needed — status is polled on demand.

ipcMain.handle('stripe:createCheckout', async (_e, { secretKey, invoiceId, invoiceNum, amountCents, clientEmail, currency = 'cad' }) => {
  if (!secretKey || !amountCents) throw new Error('Missing secretKey or amountCents');
  const body = new URLSearchParams({
    mode: 'payment',
    'line_items[0][price_data][currency]': currency,
    'line_items[0][price_data][unit_amount]': String(Math.round(amountCents)),
    'line_items[0][price_data][product_data][name]': `Facture ${invoiceNum || invoiceId}`,
    'success_url': 'https://balanceiq.ca/payment-success?session_id={CHECKOUT_SESSION_ID}',
    'cancel_url': 'https://balanceiq.ca/payment-cancel',
    'metadata[invoice_id]': invoiceId || '',
    'metadata[invoice_num]': invoiceNum || '',
  });
  if (clientEmail) body.append('customer_email', clientEmail);
  const res = await net.fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${secretKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `Stripe error ${res.status}`);
  return { sessionId: data.id, url: data.url };
});

ipcMain.handle('stripe:checkSession', async (_e, { secretKey, sessionId }) => {
  if (!secretKey || !sessionId) throw new Error('Missing params');
  const res = await net.fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
    headers: { 'Authorization': `Bearer ${secretKey}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `Stripe error ${res.status}`);
  return { status: data.status, paymentStatus: data.payment_status, amountTotal: data.amount_total, currency: data.currency };
});

ipcMain.handle('stripe:testKey', async (_e, { secretKey }) => {
  if (!secretKey) throw new Error('No key provided');
  const res = await net.fetch('https://api.stripe.com/v1/account', {
    headers: { 'Authorization': `Bearer ${secretKey}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `Stripe error ${res.status}`);
  return { valid: true, businessName: data.business_profile?.name || data.display_name || data.id };
});

ipcMain.handle('stripe:generateQR', async (_e, { url, size = 180 }) => {
  const dataUrl = await QRCode.toDataURL(url, { width: size, margin: 1, errorCorrectionLevel: 'M' });
  return { dataUrl };
});

// ── Quote E-Acceptance (spec 3.9) ──────────────────────────────────────────

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const ACCEPTANCE_BASE_URL = `${SUPABASE_URL}/functions/v1/accept-quote`;

function generateAcceptanceToken() {
  const { randomBytes } = require('crypto');
  return randomBytes(16).toString('hex'); // 128-bit
}

// Send quote for acceptance: create token via edge function (has service role), return acceptance URL
ipcMain.handle('soumission:sendAcceptance', async (_e, { quoteId, quoteNumber, quoteHtml, clientName, clientEmail, operatorEmail, orgId, expiresAt }) => {
  if (!SUPABASE_URL) return { error: 'no_supabase', message: 'Supabase not configured.' };
  try {
    const anonKey = process.env.VITE_SUPABASE_ANON_KEY || '';
    const token = generateAcceptanceToken();
    const res = await net.fetch(`${ACCEPTANCE_BASE_URL}?action=create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': anonKey, 'Authorization': `Bearer ${anonKey}` },
      body: JSON.stringify({ token, org_id: orgId, quote_id: quoteId, quote_number: quoteNumber, quote_html: quoteHtml, client_name: clientName || null, client_email: clientEmail || null, operator_email: operatorEmail || null, expires_at: expiresAt }),
    });
    if (!res.ok) { const text = await res.text(); return { error: 'insert_failed', message: text }; }
    const acceptanceUrl = `https://biq-accept-quote.sweet-bird-4d5f.workers.dev?token=${token}`;
    return { ok: true, token, acceptanceUrl };
  } catch (e) {
    return { error: 'network_error', message: String(e?.message || e) };
  }
});

// Check acceptance status: poll via edge function
ipcMain.handle('soumission:checkAcceptance', async (_e, { token }) => {
  if (!SUPABASE_URL) return { error: 'no_supabase' };
  try {
    const anonKey = process.env.VITE_SUPABASE_ANON_KEY || '';
    const res = await net.fetch(`${ACCEPTANCE_BASE_URL}?action=check&token=${encodeURIComponent(token)}`, {
      headers: { 'apikey': anonKey, 'Authorization': `Bearer ${anonKey}` },
    });
    if (!res.ok) return { error: 'fetch_failed' };
    return await res.json();
  } catch (e) {
    return { error: 'network_error', message: String(e?.message || e) };
  }
});

// Revoke token: mark as expired via edge function
ipcMain.handle('soumission:revokeToken', async (_e, { token }) => {
  if (!SUPABASE_URL) return { error: 'no_supabase' };
  try {
    const anonKey = process.env.VITE_SUPABASE_ANON_KEY || '';
    const res = await net.fetch(`${ACCEPTANCE_BASE_URL}?action=revoke&token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': anonKey, 'Authorization': `Bearer ${anonKey}` },
    });
    return res.ok ? { ok: true } : { error: 'revoke_failed' };
  } catch (e) {
    return { error: 'network_error', message: String(e?.message || e) };
  }
});

// ── PAD / ACSS Debit (spec 3.11) ──────────────────────────────────────────

const PAD_BASE_URL = `${SUPABASE_URL}/functions/v1`;

ipcMain.handle('pad:createMandate', async (_e, { org_id, client_id, client_name, client_email, operator_email, followup_enabled, stripe_secret_key }) => {
  if (!SUPABASE_URL) return { error: 'no_supabase', message: 'Supabase not configured.' };
  try {
    const anonKey = process.env.VITE_SUPABASE_ANON_KEY || '';
    const res = await net.fetch(`${PAD_BASE_URL}/create-pad-mandate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': anonKey, 'Authorization': `Bearer ${anonKey}` },
      body: JSON.stringify({ org_id, client_id, client_name, client_email, operator_email, followup_enabled, stripe_secret_key }),
    });
    if (!res.ok) { const t = await res.text(); return { error: 'request_failed', message: t }; }
    return await res.json();
  } catch (e) {
    return { error: 'network_error', message: String(e?.message || e) };
  }
});

ipcMain.handle('pad:listMandates', async (_e, { org_id, client_id }) => {
  if (!SUPABASE_URL) return { error: 'no_supabase' };
  try {
    const anonKey = process.env.VITE_SUPABASE_ANON_KEY || '';
    let url = `${SUPABASE_URL}/rest/v1/pad_mandates?org_id=eq.${encodeURIComponent(org_id)}&order=created_at.desc`;
    if (client_id) url += `&client_id=eq.${encodeURIComponent(client_id)}`;
    const res = await net.fetch(url, {
      headers: { 'apikey': anonKey, 'Authorization': `Bearer ${anonKey}`, 'Accept': 'application/json' },
    });
    if (!res.ok) return { error: 'request_failed' };
    return { ok: true, mandates: await res.json() };
  } catch (e) {
    return { error: 'network_error', message: String(e?.message || e) };
  }
});

ipcMain.handle('pad:cancelMandate', async (_e, { org_id, mandate_id }) => {
  if (!SUPABASE_URL) return { error: 'no_supabase' };
  try {
    const anonKey = process.env.VITE_SUPABASE_ANON_KEY || '';
    const res = await net.fetch(`${SUPABASE_URL}/rest/v1/pad_mandates?id=eq.${encodeURIComponent(mandate_id)}&org_id=eq.${encodeURIComponent(org_id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'apikey': anonKey, 'Authorization': `Bearer ${anonKey}`, 'Prefer': 'return=minimal' },
      body: JSON.stringify({ status: 'cancelled', updated_at: new Date().toISOString() }),
    });
    return res.ok ? { ok: true } : { error: 'cancel_failed' };
  } catch (e) {
    return { error: 'network_error', message: String(e?.message || e) };
  }
});

ipcMain.handle('pad:chargeMandate', async (_e, { org_id, mandate_id, amount_cents, invoice_id, description }) => {
  if (!SUPABASE_URL) return { error: 'no_supabase' };
  try {
    const anonKey = process.env.VITE_SUPABASE_ANON_KEY || '';
    const res = await net.fetch(`${PAD_BASE_URL}/charge-pad-mandate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': anonKey, 'Authorization': `Bearer ${anonKey}` },
      body: JSON.stringify({ org_id, mandate_id, amount_cents, invoice_id, description }),
    });
    if (!res.ok) { const t = await res.text(); return { error: 'request_failed', message: t }; }
    return await res.json();
  } catch (e) {
    return { error: 'network_error', message: String(e?.message || e) };
  }
});

ipcMain.handle('pad:saveConfig', async (_e, { org_id, webhook_secret }) => {
  if (!SUPABASE_URL) return { error: 'no_supabase' };
  try {
    const anonKey = process.env.VITE_SUPABASE_ANON_KEY || '';
    const res = await net.fetch(`${PAD_BASE_URL}/set-pad-config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': anonKey, 'Authorization': `Bearer ${anonKey}` },
      body: JSON.stringify({ org_id, webhook_secret }),
    });
    if (!res.ok) { const t = await res.text(); return { error: 'request_failed', message: t }; }
    return await res.json();
  } catch (e) {
    return { error: 'network_error', message: String(e?.message || e) };
  }
});

ipcMain.handle('pad:runFollowup', async (_e, { org_id, resend_api_key, resend_from, operator_email }) => {
  if (!SUPABASE_URL) return { error: 'no_supabase' };
  try {
    const anonKey = process.env.VITE_SUPABASE_ANON_KEY || '';
    const res = await net.fetch(`${PAD_BASE_URL}/pad-followup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': anonKey, 'Authorization': `Bearer ${anonKey}` },
      body: JSON.stringify({ org_id, resend_api_key, resend_from, operator_email }),
    });
    if (!res.ok) { const t = await res.text(); return { error: 'request_failed', message: t }; }
    return await res.json();
  } catch (e) {
    return { error: 'network_error', message: String(e?.message || e) };
  }
});

// ── Accounting Export (Acomba / Sage 50 / QuickBooks) ─────────────────────

ipcMain.handle('ledger:exportAcomba', (_e, opts = {}) => {
  const { glExportLines } = require('./src/db/database.js');
  const rows = glExportLines(opts);
  const format = opts.format || 'acomba';
  let csv = '';
  let rowCount = 0;

  if (format === 'acomba') {
    csv = 'Date,No. compte,Description,Débit,Crédit,Projet,Taxe\n';
    for (const r of rows) {
      const debit  = r.debit_cents  > 0 ? (r.debit_cents  / 100).toFixed(2) : '';
      const credit = r.credit_cents > 0 ? (r.credit_cents / 100).toFixed(2) : '';
      const desc   = (r.line_memo || r.description || '').replace(/"/g, '""');
      csv += `${r.entry_date},${r.account_number},"${desc}",${debit},${credit},,\n`;
      rowCount++;
    }
  } else if (format === 'sage50') {
    csv = 'Réf,Date,No. compte,Nom du compte,Débit,Crédit,Description\n';
    for (const r of rows) {
      const debit  = (r.debit_cents  / 100).toFixed(2);
      const credit = (r.credit_cents / 100).toFixed(2);
      const acctName = (r.account_name_fr || '').replace(/"/g, '""');
      const desc = (r.description || '').replace(/"/g, '""');
      csv += `${r.entry_number || r.entry_id},${r.entry_date},${r.account_number},"${acctName}",${debit},${credit},"${desc}"\n`;
      rowCount++;
    }
  } else if (format === 'qb') {
    csv = '!TRNS\tTRNSTYPE\tDATE\tACCNT\tAMOUNT\tMEMO\n!SPL\tTRNSTYPE\tDATE\tACCNT\tAMOUNT\tMEMO\n!ENDTRNS\n';
    let prevEntryId = null;
    for (const r of rows) {
      const isFirst = r.entry_id !== prevEntryId;
      const amount = ((r.debit_cents - r.credit_cents) / 100).toFixed(2);
      const acctName = r.account_name_en || r.account_name_fr || '';
      const tag = isFirst ? 'TRNS' : 'SPL';
      csv += `${tag}\tGENERAL JOURNAL\t${r.entry_date}\t${acctName}\t${amount}\t${r.description || ''}\n`;
      if (isFirst && prevEntryId !== null) csv += 'ENDTRNS\n';
      prevEntryId = r.entry_id;
      rowCount++;
    }
    if (prevEntryId !== null) csv += 'ENDTRNS\n';
  }

  return { csv, rowCount };
});

// ── File Save Dialog ───────────────────────────────────────────────────────

ipcMain.handle('file:save', async (_e, { defaultPath, content }) => {
  const { filePath } = await dialog.showSaveDialog({ defaultPath });
  if (!filePath) return null;
  fs.writeFileSync(filePath, content, 'utf8');
  return { filePath };
});

// ── Supabase Proxy Fetch ───────────────────────────────────────────────────
// Routes Supabase HTTP calls through Electron's net module (main process) to
// bypass renderer window.fetch "Invalid value" validation in Electron 31.
// Restricted to our Supabase project host — prevents SSRF via renderer XSS.
ipcMain.handle('supabase:fetch', async (_e, { url, method, headers, body }) => {
  const _supabaseUrl = process.env.VITE_SUPABASE_URL || '';
  if (!_supabaseUrl) throw new Error('supabase_not_configured');
  const _supabaseHost = new URL(_supabaseUrl).host;
  const parsed = new URL(url);
  if (parsed.host !== _supabaseHost) throw new Error('forbidden_host');

  // Strip CR/LF from all header values — net.fetch enforces strict RFC 7230
  // validation that rejects headers containing newline characters (which can
  // be present in long env-var tokens due to copy-paste line wrapping).
  const cleanHeaders = {};
  for (const [k, v] of Object.entries(headers || {})) {
    cleanHeaders[k] = String(v).replace(/[\r\n]/g, '');
  }
  const opts = { method: method || 'GET', headers: cleanHeaders };
  if (body != null) opts.body = body;
  const res = await net.fetch(url, opts);
  const text = await res.text();
  const resHeaders = {};
  res.headers.forEach((value, key) => { resHeaders[key] = value; });
  return { ok: res.ok, status: res.status, statusText: res.statusText, headers: resHeaders, body: text };
});

// ── Cloud Sync Queue IPC ─────────────────────────────────────────────────────
ipcMain.handle('syncQueue:push',              (_e, key, value) => syncQueuePush(key, value));
ipcMain.handle('syncQueue:peek',              (_e, limit)      => syncQueuePeek(limit));
ipcMain.handle('syncQueue:delete',            (_e, id)         => syncQueueDelete(id));
ipcMain.handle('syncQueue:incrementAttempts', (_e, id)         => syncQueueIncrementAttempts(id));
ipcMain.handle('syncQueue:length',            ()               => syncQueueLength());

// ── Close Assurance ───────────────────────────────────────────────────────────
ipcMain.handle('close:policy:get',            (_e, locationId) => closePolicyGet(locationId));
ipcMain.handle('close:policy:save',           (_e, policy)     => closePolicySave(policy));
ipcMain.handle('close:session:get',           (_e, id)         => closeSessionGet(id));
ipcMain.handle('close:session:list',          (_e, opts)       => closeSessionList(opts || {}));
ipcMain.handle('close:session:createOrLoad',  (_e, opts)       => closeSessionCreateOrLoad(opts));
ipcMain.handle('close:variance:reveal',       (_e, closureId, actor) => closeVarianceReveal(closureId, actor));
ipcMain.handle('close:exception:list',        (_e, sessionId)  => closeExceptionList(sessionId));
ipcMain.handle('close:exception:acknowledge', (_e, id, actor, reason) => closeExceptionAcknowledge(id, actor, reason));
ipcMain.handle('close:evaluate',              (_e, opts)             => evaluateCloseAssurance(opts || {}));
ipcMain.handle('close:closure:save',          (_e, opts)             => registerClosureSave(opts || {}));

app.on('window-all-closed', () => {
  if (biqTray) { biqTray.destroy(); biqTray = null; }
  if (process.platform !== 'darwin') app.quit();
});
