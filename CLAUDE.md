# CLAUDE.md — BalanceIQ Dev Rules

These rules are standing invariants. They are enforced by automated checks
in CI (npm test, npm run check:edge-auth, npm run audit). Breaking any of
them will fail the build.

---

## STANDING RULES

### 1. Edge function auth gate (enforced by check:edge-auth)
Every Supabase edge function that uses `SUPABASE_SERVICE_ROLE_KEY` must
call `requireOrgMember`, `requireCronSecret`, or verify a webhook signature
(`stripe-signature`, `verifyHeader`) before performing any privileged
operation. No exceptions. Shared helpers in `_shared/` are exempt.

### 2. Backup parity (enforced by SAFETY-001 test)
Every new SQLite table must be automatically included in `getAllTablesForBackup`.
The function uses `sqlite_master` to enumerate tables dynamically, so new
tables are picked up without code changes. The `backupSchemaParity` test
fails if any real table is missing from backup output. FTS virtual tables
and their shadow tables are intentionally excluded.

### 3. Invoice-to-GL posting (enforced by code review)
Every code path that creates an invoice with `statut:"Envoyee"` must call
`window.api.ledger.invoicePost` (or `creditNotePost` for credit notes)
immediately after `saveFactures`. A direct `statut:"Envoyee"` assignment
without an invoicePost call is a bug.

Covered paths as of v1.38.2:
- FactureEditor doSave (line ~2670)
- FactureEditor email send (line ~2902)
- DepositScheduleSection generateDepositInvoice (line ~3234)
- InterestConfigSection confirmGenerate (line ~3401)
- RecurringGenerateModal doGenerate (line ~3520)

Verified clean by grep audit: all remaining `statut:"Envoyée"` occurrences
in App.jsx are filter predicates, status-color maps, or the demo PDF — not
new invoice creation sites. Payment plan installments use `statut:"Brouillon"`
at generation and are posted through the normal doSave path.

Integration test: src/__tests__/integration/recurringInvoiceToGL.test.js
(INT-001) covers all three bypass paths end-to-end.

### 4. No em dashes in any file
The character `--` (em dash, U+2014) is banned from all source files,
docs, and comments. Use a regular hyphen `-` or double hyphen `--` instead.
This is a global project rule.

### 5. Shared constants over duplicated definitions
When two functions or modules must share a business rule (e.g.
`RECONCILABLE_STATUSES`, tax rates, account numbers), extract a single
named constant and reference it from both sides. Never duplicate the same
literal value in two places.

### 6. Known audit exemptions (xlsx)
The `xlsx` (SheetJS) package has 3 high-severity vulns with no upstream fix
as of v1.37.5. The audit script uses `--audit-level=critical` to avoid
blocking CI on an unfixable dependency. Replace xlsx with a maintained
alternative (e.g. `exceljs`) in a future sprint. Prototype-pollution and
ReDoS in xlsx only trigger on attacker-controlled spreadsheet input, which
does not apply to BalanceIQ's export-only usage.

### 7. Test isolation: always pass _db to GL functions
`glDraftEntry`, `glPostEntry`, `bankReconcileClose`, `bankReconcilePreview`,
and similar functions accept an optional `_db` parameter. Tests must pass
an in-memory db -- never rely on `getDb()` (which requires Electron's
`app.getPath`). New GL/accounting functions must follow the same pattern.

---

## HOW TO RUN SAFETY CHECKS LOCALLY

```bash
npm test                       # full unit test suite (including SAFETY-001)
npm run test:backup-parity     # just the backup schema parity test
npm run check:edge-auth        # verify all edge functions have auth gates
npm run audit                  # npm audit --production --audit-level=critical
npm run scan:semgrep           # semgrep security scan (slow -- run before big PRs)
```

---

## PROJECT SNAPSHOT

- **Stack**: Electron 31 + React 18 + better-sqlite3 v12 + Vite 5 + Vitest
- **Backend**: Supabase (edge functions, Postgres, auth)
- **Language**: French UI, English code/comments
- **Version**: see package.json

## KEY ARCHITECTURE

- `main.js` -- Electron main process, all IPC handlers, SQLite access
- `preload.js` -- contextBridge exposing `window.api.*`
- `src/App.jsx` -- full React app (~6000+ lines)
- `src/db/database.js` -- SQLite wrapper, migrations, all data functions
- `src/db/migrations.js` -- versioned migration chain (v1-v18)
- `supabase/functions/` -- Deno edge functions
- `supabase/functions/_shared/auth.ts` -- shared `requireOrgMember` helper

## SUPABASE DEPLOY

```bash
SUPABASE_ACCESS_TOKEN="sbp_..." npx supabase functions deploy <fn> --project-ref etiwnesxjypdwhxqnqqq
```
