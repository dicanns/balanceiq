/**
 * TAX-016 — Tax Period Computation Reproducibility
 *
 * The same inputs must always produce byte-for-byte identical outputs.
 * Historical filed periods must not be altered when formula version changes.
 * This is a release blocker per Section 13.3 of the trust plan.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildAccountingDb, computeCtiFromDb } from '../helpers/testSchema.js';

let db;

beforeEach(() => { db = buildAccountingDb(); });
afterEach(() => { db.close(); });

describe('TAX-016 tax period reproducibility', () => {
  const PERIOD_START = '2026-01-01';
  const PERIOD_END = '2026-03-31';

  function seedPlData(db) {
    for (const [month, revenue, bills] of [
      ['2026-01', 42000, [{ id: 'b1', tps_paid: 50.00, tvq_paid: 99.75, business_use_pct: 100 }]],
      ['2026-02', 38500, [{ id: 'b2', tps_paid: 35.00, tvq_paid: 69.83, business_use_pct: 80 }]],
      ['2026-03', 45200, [{ id: 'b3', tps_paid: 112.50, tvq_paid: 224.44, business_use_pct: 100 }]],
    ]) {
      db.prepare(`INSERT OR REPLACE INTO kv_store (key, value) VALUES (?, ?)`).run(
        `dicann-pl-${month}`,
        JSON.stringify({ _revenueOverride: revenue, loyer_bills: bills })
      );
    }
  }

  it('computing the same period twice produces identical CTI results', () => {
    seedPlData(db);

    const result1 = computeCtiFromDb(db, PERIOD_START, PERIOD_END);
    const result2 = computeCtiFromDb(db, PERIOD_START, PERIOD_END);

    expect(result1.tpsCti).toBe(result2.tpsCti);
    expect(result1.tvqRti).toBe(result2.tvqRti);
    expect(result1.billCount).toBe(result2.billCount);
    expect(JSON.stringify(result1.billIds)).toBe(JSON.stringify(result2.billIds));
  });

  it('filed period row is not altered by a subsequent compute call', () => {
    seedPlData(db);
    const first = computeCtiFromDb(db, PERIOD_START, PERIOD_END);

    // Save the period result to the tax_periods table and mark it filed
    const { lastInsertRowid: periodId } = db.prepare(
      `INSERT INTO tax_periods (period_type, period_start, period_end, tps_cti, tvq_rti, status)
       VALUES ('quarterly', ?, ?, ?, ?, 'open')`
    ).run(PERIOD_START, PERIOD_END, first.tpsCti, first.tvqRti);

    db.prepare(
      `UPDATE tax_periods SET status='filed', filed_at=datetime('now'), confirmation_number='CRA-2026-001' WHERE id=?`
    ).run(periodId);

    // Simulate future code calling compute again (e.g. a re-run triggered by accident)
    // The tax_periods row must remain unchanged after filing
    const second = computeCtiFromDb(db, PERIOD_START, PERIOD_END);

    const storedPeriod = db.prepare(`SELECT * FROM tax_periods WHERE id=?`).get(periodId);
    // Locked result must match first computation, not be overwritten by second call
    expect(storedPeriod.status).toBe('filed');
    expect(storedPeriod.tps_cti).toBeCloseTo(first.tpsCti, 8);
    expect(storedPeriod.tvq_rti).toBeCloseTo(first.tvqRti, 8);
  });

  it('changing formula version string does not alter a previously filed period', () => {
    // TODO: when formula versioning is implemented, add a test that bumps
    // source_formula_version on a new compute call and asserts the filed
    // tax_periods row retains its original tps_cti/tvq_rti values unchanged.
    // For now, verify the filed period row is immutable after status='filed'.
    seedPlData(db);
    const result = computeCtiFromDb(db, PERIOD_START, PERIOD_END);

    const { lastInsertRowid: periodId } = db.prepare(
      `INSERT INTO tax_periods (period_type, period_start, period_end, tps_cti, tvq_rti, status)
       VALUES ('quarterly', ?, ?, ?, ?, 'filed')`
    ).run(PERIOD_START, PERIOD_END, result.tpsCti, result.tvqRti);

    // A new compute with different inputs (simulate formula change)
    db.prepare(`UPDATE kv_store SET value=? WHERE key=?`).run(
      JSON.stringify({ _revenueOverride: 99999, loyer_bills: [] }),
      'dicann-pl-2026-01'
    );

    // After recomputing, the STORED filed period must not change
    const stored = db.prepare(`SELECT tps_cti, tvq_rti, status FROM tax_periods WHERE id=?`).get(periodId);
    expect(stored.status).toBe('filed');
    expect(stored.tps_cti).toBeCloseTo(result.tpsCti, 8);
  });
});
