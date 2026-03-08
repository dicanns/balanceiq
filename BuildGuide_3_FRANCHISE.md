# BalanceIQ — Build Guide 3: FRANCHISE Tier ($199/mo + $29/location)
### Only start this AFTER Build Guide 1 AND 2 are fully working.
### This builds the FRANCHISOR module — only visible in "Franchiseur" app mode.

---

## WHAT THIS BUILDS

Everything a franchise head office needs to manage multiple locations, auto-calculate royalties, and have network-wide visibility. These features are INVISIBLE in Restaurant mode — they only appear when the app mode is set to "Franchiseur".

---

## STEP 1 — Activate Franchiseur Mode

```
The welcome screen from Build Guide 1 currently shows 
"Mode Franchiseur — disponible prochainement" when clicked.

Activate it now. When user selects "🏢 Franchiseur / Siège social":

1. App enters franchiseur mode
2. New UI elements appear:
   - Location selector in the header (dropdown to switch between locations)
   - New tab: "🏢 Réseau" (network dashboard)
   - Royalty settings in Config
   - Franchise-specific invoicing features

3. The franchiseur still has access to ALL restaurant features 
   (they can view/manage individual location data by selecting 
   a location from the header dropdown)

4. First-time franchiseur setup:
   - Prompt: "Ajoutez vos locations"
   - Simple form: Nom de la location, Adresse, Ville
   - Add as many as needed
   - Each location gets its own isolated data in SQLite 
     (separate key namespace per location)

Save mode + locations to SQLite. All text in French.
```

---

## STEP 2 — Location Management

```
In Config (franchiseur mode only), add "Gestion des locations":

Per location:
- Nom (e.g., "Dic Ann's Chomedey")
- Adresse
- Ville
- Responsable (franchisee name)
- Courriel du franchisé
- Téléphone
- Lien client facturation (dropdown — link this location to a 
  client in the invoicing module, for royalty billing)
- Coordonnées météo (lat/lng — for weather API)
- Statut: Active / Inactive

"+ Nouvelle location" button.
Edit and deactivate existing locations.

Location selector in the app header:
- Dropdown showing all active locations
- Selecting a location switches ALL data views to that location's data
- Show current location name in header: "📍 Chomedey"
- "Toutes les locations" option → shows the Réseau dashboard

All text in French.
```

---

## STEP 3 — Network Dashboard (Réseau tab)

```
Create the "🏢 Réseau" tab (only visible in franchiseur mode).

This is the franchisor's command center. Shows:

TOP — Summary cards:
- Ventes réseau (total net sales across all locations, current month)
- Nombre de locations actives
- Locations balancées aujourd'hui (count)
- Redevances à percevoir (outstanding royalties)

SECTION 1 — Performance par location (table):
| Location | Ventes (mois) | Ventes (hier) | $/dz moy | Main d'œuvre % | Statut |

- Statut: ✓ (today balanced), ⏳ (incomplete), ✗ (écart), — (no data)
- Sort by any column
- Click a row → switches to that location's daily view
- Color-coded: green (performing well), yellow (watch), red (issue)

SECTION 2 — Comparaison (visual):
- Bar chart: this month's sales per location, side by side
- Toggle: Ventes | Main d'œuvre % | $/douzaine

SECTION 3 — Alertes réseau:
- "Location X n'a pas rempli depuis 3 jours"
- "Location Y: écart de caisse $45 hier"
- "Location Z: main d'œuvre 38% cette semaine"
- Auto-generated from each location's data

All text in French. This entire tab is hidden in restaurant mode.
```

---

## STEP 4 — Franchisee Scorecards

```
In the Réseau tab, add a "Scorecards" section 
(gated behind canUse('franchiseeScorecards')):

For each location, generate a monthly scorecard:

SCORECARD — [Location Name] — [Month Year]
| Metric | Valeur | Cible | Statut |
|--------|--------|-------|--------|
| Ventes nettes | $XX,XXX | $XX,XXX | ✓/✗ |
| Coût F&P % | XX% | <33% | ✓/✗ |
| Main d'œuvre % | XX% | <30% | ✓/✗ |
| $/douzaine moyen | $X.XX | >$X.XX | ✓/✗ |
| Jours avec écart | X/XX | 0 | ✓/✗ |
| Jours incomplets | X/XX | 0 | ✓/✗ |
| Score global | XX/100 | — | color |

Targets are configurable in Config per location or network-wide default.

Score calculation:
- Each metric contributes points
- 100 = perfect month
- <70 = needs attention (red)
- 70-85 = acceptable (yellow)
- 85+ = excellent (green)

Printable / PDF per location.
Can be emailed to the franchisee.

All text in French. Hidden in restaurant mode.
```

---

## STEP 5 — Royalty Configuration

```
In Config (franchiseur mode only), add "Redevances" section 
(gated behind canUse('royaltyAutoCalc')):

ROYALTY SETTINGS:
- Type: % des ventes nettes (default)
- Structure (radio):
  * Taux fixe: [X]%
  * Échelle progressive:
    - Tranche 1: 0$ à [X]$ → [Y]%
    - Tranche 2: [X]$ à [Z]$ → [W]%
    - Tranche 3: [Z]$+ → [V]%
    - "+ Ajouter une tranche" button
- Contribution publicitaire: [X]% (separate line on invoice)
- Fréquence de facturation: Mensuel (default), Bimensuel
- Catégorie de facturation: (dropdown from invoicing categories — 
  this is where the royalty line item gets its account number)
- Produit de facturation: (dropdown from products — or auto-create 
  "Redevance mensuelle" product)

PER-LOCATION OVERRIDE:
Option to set different rates per location (override network default).
In the location management, add:
- "Taux de redevance personnalisé" toggle
- If on: show same rate structure fields
- If off: uses network default

Save to SQLite. All text in French. Hidden in restaurant mode.
```

---

## STEP 6 — Auto-Generate Royalty Invoices

```
In the Facturation tab (franchiseur mode), add:
"Générer les factures de redevances" button
(gated behind canUse('autoGenerateRoyaltyInvoices'))

FLOW:
1. Select period: month/year dropdown
2. System calculates for each location:
   - Pulls total Vente nette from daily data for that month
   - Applies royalty rate (location-specific or network default)
   - Calculates: Ventes × Rate = Royalty amount
   - Calculates: Ventes × Ad rate = Advertising contribution
3. Shows preview table:
   | Location | Client | Ventes nettes | Redevance | Pub. | Total |
   With a ✓ checkbox per row (all checked by default)
4. "Créer les factures" button
5. For each checked location:
   - Creates a Facture linked to the client for that location
   - Line 1: "Redevances — [month year] — Ventes: $XX,XXX × X%"
   - Line 2: "Contribution publicitaire — [month year] — $XX,XXX × X%"
   - Uses the configured category and product
   - Due date from client's payment terms
6. Show: "✓ 12 factures créées"

These invoices appear in the normal invoice list and can be 
emailed, printed, and paid like any other invoice.

All text in French. Hidden in restaurant mode.
```

---

## STEP 7 — Multi-Location Reconciliation View

```
In the Réseau tab, add "Réconciliation des redevances" section
(gated behind canUse('multiLocationReconciliation')):

Table:
| Location | Ventes (mois) | Redevance due | Facturé | Payé | Solde |

- Redevance due: calculated from sales × rate
- Facturé: sum of royalty invoices for that month
- Payé: sum of payments against those invoices
- Solde: Facturé - Payé
- Color-coded: green (paid), yellow (partially), red (unpaid)
- Totals row at bottom

- Month selector
- "Générer les manquantes" button if any locations don't have 
  a royalty invoice yet

All text in French. Hidden in restaurant mode.
```

---

## STEP 8 — Consolidated Aging

```
Upgrade the aging report for franchiseur mode
(gated behind canUse('consolidatedAging')):

Add a "Réseau" view to the aging report that shows:
- All franchise locations' invoices in one view
- Grouped by location
- Same aging buckets (Courant, 30, 60, 90+)
- Network totals at the bottom

"Envoyer tous les états de compte" button:
- Generates and emails statements to every franchisee with 
  an outstanding balance
- Uses their email from the client/location record
- Progress indicator: "Envoi 8/12..."

All text in French. Hidden in restaurant mode.
```

---

## STEP 9 — White-Label Settings

```
In Config (franchiseur mode), add "Marque blanche" section
(gated behind canUse('whiteLabel')):

- Nom de la franchise (shown on invoices instead of "BalanceIQ")
- Logo de la franchise (replaces BIQ logo on invoices)
- Couleur d'accent (replaces orange on invoices)
- Pied de page personnalisé

When enabled, all invoices, statements, and scorecards show 
the franchise branding instead of BalanceIQ branding.

The app itself still shows BalanceIQ UI — white-label only 
affects generated documents (PDF/print/email).

All text in French. Hidden in restaurant mode.
```

---

## YOU'RE DONE WITH FRANCHISE TIER

At this point, the franchisor has:
✅ Everything from Free + Pro tiers
✅ Franchiseur app mode with location selector
✅ Location management with franchisee linking
✅ Network dashboard with performance overview
✅ Franchisee scorecards (monthly, configurable targets)
✅ Royalty configuration (flat or sliding scale, per-location override)
✅ Auto-generate royalty invoices from actual sales data
✅ Multi-location reconciliation (billed vs paid per location)
✅ Consolidated aging across all franchisees
✅ Bulk statement email to all franchisees
✅ White-label documents (franchise branding)

---

## FINAL NOTES

The three build guides create a complete invoicing system:
- Guide 1 (FREE): Core invoicing that works for any business
- Guide 2 (PRO): Automation and efficiency for growing businesses
- Guide 3 (FRANCHISE): Network management for multi-location operators

The feature flag system ensures:
- FREE users see a complete, useful product (never feels crippled)
- PRO features show gentle upgrade prompts when accessed
- FRANCHISE features are completely invisible in restaurant mode

All code lives in one codebase. No separate builds.
