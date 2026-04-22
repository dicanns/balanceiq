# BalanceIQ Test Suite

Run: `npm test` (vitest unit) + `npm run test:e2e` (Playwright)

## Test counts by area

| Area | Files | Tests | Status |
|------|-------|-------|--------|
| Calculations (pure math) | 1 | 75 | all passing |
| Database integrity (legacy) | 1 | 32 | all passing |
| Invoice balance | 1 | 12 | all passing |
| Encaisse chain | 1 | 10 | all passing |
| Feature flags | 1 | 8 | all passing |
| Anomaly detection | 1 | 14 | all passing |
| Forecast engine | 1 | 18 | all passing |
| Date utilities | 1 | 22 | all passing |
| Stepped royalty | 1 | 18 | all passing |
| Now List | 1 | ~15 | all passing |
| Chaos / user behavior | 1 | 101 | all passing |
| **GL (accounting)** | **1** | **3** | **all passing** |
| **Bank (accounting)** | **1** | **3** | **all passing** |
| **Tax — CTI/RTI** | **1** | **3** | **all passing** |
| **Tax — Reproducibility** | **1** | **3** | **all passing** |
| **Tax — Invoice TPS (stub)** | **1** | **3** | **skipped — Sprint 9** |
| **Tax — Exempt customer (stub)** | **1** | **3** | **skipped — Sprint 9** |
| **Migrations — Fresh install** | **1** | **4** | **all passing** |
| **Migrations — Pre-ledger upgrade** | **1** | **5** | **all passing** |
| **Migrations — Backup/restore** | **1** | **3** | **all passing** |
| **Migrations — Tax metadata backfill** | **1** | **2** | **all passing** |
| **E2E — App launch + tabs (Playwright)** | **1** | **~8** | **see note** |
| **E2E — Bank to reconcile (Playwright)** | **1** | **4** | **see note** |
| **E2E — Invoice to ledger (stub)** | **1** | **2** | **skipped — Sprint 9** |

**Total unit tests (vitest):** 539 passing, 6 skipped (as of Sprint 6)

Playwright e2e tests require a running Electron build (`npm run build:mac` or `npm start`).

## Sprint 5 Block Status

| Block | Condition | Status |
|-------|-----------|--------|
| Block A (GL-016, MATCH-002, e2e bank-to-reconcile) | Always required | Done |
| Block A (e2e invoice-to-ledger) | Always required | Stubbed — Sprint 9 |
| Block B (TAX-011, TAX-016) | CTI/RTI in branch (v11 merged) | Done |
| Block B (TAX-001, TAX-003) | Invoice-to-GL chain not built | Stubbed — Sprint 9 |
| Block C (MIG-001 through MIG-011) | Migration upgrade path in branch | Done |

## Canary gate

Before shipping v1.30.0 to Dic Ann's production database:
- All Block A tests must be green
- All Block B tests must be green (TAX-001/TAX-003 become green when Sprint 9 ships)
- All Block C tests must be green
- Playwright e2e suite must pass against a built .app on Mac
- Minimum 4 weeks canary on Dic Ann's books with one full month-close
