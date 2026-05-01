/**
 * OVERRIDE-001  override capture (DB + pure function)
 * OVERRIDE-002  multi-warning workflow (pure canConfirmClose)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { runMigrations } = require('../../db/migrations.js');
const { closeSessionCreateOrLoad, closeOverrideRecord, closeApprovalList } = require('../../db/database.js');
import { canConfirmClose } from '../../services/closeGating.js';

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

// ── OVERRIDE-001: override capture ───────────────────────────────────────────

describe('OVERRIDE-001 override capture', () => {
  let db;
  beforeEach(() => { db = makeDb(); });
  afterEach(() => { db.close(); });

  it('warning override is recorded in close_approvals with stage=override', () => {
    const session = closeSessionCreateOrLoad({ date_key: '2026-04-30' }, db);
    closeOverrideRecord({
      session_id: session.id,
      warning_code: 'CHECKLIST_MISSING',
      reason: 'Left early, acknowledged by manager',
      actor_name: 'Marie',
      actor_role: 'manager',
      approval_method: 'pin',
    }, db);
    const rows = closeApprovalList(session.id, db);
    expect(rows).toHaveLength(1);
    expect(rows[0].stage).toBe('override');
    expect(rows[0].actor_name).toBe('Marie');
    expect(rows[0].reason).toContain('CHECKLIST_MISSING');
  });

  it('override requires manager-level identity - throws for cashier', () => {
    const session = closeSessionCreateOrLoad({ date_key: '2026-04-29' }, db);
    expect(() => closeOverrideRecord({
      session_id: session.id,
      warning_code: 'VAR_REGISTER_EXCEEDED',
      reason: 'Cashier forgot',
      actor_name: 'Bob',
      actor_role: 'cashier',
      approval_method: 'pin',
    }, db)).toThrow('insufficient_role');
  });

  it('override accepts owner role', () => {
    const session = closeSessionCreateOrLoad({ date_key: '2026-04-28' }, db);
    expect(() => closeOverrideRecord({
      session_id: session.id,
      warning_code: 'VAR_REGISTER_EXCEEDED',
      reason: 'Owner override',
      actor_name: 'Patron',
      actor_role: 'owner',
      approval_method: 'pin',
    }, db)).not.toThrow();
  });

  it('override fails if actor_role is null (typed_name actor)', () => {
    const session = closeSessionCreateOrLoad({ date_key: '2026-04-27' }, db);
    expect(() => closeOverrideRecord({
      session_id: session.id,
      warning_code: 'CHECKLIST_MISSING',
      reason: 'Just a name',
      actor_name: 'Anthony',
      actor_role: null,
      approval_method: 'typed_name',
    }, db)).toThrow('insufficient_role');
  });

  it('multiple overrides for different warnings on the same session', () => {
    const session = closeSessionCreateOrLoad({ date_key: '2026-04-26' }, db);
    closeOverrideRecord({ session_id: session.id, warning_code: 'W1', reason: 'r1', actor_name: 'Mgr', actor_role: 'manager', approval_method: 'pin' }, db);
    closeOverrideRecord({ session_id: session.id, warning_code: 'W2', reason: 'r2', actor_name: 'Mgr', actor_role: 'manager', approval_method: 'pin' }, db);
    const rows = closeApprovalList(session.id, db);
    expect(rows.filter(r => r.stage === 'override')).toHaveLength(2);
  });
});

// ── OVERRIDE-002: multi-warning workflow (pure canConfirmClose) ───────────────

describe('OVERRIDE-002 multi-warning workflow', () => {
  const warnings = [
    { code: 'CHECKLIST_MISSING', message_fr: 'Checklist', message_en: 'Checklist' },
    { code: 'VAR_REGISTER_EXCEEDED', message_fr: 'Ecart', message_en: 'Variance' },
  ];
  const actor = { name: 'Marie', role: 'manager', identity_method: 'pin' };

  it('all warnings must have overrides before submit', () => {
    expect(canConfirmClose({
      blockers: [], variances: [], varianceRule: 'inform',
      localReasons: {}, warnings,
      signoffRequired: true,
      overrideReasons: { 0: 'reason for checklist' },
      overrideActor: actor,
    })).toBe(false);
  });

  it('mix of overrides and unresolved warnings keeps button disabled', () => {
    expect(canConfirmClose({
      blockers: [], variances: [], varianceRule: 'inform',
      localReasons: {}, warnings,
      signoffRequired: true,
      overrideReasons: { 0: 'reason', 1: '' },
      overrideActor: actor,
    })).toBe(false);
  });

  it('all warnings with reasons + actor enables confirm', () => {
    expect(canConfirmClose({
      blockers: [], variances: [], varianceRule: 'inform',
      localReasons: {}, warnings,
      signoffRequired: true,
      overrideReasons: { 0: 'reason for checklist', 1: 'reason for variance' },
      overrideActor: actor,
    })).toBe(true);
  });

  it('all override reasons filled but no actor still disabled', () => {
    expect(canConfirmClose({
      blockers: [], variances: [], varianceRule: 'inform',
      localReasons: {}, warnings,
      signoffRequired: true,
      overrideReasons: { 0: 'reason for checklist', 1: 'reason for variance' },
      overrideActor: null,
    })).toBe(false);
  });

  it('no warnings = signoffRequired has no effect on gating', () => {
    expect(canConfirmClose({
      blockers: [], variances: [], varianceRule: 'inform',
      localReasons: {}, warnings: [],
      signoffRequired: true,
      overrideReasons: {},
      overrideActor: null,
    })).toBe(true);
  });

  it('signoffRequired=false with warnings does not block confirm', () => {
    expect(canConfirmClose({
      blockers: [], variances: [], varianceRule: 'inform',
      localReasons: {}, warnings,
      signoffRequired: false,
      overrideReasons: {},
      overrideActor: null,
    })).toBe(true);
  });

  it('blockers still take priority over override state', () => {
    expect(canConfirmClose({
      blockers: [{ code: 'VAR_STORE_EXCEEDED' }], variances: [], varianceRule: 'inform',
      localReasons: {}, warnings,
      signoffRequired: true,
      overrideReasons: { 0: 'r', 1: 'r' },
      overrideActor: actor,
    })).toBe(false);
  });

  it('whitespace-only override reason does not satisfy requirement', () => {
    expect(canConfirmClose({
      blockers: [], variances: [], varianceRule: 'inform',
      localReasons: {}, warnings,
      signoffRequired: true,
      overrideReasons: { 0: '   ', 1: 'real reason' },
      overrideActor: actor,
    })).toBe(false);
  });
});
