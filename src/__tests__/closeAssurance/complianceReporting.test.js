/**
 * COMPLIANCE-001  complianceGetKPIs returns correct aggregates
 * COMPLIANCE-002  complianceGetLists returns correct list categories
 * COMPLIANCE-003  empty DB returns null/zero KPIs and empty lists without throwing
 */
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { runMigrations } = require('../../db/migrations.js');
const { complianceGetKPIs, complianceGetLists } = require('../../db/database.js');

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

const DATE = '2026-05-01';
const DATE2 = '2026-05-02';

function insertSession(db, { id, dateKey = DATE, status = 'finalized', warnings = 0, submittedAt = null, createdAt = null }) {
  db.prepare(
    `INSERT INTO close_sessions (id, date_key, status, warning_count, created_at, submitted_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, dateKey, status, warnings,
    createdAt || new Date(Date.now() - 900000).toISOString(),
    submittedAt || (status === 'finalized' ? new Date().toISOString() : null));
}

function insertClosure(db, { sessionId, cashierName = 'Alice', registerKey = 'R1', varianceCents = 0 }) {
  db.prepare(
    `INSERT INTO register_closures (close_session_id, cashier_name, register_key, variance_cents)
     VALUES (?, ?, ?, ?)`
  ).run(sessionId, cashierName, registerKey, varianceCents);
}

function insertApproval(db, { sessionId, stage, actorName = 'manager' }) {
  db.prepare(
    `INSERT INTO close_approvals (close_session_id, stage, actor_name, created_at)
     VALUES (?, ?, ?, ?)`
  ).run(sessionId, stage, actorName, new Date().toISOString());
}

function insertChecklistTemplate(db, { id, required = 1, active = 1 }) {
  db.prepare(
    `INSERT INTO checklist_templates (id, title_fr, title_en, frequency, required, active)
     VALUES (?, 'Tache', 'Task', 'daily', ?, ?)`
  ).run(id, required, active);
}

function insertChecklistEntry(db, { templateId, date = DATE, completed = 1 }) {
  db.prepare(
    `INSERT INTO checklist_entries (template_id, date, completed, completed_by)
     VALUES (?, ?, ?, 'test')`
  ).run(templateId, date, completed);
}

describe('COMPLIANCE-001: complianceGetKPIs', () => {
  let db;
  beforeEach(() => { db = makeDb(); });

  it('returns zero/null KPIs on empty DB', () => {
    const kpis = complianceGetKPIs({ dateFrom: DATE, dateTo: DATE }, db);
    expect(kpis.sessionCount).toBe(0);
    expect(kpis.avgTimeToCloseMinutes).toBeNull();
    expect(kpis.overrideCount).toBe(0);
    expect(kpis.reopenCount).toBe(0);
    expect(kpis.checklistCompliancePct).toBeNull();
    expect(kpis.evidenceCompletenessPct).toBeNull();
    expect(kpis.depositVerifLagDays).toBeNull();
    expect(kpis.varianceByCashier).toEqual([]);
    expect(kpis.varianceByRegister).toEqual([]);
  });

  it('calculates avgTimeToCloseMinutes correctly', () => {
    const created = new Date(Date.now() - 30 * 60 * 1000).toISOString(); // 30 min ago
    const submitted = new Date().toISOString();
    insertSession(db, { id: 1, dateKey: DATE, status: 'finalized', submittedAt: submitted, createdAt: created });
    const kpis = complianceGetKPIs({ dateFrom: DATE, dateTo: DATE }, db);
    expect(kpis.sessionCount).toBe(1);
    expect(kpis.avgTimeToCloseMinutes).toBeGreaterThanOrEqual(29);
    expect(kpis.avgTimeToCloseMinutes).toBeLessThanOrEqual(31);
  });

  it('counts overrides and reopens from close_approvals', () => {
    insertSession(db, { id: 1, dateKey: DATE });
    insertSession(db, { id: 2, dateKey: DATE });
    insertApproval(db, { sessionId: 1, stage: 'override' });
    insertApproval(db, { sessionId: 2, stage: 'reopened' });
    const kpis = complianceGetKPIs({ dateFrom: DATE, dateTo: DATE }, db);
    expect(kpis.overrideCount).toBe(1);
    expect(kpis.reopenCount).toBe(1);
  });

  it('groups variance by cashier and register', () => {
    insertSession(db, { id: 1, dateKey: DATE });
    insertClosure(db, { sessionId: 1, cashierName: 'Alice', registerKey: 'R1', varianceCents: 200 });
    insertClosure(db, { sessionId: 1, cashierName: 'Alice', registerKey: 'R2', varianceCents: 0 });
    insertClosure(db, { sessionId: 1, cashierName: 'Bob', registerKey: 'R1', varianceCents: -500 });
    const kpis = complianceGetKPIs({ dateFrom: DATE, dateTo: DATE }, db);
    const alice = kpis.varianceByCashier.find(r => r.cashier_name === 'Alice');
    const bob   = kpis.varianceByCashier.find(r => r.cashier_name === 'Bob');
    expect(alice.total).toBe(2);
    expect(alice.with_variance).toBe(1);
    expect(bob.total).toBe(1);
    expect(bob.with_variance).toBe(1);
    // R1 has 2 closures (Alice + Bob), both with variance
    const r1 = kpis.varianceByRegister.find(r => r.register_key === 'R1');
    expect(r1.with_variance).toBe(2);
  });

  it('computes checklistCompliancePct from required active templates only', () => {
    insertChecklistTemplate(db, { id: 1, required: 1, active: 1 });
    insertChecklistTemplate(db, { id: 2, required: 1, active: 1 });
    insertChecklistTemplate(db, { id: 3, required: 0, active: 1 });
    // complete one required, leave one incomplete, skip optional
    insertChecklistEntry(db, { templateId: 1, date: DATE, completed: 1 });
    insertChecklistEntry(db, { templateId: 2, date: DATE, completed: 0 });
    const kpis = complianceGetKPIs({ dateFrom: DATE, dateTo: DATE }, db);
    expect(kpis.checklistCompliancePct).toBe(50); // 1/2 required completed
  });

  it('computes evidenceCompletenessPct', () => {
    insertSession(db, { id: 1, dateKey: DATE, status: 'finalized' });
    insertSession(db, { id: 2, dateKey: DATE, status: 'finalized' });
    insertClosure(db, { sessionId: 1 }); // session 1 has evidence, session 2 does not
    const kpis = complianceGetKPIs({ dateFrom: DATE, dateTo: DATE }, db);
    expect(kpis.evidenceCompletenessPct).toBe(50); // 1/2 finalized have evidence
  });

  it('respects dateFrom/dateTo range', () => {
    insertSession(db, { id: 1, dateKey: DATE });
    insertSession(db, { id: 2, dateKey: DATE2 });
    const kpis = complianceGetKPIs({ dateFrom: DATE, dateTo: DATE }, db);
    expect(kpis.sessionCount).toBe(1);
  });
});

describe('COMPLIANCE-002: complianceGetLists', () => {
  let db;
  beforeEach(() => { db = makeDb(); });

  it('flags submitted sessions older than 1 day as unapproved', () => {
    const oldSubmit = new Date(Date.now() - 2 * 86400000).toISOString();
    insertSession(db, { id: 1, dateKey: DATE, status: 'submitted', submittedAt: oldSubmit, createdAt: oldSubmit });
    const lists = complianceGetLists({ dateFrom: DATE, dateTo: DATE }, db);
    expect(lists.unapproved.length).toBe(1);
    expect(lists.unapproved[0].id).toBe(1);
  });

  it('does not flag recently-submitted sessions as unapproved', () => {
    const recentSubmit = new Date(Date.now() - 1000).toISOString();
    insertSession(db, { id: 1, dateKey: DATE, status: 'submitted', submittedAt: recentSubmit, createdAt: recentSubmit });
    const lists = complianceGetLists({ dateFrom: DATE, dateTo: DATE }, db);
    expect(lists.unapproved.length).toBe(0);
  });

  it('lists sessions with warnings', () => {
    insertSession(db, { id: 1, dateKey: DATE, warnings: 2 });
    insertSession(db, { id: 2, dateKey: DATE, warnings: 0 });
    const lists = complianceGetLists({ dateFrom: DATE, dateTo: DATE }, db);
    expect(lists.withWarnings.length).toBe(1);
    expect(lists.withWarnings[0].id).toBe(1);
  });

  it('lists reopened sessions', () => {
    insertSession(db, { id: 1, dateKey: DATE });
    insertApproval(db, { sessionId: 1, stage: 'reopened' });
    const lists = complianceGetLists({ dateFrom: DATE, dateTo: DATE }, db);
    expect(lists.reopened.length).toBe(1);
    expect(lists.reopened[0].id).toBe(1);
  });

  it('ranks cashiers by variance frequency', () => {
    insertSession(db, { id: 1, dateKey: DATE });
    insertClosure(db, { sessionId: 1, cashierName: 'Charlie', registerKey: 'R1', varianceCents: 300 });
    insertClosure(db, { sessionId: 1, cashierName: 'Charlie', registerKey: 'R2', varianceCents: 100 });
    insertClosure(db, { sessionId: 1, cashierName: 'Dana', registerKey: 'R3', varianceCents: 500 });
    const lists = complianceGetLists({ dateFrom: DATE, dateTo: DATE }, db);
    expect(lists.topVarianceCashiers[0].cashier_name).toBe('Charlie'); // 2 variance events vs 1
    expect(lists.topVarianceCashiers[0].variance_count).toBe(2);
  });

  it('identifies finalized sessions missing evidence', () => {
    insertSession(db, { id: 1, dateKey: DATE, status: 'finalized' }); // no closure
    insertSession(db, { id: 2, dateKey: DATE, status: 'finalized' });
    insertClosure(db, { sessionId: 2 }); // has evidence
    const lists = complianceGetLists({ dateFrom: DATE, dateTo: DATE }, db);
    expect(lists.missingEvidence.length).toBe(1);
    expect(lists.missingEvidence[0].id).toBe(1);
  });

  it('returns all 7 list keys', () => {
    const lists = complianceGetLists({ dateFrom: DATE, dateTo: DATE }, db);
    expect(lists).toHaveProperty('unapproved');
    expect(lists).toHaveProperty('withWarnings');
    expect(lists).toHaveProperty('reopened');
    expect(lists).toHaveProperty('topVarianceCashiers');
    expect(lists).toHaveProperty('topVarianceRegisters');
    expect(lists).toHaveProperty('missingEvidence');
    expect(lists).toHaveProperty('missingDepositVerif');
  });
});

describe('COMPLIANCE-003: empty DB graceful handling', () => {
  it('complianceGetKPIs does not throw on empty DB', () => {
    const db = makeDb();
    expect(() => complianceGetKPIs({ dateFrom: DATE, dateTo: DATE }, db)).not.toThrow();
  });

  it('complianceGetLists does not throw on empty DB', () => {
    const db = makeDb();
    expect(() => complianceGetLists({ dateFrom: DATE, dateTo: DATE }, db)).not.toThrow();
  });

  it('both functions accept no opts and use default date range', () => {
    const db = makeDb();
    expect(() => complianceGetKPIs({}, db)).not.toThrow();
    expect(() => complianceGetLists({}, db)).not.toThrow();
  });
});
