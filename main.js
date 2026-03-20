const { app, BrowserWindow, ipcMain, net, dialog, shell, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { autoUpdater } = require('electron-updater');
const Sentry = require('@sentry/electron/main');

Sentry.init({
  dsn: 'https://e2c8c35467e699c99b0cbf2e87dd25c3@o4511028896071680.ingest.us.sentry.io/4511028913438720',
  environment: app.isPackaged ? 'production' : 'development',
});
const {
  storageGet, storageSet, storageGetAll,
  auditInsert, auditQuery, getDeviceId,
  snapshotSave, snapshotGetByDate, snapshotGetLatest, snapshotListDates,
  forecastProductsGetAll, forecastProductUpsert,
  forecastSalesGetForDate, forecastSalesGetForProduct, forecastSalesGetRange, forecastSalesUpsert, forecastSalesDeleteForDate,
  forecastWeatherGetRange, forecastWeatherUpsert,
  forecastCsvMappingsGetAll, forecastCsvMappingSave,
  learnedPatternsGetAll, learnedPatternUpsert,
  predAccuracyGetAll, predAccuracyGetForProduct, predAccuracyUpsert,
  insightsGetAll, insightsGetUnreadCount, insightUpsert, insightMarkRead, insightMarkAllRead,
} = require('./src/db/database.js');

const BACKUP_DIR = () => path.join(app.getPath('documents'), 'BalanceIQ Backups');
const BACKUP_KEEP_DAYS = 30;

// Module-level window reference (needed for pos:oauth-result events)
let mainWindow = null;

// POS secrets — main process only, never sent to renderer
const POS_SECRETS = {
  square: {
    sandbox:    { appSecret: 'sandbox-sq0csb-dJb-AprHSVame0buZDF9GfGBXa1ZI4VyrZH1pMh1q9U' },
    production: { appSecret: process.env.SQUARE_APP_SECRET || '' },
  },
  clover: {
    sandbox:    { appSecret: '87c503bc-596d-473d-e2af-7cea74f30e12' },
    production: { appSecret: process.env.CLOVER_APP_SECRET || '' },
  },
  shopify: {
    clientSecret: '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',
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

// Handle OAuth deep link callback (balanceiq://oauth/{posType}?code=xxx)
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

  const all = storageGetAll();

  // Build in same format as manual backup so restore button handles both
  const data = {
    liveData:  all['dicann-v7']          || {},
    roster:    all['dicann-roster']       || [],
    empRoster: all['dicann-emp-roster']   || [],
    suppliers: all['dicann-suppliers-v2'] || [],
    apiConfig: all['dicann-api-config']   || {},
    plData: {},
  };

  // Include all monthly P&L keys
  Object.entries(all).forEach(([key, val]) => {
    if (key.startsWith('dicann-pl-')) {
      data.plData[key.replace('dicann-pl-', '')] = val;
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

  const required = ['liveData', 'roster', 'empRoster', 'suppliers'];
  if (!required.every(k => k in data)) {
    return { error: "Fichier invalide — vérifier que c'est un backup BalanceIQ" };
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

  storageSet('dicann-v7', JSON.stringify(data.liveData));
  storageSet('dicann-roster', JSON.stringify(data.roster));
  storageSet('dicann-emp-roster', JSON.stringify(data.empRoster));
  storageSet('dicann-suppliers-v2', JSON.stringify(data.suppliers));
  if (data.apiConfig) storageSet('dicann-api-config', JSON.stringify(data.apiConfig));
  if (data.plData) {
    Object.entries(data.plData).forEach(([month, val]) => {
      storageSet(`dicann-pl-${month}`, JSON.stringify(val));
    });
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

  const isDev = !app.isPackaged;
  if (isDev) {
    win.loadURL('http://localhost:5173');
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }
}

// IPC handler — trigger update download + install
ipcMain.handle('updater:downloadAndInstall', () => {
  autoUpdater.downloadUpdate().catch(() => {});
});

ipcMain.handle('shell:openExternal', (_event, url) => {
  return shell.openExternal(url);
});

// ── POS INTEGRATION IPC ────────────────────────────────────────────────────

ipcMain.handle('pos:getCredentials', () => getPosCredentialsMeta());

const OAUTH_CALLBACK_URL = 'https://etiwnesxjypdwhxqnqqq.supabase.co/functions/v1/pos-oauth-callback';

ipcMain.handle('pos:startOAuth', async (_event, posType, shopDomain) => {
  const isDev = !app.isPackaged;
  let authUrl;
  if (posType === 'square') {
    const appId = isDev ? 'sandbox-sq0idb-vKGF3m-aVqnfr2d9YPC9cA' : 'sq0idp-8_k0M7m_P8VYYIYZbbF_nA';
    const base  = isDev ? 'https://connect.squareupsandbox.com' : 'https://connect.squareup.com';
    const p = new URLSearchParams({ client_id: appId, scope: 'PAYMENTS_READ ORDERS_READ MERCHANT_PROFILE_READ', redirect_uri: OAUTH_CALLBACK_URL, state: 'square' });
    authUrl = `${base}/oauth2/authorize?${p}`;
  } else if (posType === 'clover') {
    const base = isDev ? 'https://sandbox.dev.clover.com' : 'https://www.clover.com';
    const p = new URLSearchParams({ client_id: '5GTA1NCXTO5YY', redirect_uri: OAUTH_CALLBACK_URL, state: 'clover' });
    authUrl = `${base}/oauth/authorize?${p}`;
  } else if (posType === 'shopify' && shopDomain) {
    const shop = shopDomain.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const p = new URLSearchParams({ client_id: 'a728cf71c0b64c5d7e0694567a085d0d', scope: 'read_orders,read_products', redirect_uri: OAUTH_CALLBACK_URL, state: 'shopify' });
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
    const destPath = path.join(downloadsDir, filename);
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
    shell.openPath(destPath);
    return { ok: true, path: destPath };
  } catch(e) {
    return { error: e.message };
  }
});

// ── FORECAST IPC ──
ipcMain.handle('forecast:products:getAll', () => forecastProductsGetAll());
ipcMain.handle('forecast:products:upsert', (_e, p) => forecastProductUpsert(p));

ipcMain.handle('forecast:sales:getForDate', (_e, date) => forecastSalesGetForDate(date));
ipcMain.handle('forecast:sales:getForProduct', (_e, productId, limit) => forecastSalesGetForProduct(productId, limit));
ipcMain.handle('forecast:sales:getRange', (_e, from, to) => forecastSalesGetRange(from, to));
ipcMain.handle('forecast:sales:upsert', (_e, record) => forecastSalesUpsert(record));
ipcMain.handle('forecast:sales:deleteForDate', (_e, date) => forecastSalesDeleteForDate(date));

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
if (!app.requestSingleInstanceLock()) {
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

  // Auto-updater — only runs in packaged app (not dev)
  if (app.isPackaged) {
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;

    let updateIsAvailable = false;

    autoUpdater.on('update-available', () => {
      updateIsAvailable = true;
      BrowserWindow.getAllWindows().forEach(w =>
        w.webContents.send('update:available')
      );
    });

    autoUpdater.on('update-downloaded', () => {
      autoUpdater.quitAndInstall(false, true);
    });

    // Delay check so React has time to mount and register the listener
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch(() => {});
    }, 4000);

    // Allow renderer to poll in case it missed the event (e.g. slow mount)
    ipcMain.handle('updater:check', () => updateIsAvailable);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
