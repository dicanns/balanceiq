/**
 * QC-WIZARD-001  generateTaxPeriods — period structure correctness
 * QC-WIZARD-002  taxRegistrationSave + taxRegistrationGet round-trip
 */
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { runMigrations } = require('../../db/migrations.js');
const { generateTaxPeriods } = await import('../../services/onboarding.js');

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

// ── QC-WIZARD-001: generateTaxPeriods ────────────────────────────────────────

describe('QC-WIZARD-001 generateTaxPeriods Dec-31 FYE quarterly', () => {
  it('returns exactly 4 periods', () => {
    const periods = generateTaxPeriods({ fiscalYearEndMonth: 12, filingFrequency: 'quarterly', fiscalYear: 2025 });
    expect(periods).toHaveLength(4);
  });

  it('Q1 is Jan 1 - Mar 31', () => {
    const [q1] = generateTaxPeriods({ fiscalYearEndMonth: 12, filingFrequency: 'quarterly', fiscalYear: 2025 });
    expect(q1.periodStart).toBe('2025-01-01');
    expect(q1.periodEnd).toBe('2025-03-31');
  });

  it('Q2 is Apr 1 - Jun 30', () => {
    const [, q2] = generateTaxPeriods({ fiscalYearEndMonth: 12, filingFrequency: 'quarterly', fiscalYear: 2025 });
    expect(q2.periodStart).toBe('2025-04-01');
    expect(q2.periodEnd).toBe('2025-06-30');
  });

  it('Q3 is Jul 1 - Sep 30', () => {
    const [,, q3] = generateTaxPeriods({ fiscalYearEndMonth: 12, filingFrequency: 'quarterly', fiscalYear: 2025 });
    expect(q3.periodStart).toBe('2025-07-01');
    expect(q3.periodEnd).toBe('2025-09-30');
  });

  it('Q4 is Oct 1 - Dec 31', () => {
    const [,,, q4] = generateTaxPeriods({ fiscalYearEndMonth: 12, filingFrequency: 'quarterly', fiscalYear: 2025 });
    expect(q4.periodStart).toBe('2025-10-01');
    expect(q4.periodEnd).toBe('2025-12-31');
  });

  it('each period has a non-empty label', () => {
    const periods = generateTaxPeriods({ fiscalYearEndMonth: 12, filingFrequency: 'quarterly', fiscalYear: 2025 });
    for (const p of periods) {
      expect(typeof p.periodLabel).toBe('string');
      expect(p.periodLabel.length).toBeGreaterThan(0);
    }
  });
});

describe('QC-WIZARD-001 generateTaxPeriods Jun-30 FYE quarterly', () => {
  it('returns exactly 4 periods', () => {
    const periods = generateTaxPeriods({ fiscalYearEndMonth: 6, filingFrequency: 'quarterly', fiscalYear: 2025 });
    expect(periods).toHaveLength(4);
  });

  it('P1 starts Jul 1 2024', () => {
    const [p1] = generateTaxPeriods({ fiscalYearEndMonth: 6, filingFrequency: 'quarterly', fiscalYear: 2025 });
    expect(p1.periodStart).toBe('2024-07-01');
    expect(p1.periodEnd).toBe('2024-09-30');
  });

  it('P2 is Oct-Dec 2024', () => {
    const [, p2] = generateTaxPeriods({ fiscalYearEndMonth: 6, filingFrequency: 'quarterly', fiscalYear: 2025 });
    expect(p2.periodStart).toBe('2024-10-01');
    expect(p2.periodEnd).toBe('2024-12-31');
  });

  it('P4 ends Jun 30 2025', () => {
    const periods = generateTaxPeriods({ fiscalYearEndMonth: 6, filingFrequency: 'quarterly', fiscalYear: 2025 });
    const last = periods[periods.length - 1];
    expect(last.periodEnd).toBe('2025-06-30');
  });
});

describe('QC-WIZARD-001 generateTaxPeriods monthly', () => {
  it('returns exactly 12 periods for Dec FYE', () => {
    const periods = generateTaxPeriods({ fiscalYearEndMonth: 12, filingFrequency: 'monthly', fiscalYear: 2025 });
    expect(periods).toHaveLength(12);
  });

  it('first period is Jan 2025', () => {
    const [m1] = generateTaxPeriods({ fiscalYearEndMonth: 12, filingFrequency: 'monthly', fiscalYear: 2025 });
    expect(m1.periodStart).toBe('2025-01-01');
    expect(m1.periodEnd).toBe('2025-01-31');
  });

  it('last period is Dec 2025', () => {
    const periods = generateTaxPeriods({ fiscalYearEndMonth: 12, filingFrequency: 'monthly', fiscalYear: 2025 });
    const last = periods[11];
    expect(last.periodStart).toBe('2025-12-01');
    expect(last.periodEnd).toBe('2025-12-31');
  });
});

describe('QC-WIZARD-001 generateTaxPeriods annual', () => {
  it('returns exactly 1 period', () => {
    const periods = generateTaxPeriods({ fiscalYearEndMonth: 12, filingFrequency: 'annual', fiscalYear: 2025 });
    expect(periods).toHaveLength(1);
  });

  it('spans full calendar year for Dec FYE', () => {
    const [p] = generateTaxPeriods({ fiscalYearEndMonth: 12, filingFrequency: 'annual', fiscalYear: 2025 });
    expect(p.periodStart).toBe('2025-01-01');
    expect(p.periodEnd).toBe('2025-12-31');
  });
});

// ── QC-WIZARD-002: taxRegistrationSave + taxRegistrationGet ──────────────────

describe('QC-WIZARD-002 taxRegistration DB round-trip', () => {
  let db;
  beforeEach(() => { db = makeDb(); });

  it('tax_registration table exists after migration v29', () => {
    const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='tax_registration'").get();
    expect(row).toBeTruthy();
  });

  it('insert and retrieve a registration row', () => {
    db.prepare(`
      INSERT INTO tax_registration (province_code, business_number, neq, fiscal_year_end_month, filing_frequency, first_filing_period)
      VALUES ('QC', '123456789RT0001', '1234567890', 12, 'quarterly', '2025-01')
    `).run();
    const row = db.prepare('SELECT * FROM tax_registration WHERE location_id IS NULL LIMIT 1').get();
    expect(row.province_code).toBe('QC');
    expect(row.business_number).toBe('123456789RT0001');
    expect(row.neq).toBe('1234567890');
    expect(row.fiscal_year_end_month).toBe(12);
    expect(row.filing_frequency).toBe('quarterly');
    expect(row.first_filing_period).toBe('2025-01');
  });

  it('filing_frequency CHECK constraint rejects invalid value', () => {
    expect(() => {
      db.prepare(`INSERT INTO tax_registration (province_code, filing_frequency) VALUES ('QC', 'weekly')`).run();
    }).toThrow();
  });

  it('update replaces existing row', () => {
    db.prepare(`INSERT INTO tax_registration (province_code, filing_frequency) VALUES ('QC', 'quarterly')`).run();
    const id = db.prepare('SELECT id FROM tax_registration LIMIT 1').get().id;
    db.prepare(`UPDATE tax_registration SET filing_frequency='monthly' WHERE id=?`).run(id);
    const row = db.prepare('SELECT * FROM tax_registration WHERE id=?').get(id);
    expect(row.filing_frequency).toBe('monthly');
  });

  it('location_id=null row is distinct from location_id=1 row', () => {
    db.prepare(`INSERT INTO tax_registration (province_code, filing_frequency) VALUES ('QC', 'quarterly')`).run();
    db.prepare(`INSERT INTO tax_registration (location_id, province_code, filing_frequency) VALUES (1, 'ON', 'monthly')`).run();
    const nullRow = db.prepare('SELECT * FROM tax_registration WHERE location_id IS NULL').get();
    const loc1Row = db.prepare('SELECT * FROM tax_registration WHERE location_id=1').get();
    expect(nullRow.province_code).toBe('QC');
    expect(loc1Row.province_code).toBe('ON');
  });
});
