const { app, BrowserWindow, ipcMain, net, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { autoUpdater } = require('electron-updater');
const { storageGet, storageSet, storageGetAll, auditInsert, auditQuery, getDeviceId, snapshotSave, snapshotGetByDate, snapshotGetLatest, snapshotListDates } = require('./src/db/database.js');

const BACKUP_DIR = () => path.join(app.getPath('documents'), 'BalanceIQ Backups');
const BACKUP_KEEP_DAYS = 30;

// Module-level window reference (needed for pos:oauth-result events)
let mainWindow = null;

// POS secrets — main process only, never sent to renderer
const POS_SECRETS = {
  square: {
    sandbox:    { appSecret: 'SQUARE_SANDBOX_SECRET_REMOVED' },
    production: { appSecret: process.env.SQUARE_APP_SECRET || '' },
  },
  clover: {
    sandbox:    { appSecret: 'CLOVER_SANDBOX_SECRET_REMOVED' },
    production: { appSecret: process.env.CLOVER_APP_SECRET || '' },
  },
  shopify: {
    clientSecret: 'SHOPIFY_SECRET_REMOVED',
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

// IPC handler — gas price scraper (CAA Canada — prix moyen national, source statique)
// Note: La Régie de l'énergie charge ses prix via JavaScript (non scrappable).
// CAA Canada publie le prix moyen du jour en HTML statique sur https://www.caa.ca/gas-prices/
ipcMain.handle('gas:getPrice', async () => {
  const cheerio = require('cheerio');

  return new Promise((resolve) => {
    const req = net.request({
      url: 'https://www.caa.ca/gas-prices/',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'fr-CA,fr;q=0.9,en;q=0.8',
      },
    });

    req.on('response', (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        try {
          const html = Buffer.concat(chunks).toString('utf-8');
          const $ = cheerio.load(html);
          let priceCents = null;

          // Primary: today's average price in div.national_single_price — e.g. "150.5/L"
          const primaryText = $('div.national_single_price').first().text().trim();
          const primaryMatch = primaryText.match(/(\d{2,3}(?:\.\d{1,2})?)\s*\/L/);
          if (primaryMatch) {
            priceCents = parseFloat(primaryMatch[1]);
          }

          // Fallback: any element with class containing "single_price"
          if (!priceCents) {
            $('[class*="single_price"]').each((_, el) => {
              if (priceCents) return;
              const m = $(el).text().match(/(\d{2,3}(?:\.\d{1,2})?)\s*\/L/);
              if (m) priceCents = parseFloat(m[1]);
            });
          }

          // Fallback 2: raw HTML — any "NNN.N/L" pattern in reasonable range
          if (!priceCents) {
            const m = html.match(/\b(1[2-9]\d(?:\.\d{1,2})?)\s*\/L/);
            if (m) priceCents = parseFloat(m[1]);
          }

          if (priceCents && priceCents > 80 && priceCents < 350) {
            resolve({ price: (priceCents / 100).toFixed(3) });
          } else {
            resolve({ error: 'Prix introuvable — vérifier la connexion internet.' });
          }
        } catch (err) {
          resolve({ error: 'Erreur de traitement de la page.' });
        }
      });
      response.on('error', () => resolve({ error: 'Erreur réseau.' }));
    });

    req.on('error', () => resolve({ error: 'Erreur réseau — vérifier la connexion internet.' }));
    req.end();
  });
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
        let totalCents = 0, deliveryCents = 0;
        for (const p of payments) {
          const amt = p.amount_money?.amount ?? 0;
          totalCents += amt;
          if (p.source_type === 'EXTERNAL' && p.external_details?.type === 'DELIVERY') deliveryCents += amt;
        }
        const posVentes = totalCents / 100;
        registers.push({ name: loc.name || `Caisse ${registers.length + 1}`, posVentes, posTPS: Math.round(posVentes * 0.05 * 100) / 100, posTVQ: Math.round(posVentes * 0.09975 * 100) / 100, posLivraisons: deliveryCents / 100 });
      }
      return { registers };
    }
    if (posType === 'clover') {
      const start = new Date(`${dateStr}T00:00:00-05:00`).getTime();
      const end   = new Date(`${dateStr}T23:59:59-05:00`).getTime();
      const res = await netRequest({ method: 'GET', url: `${posBaseUrl('clover')}/v3/merchants/${cred.merchantId}/orders?filter=createdTime>=${start}&limit=200`, headers: { Authorization: `Bearer ${cred.accessToken}` } });
      const orders = (res.body?.elements || []).filter(o => o.state === 'locked');
      let totalCents = 0;
      for (const o of orders) totalCents += ((o.total ?? 0) - (o.taxAmount ?? 0));
      const posVentes = totalCents / 100;
      return { registers: [{ name: cred.merchantName || 'Clover', posVentes, posTPS: Math.round(posVentes * 0.05 * 100) / 100, posTVQ: Math.round(posVentes * 0.09975 * 100) / 100, posLivraisons: 0 }] };
    }
    if (posType === 'shopify') {
      const params = new URLSearchParams({ status: 'any', financial_status: 'paid', source_name: 'pos', created_at_min: `${dateStr}T00:00:00-05:00`, created_at_max: `${dateStr}T23:59:59-05:00`, limit: '250' });
      const res = await netRequest({ method: 'GET', url: `https://${cred.shopDomain}/admin/api/2024-01/orders.json?${params}`, headers: { 'X-Shopify-Access-Token': cred.accessToken } });
      const orders = res.body?.orders || [];
      let totalNet = 0;
      for (const o of orders) totalNet += parseFloat(o.subtotal_price ?? 0);
      const posVentes = Math.round(totalNet * 100) / 100;
      return { registers: [{ name: cred.shopName || 'Shopify POS', posVentes, posTPS: Math.round(posVentes * 0.05 * 100) / 100, posTVQ: Math.round(posVentes * 0.09975 * 100) / 100, posLivraisons: 0 }] };
    }
  } catch (err) { return { error: err.message }; }
  return { error: 'Unknown POS type' };
});

// Register balanceiq:// as protocol handler for OAuth callbacks
app.setAsDefaultProtocolClient('balanceiq');

// macOS: deep link via open-url event
app.on('open-url', (event, url) => {
  event.preventDefault();
  if (url.startsWith('balanceiq://oauth/')) handlePosOAuthCallback(url);
});

// Windows: deep link arrives as second argv when app is already running
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    const url = argv.find(a => a.startsWith('balanceiq://oauth/'));
    if (url) handlePosOAuthCallback(url);
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

    autoUpdater.on('update-available', () => {
      BrowserWindow.getAllWindows().forEach(w =>
        w.webContents.send('update:available')
      );
    });

    autoUpdater.on('update-downloaded', () => {
      autoUpdater.quitAndInstall(false, true);
    });

    autoUpdater.checkForUpdates().catch(() => {});
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
