# BalanceIQ — Build Guide 2: PRO Tier ($49/mo per location)
### Only start this AFTER Build Guide 1 is fully working and tested.
### Give these to Claude Code in order.

---

## WHAT THIS BUILDS

Upgrades to the invoicing module that unlock when a user is on the Pro plan. All features are built into the codebase but gated behind feature flags. Users on the free plan see an upgrade prompt when they try to access these.

---

## STEP 1 — Bulk Encaissement

```
Upgrade the payment recording system. Currently (free tier), users 
can apply one payment to one invoice. 

Add bulk payment capability (gated behind canUse('bulkEncaissement')):

When recording a payment, if the user is on Pro:
- Show CHECKBOXES (not radio buttons) next to each unpaid invoice
- User can select MULTIPLE invoices
- "Appliquer automatiquement" button: distributes payment amount 
  to selected invoices starting with the oldest
- Manual: user types specific amount per invoice in an "Appliquer" 
  column
- Running total shows: "Montant reçu: $500 | Appliqué: $450 | 
  Restant: $50"
- If payment exceeds total owing, offer:
  * "Garder en crédit" → creates a credit on the account
  * "Rembourser" → note only (manual refund)

If user is on free tier and clicks an invoice checkbox beyond the 
first: show upgrade prompt for 'bulkEncaissement'.

All text in French.
```

---

## STEP 2 — Auto-Apply Payments

```
Add "Appliquer automatiquement" feature 
(gated behind canUse('autoApplyPayments')):

When user enters a payment amount and clicks "Auto-appliquer":
1. Sort client's unpaid invoices by date (oldest first)
2. Apply payment to each invoice in order until amount is exhausted
3. Show preview of allocation before saving
4. User confirms or adjusts

If free tier user clicks this button: show upgrade prompt.

All text in French.
```

---

## STEP 3 — Detailed Aging Report

```
Upgrade the aging report (gated behind canUse('detailedAging')):

Currently shows summary (one row per client, totals only).

Add a toggle: "Formulaire détaillé" / "Formulaire sommaire"

Detailed view shows each individual invoice within each client:
| Client | # Facture | Date | Total | Courant | 30j | 60j | 90j+ |

Expandable/collapsible per client (click client name to expand 
and see their individual invoices).

If free tier user clicks "Détaillé": show upgrade prompt.

All text in French.
```

---

## STEP 4 — Account Statements with Bulk Email

```
Add account statement generation and bulk email 
(gated behind canUse('bulkEmailStatements')):

1. ÉTAT DE COMPTE (per client):
   - Client info at top
   - Date range selector
   - All transactions listed: invoices, credit notes, payments
   - Running balance per transaction
   - Aging summary at bottom
   - "Veuillez faire parvenir votre paiement" message
   - PDF format matching invoice style

2. BULK EMAIL:
   From the aging report, add:
   - Checkboxes to select clients
   - "Envoyer les états de compte" button
   - For each selected client:
     * Generate their statement PDF
     * Send via Resend API (not mailto:)
     * To: client email
     * Subject: "État de compte — [Company Name] — [Date]"
     * Body: Summary + PDF attached
   - Show progress: "Envoi 3/8..."
   - Show results: "✓ 7 envoyés, ✗ 1 échec (pas de courriel)"

If free tier user tries to email statements: show upgrade prompt.
Direct email send requires Resend API key in Config.

All text in French.
```

---

## STEP 5 — Recurring Invoices

```
Add recurring invoice capability 
(gated behind canUse('recurringInvoices')):

In a client's profile, add "Factures récurrentes" tab.

Setup:
- Select a product/service (or create custom line items)
- Frequency: Mensuel, Bimensuel, Trimestriel, Annuel
- Jour de facturation: which day of the month (1-28)
- Date de début / Date de fin (or "Indéfinie")
- Auto-envoyer: yes/no (if yes, emails automatically on creation)

Dashboard alert:
On the Facturation dashboard, show:
"3 factures récurrentes à générer" with a "Générer" button.

When clicked:
- Shows preview of all recurring invoices due
- "Créer toutes" button
- Each gets a real invoice number, real status
- If auto-send is on, emails go out via Resend

If free tier user clicks "Factures récurrentes": show upgrade prompt.

All text in French.
```

---

## STEP 6 — Direct Email Send

```
Replace mailto: links with real email sending for Pro users 
(gated behind canUse('directEmailSend')):

1. In Config, add "Service courriel" section:
   - Clé API Resend: [input field]
   - Courriel d'envoi: noreply@balanceiq.ca (or custom domain)
   - "Tester la connexion" button

2. For every "📧 Envoyer" button in the app:
   - If Pro + Resend key configured: send directly
     * Show: "Envoi en cours..." → "✓ Envoyé à client@email.com"
   - If Pro but no Resend key: use mailto: with note to configure
   - If Free: use mailto: (no upgrade prompt here — mailto works fine)

3. Send via Electron main process:
   - POST to Resend API with from, to, subject, html body
   - Attach PDF as base64

All text in French.
```

---

## STEP 7 — Excel Export

```
Upgrade accounting export 
(gated behind canUse('excelExport')):

Add "Excel (.xlsx)" option alongside CSV.

Excel export includes:
- Multiple sheets in one file:
  * Sheet 1: Journal de facturation
  * Sheet 2: Journal des encaissements
  * Sheet 3: Grand livre comptes à recevoir
  * Sheet 4: Sommaire (totals, date range, company info)
- Formatted headers (bold, colored)
- Auto-column widths
- Account numbers included on every line

Use SheetJS (xlsx library) — already available in the project.

If free tier user selects Excel: show upgrade prompt. 
CSV still works for free.

All text in French.
```

---

## STEP 8 — Deposit/Acompte Tracking

```
Add deposit tracking on orders and invoices 
(gated behind canUse('depositTracking')):

On Commande and Facture documents, add:
- "Dépôt requis" field (amount or % of total)
- "Enregistrer un dépôt" button
- When a deposit is recorded:
  * Shows on document: "Dépôt reçu: $500.00"
  * Solde dû updates: Total - Dépôts = Solde
  * Multiple deposits allowed
  * Each deposit is a mini-payment (date, amount, method, reference)
- Deposits are listed in the encaissement history
- PDF shows deposit section before final total

If free tier user clicks "Dépôt requis": show upgrade prompt.

All text in French.
```

---

## STEP 9 — Custom Invoice Templates

```
Add template customization 
(gated behind canUse('customTemplates')):

In Config, add "Modèle de facture" section:
- Logo position: Gauche / Centre / Droite
- Couleur d'accent: color picker (default: #f97316)
- Texte de pied de page: custom footer text
- Conditions par défaut: default notes text for new invoices
- Afficher le numéro TPS/TVQ: yes/no
- Preview button showing a sample invoice

Apply these settings to all PDF generation (invoices, quotes, 
orders, statements, credit notes).

If free tier user opens template settings: show upgrade prompt.
Free tier uses the default BalanceIQ template.

All text in French.
```

---

## YOU'RE DONE WITH PRO TIER

At this point, Pro users have:
✅ Everything from Free tier
✅ Bulk payment recording across multiple invoices
✅ Auto-apply payments (oldest first)
✅ Detailed aging report (per-invoice)
✅ Account statements with bulk email via Resend
✅ Recurring invoices (auto-generate monthly)
✅ Direct email send (not mailto:)
✅ Excel accounting export (multi-sheet)
✅ Deposit/acompte tracking
✅ Custom invoice templates

Test everything thoroughly before moving to Build Guide 3 (Franchise tier).
