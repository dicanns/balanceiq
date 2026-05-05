/**
 * ROYALTY-EX-001  royaltyExceptions.js — pure function correctness
 * ROYALTY-EX-002  royaltyException DB functions — round-trips
 */
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { runMigrations } = require('../../db/migrations.js');
const {
  detectRoyaltyExceptions,
  exceptionSeverityColor,
  exceptionSeverityLabel,
  EXCEPTION_TYPES,
  EXCEPTION_SEVERITY,
} = await import('../../services/royaltyExceptions.js');

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

// ── ROYALTY-EX-001: Pure functions ────────────────────────────────────────────

describe('ROYALTY-EX-001 EXCEPTION_TYPES', () => {
  it('has OVERDUE_PAYMENT key', () => {
    expect(EXCEPTION_TYPES.OVERDUE_PAYMENT).toBe('overdue_payment');
  });

  it('has MISSING_DATA key', () => {
    expect(EXCEPTION_TYPES.MISSING_DATA).toBe('missing_data');
  });
});

describe('ROYALTY-EX-001 EXCEPTION_SEVERITY', () => {
  it('has WARNING and CRITICAL and INFO', () => {
    expect(EXCEPTION_SEVERITY.WARNING).toBe('warning');
    expect(EXCEPTION_SEVERITY.CRITICAL).toBe('critical');
    expect(EXCEPTION_SEVERITY.INFO).toBe('info');
  });
});

describe('ROYALTY-EX-001 detectRoyaltyExceptions', () => {
  const grace = 15;

  it('returns empty array when no overdue invoices', () => {
    expect(detectRoyaltyExceptions({ overdueInvoices: [], gracePeriod: grace })).toHaveLength(0);
  });

  it('returns empty array when all invoices are within grace period', () => {
    const result = detectRoyaltyExceptions({
      overdueInvoices: [{ locationId: 1, locName: 'Loc A', balance: 500, daysOverdue: 10, period: '2026-04', invoiceRef: 'F-001' }],
      gracePeriod: grace,
    });
    expect(result).toHaveLength(0);
  });

  it('returns empty array when daysOverdue equals gracePeriod (not strictly over)', () => {
    const result = detectRoyaltyExceptions({
      overdueInvoices: [{ locationId: 1, locName: 'A', balance: 100, daysOverdue: 15, period: '2026-04' }],
      gracePeriod: grace,
    });
    expect(result).toHaveLength(0);
  });

  it('detects overdue_payment when daysOverdue > gracePeriod', () => {
    const result = detectRoyaltyExceptions({
      overdueInvoices: [{ locationId: 1, locName: 'Loc A', balance: 750, daysOverdue: 20, period: '2026-04', invoiceRef: 'F-002' }],
      gracePeriod: grace,
    });
    expect(result).toHaveLength(1);
    expect(result[0].exceptionType).toBe(EXCEPTION_TYPES.OVERDUE_PAYMENT);
    expect(result[0].locationId).toBe(1);
    expect(result[0].amountAtRisk).toBe(750);
  });

  it('severity is warning when <= 30 days past grace', () => {
    const result = detectRoyaltyExceptions({
      overdueInvoices: [{ locationId: 1, locName: 'A', balance: 100, daysOverdue: grace + 20, period: '2026-04' }],
      gracePeriod: grace,
    });
    expect(result[0].severity).toBe(EXCEPTION_SEVERITY.WARNING);
  });

  it('severity is critical when > 30 days past grace', () => {
    const result = detectRoyaltyExceptions({
      overdueInvoices: [{ locationId: 1, locName: 'A', balance: 100, daysOverdue: grace + 31, period: '2026-04' }],
      gracePeriod: grace,
    });
    expect(result[0].severity).toBe(EXCEPTION_SEVERITY.CRITICAL);
  });

  it('severity is critical at exactly 31 days past grace', () => {
    const result = detectRoyaltyExceptions({
      overdueInvoices: [{ locationId: 1, locName: 'A', balance: 100, daysOverdue: grace + 31, period: '2026-04' }],
      gracePeriod: grace,
    });
    expect(result[0].severity).toBe(EXCEPTION_SEVERITY.CRITICAL);
  });

  it('includes FR and EN descriptions', () => {
    const result = detectRoyaltyExceptions({
      overdueInvoices: [{ locationId: 1, locName: 'A', balance: 100, daysOverdue: 20, period: '2026-04', invoiceRef: 'F-001' }],
      gracePeriod: grace,
    });
    expect(result[0].descriptionFr).toContain('retard');
    expect(result[0].descriptionEn).toContain('overdue');
  });

  it('includes invoice ref in description when provided', () => {
    const result = detectRoyaltyExceptions({
      overdueInvoices: [{ locationId: 1, locName: 'A', balance: 100, daysOverdue: 20, period: '2026-04', invoiceRef: 'FAC-999' }],
      gracePeriod: grace,
    });
    expect(result[0].descriptionFr).toContain('FAC-999');
    expect(result[0].descriptionEn).toContain('FAC-999');
  });

  it('handles multiple overdue invoices', () => {
    const result = detectRoyaltyExceptions({
      overdueInvoices: [
        { locationId: 1, locName: 'A', balance: 100, daysOverdue: 20, period: '2026-03' },
        { locationId: 2, locName: 'B', balance: 200, daysOverdue: 5, period: '2026-04' },
        { locationId: 3, locName: 'C', balance: 300, daysOverdue: 60, period: '2026-04' },
      ],
      gracePeriod: grace,
    });
    expect(result).toHaveLength(2); // loc B is within grace
    expect(result.map(e => e.locationId).sort()).toEqual([1, 3]);
  });

  it('uses fallback locName when not provided', () => {
    const result = detectRoyaltyExceptions({
      overdueInvoices: [{ locationId: 99, balance: 100, daysOverdue: 20, period: '2026-04' }],
      gracePeriod: grace,
    });
    expect(result[0].locName).toContain('99');
  });
});

describe('ROYALTY-EX-001 exceptionSeverityColor', () => {
  it('critical → red', () => {
    expect(exceptionSeverityColor('critical')).toBe('#ef4444');
  });

  it('warning → amber', () => {
    expect(exceptionSeverityColor('warning')).toBe('#f59e0b');
  });

  it('info → blue', () => {
    expect(exceptionSeverityColor('info')).toBe('#60a5fa');
  });
});

describe('ROYALTY-EX-001 exceptionSeverityLabel', () => {
  it('returns FR label for critical', () => {
    expect(exceptionSeverityLabel('critical', 'fr')).toBe('Critique');
  });

  it('returns EN label for critical', () => {
    expect(exceptionSeverityLabel('critical', 'en')).toBe('Critical');
  });

  it('returns FR label for warning', () => {
    expect(exceptionSeverityLabel('warning', 'fr')).toBe('Avertissement');
  });
});

// ── ROYALTY-EX-002: DB round-trips ────────────────────────────────────────────

describe('ROYALTY-EX-002 royalty_exceptions table', () => {
  let db;
  beforeEach(() => { db = makeDb(); });

  it('table exists after migration v31', () => {
    const tbl = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='royalty_exceptions'").get();
    expect(tbl).toBeTruthy();
  });

  it('schema version is 31', () => {
    expect(db.pragma('user_version', { simple: true })).toBe(31);
  });
});

describe('ROYALTY-EX-002 royaltyExceptionSave / List / Acknowledge / Resolve', () => {
  const {
    royaltyExceptionSave,
    royaltyExceptionList,
    royaltyExceptionAcknowledge,
    royaltyExceptionResolve,
  } = require('../../db/database.js');
  let db;
  beforeEach(() => { db = makeDb(); });

  function save(overrides = {}) {
    return royaltyExceptionSave({
      locationId: 1, exceptionType: 'overdue_payment', period: '2026-05',
      severity: 'warning', descriptionFr: 'Retard', descriptionEn: 'Overdue',
      amountAtRisk: 500, daysOverdue: 20, invoiceRef: 'F-001',
      ...overrides,
    }, db);
  }

  it('save returns the inserted row', () => {
    const row = save();
    expect(row).toBeTruthy();
    expect(row.location_id).toBe(1);
    expect(row.exception_type).toBe('overdue_payment');
    expect(row.amount_at_risk).toBe(500);
  });

  it('list returns saved exception', () => {
    save();
    const rows = royaltyExceptionList({ period: '2026-05' }, db);
    expect(rows).toHaveLength(1);
    expect(rows[0].severity).toBe('warning');
  });

  it('upsert: saving same location+period+type resets ack/resolve and updates fields', () => {
    save({ severity: 'warning' });
    save({ severity: 'critical' });
    const rows = royaltyExceptionList({ period: '2026-05' }, db);
    expect(rows).toHaveLength(1);
    expect(rows[0].severity).toBe('critical');
    expect(rows[0].acknowledged_at).toBeNull();
  });

  it('list excludes resolved exceptions by default', () => {
    const row = save();
    royaltyExceptionResolve(row.id, db);
    const rows = royaltyExceptionList({ period: '2026-05' }, db);
    expect(rows).toHaveLength(0);
  });

  it('list includes resolved when includeResolved=true', () => {
    const row = save();
    royaltyExceptionResolve(row.id, db);
    const rows = royaltyExceptionList({ period: '2026-05', includeResolved: true }, db);
    expect(rows).toHaveLength(1);
    expect(rows[0].resolved_at).toBeTruthy();
  });

  it('acknowledge sets acknowledged_at and acknowledged_by', () => {
    const row = save();
    const updated = royaltyExceptionAcknowledge(row.id, 'test-user', db);
    expect(updated.acknowledged_at).toBeTruthy();
    expect(updated.acknowledged_by).toBe('test-user');
  });

  it('resolve sets resolved_at', () => {
    const row = save();
    const updated = royaltyExceptionResolve(row.id, db);
    expect(updated.resolved_at).toBeTruthy();
  });

  it('list sorted critical before warning before info', () => {
    save({ locationId: 1, exceptionType: 'overdue_payment', severity: 'warning' });
    save({ locationId: 2, exceptionType: 'overdue_payment', severity: 'critical', period: '2026-05' });
    save({ locationId: 3, exceptionType: 'overdue_payment', severity: 'info', period: '2026-05' });
    const rows = royaltyExceptionList({ period: '2026-05', includeResolved: true }, db);
    expect(rows[0].severity).toBe('critical');
    expect(rows[rows.length - 1].severity).toBe('info');
  });

  it('list without period returns all non-resolved', () => {
    save({ period: '2026-04' });
    save({ period: '2026-05' });
    const rows = royaltyExceptionList({}, db);
    expect(rows).toHaveLength(2);
  });
});
