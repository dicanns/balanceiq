/**
 * TRUST-MARKERS-001  SettingsAboutPanel — required sections present
 * TRUST-MARKERS-002  vaultComplianceCheck — flags bills missing vault docs
 */
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { runMigrations } = require('../../db/migrations.js');
const { LAW25_SECTIONS } = await import('../../components/SettingsAboutPanel.jsx');
const { vaultComplianceCheck } = await import('../../db/database.js');

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

// ── TRUST-MARKERS-001: SettingsAboutPanel content ────────────────────────────

describe('TRUST-MARKERS-001 LAW25_SECTIONS structure', () => {
  it('exports exactly 4 sections', () => {
    expect(LAW25_SECTIONS).toHaveLength(4);
  });

  it('section ids include law25, data-residency, retention, audit-policy', () => {
    const ids = LAW25_SECTIONS.map(s => s.id);
    expect(ids).toContain('law25');
    expect(ids).toContain('data-residency');
    expect(ids).toContain('retention');
    expect(ids).toContain('audit-policy');
  });

  it('every section has FR + EN title and body', () => {
    for (const s of LAW25_SECTIONS) {
      expect(typeof s.titleFr).toBe('string');
      expect(typeof s.titleEn).toBe('string');
      expect(Array.isArray(s.bodyFr)).toBe(true);
      expect(Array.isArray(s.bodyEn)).toBe(true);
      expect(s.bodyFr.length).toBeGreaterThan(0);
      expect(s.bodyEn.length).toBeGreaterThan(0);
    }
  });

  it('law25 section mentions Loi 25 in FR title', () => {
    const s = LAW25_SECTIONS.find(s => s.id === 'law25');
    expect(s.titleFr).toContain('Loi 25');
  });

  it('law25 section mentions Law 25 in EN title', () => {
    const s = LAW25_SECTIONS.find(s => s.id === 'law25');
    expect(s.titleEn).toContain('Law 25');
  });

  it('data-residency section mentions Montreal/Montréal', () => {
    const s = LAW25_SECTIONS.find(s => s.id === 'data-residency');
    const combined = s.bodyFr.join(' ') + s.bodyEn.join(' ');
    expect(combined).toMatch(/[Mm]ontr[eé]al/);
  });

  it('retention section mentions 6 years / 6 ans (CRA period)', () => {
    const s = LAW25_SECTIONS.find(s => s.id === 'retention');
    const combined = s.bodyFr.join(' ') + s.bodyEn.join(' ');
    expect(combined).toMatch(/6 ans|6 years/);
  });

  it('audit-policy section mentions immutability of GL entries', () => {
    const s = LAW25_SECTIONS.find(s => s.id === 'audit-policy');
    const combined = s.bodyFr.join(' ') + s.bodyEn.join(' ');
    expect(combined.length).toBeGreaterThan(100);
  });

  it('every section has an icon', () => {
    for (const s of LAW25_SECTIONS) {
      expect(typeof s.icon).toBe('string');
      expect(s.icon.length).toBeGreaterThan(0);
    }
  });
});

// ── TRUST-MARKERS-002: vaultComplianceCheck DB round-trip ────────────────────

describe('TRUST-MARKERS-002 vaultComplianceCheck', () => {
  let db;
  beforeEach(() => { db = makeDb(); });

  function insertBill({ amount = 150, tpsPaid = 7.5, tvqPaid = 7.48, vaultDocumentId = null } = {}) {
    const { lastInsertRowid } = db.prepare(`
      INSERT INTO supplier_bills (month_key, supplier_name, amount, tps_paid, tvq_paid, vault_document_id)
      VALUES ('2025-01', 'Test Supplier', ?, ?, ?, ?)
    `).run(amount, tpsPaid, tvqPaid, vaultDocumentId);
    return lastInsertRowid;
  }

  it('returns bill with CTI > 0 and amount > 100 and no vault doc', () => {
    insertBill();
    const rows = vaultComplianceCheck(db);
    expect(rows).toHaveLength(1);
    expect(rows[0].supplier_name).toBe('Test Supplier');
  });

  it('does not return bill that has a vault_document_id', () => {
    insertBill({ vaultDocumentId: 42 });
    const rows = vaultComplianceCheck(db);
    expect(rows).toHaveLength(0);
  });

  it('does not return bill with amount <= 100 even if CTI claimed', () => {
    insertBill({ amount: 80, tpsPaid: 4, tvqPaid: 3.98 });
    const rows = vaultComplianceCheck(db);
    expect(rows).toHaveLength(0);
  });

  it('does not return bill with no CTI/RTI claimed', () => {
    insertBill({ tpsPaid: 0, tvqPaid: 0 });
    const rows = vaultComplianceCheck(db);
    expect(rows).toHaveLength(0);
  });

  it('returns multiple flagged bills in date-descending order', () => {
    db.prepare(`INSERT INTO supplier_bills (month_key, supplier_name, amount, tps_paid, tvq_paid, bill_date) VALUES ('2025-01','A',200,10,9.975,'2025-01-15')`).run();
    db.prepare(`INSERT INTO supplier_bills (month_key, supplier_name, amount, tps_paid, tvq_paid, bill_date) VALUES ('2025-02','B',300,15,14.96,'2025-02-10')`).run();
    const rows = vaultComplianceCheck(db);
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows[0].bill_date >= rows[1].bill_date).toBe(true);
  });

  it('result includes supplier_name, amount, tps_paid, tvq_paid fields', () => {
    insertBill({ amount: 150, tpsPaid: 7.5, tvqPaid: 7.48 });
    const [row] = vaultComplianceCheck(db);
    expect(row).toHaveProperty('supplier_name');
    expect(row).toHaveProperty('amount');
    expect(row).toHaveProperty('tps_paid');
    expect(row).toHaveProperty('tvq_paid');
  });
});
