# Accounting Test Fixtures

Fixtures for the Sprint 5 accounting integrity test suite.

## What belongs here

- SQL scripts or JSON files describing a specific database state used in multiple tests
- Named after the scenario they represent, not the test that uses them

## Current fixtures

None yet. All test scenarios use programmatic DB builders:

- `src/__tests__/accounting/helpers/testSchema.js`
  - `buildAccountingDb()` — full v8-v11 schema, suitable for GL/Bank/Tax unit tests
  - `buildPreLedgerDb({ withLegacyData })` — pre-accounting schema at user_version=7

- Migration test helpers inline their own `buildLegacyDb()` to avoid shared state between tests.

## Planned fixtures (add as needed)

| File | Represents |
|------|------------|
| `pre-ledger-dicann.sql` | A snapshot of Dic Ann's actual DB before accounting suite migration, anonymized. Used for MIG-002 canary validation. |
| `quarter-2026-q1-pl.json` | Q1 2026 P&L kv_store data with real bill amounts (anonymized) for TAX-016 reproducibility checks. |

## Rules

- Never commit real financial data. Anonymize or use round numbers.
- SQL fixtures must be idempotent (safe to run twice).
- JSON fixtures must match the kv_store value format used by the app.
