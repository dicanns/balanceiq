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
│       ├── gas-scraper.js    # Régie de l'énergie scraper
│       ├── supabase.js       # Supabase client (URL + anon key)
│       └── cloudSync.js      # Cloud sync service (Pro/Franchise only)
├── supabase/
│   └── functions/
│       ├── create-checkout/index.ts  # Stripe Checkout session creator
│       └── stripe-webhook/index.ts   # Stripe webhook handler
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
- **Cloud sync:** Supabase (Pro/Franchise only) — `src/services/supabase.js` + `cloudSync.js`
- **Billing:** Stripe — `supabase/functions/create-checkout` + `stripe-webhook`
  - Pro monthly ($14): `price_1TCLnfGcfc7VEkjZIMBbNl4n` · Pro annual ($119): `price_1TCLnmGcfc7VEkjZX2wv763a`
  - Network Pro monthly ($5): `price_1TCLkXGcfc7VEkjZyZIa4Pkr` · Network Pro annual ($49): `price_1TCLkyGcfc7VEkjZZgwQGotm`
  - Franchise monthly ($49): `price_1TCLpmGcfc7VEkjZTuaZCNwp` · Franchise annual ($490): `price_1TCLq1Gcfc7VEkjZZK3UlWpz`
  - Franchise Location monthly ($9): `price_1TCLqxGcfc7VEkjZs19hWTOo` · Franchise Location annual ($90): `price_1TCLrZGcfc7VEkjZF2o6LLXs`
  - Legacy grandfathered: `price_1T9C86...` Pro $49/mo, `price_1T9C8M...` Franchise $199/mo, `price_1T9C8c...` Location $29/mo, `price_1T9uJz...` Network $19/mo
  - Secrets needed: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`
- **Email:** Resend (direct invoice send, Pro feature)

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
- POS Integration Framework (Square, Clover, Shopify — Pro/Franchise gated)
  - OAuth + manual token flow, daily sales auto-import to caisses
  - Header 📡 status indicator, Config → Integrations panel
  - Sandbox credentials wired; production IDs in src/config/posConfig.js + secrets in main.js
- Prévisions tab (production forecasting — opt-in toggle in Config → Application)
  - Products catalog with category, shelf life, weather sensitivity
  - Weekly forecast grid (7-day view, confidence levels, weather overlay)
  - Manual sales entry + CSV/Excel import with saved column mappings
  - Rules-based prediction engine: weighted DOW avg, weather adjustment, trend factor, stockout correction
  - Open-Meteo 7-day weather forecast (auto-fetched, 6h cache, manual override)
  - Production list generator with weather annotations and smart adjustments table
  - Alerts: stockout risk, overproduction, optimized items
  - Item detail view: 30-day profile, waste rate, weather correlation, forecast accuracy
  - AI analysis button (Pro-gated, calls Supabase edge function `ai-analysis`)
  - Weather correlation section: observed warm/cold vs neutral, suggests sensitivity update
  - POS import placeholder (Pro-gated UI, item-level import coming when POS APIs support it)
  - SQLite tables: forecast_products, forecast_daily_sales, forecast_csv_mappings, forecast_weather
  - Fully bilingual (FR/EN) — all ~100+ prevXxx translation keys in translations.js
  - Lazy-loaded as standalone component (PrevisionsTab.jsx) to keep App.jsx lean

### 🔴 In progress / next to build:
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

## Security Checklist (mandatory on every build)

This checklist exists because security bugs were found in production code that could have been caught during development. Every feature built for BalanceIQ must be evaluated against these checks before committing.

### 1. Authentication and Authorization

Before writing any edge function, IPC handler, or API endpoint:

- **Every Supabase edge function must authenticate via JWT first, unconditionally.** No request path should skip authentication. If a feature accepts an optional user-provided API key (like `ownApiKey`), that key only controls which external service key is used for the downstream call. It never controls whether the user is authorized to use the endpoint.
- **Plan and quota checks run after auth, always.** A valid JWT is not enough. Verify the user's org has the required plan tier and hasn't exceeded usage limits.
- **CORS must specify exact allowed origins.** Never use `Access-Control-Allow-Origin: *` in production. Allowed origins: `https://balanceiq.ca`. Add `http://localhost:5173` only in development mode.

Ask yourself: "If someone calls this endpoint with no JWT, what happens?" If the answer is anything other than "401 Unauthorized," there's a bug.

### 2. Input Sanitization

Before writing any code that handles filenames, paths, URLs, or user-provided strings:

- **File paths from any external source must be sanitized with `path.basename()` before joining with a directory.** Applies to: document downloads, file uploads, backup restores, CSV imports, any IPC handler that writes files.
- **URLs passed to `shell.openExternal()` must be validated against the allowlist in `isUrlSafe()` (main.js).** Only `https:` scheme. Only known domains. Block everything else silently. Add new domains to the allowlist explicitly.
- **User-provided strings stored in SQLite or rendered in HTML must be escaped** with `escapeHtml()` before use in PDF builders or any HTML context.
- **SQLite TEXT PRIMARY KEY does not imply NOT NULL.** Always add explicit `NOT NULL` constraints.

Ask yourself: "What happens if this input is `../../etc/passwd` or `javascript:alert(1)`?" If the answer is not "rejected or sanitized," there's a bug.

### 3. Data Consent and Privacy

Before writing any code that sends data off the user's computer:

- **No network calls to Supabase before the user has accepted the telemetry consent prompt.** This includes install counting, analytics, crash reports.
- **README, marketing copy, and in-app text must accurately describe what data leaves the device.** Do not claim "all data stays on your computer" if the app sends telemetry. Do not call the audit trail "immutable" — it is append-only at the application level.

### 4. Electron-Specific

- **Do not add `unsafe-eval` to CSP script-src.** If a dependency requires eval, find an alternative.
- **preload.js should expose the minimum necessary API surface.** Every IPC channel is an attack surface.
- **Never pass renderer-controlled data directly to Node.js filesystem or shell APIs** without validation in the main process.

### 5. Post-Build Security Review

After every build session touching IPC handlers, edge functions, file operations, or external URLs:

- Run the full test suite (`npm test`).
- Think adversarially: "What's the worst thing a malicious actor could do with this input/endpoint/handler?"
- Consider requesting a security-focused second review for complex auth or file I/O changes.

*These rules were established after an April 2026 security review. See `docs/BalanceIQ_Security_Fixes_Spec_2026-04-02.md` for full context.*

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
11. ~~Bilingual FR/EN toggle~~ — DONE
12. ~~Facturation module~~ — DONE (Free + Pro + Franchise tiers)
13. ~~Cloud sync (Supabase)~~ — DONE (Pro/Franchise, login/signup in Config → Application)
14. ~~Prévisions tab~~ — DONE (production forecasting, rules-based + AI, bilingual, opt-in toggle)
15. Stripe billing — next (wire plan enforcement)
16. ~~Apple code signing~~ — DONE (v1.12.7, signed + notarized via CI)

See ROADMAP.md for the full feature roadmap and future phases.
