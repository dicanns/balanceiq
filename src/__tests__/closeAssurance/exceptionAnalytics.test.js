/**
 * EXCEPTION-001  pure pattern detectors (exceptionAnalytics.js)
 * EXCEPTION-002  closeExceptionPatterns DB function returns correct shape
 */
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { createRequire } from 'module';
import {
  PATTERNS,
  detectCashierVariancePattern,
  detectRegisterVariancePattern,
  detectDayOfWeekPattern,
  detectDelayedApprovalPattern,
  detectReopenPattern,
  runExceptionAnalytics,
  DOW_NAMES_EN,
  DOW_NAMES_FR,
} from '../../services/exceptionAnalytics.js';

const require = createRequire(import.meta.url);
const { runMigrations } = require('../../db/migrations.js');
const { closeExceptionPatterns } = require('../../db/database.js');

// ── Shared DB factory (mirrors complianceReporting.test.js) ──
function makeDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS kv_store (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT NOT NULL DEFAULT 'test',
      module TEXT NOT NULL, action TEXT NOT NULL,
      record_type TEXT NOT NULL, record_id TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS forecast_products (id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT DEFAULT '');
    CREATE TABLE IF NOT EXISTS ingredients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name_fr TEXT NOT NULL, name_en TEXT DEFAULT '', category TEXT DEFAULT 'other'
    );
    CREATE TABLE IF NOT EXISTS checklist_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title_fr TEXT NOT NULL, title_en TEXT NOT NULL,
      required INTEGER DEFAULT 0, frequency TEXT DEFAULT 'daily',
      category TEXT DEFAULT 'custom', sort_order INTEGER DEFAULT 0, active INTEGER DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS checklist_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      template_id INTEGER NOT NULL, date TEXT NOT NULL,
      completed INTEGER DEFAULT 0, completed_by TEXT,
      UNIQUE(template_id, date)
    );
  `);
  db.pragma('user_version = 7');
  runMigrations(db);
  return db;
}

// ── Helpers ──
function insertSession(db, { date_key = '2026-04-01', status = 'finalized', submitted_at = null } = {}) {
  const { lastInsertRowid } = db.prepare(
    `INSERT INTO close_sessions (date_key, status, submitted_at, created_at, updated_at)
     VALUES (?, ?, ?, datetime('now'), datetime('now'))`
  ).run(date_key, status, submitted_at);
  return lastInsertRowid;
}

function insertClosure(db, sessionId, { cashier_name = 'Alice', register_key = 'R1', variance_cents = 0 } = {}) {
  const { lastInsertRowid } = db.prepare(
    `INSERT INTO register_closures (close_session_id, cashier_name, register_key, variance_cents)
     VALUES (?, ?, ?, ?)`
  ).run(sessionId, cashier_name, register_key, variance_cents);
  return lastInsertRowid;
}

function insertApproval(db, sessionId, { stage = 'approved', actor_name = 'Manager', created_at = null } = {}) {
  db.prepare(
    `INSERT INTO close_approvals (close_session_id, stage, actor_name, created_at)
     VALUES (?, ?, ?, ?)`
  ).run(sessionId, stage, actor_name, created_at || new Date().toISOString());
}

// ════════════════════════════════════════════════════════
// EXCEPTION-001  Pure pattern detectors
// ════════════════════════════════════════════════════════
describe('EXCEPTION-001 detectCashierVariancePattern', () => {
  it('flags cashiers above 30% rate with >= 5 sessions', () => {
    const summary = [
      { cashier_name: 'Alice', total_closures: 10, variance_closures: 4 }, // 40% — flag
      { cashier_name: 'Bob',   total_closures: 10, variance_closures: 2 }, // 20% — ok
      { cashier_name: 'Carol', total_closures: 4,  variance_closures: 3 }, // < MIN_SESSIONS — skip
    ];
    const result = detectCashierVariancePattern(summary);
    expect(result).toHaveLength(1);
    expect(result[0].subject).toBe('Alice');
    expect(result[0].type).toBe('cashier_variance');
    expect(result[0].rate).toBe(40);
    expect(result[0].count).toBe(4);
    expect(result[0].total).toBe(10);
  });

  it('returns empty array when no cashiers are flagged', () => {
    const summary = [{ cashier_name: 'X', total_closures: 10, variance_closures: 1 }];
    expect(detectCashierVariancePattern(summary)).toHaveLength(0);
  });

  it('sorts by rate descending', () => {
    const summary = [
      { cashier_name: 'A', total_closures: 10, variance_closures: 4 }, // 40%
      { cashier_name: 'B', total_closures: 10, variance_closures: 6 }, // 60%
    ];
    const result = detectCashierVariancePattern(summary);
    expect(result[0].subject).toBe('B');
    expect(result[1].subject).toBe('A');
  });

  it('handles null input gracefully', () => {
    expect(detectCashierVariancePattern(null)).toEqual([]);
    expect(detectCashierVariancePattern(undefined)).toEqual([]);
  });

  it('skips cashiers with no name', () => {
    const summary = [{ cashier_name: '', total_closures: 10, variance_closures: 8 }];
    expect(detectCashierVariancePattern(summary)).toHaveLength(0);
  });
});

describe('EXCEPTION-001 detectRegisterVariancePattern', () => {
  it('flags registers above 30% rate', () => {
    const summary = [
      { register_key: 'R1', total_closures: 10, variance_closures: 4 },
      { register_key: 'R2', total_closures: 10, variance_closures: 2 },
    ];
    const result = detectRegisterVariancePattern(summary);
    expect(result).toHaveLength(1);
    expect(result[0].subject).toBe('R1');
    expect(result[0].type).toBe('register_variance');
  });

  it('requires MIN_SESSIONS_FOR_RATE closures', () => {
    const summary = [{ register_key: 'R1', total_closures: 4, variance_closures: 4 }];
    expect(detectRegisterVariancePattern(summary)).toHaveLength(0);
  });

  it('handles null input gracefully', () => {
    expect(detectRegisterVariancePattern(null)).toEqual([]);
  });
});

describe('EXCEPTION-001 detectDayOfWeekPattern', () => {
  it('flags days above 50% rate with >= 4 samples', () => {
    const summary = [
      { dow: 5, total_closures: 6, variance_closures: 4 }, // Friday, 67% — flag
      { dow: 1, total_closures: 6, variance_closures: 2 }, // Monday, 33% — ok
      { dow: 0, total_closures: 3, variance_closures: 3 }, // Sunday, < DOW_MIN_SAMPLES
    ];
    const result = detectDayOfWeekPattern(summary);
    expect(result).toHaveLength(1);
    expect(result[0].dow).toBe(5);
    expect(result[0].subject).toBe('Friday');
    expect(result[0].subjectFr).toBe('Vendredi');
    expect(result[0].type).toBe('dow_variance');
    expect(result[0].rate).toBe(67);
  });

  it('uses DOW_NAMES_EN and DOW_NAMES_FR correctly', () => {
    expect(DOW_NAMES_EN[0]).toBe('Sunday');
    expect(DOW_NAMES_FR[0]).toBe('Dimanche');
    expect(DOW_NAMES_EN[6]).toBe('Saturday');
    expect(DOW_NAMES_FR[6]).toBe('Samedi');
  });

  it('handles null input gracefully', () => {
    expect(detectDayOfWeekPattern(null)).toEqual([]);
  });
});

describe('EXCEPTION-001 detectDelayedApprovalPattern', () => {
  it('flags when average lag > 120 min with >= 5 sessions', () => {
    const lags = [130, 140, 150, 160, 170];
    const result = detectDelayedApprovalPattern(lags);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('delayed_approval');
    expect(result[0].avgMinutes).toBe(150);
    expect(result[0].sampleCount).toBe(5);
  });

  it('returns empty when average is under threshold', () => {
    const lags = [60, 70, 80, 90, 100];
    expect(detectDelayedApprovalPattern(lags)).toHaveLength(0);
  });

  it('returns empty when fewer than MIN_SESSIONS_FOR_RATE samples', () => {
    const lags = [200, 300, 400];
    expect(detectDelayedApprovalPattern(lags)).toHaveLength(0);
  });

  it('handles null / empty gracefully', () => {
    expect(detectDelayedApprovalPattern(null)).toEqual([]);
    expect(detectDelayedApprovalPattern([])).toEqual([]);
  });
});

describe('EXCEPTION-001 detectReopenPattern', () => {
  it('flags when reopen rate > 10% with >= 5 sessions', () => {
    const result = detectReopenPattern({ sessionCount: 20, reopenCount: 3 });
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('reopen_frequency');
    expect(result[0].rate).toBe(15);
    expect(result[0].count).toBe(3);
    expect(result[0].total).toBe(20);
  });

  it('does not flag when rate <= 10%', () => {
    expect(detectReopenPattern({ sessionCount: 20, reopenCount: 2 })).toHaveLength(0);
  });

  it('does not flag when fewer than MIN_SESSIONS_FOR_RATE', () => {
    expect(detectReopenPattern({ sessionCount: 4, reopenCount: 4 })).toHaveLength(0);
  });

  it('handles default args without throwing', () => {
    expect(detectReopenPattern()).toEqual([]);
    expect(detectReopenPattern({})).toEqual([]);
  });
});

describe('EXCEPTION-001 runExceptionAnalytics', () => {
  it('aggregates all detectors into a flat list', () => {
    const cashierSummary = [{ cashier_name: 'A', total_closures: 10, variance_closures: 4 }];
    const registerSummary = [{ register_key: 'R1', total_closures: 10, variance_closures: 4 }];
    const dowSummary = [{ dow: 2, total_closures: 6, variance_closures: 4 }];
    const sessionCounts = { sessionCount: 20, reopenCount: 3 };
    const approvalLags = [130, 140, 150, 160, 170];
    const result = runExceptionAnalytics({ cashierSummary, registerSummary, dowSummary, sessionCounts, approvalLags });
    const types = result.map(r => r.type);
    expect(types).toContain('cashier_variance');
    expect(types).toContain('register_variance');
    expect(types).toContain('dow_variance');
    expect(types).toContain('reopen_frequency');
    expect(types).toContain('delayed_approval');
  });

  it('returns empty array when no patterns flagged', () => {
    const result = runExceptionAnalytics({
      cashierSummary: [],
      registerSummary: [],
      dowSummary: [],
      sessionCounts: { sessionCount: 0, reopenCount: 0 },
      approvalLags: [],
    });
    expect(result).toEqual([]);
  });

  it('handles missing/null fields without throwing', () => {
    expect(() => runExceptionAnalytics({})).not.toThrow();
    expect(() => runExceptionAnalytics({ cashierSummary: null })).not.toThrow();
  });
});

// ════════════════════════════════════════════════════════
// EXCEPTION-002  closeExceptionPatterns DB function
// ════════════════════════════════════════════════════════
describe('EXCEPTION-002 closeExceptionPatterns DB function', () => {
  let db;
  beforeEach(() => { db = makeDb(); });

  it('returns correct shape with empty DB', () => {
    const result = closeExceptionPatterns({}, db);
    expect(result).toHaveProperty('cashierSummary');
    expect(result).toHaveProperty('registerSummary');
    expect(result).toHaveProperty('dowSummary');
    expect(result).toHaveProperty('sessionCounts');
    expect(result).toHaveProperty('approvalLags');
    expect(Array.isArray(result.cashierSummary)).toBe(true);
    expect(Array.isArray(result.registerSummary)).toBe(true);
    expect(Array.isArray(result.dowSummary)).toBe(true);
    expect(typeof result.sessionCounts).toBe('object');
    expect(Array.isArray(result.approvalLags)).toBe(true);
  });

  it('counts variance closures above $5 threshold per cashier', () => {
    const sid1 = insertSession(db, { date_key: '2026-04-10' });
    const sid2 = insertSession(db, { date_key: '2026-04-11' });
    insertClosure(db, sid1, { cashier_name: 'Alice', register_key: 'R1', variance_cents: 600 }); // > 500 — counts
    insertClosure(db, sid2, { cashier_name: 'Alice', register_key: 'R1', variance_cents: 200 }); // <= 500 — no

    const result = closeExceptionPatterns({ dateFrom: '2026-04-01', dateTo: '2026-04-30' }, db);
    const alice = result.cashierSummary.find(r => r.cashier_name === 'Alice');
    expect(alice).toBeDefined();
    expect(alice.total_closures).toBe(2);
    expect(alice.variance_closures).toBe(1);
  });

  it('counts reopen sessions correctly', () => {
    const sid = insertSession(db, { date_key: '2026-04-05' });
    insertApproval(db, sid, { stage: 'reopened' });

    const result = closeExceptionPatterns({ dateFrom: '2026-04-01', dateTo: '2026-04-30' }, db);
    expect(result.sessionCounts.sessionCount).toBeGreaterThanOrEqual(1);
    expect(result.sessionCounts.reopenCount).toBe(1);
  });

  it('computes approval lags in minutes', () => {
    const submittedAt = '2026-04-08T10:00:00';
    const approvedAt  = '2026-04-08T12:30:00'; // 150 min later
    const sid = insertSession(db, { date_key: '2026-04-08', status: 'finalized', submitted_at: submittedAt });
    insertApproval(db, sid, { stage: 'approved', actor_name: 'Mgr', created_at: approvedAt });

    const result = closeExceptionPatterns({ dateFrom: '2026-04-01', dateTo: '2026-04-30' }, db);
    expect(result.approvalLags).toHaveLength(1);
    expect(result.approvalLags[0]).toBeCloseTo(150, 0);
  });

  it('groups closures by day-of-week', () => {
    // 2026-04-06 is a Monday (dow=1)
    const sid = insertSession(db, { date_key: '2026-04-06' });
    insertClosure(db, sid, { cashier_name: 'X', register_key: 'R1', variance_cents: 700 });

    const result = closeExceptionPatterns({ dateFrom: '2026-04-01', dateTo: '2026-04-30' }, db);
    const monRow = result.dowSummary.find(r => r.dow === 1);
    expect(monRow).toBeDefined();
    expect(monRow.total_closures).toBe(1);
    expect(monRow.variance_closures).toBe(1);
  });

  it('respects dateFrom/dateTo range', () => {
    const sid = insertSession(db, { date_key: '2026-03-01' }); // outside range
    insertClosure(db, sid, { cashier_name: 'Bob', register_key: 'R2', variance_cents: 1000 });

    const result = closeExceptionPatterns({ dateFrom: '2026-04-01', dateTo: '2026-04-30' }, db);
    const bob = result.cashierSummary.find(r => r.cashier_name === 'Bob');
    expect(bob).toBeUndefined();
  });
});

// ════════════════════════════════════════════════════════
// EXCEPTION-001 PATTERNS constants
// ════════════════════════════════════════════════════════
describe('EXCEPTION-001 PATTERNS constants are correct', () => {
  it('exports expected threshold values', () => {
    expect(PATTERNS.CASHIER_VARIANCE_RATE).toBe(0.30);
    expect(PATTERNS.CASHIER_VARIANCE_CENTS).toBe(500);
    expect(PATTERNS.REGISTER_VARIANCE_RATE).toBe(0.30);
    expect(PATTERNS.DOW_MIN_SAMPLES).toBe(4);
    expect(PATTERNS.DOW_VARIANCE_RATE).toBe(0.50);
    expect(PATTERNS.MIN_SESSIONS_FOR_RATE).toBe(5);
    expect(PATTERNS.REOPEN_RATE).toBe(0.10);
    expect(PATTERNS.DELAYED_APPROVAL_MINUTES).toBe(120);
  });
});
