/**
 * APPROVAL-001  FSM validateTransition
 * APPROVAL-002  closeSessionTransition DB round-trip
 * APPROVAL-003  closeApprovalCreate / closeApprovalList
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { runMigrations } = require('../../db/migrations.js');
const { validateTransition, VALID_TRANSITIONS } = require('../../services/closeStateMachine.js');
const {
  closeSessionCreateOrLoad,
  closeSessionTransition,
  closeApprovalCreate,
  closeApprovalList,
} = require('../../db/database.js');

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
  `);
  db.pragma('user_version = 7');
  runMigrations(db);
  return db;
}

// ── APPROVAL-001: FSM validateTransition ─────────────────────────────────────

describe('APPROVAL-001 FSM validateTransition', () => {
  it('draft -> submitted is valid', () => {
    expect(validateTransition('draft', 'submitted')).toBeNull();
  });

  it('submitted -> approved is valid', () => {
    expect(validateTransition('submitted', 'approved')).toBeNull();
  });

  it('submitted -> finalized is valid', () => {
    expect(validateTransition('submitted', 'finalized')).toBeNull();
  });

  it('approved -> finalized is valid', () => {
    expect(validateTransition('approved', 'finalized')).toBeNull();
  });

  it('finalized -> reopened is valid', () => {
    expect(validateTransition('finalized', 'reopened')).toBeNull();
  });

  it('reopened -> submitted is valid', () => {
    expect(validateTransition('reopened', 'submitted')).toBeNull();
  });

  it('draft -> finalized is invalid', () => {
    expect(validateTransition('draft', 'finalized')).not.toBeNull();
  });

  it('draft -> approved is invalid', () => {
    expect(validateTransition('draft', 'approved')).not.toBeNull();
  });

  it('finalized -> submitted is invalid', () => {
    expect(validateTransition('finalized', 'submitted')).not.toBeNull();
  });

  it('invalid from status returns error string', () => {
    expect(validateTransition('unknown', 'submitted')).toMatch(/invalid_from_status/);
  });

  it('invalid transition returns error string', () => {
    expect(validateTransition('draft', 'reopened')).toMatch(/invalid_transition/);
  });

  it('VALID_TRANSITIONS covers all required statuses', () => {
    const statuses = ['draft', 'submitted', 'approved', 'finalized', 'reopened'];
    statuses.forEach(s => expect(Object.keys(VALID_TRANSITIONS)).toContain(s));
  });
});

// ── APPROVAL-002: closeSessionTransition DB round-trip ────────────────────────

describe('APPROVAL-002 closeSessionTransition DB round-trip', () => {
  let db;
  beforeEach(() => { db = makeDb(); });
  afterEach(() => { db.close(); });

  it('transitions draft -> submitted and records submitted_at', () => {
    const session = closeSessionCreateOrLoad({ date_key: '2026-04-30' }, db);
    expect(session.status).toBe('draft');
    const updated = closeSessionTransition({ id: session.id, to: 'submitted', actor_name: 'Marie', actor_role: 'cashier', approval_method: 'pin' }, db);
    expect(updated.status).toBe('submitted');
    expect(updated.submitted_at).toBeTruthy();
  });

  it('transitions submitted -> approved and records approved_by', () => {
    const session = closeSessionCreateOrLoad({ date_key: '2026-04-29' }, db);
    closeSessionTransition({ id: session.id, to: 'submitted', actor_name: 'Jean', actor_role: 'cashier', approval_method: 'typed_name' }, db);
    const approved = closeSessionTransition({ id: session.id, to: 'approved', actor_name: 'Patron', actor_role: 'manager', approval_method: 'pin' }, db);
    expect(approved.status).toBe('approved');
    expect(approved.approved_by).toBe('Patron');
    expect(approved.approved_at).toBeTruthy();
  });

  it('transitions approved -> finalized', () => {
    const session = closeSessionCreateOrLoad({ date_key: '2026-04-28' }, db);
    closeSessionTransition({ id: session.id, to: 'submitted' }, db);
    closeSessionTransition({ id: session.id, to: 'approved', actor_name: 'Mgr' }, db);
    const final = closeSessionTransition({ id: session.id, to: 'finalized', actor_name: 'Mgr' }, db);
    expect(final.status).toBe('finalized');
  });

  it('transitions submitted -> finalized directly (no signoff path)', () => {
    const session = closeSessionCreateOrLoad({ date_key: '2026-04-27' }, db);
    closeSessionTransition({ id: session.id, to: 'submitted' }, db);
    const final = closeSessionTransition({ id: session.id, to: 'finalized', actor_name: 'Owner', actor_role: 'owner', approval_method: 'pin' }, db);
    expect(final.status).toBe('finalized');
  });

  it('throws on invalid transition', () => {
    const session = closeSessionCreateOrLoad({ date_key: '2026-04-26' }, db);
    expect(() => closeSessionTransition({ id: session.id, to: 'finalized' }, db)).toThrow(/invalid_transition/);
  });

  it('throws for non-existent session', () => {
    expect(() => closeSessionTransition({ id: 99999, to: 'submitted' }, db)).toThrow(/session_not_found/);
  });

  it('creates an approval row automatically when actor_name is provided', () => {
    const session = closeSessionCreateOrLoad({ date_key: '2026-04-25' }, db);
    closeSessionTransition({ id: session.id, to: 'submitted', actor_name: 'Alice', actor_role: 'cashier', approval_method: 'pin' }, db);
    const approvals = closeApprovalList(session.id, db);
    expect(approvals).toHaveLength(1);
    expect(approvals[0].actor_name).toBe('Alice');
    expect(approvals[0].stage).toBe('submitted');
  });

  it('does not create approval row when actor_name is null', () => {
    const session = closeSessionCreateOrLoad({ date_key: '2026-04-24' }, db);
    closeSessionTransition({ id: session.id, to: 'submitted', actor_name: null }, db);
    const approvals = closeApprovalList(session.id, db);
    expect(approvals).toHaveLength(0);
  });
});

// ── APPROVAL-003: closeApprovalCreate / closeApprovalList ─────────────────────

describe('APPROVAL-003 closeApprovalCreate and closeApprovalList', () => {
  let db;
  beforeEach(() => { db = makeDb(); });
  afterEach(() => { db.close(); });

  it('creates an approval record and retrieves it', () => {
    const session = closeSessionCreateOrLoad({ date_key: '2026-04-23' }, db);
    const approval = closeApprovalCreate({
      close_session_id: session.id,
      stage: 'submitted',
      actor_name: 'Bob',
      actor_role: 'manager',
      approval_method: 'pin',
      reason: 'test reason',
    }, db);
    expect(approval.id).toBeGreaterThan(0);
    expect(approval.actor_name).toBe('Bob');
    expect(approval.stage).toBe('submitted');
  });

  it('lists approvals in insertion order', () => {
    const session = closeSessionCreateOrLoad({ date_key: '2026-04-22' }, db);
    closeApprovalCreate({ close_session_id: session.id, stage: 'submitted', actor_name: 'A', actor_role: 'cashier', approval_method: 'typed_name' }, db);
    closeApprovalCreate({ close_session_id: session.id, stage: 'approved',  actor_name: 'B', actor_role: 'manager', approval_method: 'pin' }, db);
    const list = closeApprovalList(session.id, db);
    expect(list).toHaveLength(2);
    expect(list[0].actor_name).toBe('A');
    expect(list[1].actor_name).toBe('B');
  });

  it('returns empty array for session with no approvals', () => {
    const session = closeSessionCreateOrLoad({ date_key: '2026-04-21' }, db);
    expect(closeApprovalList(session.id, db)).toEqual([]);
  });

  it('approval_method null is accepted (no constraint violation)', () => {
    const session = closeSessionCreateOrLoad({ date_key: '2026-04-20' }, db);
    expect(() => closeApprovalCreate({
      close_session_id: session.id, stage: 'submitted',
      actor_name: 'Ghost', approval_method: null,
    }, db)).not.toThrow();
  });
});
