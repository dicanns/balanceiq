# BalanceIQ — Build Guide 1: FREE Tier (Restaurant / Franchisé)
### Give these instructions to Claude Code IN ORDER. Complete and test each step before moving to the next.

---

## WHAT THIS BUILDS

Everything a single restaurant owner or franchisee gets for free. No cloud, no subscriptions, no login required. All data local in SQLite. This is the open source product.

---

## STEP 1 — App Mode (First Launch Screen)

```
Add an app mode system. On FIRST LAUNCH (no mode saved), show:

"Bienvenue sur BalanceIQ"
"Comment utilisez-vous l'application?"

Two large buttons:
  [🏪 Restaurant / Franchisé]
  [🏢 Franchiseur / Siège social]

For NOW, only the Restaurant mode works. If they click Franchiseur, 
show: "Mode Franchiseur — disponible prochainement" and default 
them to Restaurant mode.

Save the choice to storage. In Config, show current mode but don't 
allow switching to Franchiseur yet.

All text in French.
```

**Test:** App shows welcome screen on first launch. Selecting Restaurant proceeds to the app normally. Reopening skips the welcome screen.

---

## STEP 2 — Feature Flag System

```
Create a feature flag system in src/config/features.js.

For now, everything is set to the FREE tier. We'll add Pro/Franchise 
flags later. The purpose right now is to have the STRUCTURE in place 
so we can gate features later without refactoring.

const CURRENT_PLAN = 'free'; // will be dynamic later

const PLAN_FEATURES = {
  free: {
    clientDatabase: true,
    categoriesProducts: true,
    invoiceFlow: true,
    creditNotes: true,
    singlePaymentRecord: true,
    basicAging: true,
    pdfPrint: true,
    mailtoEmail: true,
    singleCsvExport: true,
    // Pro features (locked)
    bulkEncaissement: false,
    autoApplyPayments: false,
    detailedAging: false,
    bulkEmailStatements: false,
    recurringInvoices: false,
    directEmailSend: false,
    excelExport: false,
    depositTracking: false,
    customTemplates: false,
    cloudBackup: false,
    // Franchise features (hidden in restaurant mode)
    royaltyAutoCalc: false,
    autoGenerateRoyaltyInvoices: false,
    multiLocationReconciliation: false
  }
};

Create a helper: canUse(featureName) that returns true/false.
Create a helper: showUpgradePrompt(featureName) that shows:
  "Cette fonctionnalité est disponible avec BalanceIQ Pro.
   [En savoir plus] [Fermer]"
  (non-aggressive, dismissable, shown once per session per feature)

Don't gate anything yet — just set up the system. We'll wire it 
into the invoicing UI as we build.
```

**Test:** Feature flags file exists. canUse('clientDatabase') returns true. canUse('bulkEncaissement') returns false.

---

## STEP 3 — Company Info (Config)

```
In the Config tab, add a new section at the top: 
"🏢 Informations de l'entreprise"

Fields:
- Nom de l'entreprise
- Adresse
- Ville
- Province (dropdown)
- Code postal
- Téléphone
- Courriel
- Site web (optional)
- Numéro TPS (e.g., "123456789 RT0001")
- Numéro TVQ (e.g., "1234567890 TQ0001")
- Logo (image upload — save to app data directory)

This info will appear on all invoices, quotes, and statements.
Save to SQLite. All text in French.
```

**Test:** Fill in company info, close app, reopen — info persists. Logo uploads and displays.

---

## STEP 4 — Categories

```
In the Facturation tab (create this new tab now — place it after 
Encaisse), add a "Catégories" sub-section.

IMPORTANT: Start completely blank. No pre-populated categories. 
Users create their own.

Category fields:
- Nom de la catégorie (e.g., "Redevances", "Produits", "Services")
- # Compte de revenu (optional — accounting account number, e.g., "4050")
- # Compte d'escompte (optional — discount account number)
- Description (optional)
- Actif: yes/no toggle

UI:
- List view showing all categories
- "+ Nouvelle catégorie" button
- Click to edit, ✕ to deactivate (not delete — data may reference it)
- Sortable by drag or by name

Save to SQLite. All text in French.
```

**Test:** Create 3-4 categories. Edit one. Deactivate one. Close and reopen — all persist.

---

## STEP 5 — Products & Services

```
In the Facturation tab, add "Produits & Services" sub-section.

Products are SUBDIVISIONS of categories. Each product belongs to 
exactly one category.

Product/Service fields:
- Code produit (auto-generated or custom, e.g., "MAYO-EP")
- Description (shown on invoices)
- Catégorie (dropdown — from user-created categories in Step 4)
- Prix unitaire par défaut (default price)
- Unité de mesure (dropdown: unité, douzaine, kg, litre, heure, 
  forfait, %, boîte, caisse — also allow typing a custom unit)
- Taxable TPS: yes/no toggle (default: yes)
- Taxable TVQ: yes/no toggle (default: yes)
- Notes internes (not shown on invoices)
- Actif: yes/no toggle

UI:
- List view grouped by category (collapsible groups)
- Searchable by name or code
- Filter by category, active/inactive
- "+ Nouveau produit" button
- Click to edit

Save to SQLite. All text in French.
```

**Test:** Create products under different categories. Search works. Grouping by category works. Deactivated products don't show in search but still exist.

---

## STEP 6 — Client Database

```
In the Facturation tab, add "Clients" as the main section 
(it should be the default view when opening the tab).

Client fields:
- Code client (auto-generated: CLI-001, CLI-002... or user can type custom)
- Entreprise (company name) — REQUIRED
- Contact (person name)
- Adresse
- Ville
- Province (dropdown: QC, ON, AB, BC, MB, SK, NS, NB, PE, NL, YT, NT, NU)
- Code postal
- Pays (default: Canada)
- Téléphone #1
- Téléphone #2
- Cellulaire
- Courriel
- Langue (dropdown: Français, English) — for invoice language in the future
- Conditions de paiement (dropdown: Sur réception, Net 15, Net 30, 
  Net 45, Net 60, Personnalisé)
  - If Personnalisé: show a "Nombre de jours" field
- Notes (internal, not shown on documents)
- Statut: Actif / Inactif

Client list view:
- Table columns: Code, Entreprise, Contact, Ville, Téléphone, Solde dû
- Searchable (search across code, entreprise, contact)
- Filter: Actif / Inactif / Tous
- Sort by any column header
- "+ Nouveau client" button
- Click a row to open client profile

Client profile page:
- All contact fields (editable)
- Quick action buttons at top:
  * Nouvelle soumission
  * Nouvelle commande
  * Nouvelle facture
  * Nouvelle note de crédit
  * Nouvel encaissement
  * État de compte
- Tabs at bottom showing history:
  * Factures (list of all invoices for this client)
  * Commandes (list of all orders)
  * Soumissions (list of all quotes)
  * Encaissements (list of all payments received)
  * Notes

The history tabs are empty for now — we'll populate them as we 
build the document flow.

Save to SQLite. All text in French.
```

**Test:** Create 5+ clients with full info. Search works. Sort works. Filter active/inactive works. Open a profile, edit info, save. Close and reopen — all persists.

---

## STEP 7 — Document Number Configuration

```
In Config, under company info, add:

"Numérotation des documents"
- Prochain # soumission (default: 1, displays as S-0001)
- Prochain # commande (default: 1, displays as C-0001)
- Prochain # facture (default: 1, displays as F-0001)
- Prochain # note de crédit (default: 1, displays as NC-0001)
- Prochain # encaissement (default: 1, displays as E-0001)
- Préfixe (optional — e.g., "BIQ-" makes "BIQ-F-0001")

Each number auto-increments when a document is created.
Users can adjust the next number (e.g., if migrating from another system).

Save to SQLite.
```

**Test:** Set starting numbers. Create a document (next step) and verify number increments.

---

## STEP 8 — Soumission (Quote)

```
Build the Soumission (quote) document type.

Create from: client profile "Nouvelle soumission" button, 
or from Facturation tab "+ Nouvelle soumission" button.

HEADER:
- # Soumission (auto-generated from config sequence)
- Date (default: today)
- Date d'expiration (default: today + 30 days, editable)
- Client (searchable dropdown — selecting auto-fills address block)
- Référence client / Bon de commande (optional text field)
- Statut: Brouillon (default), Envoyée, Acceptée, Refusée, Expirée

LINE ITEMS:
- Each line:
  * Produit (searchable dropdown from product catalog — auto-fills 
    description, price, unit, tax settings when selected)
  * Description (editable — can override what came from catalog)
  * Quantité (number)
  * Prix unitaire (number — pre-filled from catalog, editable)
  * Remise % (discount per line — optional, default 0)
  * Total ligne (auto-calculated: qty × price × (1 - remise%))
- Can also add a free-text line without selecting a product
  (just type in description and price manually)
- "+ Ajouter une ligne" button
- ✕ to delete a line
- Drag to reorder lines (optional — nice to have, skip if complex)

TOTALS (auto-calculated):
- Sous-total (sum of all line totals)
- TPS 5% (sum of TPS on taxable lines only)
- TVQ 9.975% (sum of TVQ on taxable lines only)
- Total

NOTES:
- Text area: "Notes / Conditions" (shown on printed document)
- Default text configurable in Config (e.g., "Soumission valide 30 jours")

ACTIONS:
- 💾 Sauvegarder
- 🖨️ Imprimer (generate PDF view, open print dialog)
- 📧 Envoyer (mailto: link with client email, subject, summary in body)
- "Convertir en commande" button → creates a Commande with same data
- "Convertir en facture" button → creates a Facture with same data
- 🗑️ Supprimer (only if status is Brouillon)

PDF/PRINT FORMAT:
- Company logo + info (from Config) at top
- "SOUMISSION" title
- Soumission number and dates
- Client info block (name, address)
- Line items table
- Totals with tax breakdown
- Notes/conditions
- TPS/TVQ registration numbers at bottom

Save to SQLite. All text in French.
```

**Test:** Create a quote for a client with 3+ line items including discounts. Print it. Email it. Verify totals are correct including taxes on taxable-only items.

---

## STEP 9 — Commande (Order)

```
Build the Commande (order) document type. Nearly identical to 
Soumission but with different statuses and a delivery date.

Same structure as Soumission (Step 8) with these differences:
- # Commande (from commande sequence)
- No expiration date — instead: "Date de livraison" (optional)
- Statut: Brouillon, Confirmée, En cours, Complétée, Annulée
- Quantities remain editable until status is Complétée
- "Facturer cette commande" button → creates a Facture
- Title on PDF: "BON DE COMMANDE"

Can be created:
- From scratch (+ Nouvelle commande)
- From client profile
- Converted from a Soumission (copies all data, links to original)

When converted from Soumission, the soumission status changes to 
"Acceptée" and shows a link: "Voir commande C-0001"

Save to SQLite. All text in French.
```

**Test:** Create an order. Convert a quote to an order — verify quote status changes. Print order PDF.

---

## STEP 10 — Facture (Invoice)

```
Build the Facture (invoice) document type. Same structure as 
Soumission/Commande with these differences:

- # Facture (from facture sequence)
- Date d'échéance (auto-calculated from client's payment terms)
- Statut: Brouillon, Envoyée, Payée partiellement, Payée, En retard, Annulée
- Once status moves past Brouillon, line items are LOCKED 
  (use credit notes for adjustments)
- Shows payment info at bottom:
  "Montant payé: $0.00 | Solde dû: $1,234.56"
- Title on PDF: "FACTURE"
- Due date prominently shown on PDF

Auto-detect overdue: if today > date_due and status is Envoyée, 
show status as "En retard" in red.

Can be created:
- From scratch
- From client profile  
- Converted from Commande (copies data, links to original)
- Converted from Soumission (copies data, links)

Save to SQLite. All text in French.
```

**Test:** Create an invoice. Set payment terms to Net 30, verify due date calculates. Convert an order to an invoice. Check overdue detection by creating a backdated invoice.

---

## STEP 11 — Single Payment Recording (Encaissement)

```
Build basic payment recording. In the FREE tier, this is 
ONE payment applied to ONE invoice at a time.

Access from: client profile "Nouvel encaissement" button, 
or from an invoice's "Enregistrer un paiement" button.

FLOW:
1. Client is pre-selected (from wherever they navigated from)
2. Show list of unpaid/partially paid invoices for this client:
   | # Facture | Date | Total | Déjà payé | Solde |
3. User selects ONE invoice (radio button, not checkboxes — 
   checkboxes are Pro feature for bulk)
4. Enter payment details:
   - Date du versement (default: today)
   - Montant reçu
   - Mode de paiement (dropdown: Chèque, Virement/E-Transfer, 
     Carte de crédit, Carte de débit, Comptant, Autre)
   - Numéro de référence (optional)
   - Note (optional)
5. Save → updates invoice:
   - If fully paid: status → "Payée"
   - If partially paid: status → "Payée partiellement", 
     shows remaining balance
6. Receipt number auto-generated: E-0001, etc.
7. Show confirmation: "✓ Paiement de $XXX enregistré sur facture F-XXXX"

Payment is printable as a receipt (simple format).

LINK TO ENCAISSE TAB:
If payment mode = "Comptant", create a read-only entry in the 
Encaisse tab's cash entries for that date. The Facturation module 
OWNS the data — Encaisse only READS it.

Save to SQLite. All text in French.
```

**Test:** Record a payment against an invoice. Verify invoice status changes. Record a partial payment, verify status shows partially paid with balance. Check that cash payments appear in Encaisse.

---

## STEP 12 — Credit Notes

```
Build credit note document type.

- # Note de crédit (NC-0001, etc.)
- Links to original invoice (optional — dropdown of client's invoices)
- Same line item structure as invoice BUT amounts show as NEGATIVE
- Raison (required): dropdown + free text
  * Erreur de facturation
  * Retour de marchandise
  * Ajustement de prix
  * Autre (must type explanation)
- When saved, reduces client's balance owing
- If linked to a specific invoice, that invoice's "payé" amount 
  increases by the credit amount
- Title on PDF: "NOTE DE CRÉDIT"
- Shown in red/negative styling

Can be created from client profile or from a specific invoice.

Save to SQLite. All text in French.
```

**Test:** Create a credit note for $50 against an invoice of $200. Verify the invoice now shows $50 paid. Create a standalone credit note (no linked invoice).

---

## STEP 13 — Basic Aging Report (Summary)

```
Build the basic aging report. In the FREE tier, this is 
SUMMARY ONLY (totals per client, no per-invoice breakdown).

Access from: Facturation tab dashboard area.

Show a table:
| Client | Montant dû | Courant | 30 jours | 60 jours | 90+ jours |

- Courant = invoices not yet past due date
- 30 jours = 1-30 days past due
- 60 jours = 31-60 days past due
- 90+ jours = 61+ days past due
- Each cell shows the TOTAL for that client in that bucket
- Do NOT show individual invoices (that's Pro — "Voir le détail" 
  button shows upgrade prompt via canUse('detailedAging'))
- Color-coded: Courant (white), 30 (yellow), 60 (orange), 90+ (red)
- Totals row at bottom
- Sort by any column
- Date selector: "Âge des comptes au:" (default: today)

Save to SQLite. All text in French.
```

**Test:** Create several invoices with different due dates (some current, some overdue). Verify they sort into correct aging buckets.

---

## STEP 14 — Document List & Dashboard

```
Build the main Facturation tab dashboard.

When opening the Facturation tab, show:

TOP — Quick stats cards (same style as daily tab):
- Total facturé ce mois (sum of all invoices created this month)
- Total encaissé ce mois (sum of all payments received this month)
- Total en souffrance (sum of all unpaid invoice balances)
- Factures en retard (count of overdue invoices)

MIDDLE — Filter tabs:
  Tous | Soumissions | Commandes | Factures | Notes de crédit

TABLE — Document list:
| # | Type | Date | Client | Total | Statut | Solde |

- Type shown as pill: S (blue), C (purple), F (orange), NC (red)
- Statut color-coded pills (same as rest of app)
- Sortable by any column
- Searchable (by number, client name)
- Date range filter
- Click a row to open the document

ACTIONS:
- "+ Nouvelle soumission" button
- "+ Nouvelle commande" button
- "+ Nouvelle facture" button
- "Âge des comptes" button → opens aging report
- "Exporter" button → CSV export of visible list

All text in French.
```

**Test:** Create various document types. Verify dashboard stats are accurate. Filters work. Search works. Export CSV.

---

## STEP 15 — Accounting Export (CSV)

```
Add accounting export to the Facturation tab.

"📊 Exporter pour comptabilité" button. Opens a dialog:

Date range: [Début] → [Fin]

Export type (radio buttons):
- Journal de facturation
- Journal des encaissements
- Grand livre comptes à recevoir

Format: CSV (free tier — Excel option shows upgrade prompt)

JOURNAL DE FACTURATION columns:
Date, # Facture, Code client, Nom client, Code produit, 
Catégorie, # Compte revenu, Description, Quantité, 
Prix unitaire, Sous-total, TPS, TVQ, Total

JOURNAL DES ENCAISSEMENTS columns:
Date, # Encaissement, Code client, Nom client, # Facture, 
Montant, Mode de paiement, Référence

GRAND LIVRE COMPTES À RECEVOIR columns:
Code client, Nom client, Solde ouverture, Facturé, 
Notes de crédit, Encaissé, Solde fermeture

The account numbers from categories are included so the 
accountant can map to their chart of accounts.

All text in French.
```

**Test:** Create invoices and payments. Export each report type. Open in Excel. Verify account numbers are present and totals match.

---

## STEP 16 — Wire History Tabs on Client Profile

```
Now that all document types exist, wire the history tabs on 
the client profile page:

- Factures tab: show all invoices for this client, sorted by date desc
- Commandes tab: show all orders for this client
- Soumissions tab: show all quotes for this client
- Encaissements tab: show all payments received from this client
- Each row is clickable → opens the document

Also show "Solde dû" on the client profile — total of all 
unpaid invoice balances minus credits.

All text in French.
```

**Test:** Open a client with multiple documents. All tabs show correct data. Solde dû is accurate.

---

## YOU'RE DONE WITH FREE TIER

At this point, a restaurant owner or franchisee has:
✅ Client database
✅ User-created categories with accounting account numbers
✅ Product catalog as subdivision of categories
✅ Full quote → order → invoice flow
✅ Credit notes
✅ Single payment recording
✅ Basic aging report (summary)
✅ PDF print for all documents
✅ Email via mailto:
✅ CSV accounting export
✅ Dashboard with stats
✅ Feature flag system ready for Pro features

Test everything thoroughly before moving to Build Guide 2 (Pro tier).
