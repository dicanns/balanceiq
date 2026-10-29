# CLAUDE.md - BalanceIQ Dev Rules

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
in App.jsx are filter predicates, status-color maps, or the demo PDF - not
new invoice creation sites. Payment plan installments use `statut:"Brouillon"`
at generation and are posted through the normal doSave path.

Integration test: src/__tests__/integration/recurringInvoiceToGL.test.js
(INT-001) covers all three bypass paths end-to-end.

### 4. No em dashes in any file (enforced by check:no-em-dash)
The em dash (U+2014) is banned from every text file in the repository:
source, tests, docs, comments and user-facing strings alike. Use a
hyphen `-`. `npm run check:no-em-dash` lists offenders and fails CI.

### 5. Shared constants over duplicated definitions
When two functions or modules must share a business rule (e.g.
`RECONCILABLE_STATUSES`, tax rates, account numbers), extract a single
named constant and reference it from both sides. Never duplicate the same
literal value in two places.

### 6. Dependency audit
`xlsx` (SheetJS) was replaced by `exceljs` (v1.73.0); no audit exemption
remains. `npm run audit` runs against production dependencies at the
level in package.json. The advisories in exceljs's Node-only helpers
(`archiver`, `tmp`, `uuid`) are pinned to fixed versions through
`overrides` in package.json; keep those pins when bumping exceljs.

### 7. Test isolation: always pass _db to GL functions
`glDraftEntry`, `glPostEntry`, `bankReconcileClose`, `bankReconcilePreview`,
and similar functions accept an optional `_db` parameter. Tests must pass
an in-memory db -- never rely on `getDb()` (which requires Electron's
`app.getPath`). New GL/accounting functions must follow the same pattern.

### 8. Money in new tables is INTEGER cents (enforced by MONEY-001)
Thirty-two columns hold money as `_cents INTEGER`; a known set of older
tables hold it as `REAL` (listed in src/__tests__/accounting/gl/moneyColumns.test.js).
New money columns are integer cents. Convert at the boundary with
`Math.round(x * 100)` and never compare a REAL amount to a cents amount
without converting first.

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

---

## LEGACY SOFTWARE (Kesa, Mon Resto, Fortune 1000)

Anthony's current billing, till and accounting programs live on the ThinkPad and are copied
nightly to the backup server. Before studying them, read docs/LEGACY_SOFTWARE_ACCESS.md: it gives
the two SSH doors (already keyed from this Mac), what every folder is, how the data can be read,
and the rules (read-only, no personal data in the repo, nothing installed or changed on the
ThinkPad without Anthony).


## If Claude is on a new account (written 2026-10-28)

Anthony may have moved from the business Claude account to a personal one. Nothing in this folder depends on the Claude account:
- The code, data and git history are plain files here. Claude Code conversations about this folder are local too
  (`~/.claude/projects/`), and a readable copy of every past conversation is in
  `~/Documents/CLAUDE EXPORT - all conversations (READ ME)/`. Read the relevant ones there if context is missing.
- Logins used from the terminal (GitHub `gh`, Vercel, Cloudflare `wrangler`, Supabase CLI, SSH keys to the ThinkPad and the
  backup server) live on this Mac, not in the Claude account. They keep working. Test with the usual command before assuming otherwise.
- Only the connectors inside the Claude desktop app (Supabase, Netlify, Sentry, Stripe, Spark mail, Claude Docs, Chrome extension,
  scheduled tasks) are tied to the account. If a connector tool is missing, ask Anthony to re-add it under Connectors; do not work around it.
- The full account-move notes and the day-of checklist: `~/Desktop/Automation/docs/MOVE.md`. The automation machine (ThinkPad) and the
  backup server are documented in `~/Desktop/Automation/HANDBOOK.md`.
