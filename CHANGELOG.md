# BalanceIQ — Changelog & Rollback Reference

This file documents every meaningful change made to the codebase, in reverse-chronological order.
Each entry includes what changed, why, and exactly how to roll it back if needed.

---

## Session 4 — March 7, 2026

### [4-A] Gas price scraper — IPC handler in main process

**What changed:** Added a real gas price scraper replacing the `alert()` placeholder.

**Files modified:**
- `main.js`
- `preload.js`
- `src/App.jsx`
- `package.json` (new dep: `cheerio`)

**Why:** The "Vérifier le prix" button previously did nothing. Wired it to fetch live gas price.

**Source decision:** Attempted Régie de l'énergie QC first — confirmed JS-rendered (no price data in static HTML). Switched to CAA Canada (`https://www.caa.ca/gas-prices/`) which publishes today's national average in static HTML inside `div.national_single_price` (e.g. `"150.5/L"` = 1.505 $/L).

---

#### `main.js` — what was added

Added `net` to the Electron require at line 1:
```js
// BEFORE:
const { app, BrowserWindow, ipcMain } = require('electron');

// AFTER:
const { app, BrowserWindow, ipcMain, net } = require('electron');
```

Added IPC handler block (insert after the `storage:set` handler, before `createWindow`):
```js
ipcMain.handle('gas:getPrice', async () => {
  const cheerio = require('cheerio');
  return new Promise((resolve) => {
    const req = net.request({
      url: 'https://www.caa.ca/gas-prices/',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ...',
        'Accept': 'text/html,...',
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
          const primaryText = $('div.national_single_price').first().text().trim();
          const primaryMatch = primaryText.match(/(\d{2,3}(?:\.\d{1,2})?)\s*\/L/);
          if (primaryMatch) priceCents = parseFloat(primaryMatch[1]);
          // + 2 fallback strategies ...
          if (priceCents && priceCents > 80 && priceCents < 350) {
            resolve({ price: (priceCents / 100).toFixed(3) });
          } else {
            resolve({ error: 'Prix introuvable — vérifier la connexion internet.' });
          }
        } catch (err) { resolve({ error: 'Erreur de traitement de la page.' }); }
      });
      response.on('error', () => resolve({ error: 'Erreur réseau.' }));
    });
    req.on('error', () => resolve({ error: 'Erreur réseau — vérifier la connexion internet.' }));
    req.end();
  });
});
```

**To roll back `main.js`:** Remove the `net` from the require destructuring, and delete the entire `ipcMain.handle('gas:getPrice', ...)` block.

---

#### `preload.js` — what was added

```js
// BEFORE:
contextBridge.exposeInMainWorld('api', {
  storage: {
    get: (key) => ipcRenderer.invoke('storage:get', key),
    set: (key, value) => ipcRenderer.invoke('storage:set', key, value),
  },
});

// AFTER:
contextBridge.exposeInMainWorld('api', {
  storage: {
    get: (key) => ipcRenderer.invoke('storage:get', key),
    set: (key, value) => ipcRenderer.invoke('storage:set', key, value),
  },
  gas: {
    getPrice: () => ipcRenderer.invoke('gas:getPrice'),
  },
});
```

**To roll back `preload.js`:** Remove the `gas: { ... }` block and its preceding comma.

---

#### `src/App.jsx` — what was added

**1. Two new state variables** (added after `const [editingSupName,...]`):
```js
const [gasCheckLoading,setGasCheckLoading]=useState(false);
const [gasCheckMsg,setGasCheckMsg]=useState(null);
```

**2. New `upd` position** — `upd` was moved up (before `checkGasPrice`) to avoid a temporal dead zone error that caused a blank screen. Original position was after `saveApiCfg`. The `const upd=useCallback(...)` line itself is unchanged.

**3. New `checkGasPrice` function** (added after `upd`):
```js
const checkGasPrice=useCallback(async()=>{
  setGasCheckLoading(true);setGasCheckMsg(null);
  try{
    const result=await window.api.gas.getPrice();
    if(result?.price){
      upd(selectedDate,"gas",result.price);
      setGasCheckMsg({ok:true,text:`✓ Prix mis à jour: ${Number(result.price).toFixed(3)} $/L`});
    }else{
      setGasCheckMsg({ok:false,text:"Impossible de vérifier — entrer le prix manuellement"});
    }
  }catch(e){
    setGasCheckMsg({ok:false,text:"Impossible de vérifier — entrer le prix manuellement"});
  }finally{
    setGasCheckLoading(false);
  }
},[selectedDate,upd]);
```

**4. Button replacement** — the old placeholder button:
```js
// BEFORE (single line):
<button onClick={()=>alert("Disponible lors de la prochaine mise à jour.")}
  style={{...}}>Vérifier le prix (Régie)</button>

// AFTER (button + status message):
<button onClick={checkGasPrice} disabled={gasCheckLoading}
  style={{...opacity:gasCheckLoading?0.65:1}}>
  {gasCheckLoading?"Vérification...":"Vérifier le prix (Régie de l'énergie)"}
</button>
{gasCheckMsg&&<div style={{fontSize:9.5,marginTop:2,padding:"1px 4px",
  color:gasCheckMsg.ok?"#16a34a":"#f97316"}}>{gasCheckMsg.text}</div>}
```

**To roll back `src/App.jsx`:**
1. Delete the two `gasCheckLoading`/`gasCheckMsg` useState lines
2. Move `upd` back to its original position (after `saveApiCfg`, not before `checkGasPrice`)
3. Delete the `checkGasPrice` useCallback block
4. Replace the button+message block with the original: `<button onClick={()=>alert("Disponible lors de la prochaine mise à jour.")} style={{marginTop:3,fontSize:9.5,padding:"3px 8px",borderRadius:4,border:"1px solid rgba(56,189,248,0.2)",background:"rgba(56,189,248,0.06)",color:"#38bdf8",cursor:"pointer",fontWeight:600,width:"100%",textAlign:"center"}}>Vérifier le prix (Régie)</button>`

---

#### `package.json` / `node_modules` — dependency added

```
npm install cheerio
```
Adds `cheerio` and its dependencies (~21 packages) to `node_modules` and `package-lock.json`.

**To roll back:** `npm uninstall cheerio` — also remove the `gas:getPrice` IPC handler first or it will throw on startup.

---

### [4-B] Bug fix — blank screen on startup

**What happened:** `checkGasPrice` was initially placed before `upd` in the component body. Since both use `const` (no hoisting), referencing `upd` in the deps array `[selectedDate, upd]` before it was declared threw a `ReferenceError` during render, causing a blank white screen.

**Fix:** Moved the `upd` declaration above `checkGasPrice`. No logic changed — just ordering.

**Lesson:** In a React component, any `useCallback`/`useMemo` that references another hook's return value in its deps array must come *after* that hook in the file.

---

## Session 4 (continued) — March 7, 2026

### [4-C] Electron-builder — icons + installers

**Files created:**
- `build/icon.png` — 1024×1024 source PNG
- `build/icon.icns` — macOS icon (10 sizes via `iconutil`)
- `build/icon.ico` — Windows icon (7 sizes via Pillow)
- `build/make-icons.py` — icon generation script (re-run if you need to regenerate)

**Files modified:**
- `package.json` — build config updated

**Outputs (in `release/`):**
- `release/BalanceIQ-1.0.0.dmg` — Mac Intel x64 (~103 MB)
- `release/BalanceIQ-1.0.0-arm64.dmg` — Mac Apple Silicon (~97 MB)
- `release/BalanceIQ Setup 1.0.0.exe` — Windows x64 NSIS installer (~79 MB)

**To rebuild icons:** `python3 build/make-icons.py`
**To rebuild Mac:** `npm run build:mac`
**To rebuild Windows (from Mac):** `npm run build:win` *(runs after build:mac, reuses existing dist/)*
**To rebuild everything:** `npm run build` *(vite build → mac → win in one command)*

**Key decisions:**
- `release/` directory used for all installer output (separate from `dist/` which is Vite's output)
- `build:win` does NOT re-run `vite build` — it reuses the existing `dist/` built by `build:mac`
- `asar: true` + `asarUnpack: ["node_modules/better-sqlite3/**/*"]` — native .node file unpacked from ASAR so it can be loaded by require() at runtime
- better-sqlite3 prebuilt binaries are downloaded automatically by electron-builder for each platform (darwin x64/arm64, win32 x64) — no cross-compilation needed
- No code signing configured — apps are unsigned. macOS will show a Gatekeeper warning on first launch (right-click → Open to bypass). For distribution, add an Apple Developer ID certificate.

**electron-builder config additions to package.json `"build"` section:**
```json
"directories": { "output": "release" },
"asar": true,
"asarUnpack": ["node_modules/better-sqlite3/**/*"],
"mac": {
  "icon": "build/icon.icns",
  "target": [{ "target": "dmg", "arch": ["x64", "arm64"] }]
},
"dmg": {
  "title": "BalanceIQ ${version}",
  "backgroundColor": "#0c0e14",
  "window": { "width": 540, "height": 380 },
  "contents": [
    { "x": 130, "y": 220, "type": "file" },
    { "x": 410, "y": 220, "type": "link", "path": "/Applications" }
  ]
},
"win": {
  "icon": "build/icon.ico",
  "target": [{ "target": "nsis", "arch": ["x64"] }]
},
"nsis": {
  "oneClick": false,
  "perMachine": false,
  "allowToChangeInstallationDirectory": true,
  "createDesktopShortcut": true,
  "createStartMenuShortcut": true,
  "shortcutName": "BalanceIQ"
}
```

**To roll back [4-C]:**
- Delete `build/icon.png`, `build/icon.icns`, `build/icon.ico`, `build/make-icons.py`
- Delete `release/` directory
- Restore the `"build"` section in `package.json` to the session 3 version:
```json
"build": {
  "appId": "com.balanceiq.app",
  "productName": "BalanceIQ",
  "files": ["dist/**/*","main.js","preload.js","src/db/database.js"],
  "mac": { "category": "public.app-category.business", "target": "dmg" },
  "win": { "target": "nsis" }
}
```

---

## Session 3 — March 6, 2026

### [3-A] Electron project scaffolded and working

**Files created:**
- `main.js` — Electron main process, IPC storage handlers
- `preload.js` — contextBridge exposing `window.api.storage`
- `src/App.jsx` — React app migrated from `app.jsx`
- `src/index.html` — entry HTML
- `src/index.jsx` — React entry point
- `src/db/database.js` — SQLite wrapper using `better-sqlite3`
- `vite.config.js` — Vite config (root: src, outDir: ../dist)
- `package.json` — all dependencies declared

**Key decisions:**
- `better-sqlite3` v12+ required (v9 is incompatible with Electron 31)
- Native rebuild needed: `npx electron-rebuild -f -w better-sqlite3`
- Dev: `npm start` runs Vite + Electron concurrently via `wait-on`

### [3-B] Branding — "Dic Ann's Ops" → "BalanceIQ"

- App header text changed to "BalanceIQ"
- Icon letters changed from "DA" to "BIQ"
- Window title set to "BalanceIQ" in `createWindow()`

### [3-C] Storage migration — `window.storage` → SQLite IPC

All `window.storage.get(key)` / `window.storage.set(key, value)` calls in `App.jsx` replaced with:
- `window.api.storage.get(key)` → IPC `storage:get`
- `window.api.storage.set(key, value)` → IPC `storage:set`

SQLite table: `kv_store(key TEXT PRIMARY KEY, value TEXT)`
DB file location: `app.getPath('userData')/balanceiq.db`

Storage keys in use:
- `dicann-v7` — all daily data
- `dicann-roster` — cashier names
- `dicann-emp-roster` — employee roster with wages
- `dicann-suppliers-v2` — supplier list
- `dicann-api-config` — API keys/config
- `dicann-pl-{YYYY-MM}` — monthly P&L (one key per month)
- `balanceiq-theme` — light/dark preference

---

## Sessions 1–2 — Pre-Electron (prototype in Claude.ai artifacts)

All feature development happened in the browser prototype (`app.jsx`).
That file is preserved at `/Users/anthonyzammit/balanceiq/app.jsx` as the original reference.
Do not delete it — it is the source of truth for all business logic.

---

## How to use this file for rollbacks

1. **Find the session** that introduced the change you want to undo.
2. **Follow the "To roll back" instructions** for that specific change.
3. **Restart the app** (`npm start`) to verify.
4. For dependency changes, run `npm install` after modifying `package.json` manually,
   or use `npm uninstall <package>`.

**The safest full rollback** for session 4 is:
1. Restore `main.js` to session 3 state (remove `net` + `gas:getPrice` handler)
2. Restore `preload.js` to session 3 state (remove `gas` block)
3. Restore `App.jsx` changes (remove state, function, button — swap back placeholder)
4. Run `npm uninstall cheerio`
