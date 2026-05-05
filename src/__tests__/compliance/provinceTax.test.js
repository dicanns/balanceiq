/**
 * PROVINCE-TAX-001  QC default rates
 * PROVINCE-TAX-002  ON HST
 * PROVINCE-TAX-003  BC GST+PST
 * PROVINCE-TAX-004  fallback to QC when supplier has no province assigned
 * PROVINCE-TAX-005  reproducibility — tax_calc_log captures province profile id,
 *                   historical results unaffected by rate changes
 */
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { runMigrations } = require('../../db/migrations.js');
const { computeTax, logTaxComputation, FORMULA_VERSION_PROVINCE } = await import('../../services/tax.js');

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

// Helper: insert a supplier tax profile with optional province link
function insertSupplierProfile(db, { name = 'TestSupplier', provinceTaxProfileId = null } = {}) {
  const { lastInsertRowid } = db.prepare(
    `INSERT OR REPLACE INTO supplier_tax_profiles
       (supplier_name, tps_rate, tvq_rate, applies_tps, applies_tvq, province_tax_profile_id)
     VALUES (?, 0.05, 0.09975, 1, 1, ?)`
  ).run(name, provinceTaxProfileId);
  return lastInsertRowid;
}

// Helper: get province id by code
function getProvinceId(db, code) {
  return db.prepare('SELECT id FROM province_tax_profiles WHERE province_code=?').get(code)?.id;
}

describe('PROVINCE-TAX-001 QC default', () => {
  let db;
  beforeEach(() => { db = makeDb(); });

  it('default supplier_tax_profile uses QC rates (5% TPS, 9.975% TVQ)', () => {
    const profileId = insertSupplierProfile(db);
    const result = computeTax(10000, profileId, db);
    expect(result.provinceCode).toBe('QC');
    expect(result.gstCents).toBe(500);
    expect(result.qstCents).toBe(998);
    expect(result.hstCents).toBe(0);
    expect(result.pstCents).toBe(0);
  });

  it('TPS on $100 = $5.00 = 500 cents exact', () => {
    const profileId = insertSupplierProfile(db);
    const { gstCents } = computeTax(10000, profileId, db);
    expect(gstCents).toBe(500);
  });

  it('TVQ on $100 = $9.975 = 998 cents (rounded)', () => {
    const profileId = insertSupplierProfile(db);
    const { qstCents } = computeTax(10000, profileId, db);
    expect(qstCents).toBe(998);
  });

  it('formula version is province-aware version string', () => {
    const profileId = insertSupplierProfile(db);
    const { formulaVersion } = computeTax(10000, profileId, db);
    expect(formulaVersion).toBe(FORMULA_VERSION_PROVINCE);
  });
});

describe('PROVINCE-TAX-002 ON HST', () => {
  let db;
  beforeEach(() => { db = makeDb(); });

  it('ON profile applies 13% HST as single rate', () => {
    const onId = getProvinceId(db, 'ON');
    const profileId = insertSupplierProfile(db, { name: 'ONSupplier', provinceTaxProfileId: onId });
    const result = computeTax(10000, profileId, db);
    expect(result.provinceCode).toBe('ON');
    expect(result.hstCents).toBe(1300);
    expect(result.gstCents).toBe(0);
    expect(result.qstCents).toBe(0);
    expect(result.pstCents).toBe(0);
  });

  it('HST on $100 = $13.00 = 1300 cents exact', () => {
    const onId = getProvinceId(db, 'ON');
    const profileId = insertSupplierProfile(db, { name: 'ONSupplier2', provinceTaxProfileId: onId });
    expect(computeTax(10000, profileId, db).hstCents).toBe(1300);
  });

  it('totalTaxCents for ON is hstCents only', () => {
    const onId = getProvinceId(db, 'ON');
    const profileId = insertSupplierProfile(db, { name: 'ONSupplier3', provinceTaxProfileId: onId });
    const result = computeTax(10000, profileId, db);
    expect(result.totalTaxCents).toBe(result.hstCents);
  });
});

describe('PROVINCE-TAX-003 BC GST+PST', () => {
  let db;
  beforeEach(() => { db = makeDb(); });

  it('BC profile applies 5% GST + 7% PST', () => {
    const bcId = getProvinceId(db, 'BC');
    const profileId = insertSupplierProfile(db, { name: 'BCSupplier', provinceTaxProfileId: bcId });
    const result = computeTax(10000, profileId, db);
    expect(result.provinceCode).toBe('BC');
    expect(result.gstCents).toBe(500);
    expect(result.pstCents).toBe(700);
    expect(result.hstCents).toBe(0);
    expect(result.qstCents).toBe(0);
  });

  it('totalTaxCents for BC = gstCents + pstCents', () => {
    const bcId = getProvinceId(db, 'BC');
    const profileId = insertSupplierProfile(db, { name: 'BCSupplier2', provinceTaxProfileId: bcId });
    const result = computeTax(10000, profileId, db);
    expect(result.totalTaxCents).toBe(result.gstCents + result.pstCents);
  });
});

describe('PROVINCE-TAX-004 fallback', () => {
  let db;
  beforeEach(() => { db = makeDb(); });

  it('supplier with no province_tax_profile_id falls back to QC default', () => {
    const profileId = insertSupplierProfile(db, { provinceTaxProfileId: null });
    const result = computeTax(10000, profileId, db);
    expect(result.provinceCode).toBe('QC');
    expect(result.gstCents).toBe(500);
    expect(result.qstCents).toBe(998);
  });

  it('null supplierTaxProfileId falls back to QC default', () => {
    const result = computeTax(10000, null, db);
    expect(result.provinceCode).toBe('QC');
    expect(result.gstCents).toBe(500);
  });

  it('provinceProfileId in result matches QC row id', () => {
    const profileId = insertSupplierProfile(db, { provinceTaxProfileId: null });
    const qcId = getProvinceId(db, 'QC');
    const result = computeTax(10000, profileId, db);
    expect(result.provinceProfileId).toBe(qcId);
  });
});

describe('PROVINCE-TAX-005 reproducibility', () => {
  let db;
  beforeEach(() => { db = makeDb(); });

  it('tax_calc_log captures province_tax_profile_id', () => {
    const profileId = insertSupplierProfile(db);
    const result = computeTax(10000, profileId, db);
    logTaxComputation(db, {
      taxPeriodId: null,
      calculationType: 'test_gst',
      amountCents: 10000,
      supplierTaxProfileId: profileId,
      result,
    });
    const row = db.prepare('SELECT * FROM tax_calc_log WHERE calculation_type=?').get('test_gst');
    expect(row).toBeTruthy();
    expect(row.province_tax_profile_id).toBe(result.provinceProfileId);
    expect(row.formula_version).toBe(FORMULA_VERSION_PROVINCE);
    expect(row.result).toBe(result.totalTaxCents);
  });

  it('changing province profile rates does NOT alter historical log results', () => {
    const qcId = getProvinceId(db, 'QC');
    const profileId = insertSupplierProfile(db);
    const result = computeTax(10000, profileId, db);
    logTaxComputation(db, {
      taxPeriodId: null,
      calculationType: 'historical_test',
      amountCents: 10000,
      supplierTaxProfileId: profileId,
      result,
    });

    // Simulate QC raising GST to 10%
    db.prepare('UPDATE province_tax_profiles SET gst_rate=0.10 WHERE province_code=?').run('QC');

    const row = db.prepare('SELECT * FROM tax_calc_log WHERE calculation_type=?').get('historical_test');
    // The logged result was computed at the OLD rate — should still be 1498 (500 + 998)
    expect(row.result).toBe(1498);
    expect(row.province_tax_profile_id).toBe(qcId);
  });

  it('province_tax_profiles table has QC, ON, BC, AB rows after migration', () => {
    const rows = db.prepare('SELECT province_code FROM province_tax_profiles ORDER BY province_code').all().map(r => r.province_code);
    expect(rows).toContain('QC');
    expect(rows).toContain('ON');
    expect(rows).toContain('BC');
    expect(rows).toContain('AB');
  });

  it('only one province has is_default=1', () => {
    const defaults = db.prepare('SELECT * FROM province_tax_profiles WHERE is_default=1').all();
    expect(defaults).toHaveLength(1);
    expect(defaults[0].province_code).toBe('QC');
  });
});
