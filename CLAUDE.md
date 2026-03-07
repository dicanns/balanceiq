# CLAUDE.md — BalanceIQ

## What this project is

**BalanceIQ** is a franchise operations management desktop app, initially built for Dic Ann's (a Quebec hamburger franchise with 15+ locations). It replaces pen-and-paper daily close-out sheets, monthly P&L tracking, and gives franchisees analytics and intelligence on their operations.

The app is built as a React single-page application. It needs to be wrapped in Electron to produce .exe (Windows) and .dmg (Mac) installers. Browser `window.storage` needs to be replaced with SQLite for persistent local data.

**App name:** BalanceIQ
**Tagline:** L'intelligence derrière vos chiffres.
**Branding colors:** Orange gradient (#f97316 → #ea580c), dark background (#0c0e14)
**Logo text:** BIQ (for app icon) or BalanceIQ (for header)

## Current state

The prototype is a single React component (`app.jsx`) that was built and tested in Claude.ai's artifact system. It uses `window.storage` (a Claude.ai-specific API) for persistence. Everything works — the UI, calculations, reconciliation logic, P&L, intelligence analytics — it just needs to be converted to a proper Electron app with real storage.

## Architecture to build

```
balanceiq/
├── package.json
├── main.js                  # Electron main process
├── preload.js               # Bridge between main and renderer
├── src/
│   ├── App.jsx              # Main React app (from app.jsx)
│   ├── index.html           # Entry HTML — title: BalanceIQ
│   ├── index.jsx            # React entry point
│   ├── components/          # Break out components as needed
│   ├── db/
│   │   └── database.js      # SQLite wrapper (replaces window.storage)
│   └── services/
│       ├── weather.js        # Open-Meteo API integration
│       └── gas-scraper.js    # Régie de l'énergie scraper
├── ROADMAP.md
└── CLAUDE.md
```

## Key technical decisions

- **Electron** for desktop packaging (.exe + .dmg)
- **SQLite** via `better-sqlite3` for local data (replaces window.storage)
- **electron-builder** for creating installers
- **React** (already built) — keep the existing component structure
- **No server** — everything runs locally on the franchisee's computer
- **All UI text must be in French** — this is a Quebec product
- **App header should say "BalanceIQ"** instead of "Dic Ann's Ops"
- **App icon letters should be "BIQ"** with the orange gradient background

## Storage migration

The current app uses `window.storage.get(key)` and `window.storage.set(key, value)` where values are JSON strings. The SQLite replacement should expose the same simple key-value interface through Electron's IPC:

```javascript
// Current (browser):
await window.storage.get("dicann-v7")     // returns {key, value} or null
await window.storage.set("dicann-v7", jsonString)

// Replace with (Electron IPC):
await window.api.storage.get("dicann-v7")
await window.api.storage.set("dicann-v7", jsonString)
```

Storage keys used:
- `dicann-v7` — all daily data (cashes, inventory, employees, external factors, notes)
- `dicann-roster` — cashier name roster
- `dicann-emp-roster` — employee roster with wages
- `dicann-suppliers-v2` — supplier list for P&L
- `dicann-api-config` — API keys/config
- `dicann-pl-{YYYY-MM}` — monthly P&L data (one key per month)

## API integrations to wire

1. **Weather (Open-Meteo)** — free, no API key needed
   - Endpoint: `https://api.open-meteo.com/v1/forecast?latitude=45.5&longitude=-73.6&current=temperature_2m,weather_code`
   - Auto-fill weather and temperature on daily report

2. **Gas prices (Régie de l'énergie du Québec)** — scrape ✓ WIRED
   - Source: `https://www.regie-energie.qc.ca/fr/sources-d-energie/produits-petroliers/`
   - IPC channel: `gas:getPrice` — returns `{ price: "X.XXX" }` or `{ error: "..." }`
   - Uses Electron `net` module + `cheerio` to parse Montreal minimum price (¢/L → $/L)
   - Button shows loading state, auto-fills field on success, shows French error on failure
   - Fallback: auto-fill from last known price (already implemented in app)

3. **Auphan POS** — future, needs their API documentation
   - Config field exists for API key, wire when docs are available

## Business logic — critical formulas

### Cash reconciliation (per register)
```
Manual total = Interac + Livraisons + Dépôts + Cash_final - Float
POS total = Ventes_avant_taxes + TPS + TVQ + Livraisons_POS
Balanced = |Manual_total - POS_total| <= 1
```

### Daily calculations
```
Vente nette = sum of all cash register manual totals
TPS = Vente_nette × 0.05
TVQ = Vente_nette × 0.09975
Total brut = Vente_nette + TPS + TVQ
Moyenne per dozen = Vente_nette / (ham_used + hot_used)
Labour % = labour_cost / Vente_nette × 100
```

### Inventory carry-over
```
Today's start = Yesterday's end (automatic)
Used = Start + Received - End
Override available via hamStartOverride / hotStartOverride
```

### Bread checkpoints (Suivi du pain)
Stored in daily data as `hamB14`, `hamB17`, `hamB19`, `hamB20` (hamburger) and `hotB14`, `hotB17`, `hotB19`, `hotB20` (hot dog). Each value = dozens remaining at that hour.
```
Passé à heure X = (Début + Reçu) - Restant_à_X
Projection fin de journée = Consommé_jusqu'ici / fraction_du_jour_écoulée
  where fractions: 14h=1/4, 17h=2/4, 19h=3/4, 20h=4/4
```

### Intelligence — velocity profiles
`velocityProfiles[dow][windowIdx] = {ham: [], hot: []}` where windowIdx 0=Début→14h, 1=14h→17h, 2=17h→19h, 3=19h→20h. Computed from all historical entries with bread checkpoint data.

### Intelligence — predictive ordering (multi-factor)
Base = day-of-week average (ham/hot/sales). Adjustments:
- Rainy/snowy weather: −10%
- Sunny: +5%
- Cold (<5°C): −8%, Hot (>24°C): +8%
- Quebec holiday: +12%
Safety margin: +3 dz ham, +2 dz hot on top of adjusted base.

### Gas auto-fill
Walk back up to 14 days to find last entered gas price, show with "Confirmer" button. "Vérifier le prix" button scrapes Régie de l'énergie (wire in Electron).

## P&L structure
- Revenue: auto from daily data, with manual override
- Cost of goods: Petty cash F&P + supplier invoices (editable supplier list)
- Operating expenses: 16 categories (Hydro, Gaz Nat, Loyer, CSST, etc.)
- Labour: auto from daily employee entries, with monthly override
- Result: Revenue - F&P - Labour - Expenses = Net Profit
- Email reports to: info@dicanns.ca

## Intelligence (rule-based, no API cost)
- Day-of-week profiling (average sales/ham/hot per weekday)
- Anomaly detection (±25% from average flags the day)
- Ordering suggestions (average + safety margin)
- Cash variance tracking per cashier (running history)

## What to do first
1. Set up the Electron project with React and SQLite
2. Migrate app.jsx into the React structure
3. Update header from "Dic Ann's Ops" to "BalanceIQ" and icon from "DA" to "BIQ"
4. Replace all window.storage calls with SQLite IPC
5. Verify everything works
6. Wire the Open-Meteo weather API
7. ~~Wire the gas price scraper~~ — DONE (cheerio + Electron net, IPC gas:getPrice)
8. Configure electron-builder for .exe and .dmg
9. Build and test installers

See ROADMAP.md for the full feature roadmap and future phases.
