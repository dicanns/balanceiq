# BalanceIQ — Product Roadmap
### L'intelligence derrière vos chiffres.
### Last updated: March 9, 2026 (session 9)

---

## Architecture

| Component | Technology | Status |
|-----------|-----------|--------|
| Frontend | React | ✅ Built |
| Desktop wrapper | Electron.js | ✅ Built |
| Database | SQLite (replaces browser storage) | ✅ Built |
| Gas price fetch | CAA Canada scraper (cheerio) | ✅ Wired |
| Weather API | Open-Meteo (free, no key) | ✅ Built |
| Packaging | electron-builder (.exe + .dmg) | ✅ Built |
| Auto-updater | electron-updater → GitHub Releases | ✅ Built |
| Audit trail | SQLite audit_log + daily_snapshots | ✅ Built |
| PDF engine | Electron printToPDF (hidden BrowserWindow) | ✅ Built |
| Email | Resend API via Electron net module | ✅ Built |

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
- [x] Bread checkpoints — track buns remaining at 14h, 17h, 19h, 20h; shows "passé" per window
- [x] Average $/dozen (Vente nette ÷ total dozens used)
- [x] Labour tracking — employees, hours, saved wages, cost, % of sales
- [x] Labour % color-coded (green ≤28%, yellow 28-35%, red >35%)
- [x] External factors: weather, temperature, gas price, events
- [x] Quebec holidays auto-detected
- [x] Gas price auto-fill from last known price (up to 14 days back)
- [x] Gas price live fetch from CAA Canada (cheerio scraper via IPC)
- [x] Daily notes, weekly sales chart
- [x] All data auto-saves with debounce

### ✅ DONE — P&L Mensuel tab

- [x] Revenue auto-calculated from daily reports with manual override
- [x] Supplier cost tracking — F&P column per supplier with multi-bill entry (date, amount HT, note)
- [x] 16 operating expense categories
- [x] Labour auto-pulled from daily reports + manual override
- [x] Full P&L summary: Revenue → Gross → Net
- [x] Percentage indicators with color-coded alerts
- [x] Save & Print PDF, email to info@dicanns.ca
- [x] Monthly P&L reset button

### ✅ DONE — Intelligence tab

- [x] Sales projections based on last 8 same-day-of-week entries
- [x] Suggested ordering quantities (ham + hot dozens with safety margin)
- [x] Day-of-week profiling; anomaly detection ±25%
- [x] Cash variance history per cashier
- [x] Consumption velocity analysis per time window
- [x] Predictive ordering — multi-factor model (dow + weather + temp + Quebec holidays)
- [x] Intra-day projection from bread checkpoints
- [x] Encaisse monthly sortie breakdown vs prior month (flags +40%)

### ✅ DONE — Encaisse tab (💵 daily cash position tracker)

- [x] Reads from caisses (finalCash - float), never writes back
- [x] Solde d'ouverture auto-carried from prior day closing
- [x] Entrées: Cash des ventes (auto) + Autre entrée (manual)
- [x] Dépôts à la banque: Interac/Crédit (auto) + cash deposits (manual)
- [x] Sorties de cash with categories
- [x] Comptage physique (tiroirs-caisses, petite caisse, bureau)
- [x] Réconciliation: ✓ BALANCÉ (|écart| ≤ $2) or ✗ with amount
- [x] Monthly summary — days balanced, écart flags
- [x] Daily tab status indicator (clickable card)

### ✅ DONE — Livraisons (delivery platform tracking)

- [x] Per-platform: Ventes plateforme + Dépôt reçu with commission display
- [x] Informational only — never affects caisse reconciliation
- [x] CSV import per platform (DoorDash, Uber Eats, Skip; column auto-detect + mapper)
- [x] P&L and Intelligence tab integration
- [x] Collapsible section

### ✅ DONE — Facturation module — FREE tier (BuildGuide_1_FREE.md)

- [x] Client database with full contact info
- [x] Categories + Products (with account numbers for accounting export)
- [x] Soumissions (quotes) → Commandes (orders) → Factures (invoices) — full conversion chain
- [x] Notes de crédit
- [x] Document chain tracking — clickable banners linking converted docs
- [x] EncaissementEditor — record payments, running balance, credit handling
- [x] Basic aging report (summary)
- [x] État de compte — FREE for single client
- [x] PDF print + preview for all document types (PDFPreviewModal via CustomEvent)
- [x] Email compose modal — Pro sends via Resend; Free uses mailto: + PDF download
- [x] Auto-advance document status on email send
- [x] Client profile with document history + État de compte button
- [x] Partial payments (dépôts/acomptes) FREE on Factures
- [x] CSV export
- [x] Company info + logo in Config

### ✅ DONE — Facturation module — PRO tier (BuildGuide_2_PRO.md)

- [x] Bulk Encaissement — multi-invoice payment, auto-apply oldest-first, running total, credit/refund
- [x] Auto-Apply Payments — oldest-first distribution with preview
- [x] Detailed Aging Report — per-invoice expandable rows
- [x] Account Statements + Bulk Email via Resend
- [x] Recurring Invoices — per client, frequency, auto-send
- [x] Direct Email Send — Resend API (real PDF attachment via pdf:toPDF IPC)
- [x] Excel Export — SheetJS, 4-sheet workbook (journal facturation, encaissements, grand livre, sommaire)
- [x] Deposit/Acompte Tracking on Commandes
- [x] Custom Invoice Templates — accent color, logo position, footer, default notes, TPS/TVQ toggle

### ✅ DONE — Facturation module — FRANCHISE tier (BuildGuide_3_FRANCHISE.md)

- [x] **Franchiseur mode** — welcome screen activates mode, saves to balanceiq-mode storage
- [x] **Location selector** — dropdown in header (purple) to switch between locations or "Tout le réseau"
- [x] **⇄ Mode button** — always visible in header, returns to welcome screen to switch modes
- [x] **Config → Application** — correctly shows active mode (🏢 Franchiseur vs 🏪 Restaurant)
- [x] **Config → 📍 Succursales** — add/edit/deactivate locations; link to billing client; custom royalty rate override per location; weather coords per location
- [x] **Config → 💰 Redevances** — flat rate or progressive brackets; ad contribution %; billing category + product; stepped flat rate (hidden "Options avancées" — taux par palier mensuel)
- [x] **Config → 🏷️ Marque blanche** — franchise name replaces "BIQ" on documents; custom accent color; custom footer; "Propulsé par BalanceIQ" credit always appended
- [x] **Réseau tab → 📊 Performance** — network summary cards (ventes, succursales actives, balancées aujourd'hui, redevances en attente); performance table per location (ventes mois/hier, $/dz, labour%, statut); auto-generated alerts (days not filled, labour %, today's écart)
- [x] **Réseau tab → 🏆 Scorecards** — monthly score per location (labour %, $/dz, completeness); color-coded 0-100
- [x] **Réseau tab → 💰 Redevances** — select period → calculate per-location royalties → preview table → create invoices; invoices tagged "redevance" + linked to client
- [x] **Réseau tab → 🔄 Réconciliation** — billed vs paid per location; totals row; color-coded status
- [x] **Réseau tab → 📋 Audit réseau** — full audit log viewer with action filters (Créé/Modifié/Correction/Annulé); shows 100 most recent entries
- [x] **White label wired into PDF builders** — all 5 builders (soumission, commande, facture, note de crédit, état de compte) respect whiteLabelEnabled/whiteLabelName/accentColor via effectiveTemplate
- [x] **Data isolation per location** — each location has its own SQLite key namespace: `dicann-v7-loc-{id}`, `dicann-pl-{month}-loc-{id}`, etc.
- [x] **Stepped flat rate** — hidden advanced option; monthly total sales determine which single % applies to entire month (distinct from progressive brackets)

### ✅ DONE — Infrastructure

- [x] Electron main process (`main.js`) with all IPC handlers
- [x] SQLite via better-sqlite3 — kv_store + audit_log + daily_snapshots tables
- [x] preload.js contextBridge — window.api.*
- [x] Auto-updater — electron-updater, GitHub Releases, orange notification bar
- [x] Audit trail — append-only audit_log, device UUID, logCreate/logUpdate/logVoid/logCorrection
- [x] Daily snapshots — auto-snapshot on complete day
- [x] pdf:toPDF IPC — hidden BrowserWindow → printToPDF → base64 (used for email attachments)
- [x] pdf:print IPC — visible BrowserWindow → system print dialog
- [x] Auto-backup — 1 JSON/day to Documents/BalanceIQ Backups/, 30-day rotation
- [x] Restore from JSON backup

### ✅ DONE — Plan / Feature Flag System (src/config/features.js)

- Plans: `free`, `pro`, `franchise`
- Runtime-mutable: `setPlan()` / `getActivePlan()` / `canUse(featureName)`
- DEV mode: pill buttons in Config → Application to switch plans for testing
- Production: plan locked to free until billing is wired
- Franchise features: `royaltyAutoCalc`, `autoGenerateRoyaltyInvoices`, `multiLocationReconciliation`, `franchiseeScorecards`, `consolidatedAging`, `whiteLabel`

---

## 🟡 QUICK WIN OPPORTUNITIES

| Feature | Effort | Description |
|---------|--------|-------------|
| Bilingual FR/EN toggle | Medium | Switch all UI between French and English |
| Date calendar view | Low | Calendar showing which days have data entered |
| Break-even tracker | Low | Daily sales target to hit monthly break-even |
| Monthly trend line chart | Low | Line chart of daily net sales for selected month |
| Mobile-first responsive | Medium | Adapt layout for phone/tablet use |
| Apple code signing | — | $99/year eliminates "damaged app" warning on Mac |

---

## 🔲 NEXT PHASES

### Phase 5 — Cloud Sync (BalanceIQ_SaaS_Guide.md)

- Supabase (Montreal region) for multi-device sync
- Franchisee enters data on their own computer → syncs to franchisor dashboard
- Stripe billing for Pro/Franchise plan enforcement
- This is the missing link for true multi-location real-time data

### Phase 6 — Advanced Intelligence

- Claude API for natural language analysis ("why were sales low this week?")
- Predictive ordering with confidence intervals
- Proactive anomaly alerts (email/SMS)
- Seasonal trend recognition

### Phase 7 — Automation

- Supplier invoice scanning (OCR → auto-fill P&L)
- Bank feed connection
- Auphan POS integration (waiting on API docs)
- Auto-generated monthly reports sent to franchisor
- Open API for third-party tools

---

## Immediate Next Steps

1. **Cloud sync (Supabase)** — the key missing piece for franchisee→franchisor real-time data
2. **Stripe billing** — to enforce plan gating in production builds
3. **Apple code signing** — $99/year Apple Developer account eliminates install warnings
4. **Auphan POS** — contact Auphan for API documentation

---

## Build Guides Status

| Guide | Description | Status |
|-------|-------------|--------|
| BuildGuide_1_FREE.md | Core invoicing (free tier) | ✅ Complete |
| BuildGuide_1B_AUDIT.md | Audit trail | ✅ Complete |
| BuildGuide_2_PRO.md | Pro tier (9 steps) | ✅ Complete |
| BuildGuide_3_FRANCHISE.md | Franchise tier (9 steps) | ✅ Complete |

---

*BalanceIQ v1.2.0 — March 9, 2026*
