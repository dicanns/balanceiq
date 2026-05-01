/**
 * REOPEN-001  CloseReopenDialog form validation (pure logic)
 * REOPEN-002  Edit-after-close detection (requiresReopen utility)
 * REOPEN-003  FSM enforcement: finalized->reopened requires manager + reason
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { runMigrations } = require('../../db/migrations.js');
const {
  closeSessionCreateOrLoad,
  closeSessionTransition,
  closeApprovalList,
} = require('../../db/database.js');
const { requiresReopen } = require('../../services/closeReopenGuard.js');

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

function finalizeSession(db, dateKey) {
  const s = closeSessionCreateOrLoad({ date_key: dateKey }, db);
  closeSessionTransition({ id: s.id, to: 'submitted', actor_name: 'Cashier', actor_role: 'cashier', approval_method: 'typed_name' }, db);
  closeSessionTransition({ id: s.id, to: 'finalized', actor_name: 'Owner', actor_role: 'owner', approval_method: 'pin' }, db);
  return db.prepare('SELECT * FROM close_sessions WHERE id = ?').get(s.id);
}

// ── REOPEN-001: CloseReopenDialog form validation ────────────────────────────

describe('REOPEN-001 CloseReopenDialog form validation logic', () => {
  function canConfirmReopen({ reason, actor }) {
    return !!(reason?.trim()) && !!actor;
  }

  it('disabled when reason is empty and no actor', () => {
    expect(canConfirmReopen({ reason: '', actor: null })).toBe(false);
  });

  it('disabled when reason has only whitespace', () => {
    expect(canConfirmReopen({ reason: '   ', actor: { name: 'Mgr', role: 'manager' } })).toBe(false);
  });

  it('disabled when reason is filled but no actor', () => {
    expect(canConfirmReopen({ reason: 'Erreur de saisie', actor: null })).toBe(false);
  });

  it('disabled when actor is present but reason is empty', () => {
    expect(canConfirmReopen({ reason: '', actor: { name: 'Mgr', role: 'manager' } })).toBe(false);
  });

  it('enabled when both reason and actor are provided', () => {
    expect(canConfirmReopen({ reason: 'Correction requise', actor: { name: 'Marie', role: 'manager' } })).toBe(true);
  });

  it('enabled with minimal non-empty reason', () => {
    expect(canConfirmReopen({ reason: 'x', actor: { name: 'Jean', role: 'owner' } })).toBe(true);
  });
});

// ── REOPEN-002: Edit-after-close detection ───────────────────────────────────

describe('REOPEN-002 edit-after-close detection', () => {
  it('returns true for finalized session', () => {
    expect(requiresReopen({ status: 'finalized' })).toBe(true);
  });

  it('returns false for draft session', () => {
    expect(requiresReopen({ status: 'draft' })).toBe(false);
  });

  it('returns false for submitted session', () => {
    expect(requiresReopen({ status: 'submitted' })).toBe(false);
  });

  it('returns false for approved session', () => {
    expect(requiresReopen({ status: 'approved' })).toBe(false);
  });

  it('returns false for reopened session (already unlocked for editing)', () => {
    expect(requiresReopen({ status: 'reopened' })).toBe(false);
  });

  it('returns false for null session (no session = no gate)', () => {
    expect(requiresReopen(null)).toBe(false);
  });

  it('returns false for undefined session', () => {
    expect(requiresReopen(undefined)).toBe(false);
  });

  it('returns false for session without status field', () => {
    expect(requiresReopen({})).toBe(false);
  });
});

// ── REOPEN-003: FSM enforcement for finalized->reopened ──────────────────────

describe('REOPEN-003 finalized->reopened FSM enforcement', () => {
  let db;
  beforeEach(() => { db = makeDb(); });
  afterEach(() => { db.close(); });

  it('throws reopen_reason_required when reason is missing', () => {
    const session = finalizeSession(db, '2026-05-01');
    expect(() => closeSessionTransition({
      id: session.id, to: 'reopened',
      actor_name: 'Mgr', actor_role: 'manager', approval_method: 'pin',
    }, db)).toThrow('reopen_reason_required');
  });

  it('throws reopen_reason_required when reason is whitespace only', () => {
    const session = finalizeSession(db, '2026-05-02');
    expect(() => closeSessionTransition({
      id: session.id, to: 'reopened',
      actor_name: 'Mgr', actor_role: 'manager', approval_method: 'pin',
      reason: '   ',
    }, db)).toThrow('reopen_reason_required');
  });

  it('throws reopen_insufficient_role for cashier actor', () => {
    const session = finalizeSession(db, '2026-05-03');
    expect(() => closeSessionTransition({
      id: session.id, to: 'reopened',
      actor_name: 'Bob', actor_role: 'cashier', approval_method: 'pin',
      reason: 'Correction requise',
    }, db)).toThrow('reopen_insufficient_role');
  });

  it('throws reopen_insufficient_role when actor_role is null', () => {
    const session = finalizeSession(db, '2026-05-04');
    expect(() => closeSessionTransition({
      id: session.id, to: 'reopened',
      actor_name: 'Anonymous', actor_role: null, approval_method: 'typed_name',
      reason: 'Test',
    }, db)).toThrow('reopen_insufficient_role');
  });

  it('succeeds with manager role + non-empty reason', () => {
    const session = finalizeSession(db, '2026-05-05');
    const updated = closeSessionTransition({
      id: session.id, to: 'reopened',
      actor_name: 'Marie', actor_role: 'manager', approval_method: 'pin',
      reason: 'Erreur de saisie détectée',
    }, db);
    expect(updated.status).toBe('reopened');
    expect(updated.reopened_by).toBe('Marie');
    expect(updated.reopened_at).toBeTruthy();
    expect(updated.reopen_reason).toBe('Erreur de saisie détectée');
  });

  it('succeeds with owner role + reason', () => {
    const session = finalizeSession(db, '2026-05-06');
    const updated = closeSessionTransition({
      id: session.id, to: 'reopened',
      actor_name: 'Patron', actor_role: 'owner', approval_method: 'pin',
      reason: 'Owner correction',
    }, db);
    expect(updated.status).toBe('reopened');
  });

  it('records approval row with stage=reopened and reason', () => {
    const session = finalizeSession(db, '2026-05-07');
    closeSessionTransition({
      id: session.id, to: 'reopened',
      actor_name: 'Marie', actor_role: 'manager', approval_method: 'pin',
      reason: 'Données incorrectes',
    }, db);
    const approvals = closeApprovalList(session.id, db);
    const reopenRow = approvals.find(a => a.stage === 'reopened');
    expect(reopenRow).toBeTruthy();
    expect(reopenRow.actor_name).toBe('Marie');
    expect(reopenRow.reason).toBe('Données incorrectes');
  });

  it('reopened session can be submitted again (draft->submitted->finalized->reopened->submitted)', () => {
    const session = finalizeSession(db, '2026-05-08');
    closeSessionTransition({
      id: session.id, to: 'reopened',
      actor_name: 'Mgr', actor_role: 'manager', approval_method: 'pin',
      reason: 'Fix needed',
    }, db);
    const resubmitted = closeSessionTransition({
      id: session.id, to: 'submitted',
      actor_name: 'Cashier', actor_role: 'cashier', approval_method: 'typed_name',
    }, db);
    expect(resubmitted.status).toBe('submitted');
  });

  it('FSM still rejects invalid transition from finalized to submitted directly', () => {
    const session = finalizeSession(db, '2026-05-09');
    expect(() => closeSessionTransition({
      id: session.id, to: 'submitted',
      actor_name: 'Mgr', actor_role: 'manager', approval_method: 'pin',
    }, db)).toThrow(/invalid_transition/);
  });
});
