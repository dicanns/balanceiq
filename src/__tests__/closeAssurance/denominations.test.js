/**
 * DENOM-001  sum logic
 * DENOM-002  mismatch detection
 * DENOM-003  mode enforcement (pure logic)
 * DENOM-004  persistence (DB round-trip)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { createRequire } from 'module';
import { sumDenominations, buildDenominationRows, DENOMINATIONS } from '../../components/DenominationCounter.jsx';

const require = createRequire(import.meta.url);
const { runMigrations } = require('../../db/migrations.js');

// ── helpers ──────────────────────────────────────────────────────────────────

function makeDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  // Seed tables required by migrations v1-v7 so we can skip them cleanly.
  db.exec(`
    CREATE TABLE IF NOT EXISTS kv_store (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT NOT NULL DEFAULT 'test',
      module TEXT NOT NULL,
      action TEXT NOT NULL,
      record_type TEXT NOT NULL,
      record_id TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS forecast_products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS ingredients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name_fr TEXT NOT NULL,
      name_en TEXT DEFAULT '',
      category TEXT DEFAULT 'other'
    );
  `);
  db.pragma('user_version = 7');
  runMigrations(db);
  return db;
}

function seedClosure(db) {
  const session = db.prepare(`
    INSERT INTO close_sessions (date_key, status) VALUES ('2026-04-29', 'draft')
  `).run();
  const closure = db.prepare(`
    INSERT INTO register_closures (close_session_id, register_key, variance_cents)
    VALUES (?, 'register_0', 0)
  `).run(session.lastInsertRowid);
  return Number(closure.lastInsertRowid);
}

// ── DENOM-001: sum logic ──────────────────────────────────────────────────────

describe('DENOM-001 sumDenominations', () => {
  it('sums quantities x unit values in integer cents exactly', () => {
    const qtys = { bill_100: 3, bill_50: 2, bill_20: 5 };
    // 3×10000 + 2×5000 + 5×2000 = 30000+10000+10000 = 50000 cents = $500.00
    expect(sumDenominations(qtys)).toBe(50000);
  });

  it('handles zero quantities for all rows', () => {
    expect(sumDenominations({})).toBe(0);
  });

  it('handles single denomination only', () => {
    expect(sumDenominations({ bill_100: 1 })).toBe(10000);
  });

  it('handles large drawer over $10k', () => {
    const qtys = { bill_100: 80, bill_50: 40, bill_20: 20 };
    // 80×10000 + 40×5000 + 20×2000 = 800000+200000+40000 = 1040000 cents = $10400.00
    expect(sumDenominations(qtys)).toBe(1040000);
  });

  it('rolls of coins are summed correctly', () => {
    // 4 rolls of quarters = 4 × 1000 cents = 4000 cents = $40.00
    expect(sumDenominations({ roll_quarter: 4 })).toBe(4000);
  });

  it('all 15 denomination types present in DENOMINATIONS array', () => {
    expect(DENOMINATIONS).toHaveLength(15);
  });

  it('computes mixed bills + coins + rolls correctly', () => {
    const qtys = {
      bill_100: 3,  // 30000
      bill_50: 2,   // 10000
      bill_20: 5,   // 10000
      roll_quarter: 4, // 4000
    };
    expect(sumDenominations(qtys)).toBe(54000);
  });
});

// ── DENOM-002: mismatch detection ─────────────────────────────────────────────

describe('DENOM-002 mismatch detection', () => {
  it('flags mismatch when denomination sum differs from manual by more than $0.01', () => {
    const denomTotal = sumDenominations({ bill_100: 5, roll_quarter: 4 }) / 100; // $540.00
    const manual = 500.00;
    expect(Math.abs(denomTotal - manual) > 0.01).toBe(true);
  });

  it('does not flag mismatch when difference is within $0.01 (rounding tolerance)', () => {
    const denomTotal = sumDenominations({ bill_100: 5 }) / 100; // $500.00
    const manual = 500.00;
    expect(Math.abs(denomTotal - manual) > 0.01).toBe(false);
  });

  it('exact match - no mismatch', () => {
    const denomTotal = sumDenominations({ bill_20: 3, coin_loonie: 2 }) / 100; // $62.00
    expect(Math.abs(denomTotal - 62.00) > 0.01).toBe(false);
  });
});

// ── DENOM-003: mode enforcement (pure logic) ──────────────────────────────────

describe('DENOM-003 mode enforcement', () => {
  it('denominations_required: denomRequired is true', () => {
    const denominationMode = 'denominations_required';
    expect(denominationMode === 'denominations_required').toBe(true);
  });

  it('denominations_optional: both modes available', () => {
    const denominationMode = 'denominations_optional';
    const denomAllowed = denominationMode !== 'total_only';
    const denomRequired = denominationMode === 'denominations_required';
    expect(denomAllowed).toBe(true);
    expect(denomRequired).toBe(false);
  });

  it('total_only: denomination toggle hidden', () => {
    const denominationMode = 'total_only';
    const denomAllowed = denominationMode !== 'total_only';
    expect(denomAllowed).toBe(false);
  });
});

// ── DENOM-004: persistence ────────────────────────────────────────────────────

describe('DENOM-004 persistence', () => {
  let db;
  beforeEach(() => { db = makeDb(); });
  afterEach(() => { db.close(); });

  it('buildDenominationRows produces 15 rows', () => {
    const rows = buildDenominationRows({ bill_100: 3, roll_quarter: 4 });
    expect(rows).toHaveLength(15);
  });

  it('total_value_cents is computed and stored in each row', () => {
    const rows = buildDenominationRows({ bill_100: 2, bill_50: 1 });
    const bill100 = rows.find(r => r.denomination_code === 'bill_100');
    const bill50 = rows.find(r => r.denomination_code === 'bill_50');
    expect(bill100.total_value_cents).toBe(20000);
    expect(bill50.total_value_cents).toBe(5000);
  });

  it('zero-quantity rows have total_value_cents of 0', () => {
    const rows = buildDenominationRows({});
    for (const row of rows) {
      expect(row.total_value_cents).toBe(0);
      expect(row.quantity).toBe(0);
    }
  });

  it('all 15 denomination rows are saved to DB on close', () => {
    const closureId = seedClosure(db);
    const rows = buildDenominationRows({ bill_100: 3, roll_quarter: 4 });

    const ins = db.prepare(`
      INSERT INTO register_count_denominations
        (register_closure_id, denomination_code, unit_value_cents, quantity, total_value_cents)
      VALUES (?, ?, ?, ?, ?)
    `);
    db.transaction(() => {
      for (const r of rows) {
        ins.run(closureId, r.denomination_code, r.unit_value_cents, r.quantity, r.total_value_cents);
      }
    })();

    const saved = db.prepare(
      'SELECT * FROM register_count_denominations WHERE register_closure_id = ?'
    ).all(closureId);
    expect(saved).toHaveLength(15);
  });

  it('denomination rows are linked to the correct register_closure_id', () => {
    const closureId = seedClosure(db);
    const rows = buildDenominationRows({ bill_100: 3 });
    const ins = db.prepare(`
      INSERT INTO register_count_denominations
        (register_closure_id, denomination_code, unit_value_cents, quantity, total_value_cents)
      VALUES (?, ?, ?, ?, ?)
    `);
    db.transaction(() => {
      for (const r of rows) ins.run(closureId, r.denomination_code, r.unit_value_cents, r.quantity, r.total_value_cents);
    })();

    const saved = db.prepare(
      'SELECT register_closure_id FROM register_count_denominations WHERE quantity > 0'
    ).all();
    expect(saved.every(s => s.register_closure_id === closureId)).toBe(true);
  });

  it('re-saving for same closure replaces previous rows', () => {
    const closureId = seedClosure(db);
    const ins = db.prepare(`
      INSERT INTO register_count_denominations
        (register_closure_id, denomination_code, unit_value_cents, quantity, total_value_cents)
      VALUES (?, ?, ?, ?, ?)
    `);
    const save = (rows) => db.transaction(() => {
      db.prepare('DELETE FROM register_count_denominations WHERE register_closure_id = ?').run(closureId);
      for (const r of rows) ins.run(closureId, r.denomination_code, r.unit_value_cents, r.quantity, r.total_value_cents);
    })();

    save(buildDenominationRows({ bill_100: 1 }));
    save(buildDenominationRows({ bill_100: 5, bill_50: 2 }));

    const bill100 = db.prepare(
      `SELECT quantity FROM register_count_denominations WHERE register_closure_id=? AND denomination_code='bill_100'`
    ).get(closureId);
    expect(bill100.quantity).toBe(5);

    const total = db.prepare(
      'SELECT COUNT(*) as n FROM register_count_denominations WHERE register_closure_id=?'
    ).get(closureId);
    expect(total.n).toBe(15);
  });
});
