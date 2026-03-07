# BalanceIQ — Product Roadmap
### L'intelligence derrière vos chiffres.
### Last updated: March 7, 2026 (session 4)

---

## Architecture

| Component | Technology | Status |
|-----------|-----------|--------|
| Frontend | React | ✅ Built |
| Desktop wrapper | Electron.js | ✅ Built |
| Database | SQLite (replaces browser storage) | ✅ Built |
| Gas price fetch | CAA Canada scraper (cheerio) | ✅ Wired |
| Weather API | Open-Meteo (free, no key) | 🔲 Next |
| Packaging | electron-builder (.exe + .dmg) | 🔲 Next |

---

## Feature Status

### ✅ DONE — Daily Report (Quotidien tab)

- [x] Multiple cash registers per day (add/remove dynamically)
- [x] POS reading vs manual count — side by side per caisse
- [x] Full line-by-line reconciliation (Compté vs POS)
- [x] Balanced / Écart indicator per caisse and per day
- [x] Cashier roster — add names in Config, select from dropdown on each caisse
- [x] Employee roster with wage memory — select from dropdown, wage auto-fills
- [x] "Copier d'hier" button to duplicate yesterday's employee list
- [x] Inventory carry-over (Fin → Début du lendemain automatic)
- [x] Inventory manual override (✎ button to correct starting count)
- [x] Stock received (+Reçu field for deliveries)
- [x] Bread checkpoints — track buns remaining at 14h, 17h, 19h, 20h for ham and hot dog; shows cumulative "passé" (sold by that point) = Début + Reçu − Restant
- [x] Average $/dozen (Vente nette ÷ total dozens used)
- [x] Labour tracking — employees, hours, saved wages, cost, % of sales
- [x] Labour % color-coded (green ≤28%, yellow 28-35%, red >35%)
- [x] External factors: weather, temperature, gas price, events
- [x] Quebec holidays auto-detected
- [x] Gas price auto-fill from last known price (up to 14 days back)
- [x] Gas price "Confirmer" button for auto-filled price
- [x] Gas price "Vérifier le prix (Régie de l'énergie)" button — live fetch from CAA Canada, shows loading state, auto-fills on success, French error message on failure
- [x] Daily notes
- [x] Weekly sales chart
- [x] Each day starts blank (except inventory carry-over + gas auto-fill)
- [x] All data auto-saves with debounce

### ✅ DONE — P&L Mensuel tab

- [x] Revenue auto-calculated from daily reports
- [x] Revenue manual override with "Retour auto" option
- [x] Supplier cost tracking — Food & Paper column per supplier
- [x] Petty cash — F&P and Misc separate lines
- [x] 16 operating expense categories
- [x] Labour cost auto-pulled from daily reports + manual override
- [x] Full P&L summary: Revenue → Gross Profit → Net Profit/Loss
- [x] Percentage indicators (F&P %, Labour %, Net %)
- [x] Color-coded alerts when percentages are out of range
- [x] Save & Print PDF (opens print dialog)
- [x] Email report to info@dicanns.ca
- [x] Buffered inputs (no focus loss when typing)
- [x] Multi-bill entry per supplier/expense — add individual invoices with date, amount (HT), note/invoice number; collapsed by default showing total, expanded showing line-by-line; all amounts before taxes (avant taxes); PDF print includes bill detail
- [x] Enter key navigation — across daily tab and P&L, Enter moves focus to next blank field

### ✅ DONE — Intelligence tab

- [x] Sales projections based on last 8 same-day-of-week entries
- [x] Suggested ordering quantities (ham + hot dozens with safety margin)
- [x] Day-of-week profiling (average sales, ham, hot per weekday)
- [x] Anomaly detection — flags days ±25% from average for that day type
- [x] Cash variance history per cashier (running total + last 5 entries)
- [x] All rule-based, no API cost
- [x] Consumption velocity analysis — average dz consumed per time window (Début→14h, 14h→17h, 17h→19h, 19h→20h) broken down by day of week
- [x] Predictive ordering with external factors — multi-factor model (dow + weather category + temp range + Quebec holidays); shows ham/hot/sales estimate for tomorrow with contextual adjustments
- [x] Intra-day projection on daily tab — once any bread checkpoint is entered, linearly extrapolates end-of-day usage for ham and hot

### ✅ DONE — Config tab

- [x] Cashier roster management (add, remove)
- [x] Employee roster management (add, remove, with saved hourly wage)
- [x] Supplier list management (add, remove, rename in-place)
- [x] API integration fields (Auphan POS, Gas price) — ready for keys
- [x] Coordonnées météo — GeoSearch component using Open-Meteo geocoding API; type city name → dropdown of results → saves lat/lng/label to apiConfig; shows "📍 Ville — météo configurée"; defaults to Montréal if unconfigured
- [x] Export: CSV, PDF (print dialog), JSON backup
- [x] Restore from JSON backup — file dialog, validation, confirmation, SQLite write, reload (handles both manual + auto-backup formats including P&L)
- [x] Auto-backup — on launch, 1 JSON per day to Documents/BalanceIQ Backups/, 30-day rotation, cross-platform; Config tab shows last backup date + file count + folder path with "Ouvrir le dossier" button
- [x] Light / dark theme toggle — "Warm" light theme + persistent preference (SQLite)

### ✅ DONE — Electron + Infrastructure

- [x] Electron main process (`main.js`) with IPC handlers
- [x] SQLite via `better-sqlite3` — key-value store replacing `window.storage`
- [x] `preload.js` contextBridge — exposes `window.api.storage`, `window.api.gas`, `window.api.backup`, `window.api.updater`
- [x] Auto-updater — `electron-updater` wired; checks GitHub Releases on launch (production only); orange notification bar with "Installer" button; `autoDownload=false` until user confirms
- [x] Vite dev server + Electron concurrently for development
- [x] `cheerio` installed for HTML parsing
- [x] Gas price IPC handler (`gas:getPrice`) — fetches CAA Canada, parses `national_single_price`

---

## 🟡 LOW-EFFORT UPGRADES

### Quick wins — UI improvements

| Feature | Effort | Impact | Description |
|---------|--------|--------|-------------|
| ~~**"Journée complète" indicator**~~ | ~~Very low~~ | ~~Medium~~ | ✅ Done — green badge on date + green dot on week chart when all caisses balance + inventory entered |
| ~~**Running month-to-date total**~~ | ~~Very low~~ | ~~High~~ | ✅ Done — "Mois en cours" MC card showing cumulative net sales + day count |
| ~~**Notes preview in week chart**~~ | ~~Very low~~ | ~~Low~~ | ✅ Done — 4px orange dot below day label when notes exist |
| ~~**Quick-entry mode / keyboard shortcuts**~~ | ~~Low~~ | ~~Medium~~ | ✅ Done — explicit tabIndex ordering through POS then manual fields per caisse |
| ~~**Print daily report**~~ | ~~Low~~ | ~~Medium~~ | ✅ Done — "🖨️ Imprimer le rapport" button at bottom of daily tab |
| **Date search with calendar** | Low | Medium | Calendar view showing which days have data entered (filled vs empty) |
| **Mobile-first responsive design** | Medium | High | Adapt layout for phone/tablet use — franchisees close out on the floor |
| ~~**Light theme option**~~ | ~~Low~~ | ~~Low~~ | ✅ Done — dark/light toggle in header + Config, saved to storage |
| **Bilingual mode (FR/EN toggle)** | Medium | Medium | Switch all UI labels between French and English |

### Quick wins — Daily report

| Feature | Effort | Impact | Description |
|---------|--------|--------|-------------|
| **Break-even tracker** | Low | High | Show daily sales target needed to hit monthly break-even; flag if below |
| **Waste / Perte field in inventory** | Very low | Medium | Track product waste separately from used — affects real cost calculation |

### Quick wins — Analytics

| Feature | Effort | Impact | Description |
|---------|--------|--------|-------------|
| **Monthly trend line** | Low | High | Simple line chart showing daily net sales for the selected month |
| **Best/worst day of month** | Very low | Medium | Highlight highest and lowest sales days |
| **Average daily sales card** | Very low | Medium | Show month-to-date average alongside cumulative |
| **Labour cost trend** | Low | Medium | Track labour % over time — is it trending up or down? |
| **Food cost warning on daily** | Low | Medium | If daily moyenne $/dz is off from the monthly average, flag it |
| **Total employee hours in P&L** | Very low | Medium | Auto-sum hours from all daily reports into the monthly P&L labour section |

### Quick wins — Data integrity

| Feature | Effort | Impact | Description |
|---------|--------|--------|-------------|
| ~~**Restore from JSON backup**~~ | ~~Low~~ | ~~High~~ | ✅ Done — "Restaurer depuis backup" button in Config/Export; file dialog + validation + confirmation + SQLite write + reload |
| ~~**Data validation on save**~~ | ~~Low~~ | ~~Medium~~ | ✅ Done — on-blur warnings for all daily tab fields (float, cash, POS, inventory, employees) and P&L tab (bills, overrides) |

---

## 🔲 NEXT PHASES

### Phase 2 — Electron Desktop App ✅ Mostly complete

1. ✅ Scaffold Electron + React project
2. ✅ Migrate current code, rebrand to BalanceIQ
3. ✅ Replace `window.storage` with SQLite
4. ✅ Wire gas price scraper (CAA Canada — fallback since Régie is JS-rendered)
5. 🔲 Wire Open-Meteo weather API (free, no key needed)
6. 🔲 Configure electron-builder
7. 🔲 Build .exe (Windows) and .dmg (Mac)
8. 🔲 Test on both platforms

### Phase 3 — API Integrations

| Integration | Status | Next step |
|-------------|--------|-----------|
| Auphan POS | Config field ready | Contact Auphan for API docs |
| Weather (Open-Meteo) | 🔲 Not wired | Wire in Electron — free, no key |
| Gas (CAA scraper) | ✅ Done | Working — fetches daily average from CAA Canada |
| Holidays QC | ✅ Done | — |

### Phase 4 — Multi-Location

- Location selector in app
- Franchisor dashboard — all locations at a glance, real-time
- Location-to-location comparison
- Benchmark: compare one location vs network average (sales, labour %, food cost %)
- Franchisee scorecards (monthly)
- Consolidated reports
- Royalty auto-calculation
- Per-product profitability analysis (ham vs hot dog margin, waste impact)

### Phase 5 — Advanced Intelligence

- Claude API for natural language analysis ("why were sales low?")
- Weather correlation model
- Predictive ordering with confidence intervals
- Proactive anomaly alerts (email/SMS)
- Seasonal trend recognition

### Phase 6 — Automation

- Supplier invoice scanning (OCR → auto-fill P&L)
- Bank feed connection
- Schedule integration
- Auto-generated monthly reports sent to franchisor
- Open API for third-party tools

---

## Immediate Next Steps

1. **Wire Open-Meteo weather API** — auto-fill Météo and Temp fields on daily report
2. **Configure electron-builder** — `npm run build` → .dmg (Mac) + .exe (Windows)
3. **Test installers** on both platforms
4. **Contact Auphan** for POS API documentation

---

*BalanceIQ v1.0 — March 7, 2026*
