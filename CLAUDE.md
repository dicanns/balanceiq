# CLAUDE.md — BalanceIQ

## What this project is

**BalanceIQ** is a franchise and restaurant operations management desktop app. It digitizes daily close-out, inventory tracking, monthly P&L, cash position management, delivery platform commission tracking, predictive analytics, and invoicing. Initially built for Dic Ann's (a Quebec hamburger franchise with 15+ locations), but designed to be generic enough for any QSR or restaurant business.

**App name:** BalanceIQ
**Tagline:** L'intelligence derrière vos chiffres.
**Branding colors:** Orange gradient (#f97316 → #ea580c), dark background (#0c0e14), warm light theme (#FBF8F4)
**Logo text:** BIQ (for app icon) or BalanceIQ (for header)
**GitHub:** github.com/dicanns/balanceiq

## Current state

The prototype was a single React component (`app.jsx`) built and tested in Claude.ai's artifact system. It has since been fully migrated to a proper Electron app with SQLite storage, installers, auto-updater, and CI/CD. The app is in active production use.

## Architecture

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
├── BalanceIQ_Invoicing_Spec.md
├── BalanceIQ_SaaS_Guide.md
├── BalanceIQ_Business_Plan.md
└── CLAUDE.md
```

## Tech Stack

- **Frontend:** React (Vite)
- **Desktop:** Electron.js
- **Database:** SQLite via better-sqlite3
- **Packaging:** electron-builder (.dmg + .exe)
- **Windows builds:** GitHub Actions (cross-compile from Mac fails — use CI)
- **Weather:** Open-Meteo API (free, no key)
- **Gas prices:** Live scraper (Régie de l'énergie / CAA Canada via cheerio)
- **Future cloud:** Supabase (Montreal region), Stripe, Resend

## Key technical decisions

- **Electron** for desktop packaging (.exe + .dmg)
- **SQLite** via `better-sqlite3` for local data (replaces window.storage)
- **electron-builder** for creating installers
- **React** (already built) — keep the existing component structure
- **No server** — everything runs locally on the franchisee's computer
- **All UI text must be in French** — this is a Quebec product (bilingual toggle coming)
- **App header should say "BalanceIQ"** instead of "Dic Ann's Ops"
- **App icon letters should be "BIQ"** with the orange gradient background

## Current Feature Status

### ✅ Built and working:
- Daily cash reconciliation (multi-caisse, POS vs manual, per-cashier)
- Cashier roster + Employee roster with wage memory
- Inventory with carry-over, bread velocity tracking (14h/17h/19h/20h)
- P&L mensuel with individual invoice entries per supplier, before-tax (avant taxes)
- Livraisons tab (delivery platform tracking — DoorDash, Uber Eats, Skip; CSV import)
- 💵 Encaisse tab (daily cash position tracker — reads from caisses, never writes back)
- Intelligence: day-of-week profiling, anomaly detection, predictive ordering with external factors, consumption velocity analysis
- Weather auto-fill (Open-Meteo + city search geocoding)
- Gas price auto-fill + live scraper (CAA Canada via cheerio)
- Quebec holidays auto-detected
- Light/dark theme toggle (warm light theme)
- Quick-entry mode (Tab/Enter navigation)
- Print daily report + P&L PDF print + email to info@dicanns.ca
- CSV, PDF, JSON backup/export + auto-backup (Documents/BalanceIQ Backups/, 30-day rotation)
- Restore from JSON backup
- .dmg Mac installer (arm64 + x64 separate builds)
- .exe Windows installer via GitHub Actions
- Auto-updater (electron-updater, checks GitHub Releases on launch)

### 🔴 In progress / next to build:
- 🌐 Bilingual FR/EN toggle
- 🧾 Facturation module (5 phases — see BalanceIQ_Invoicing_Spec.md)
- Auphan POS integration (waiting on API docs)

## Business Model — Open Core

Free desktop app (single location, all core operations). Revenue from paid cloud tiers.

**Free:** All core operations + basic invoicing (unlimited clients, full invoice flow, credit notes, basic aging, CSV export, PDF print)

**Pro ($49/mo per location):** Cloud sync, POS integration, OCR scanning, AI analysis, bulk payments, recurring invoices, direct email, Excel export, detailed aging, account statements, deposit tracking, custom templates

**Franchise ($199/mo + $29/location):** Multi-location dashboard, royalty auto-calculation from sales data, auto-generate franchise invoices, consolidated aging, white-label

All features built into codebase. Paid features gated behind `src/config/features.js`. Upgrade prompts non-aggressive and dismissable.

## Storage migration

The original app used `window.storage.get(key)` / `window.storage.set(key, value)`. Fully migrated to Electron IPC + SQLite:

```javascript
// Electron IPC (current):
await window.api.storage.get("dicann-v7")
await window.api.storage.set("dicann-v7", jsonString)
```

Storage keys used:
- `dicann-v7` — all daily data (cashes, inventory, employees, external factors, notes)
- `dicann-roster` — cashier name roster
- `dicann-emp-roster` — employee roster with wages
- `dicann-suppliers-v2` — supplier list for P&L
- `dicann-api-config` — API keys/config (weather coords, CSV column maps, etc.)
- `dicann-pl-{YYYY-MM}` — monthly P&L data (one key per month)
- `dicann-platforms` — delivery platform definitions
- `dicann-encaisse` — all daily encaisse data (cash position per day)
- `dicann-encaisse-config` — encaisse sortie categories + cash locations
- `balanceiq-theme` — theme preference (dark/light)

## API integrations to wire

1. **Weather (Open-Meteo)** — free, no API key needed ✓ WIRED
   - Endpoint: `https://api.open-meteo.com/v1/forecast?latitude=45.5&longitude=-73.6&current=temperature_2m,weather_code`
   - Auto-fill weather and temperature on daily report

2. **Gas prices (Régie de l'énergie du Québec)** — scrape ✓ WIRED
   - IPC channel: `gas:getPrice` — returns `{ price: "X.XXX" }` or `{ error: "..." }`
   - Uses Electron `net` module + `cheerio` to parse CAA Canada national price (¢/L → $/L)
   - Button shows loading state, auto-fills field on success, shows French error on failure
   - Fallback: auto-fill from last known price (up to 14 days back)

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
Walk back up to 14 days to find last entered gas price, show with "Confirmer" button. "Vérifier le prix" button scrapes live price.

### Encaisse (cash position)
```
Solde calculé = Solde d'ouverture + Cash des ventes + Autres entrées − Dépôts banque − Sorties cash
Cash des ventes = sum of (finalCash - float) across all caisses (read-only)
Balanced = |Comptage physique - Solde calculé| <= 2
Opening balance = previous day's closing (iterative forward chain)
```

## P&L structure
- Revenue: auto from daily data, with manual override
- Cost of goods: Petty cash F&P + supplier invoices (editable supplier list)
- Operating expenses: 16 categories (Hydro, Gaz Nat, Loyer, CSST, etc.)
- Labour: auto from daily employee entries, with monthly override
- Result: Revenue - F&P - Labour - Expenses = Net Profit
- All amounts before taxes (avant taxes)
- Email reports to: info@dicanns.ca

## Intelligence (rule-based, no API cost)
- Day-of-week profiling (average sales/ham/hot per weekday)
- Anomaly detection (±25% from average flags the day)
- Ordering suggestions (average + safety margin)
- Cash variance tracking per cashier (running history)
- Consumption velocity per time window (Début→14h, 14h→17h, 17h→19h, 19h→20h)
- Multi-factor predictive ordering (weather + temp + holidays)
- Encaisse: monthly sortie breakdown by category, flags 40%+ increases vs prior month

## Critical Rules

1. **Livraisons section is INFORMATIONAL ONLY** — never affects caisse reconciliation
2. **Encaisse tab READS from caisses** but never writes back to them
3. **Cash payments in Facturation** show as read-only in Encaisse — Facturation owns the data
4. **P&L amounts are before taxes (avant taxes)**
5. **All UI text in French** (bilingual toggle coming — see memory/bilingual-plan.md)
6. **Categories in invoicing start blank** — users create their own
7. **Products/services are subdivisions of categories** — categories carry account numbers for accounting export

## File References

- **ROADMAP.md** — full product roadmap with feature status
- **BalanceIQ_Invoicing_Spec.md** — detailed invoicing module spec (5 phases with Claude Code instructions)
- **BalanceIQ_SaaS_Guide.md** — cloud infrastructure A-Z (Supabase, Stripe, Resend, etc.)
- **BalanceIQ_Business_Plan.md** — business plan with revenue projections

## Owner Contact
- Email: info@dicanns.ca
- Reports sent to: info@dicanns.ca

## What to do / already done
1. ~~Set up the Electron project with React and SQLite~~ — DONE
2. ~~Migrate app.jsx into the React structure~~ — DONE
3. ~~Update header to "BalanceIQ" and icon to "BIQ"~~ — DONE
4. ~~Replace all window.storage calls with SQLite IPC~~ — DONE
5. ~~Wire the Open-Meteo weather API~~ — DONE
6. ~~Wire the gas price scraper~~ — DONE (cheerio + Electron net, IPC gas:getPrice)
7. ~~Configure electron-builder for .exe and .dmg~~ — DONE
8. ~~Auto-updater~~ — DONE (electron-updater, GitHub Releases)
9. ~~Livraisons tab~~ — DONE
10. ~~Encaisse tab~~ — DONE
11. Bilingual FR/EN toggle — next
12. Facturation module — see BalanceIQ_Invoicing_Spec.md

See ROADMAP.md for the full feature roadmap and future phases.
