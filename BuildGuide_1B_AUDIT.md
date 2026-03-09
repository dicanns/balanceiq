# BalanceIQ — Build Guide 1B: Audit Trail
### Build this AFTER Guide 1 (Free tier) is complete, BEFORE Guide 2 (Pro).
### This protects both franchisees and franchisors.

---

## WHAT THIS BUILDS

An immutable audit log that records every change made in the system. Nothing is ever truly deleted — only marked as void. Every modification saves the original values. The audit trail protects:

- **Franchisees** — proof that their reported numbers weren't tampered with
- **Franchisors** — proof that sales weren't underreported
- **Accountants** — full history of every correction and why

---

## CORE PRINCIPLES

1. **APPEND ONLY** — the audit table only receives INSERTs, never UPDATEs or DELETEs
2. **ORIGINAL PRESERVED** — every change stores the before AND after values
3. **TIMESTAMPED** — every entry has an exact timestamp
4. **IDENTIFIED** — every entry records who made the change (user/device)
5. **REASON REQUIRED** — corrections to key financial fields require a reason
6. **INVOICES NEVER DELETED** — invoices can be voided (Annulée) but the record remains forever
7. **DAILY DATA NEVER DELETED** — daily close-out data can be corrected but originals are preserved

---

## STEP 1 — Audit Database Table

```
Create an immutable audit log system that tracks every change 
across the entire app. This is a FOUNDATION piece — it needs to 
be solid and untamperable.

Create a new SQLite table:

CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  device_id TEXT NOT NULL,
  user_name TEXT DEFAULT 'local',
  module TEXT NOT NULL,
  action TEXT NOT NULL,
  record_type TEXT NOT NULL,
  record_id TEXT NOT NULL,
  field_name TEXT,
  old_value TEXT,
  new_value TEXT,
  reason TEXT,
  metadata TEXT
);

CREATE INDEX idx_audit_module ON audit_log(module);
CREATE INDEX idx_audit_record ON audit_log(record_type, record_id);
CREATE INDEX idx_audit_timestamp ON audit_log(timestamp);

CRITICAL: 
- This table must NEVER have UPDATE or DELETE operations run on it
- The app code must not expose any function to modify or delete audit entries
- Generate a device_id on first launch (UUID) and store it — this 
  identifies which computer made the change

The 'module' field values:
  'daily' — daily report data
  'inventory' — inventory changes
  'caisse' — cash register data
  'employee' — employee hours/wages
  'encaisse' — cash position data
  'pl' — P&L monthly data
  'livraisons' — delivery platform data
  'invoice' — invoicing documents
  'payment' — payment records
  'client' — client data
  'product' — product/category data
  'config' — configuration changes

The 'action' field values:
  'create' — new record created
  'update' — field value changed
  'void' — record voided/cancelled (NOT deleted)
  'correct' — financial correction with reason
  'restore' — data restored from backup

All text in French. Update CLAUDE.md when done.
```

---

## STEP 2 — Audit Logger Service

```
Create src/services/auditLogger.js — a centralized logging service.

Functions:

logCreate(module, recordType, recordId, newData)
  — Called when any record is created (invoice, client, daily entry, etc.)
  — Stores the full initial data as new_value

logUpdate(module, recordType, recordId, fieldName, oldValue, newValue, reason)
  — Called when any field changes
  — Stores before and after values
  — reason is optional for non-financial fields, REQUIRED for financial fields

logVoid(module, recordType, recordId, reason)
  — Called when a record is voided/cancelled
  — reason is REQUIRED
  — The original record stays in the database, only status changes

logCorrection(module, recordType, recordId, fieldName, oldValue, newValue, reason)
  — Called when a financial correction is made
  — reason is ALWAYS required
  — This is different from a regular update — it indicates a deliberate 
    correction to previously-saved financial data

logRestore(restoreDate, recordCount)
  — Called when data is restored from a JSON backup

FINANCIAL FIELDS that require a reason when corrected:
  Daily: posVentes, posTPS, posTVQ, posLivraisons, float, interac, 
         livraisons, deposits, finalCash, hamEnd, hotEnd, hamReceived, 
         hotReceived
  P&L: Any supplier amount, any expense amount, revenue override
  Invoice: Any line item amount, total, discount
  Payment: Amount, date
  Encaisse: Any deposit amount, any cash payout amount, physical count

When a financial field is changed AFTER the record was initially saved, 
show a dialog:
  "Correction financière"
  "Vous modifiez un champ déjà enregistré. Veuillez indiquer la raison:"
  [Text input — required]
  [Sauvegarder] [Annuler]

Non-financial fields (notes, weather, events, client phone number, etc.) 
are logged silently without requiring a reason.

All text in French.
```

---

## STEP 3 — Wire Audit into Daily Operations

```
Wire the audit logger into ALL existing daily operations:

DAILY TAB:
- When a day's data is saved for the FIRST time: logCreate('daily', ...)
- When any caisse field changes after initial save: logUpdate or logCorrection
- When inventory fields change after save: logCorrection with reason
- When employee hours are modified: logUpdate
- When notes/weather/gas change: logUpdate (no reason needed)

IMPORTANT — "after initial save" detection:
- Track whether a record has been previously saved
- First save = logCreate (no reason needed, they're entering fresh data)
- Any change to a previously saved financial field = logCorrection (reason required)
- The debounced auto-save counts as the first save
- Changes within the same editing session (before navigating away) 
  can be grouped — don't prompt for reason on every keystroke

P&L TAB:
- When a supplier bill is added: logCreate
- When a bill amount is modified: logCorrection with reason
- When a bill is removed: logVoid with reason (bill stays in database, 
  marked as voided, doesn't count in totals)

ENCAISSE TAB:
- When deposits/payouts are entered: logCreate
- When amounts are modified: logCorrection with reason
- When entries are removed: logVoid with reason

All text in French.
```

---

## STEP 4 — Wire Audit into Invoicing

```
Wire the audit logger into the invoicing module.

INVOICES / QUOTES / ORDERS:
- Creating a document: logCreate with full document data
- Changing status: logUpdate('invoice', 'status', docId, oldStatus, newStatus)
- Modifying line items AFTER initial save: logCorrection with reason
- VOIDING an invoice: logVoid with reason
  * CRITICAL: Never delete an invoice record from the database
  * Set status to "Annulée", add void reason, add void date
  * The invoice number is NEVER reused
  * The document remains visible in history with "ANNULÉE" stamp
  * Void reason is shown on the document

PAYMENTS:
- Recording a payment: logCreate
- Modifying a payment: logCorrection with reason 
  (you almost never modify a payment — if wrong, void it and create a new one)
- Voiding a payment: logVoid with reason
  * The invoice's paid amount reverts
  * The payment record stays, marked as void

CREDIT NOTES:
- Creating: logCreate
- Cannot be deleted — only voided with reason

CLIENTS:
- Creating: logCreate
- Modifying contact info: logUpdate (no reason needed)
- Deactivating: logUpdate with note

PRODUCTS / CATEGORIES:
- Creating: logCreate
- Modifying price: logUpdate
- Deactivating: logUpdate (never delete)

All text in French.
```

---

## STEP 5 — Delete Prevention

```
Across the ENTIRE app, replace all delete operations with void operations:

RULES:
1. NO database DELETE statements on any financial data — ever
2. "Delete" buttons become "Annuler" or "Void" buttons with reason
3. Voided records are hidden from normal views but remain in the database
4. Voided records are visible in audit views and history

Specifically:
- Invoices: ✕ button → "Annuler cette facture?" → reason → status = Annulée
- Payments: ✕ button → "Annuler ce paiement?" → reason → status = Annulé
- Credit notes: ✕ button → "Annuler?" → reason → status = Annulée
- P&L bill entries: ✕ button → "Retirer cette facture?" → reason → 
  marked as voided, excluded from totals but visible in history
- Daily caisse data: CANNOT be deleted at all — only corrected

NON-FINANCIAL records CAN be deleted (but still logged):
- Clients can be deactivated (not deleted)
- Products can be deactivated (not deleted)
- Categories can be deactivated (not deleted)
- Employee roster entries can be removed (logged)
- Cashier roster entries can be removed (logged)

All text in French.
```

---

## STEP 6 — Audit Viewer

```
Create an "📋 Historique des modifications" section accessible from:
1. Config tab (full audit log)
2. Each document (invoice, quote, order) — shows changes for that document
3. Each day's daily report — shows changes for that day

FULL AUDIT LOG (Config):
- Table: Date/heure | Module | Action | Enregistrement | Champ | 
  Ancienne valeur | Nouvelle valeur | Raison
- Filterable by:
  * Date range
  * Module (daily, invoice, payment, etc.)
  * Action type (create, update, correct, void)
  * Record type
- Searchable
- Sortable by date (newest first by default)
- Export to CSV

PER-DOCUMENT AUDIT (on each invoice/quote/order):
- Button: "📋 Historique" on the document view
- Shows all changes made to THIS document in chronological order
- Clear display: "Le 5 mars à 14:32 — Montant ligne 2 changé de 
  89.82$ à 119.76$ — Raison: Erreur de prix, corrigé par le fournisseur"

PER-DAY AUDIT (on daily report):
- Small "📋" icon in the daily tab header
- Shows all changes to that day's data
- Highlights corrections in orange

IMPORTANT — Audit viewer is READ ONLY. No editing, no deleting, 
no filtering out entries. What's logged stays logged.

In Restaurant mode: the user can see their own audit log.
In Franchiseur mode: the franchisor can see audit logs for 
all locations (when viewing a specific location).

All text in French.
```

---

## STEP 7 — Daily Close-Out Snapshot

```
Add a "snapshot" system for daily data. When the user indicates 
their day is complete (the "Journée complète" indicator), take 
an immutable snapshot of that day's data.

When all caisses are balanced and the user navigates away from 
that day (or clicks a "Confirmer la fermeture" button):

1. Save a complete JSON snapshot of that day's data to a 
   separate table:

   CREATE TABLE daily_snapshots (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     date TEXT NOT NULL,
     snapshot_timestamp TEXT NOT NULL DEFAULT (datetime('now','localtime')),
     data TEXT NOT NULL,
     device_id TEXT NOT NULL
   );

2. This snapshot is IMMUTABLE — never updated or deleted
3. If the user goes back and changes data after the snapshot, 
   the audit log captures those changes as corrections
4. The snapshot represents "what the numbers were at close-out"

In the audit viewer for a specific day, show:
"📸 Snapshot de fermeture — [timestamp]"
With ability to compare: current values vs snapshot values
Differences highlighted in orange

This is powerful for franchisors: "The close-out said $2,400 
but someone changed it to $2,200 the next morning"

The snapshot is also valuable for the franchisee as proof: 
"These were my numbers when I closed — any changes after that 
weren't mine."

All text in French.
```

---

## STEP 8 — Audit Export & Reporting

```
Add audit reporting capabilities:

1. EXPORT COMPLET:
   "Exporter le journal d'audit" button in Config
   - Date range selector
   - Filter by module
   - CSV export with all fields
   - This is what an accountant or auditor would request

2. CORRECTION REPORT:
   "Rapport des corrections" — shows only logCorrection entries
   - Grouped by date
   - Shows: what was changed, from what to what, why, when
   - This is what a franchisor reviews monthly

3. VOID REPORT:
   "Rapport des annulations" — shows only logVoid entries
   - All voided invoices, payments, credit notes, bill entries
   - With reasons
   - Dates and original amounts

4. INTEGRITY CHECK:
   In Config, add "Vérification d'intégrité" button:
   - Compares current daily data against snapshots
   - Lists any day where current values differ from the close-out snapshot
   - Shows: Date | Champ | Valeur snapshot | Valeur actuelle | Modifié le
   - This is a quick way for a franchisor to spot post-close modifications

All text in French.
```

---

## STEP 9 — Cloud Sync for Franchise Tier

```
IMPORTANT: This step is for FUTURE implementation when cloud 
sync (Supabase) is set up. For now, just document the plan 
and add placeholder code.

When the Franchise tier cloud sync is built:

1. The audit_log table syncs to Supabase automatically
2. The daily_snapshots table syncs to Supabase automatically
3. The franchisor can view audit trails for ALL locations 
   from their dashboard — without physically visiting the location
4. Audit data is READ-ONLY on the cloud — even the franchisor 
   cannot modify audit entries
5. The cloud acts as a backup — even if a franchisee reinstalls 
   the app or replaces their computer, the audit trail survives

For now, add a comment in the sync service:
// TODO: Sync audit_log and daily_snapshots to Supabase 
// when Franchise cloud tier is implemented

And in the Réseau tab (franchiseur mode), add a placeholder:
"📋 Journal d'audit réseau — disponible avec synchronisation cloud"

All text in French.
```

---

## BUILD ORDER SUMMARY

The full build sequence is now:

```
Build Guide 1:  FREE tier invoicing (16 steps)
Build Guide 1B: Audit Trail (9 steps) ← YOU ARE HERE
Build Guide 2:  PRO tier features (9 steps)
Build Guide 3:  FRANCHISE tier / Franchisor module (9 steps)
```

After this guide is complete, every change in the system is tracked, 
financial data cannot be silently altered, and there's a clear paper 
trail for accountability. This is what makes BalanceIQ trustworthy 
for franchise relationships.
