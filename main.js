const { app, BrowserWindow, ipcMain, net } = require('electron');
const path = require('path');
const { storageGet, storageSet } = require('./src/db/database.js');

// IPC handlers for storage
ipcMain.handle('storage:get', (event, key) => {
  return storageGet(key);
});

ipcMain.handle('storage:set', (event, key, value) => {
  return storageSet(key, value);
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

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
