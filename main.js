const { app, BrowserWindow, ipcMain, net, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');
const { storageGet, storageSet, storageGetAll } = require('./src/db/database.js');

const BACKUP_DIR = () => path.join(app.getPath('documents'), 'BalanceIQ Backups');
const BACKUP_KEEP_DAYS = 30;

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
  const win = new BrowserWindow({
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
