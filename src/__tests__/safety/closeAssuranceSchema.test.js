/**
 * CA-SCHEMA-001  Close Assurance schema parity
 * CA-IPC-001     Close policy CRUD
 * CA-IPC-002     Close session create-or-load
 */
import { describe, it, expect } from 'vitest';
import { buildAccountingDb } from '../accounting/helpers/testSchema.js';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  getAllTablesForBackup,
  closePolicyGet, closePolicySave,
  closeSessionGet, closeSessionList, closeSessionCreateOrLoad,
  closeExceptionList, closeExceptionAcknowledge,
} = require('../../db/database.js');

const CLOSE_TABLES = [
  'close_policies',
  'close_sessions',
  'register_closures',
  'close_exceptions',
  'close_approvals',
];

describe('CA-SCHEMA-001 close assurance schema parity', () => {
  it('all close assurance tables are included in backup', () => {
    const db = buildAccountingDb();
    const { sqlite } = getAllTablesForBackup(db);
    const backed = Object.keys(sqlite);
    const missing = CLOSE_TABLES.filter(t => !backed.includes(t));
    expect(missing, `Tables missing from backup: ${missing.join(', ')}`).toEqual([]);
    db.close();
  });

  it('all close assurance tables exist in schema', () => {
    const db = buildAccountingDb();
    const tables = db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`
    ).all().map(r => r.name);
    const missing = CLOSE_TABLES.filter(t => !tables.includes(t));
    expect(missing, `Tables missing from schema: ${missing.join(', ')}`).toEqual([]);
    db.close();
  });
});

describe('CA-IPC-001 close policy CRUD', () => {
  it('default policy is returned when none exists for location', () => {
    const db = buildAccountingDb();
    const policy = closePolicyGet(null, db);
    expect(policy.blind_close_mode).toBe('off');
    expect(policy.denomination_mode).toBe('total_only');
    expect(policy.approver_identity_method).toBe('typed_name');
    expect(policy.variance_per_register_cents).toBe(100);
    expect(policy.id).toBeUndefined();
    db.close();
  });

  it('policy save upserts and writes audit_log', () => {
    const db = buildAccountingDb();
    const saved = closePolicySave({ name: 'test', blind_close_mode: 'register_blind' }, db);
    expect(saved.id).toBeGreaterThan(0);
    expect(saved.blind_close_mode).toBe('register_blind');

    const audit = db.prepare(`SELECT * FROM audit_log WHERE action='close_policy_saved'`).all();
    expect(audit.length).toBeGreaterThanOrEqual(1);

    const updated = closePolicySave({ id: saved.id, blind_close_mode: 'manager_reveal' }, db);
    expect(updated.id).toBe(saved.id);
    expect(updated.blind_close_mode).toBe('manager_reveal');
    db.close();
  });

  it('CHECK constraint rejects invalid blind_close_mode value', () => {
    const db = buildAccountingDb();
    expect(() => {
      db.prepare(`INSERT INTO close_policies (name, blind_close_mode) VALUES ('x', 'invalid')`).run();
    }).toThrow();
    db.close();
  });

  it('CHECK constraint rejects invalid denomination_mode value', () => {
    const db = buildAccountingDb();
    expect(() => {
      db.prepare(`INSERT INTO close_policies (name, blind_close_mode, denomination_mode) VALUES ('x', 'off', 'bad')`).run();
    }).toThrow();
    db.close();
  });
});

describe('CA-IPC-002 close session create or load', () => {
  it('creates new draft session when none exists', () => {
    const db = buildAccountingDb();
    const session = closeSessionCreateOrLoad({ date_key: '2026-04-28' }, db);
    expect(session.id).toBeGreaterThan(0);
    expect(session.date_key).toBe('2026-04-28');
    expect(session.status).toBe('draft');
    db.close();
  });

  it('returns existing session when date_key matches', () => {
    const db = buildAccountingDb();
    const first = closeSessionCreateOrLoad({ date_key: '2026-04-28' }, db);
    const second = closeSessionCreateOrLoad({ date_key: '2026-04-28' }, db);
    expect(second.id).toBe(first.id);
    db.close();
  });

  it('closeSessionGet returns session with register_closures array', () => {
    const db = buildAccountingDb();
    const session = closeSessionCreateOrLoad({ date_key: '2026-04-29' }, db);
    const loaded = closeSessionGet(session.id, db);
    expect(loaded.id).toBe(session.id);
    expect(Array.isArray(loaded.register_closures)).toBe(true);
    db.close();
  });

  it('closeSessionList filters by status', () => {
    const db = buildAccountingDb();
    closeSessionCreateOrLoad({ date_key: '2026-04-30' }, db);
    const drafts = closeSessionList({ status: 'draft' }, db);
    expect(drafts.length).toBeGreaterThanOrEqual(1);
    const approved = closeSessionList({ status: 'approved' }, db);
    expect(approved.length).toBe(0);
    db.close();
  });
});
