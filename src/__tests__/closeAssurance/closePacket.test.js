/**
 * PACKET-001  packet structure (pure builder)
 * PACKET-002  variance aggregation (pure builder)
 * PACKET-003  approval chain (pure + DB round-trip)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { runMigrations } = require('../../db/migrations.js');
const { buildClosePacket } = require('../../services/closePacketGenerator.js');
const {
  closeSessionCreateOrLoad,
  closeSessionTransition,
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

const SESSION = { date_key: '2026-05-01', shift_key: 'morning', status: 'approved', approved_by: 'Alice', approved_at: '2026-05-01T09:00:00.000Z', carry_forward_float_cents: 30000, is_final_shift: 0 };
const REG_A   = { register_key: 'register_1', variance_cents: 500,  status: 'approved', tender_mode: 'simple',   safe_drops_total_cents: 10000, paid_ins_cents: 0, paid_outs_cents: 0, cash_tips_paid_cents: 0 };
const REG_B   = { register_key: 'register_2', variance_cents: -200, status: 'approved', tender_mode: 'advanced', safe_drops_total_cents: 0,     paid_ins_cents: 100, paid_outs_cents: 50, cash_tips_paid_cents: 25 };

// ── PACKET-001: packet structure ─────────────────────────────────────────────

describe('PACKET-001 packet structure', () => {
  it('buildClosePacket returns all top-level keys', () => {
    const p = buildClosePacket({ session: SESSION, registers: [REG_A], approvals: [], safeDrops: [] });
    expect(p).toHaveProperty('generatedAt');
    expect(p).toHaveProperty('session');
    expect(p).toHaveProperty('registers');
    expect(p).toHaveProperty('approvalChain');
    expect(p).toHaveProperty('safeDrops');
    expect(p).toHaveProperty('summary');
  });

  it('generatedAt is an ISO string', () => {
    const p = buildClosePacket({});
    expect(() => new Date(p.generatedAt)).not.toThrow();
    expect(p.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('session is passed through verbatim', () => {
    const p = buildClosePacket({ session: SESSION });
    expect(p.session).toBe(SESSION);
  });

  it('null session is preserved as null', () => {
    const p = buildClosePacket({});
    expect(p.session).toBeNull();
  });

  it('registers array length matches input', () => {
    const p = buildClosePacket({ registers: [REG_A, REG_B] });
    expect(p.registers).toHaveLength(2);
  });

  it('register entry has all required fields', () => {
    const p = buildClosePacket({ registers: [REG_A] });
    const r = p.registers[0];
    expect(r).toHaveProperty('register_key');
    expect(r).toHaveProperty('variance_cents');
    expect(r).toHaveProperty('status');
    expect(r).toHaveProperty('tender_mode');
    expect(r).toHaveProperty('safe_drops_total_cents');
    expect(r).toHaveProperty('paid_ins_cents');
    expect(r).toHaveProperty('paid_outs_cents');
    expect(r).toHaveProperty('cash_tips_paid_cents');
  });

  it('empty registers produces empty packet registers array', () => {
    const p = buildClosePacket({ registers: [] });
    expect(p.registers).toHaveLength(0);
  });

  it('summary.registerCount matches input register count', () => {
    const p = buildClosePacket({ registers: [REG_A, REG_B] });
    expect(p.summary.registerCount).toBe(2);
  });

  it('summary.isFinalShift true when session.is_final_shift === 1', () => {
    const p = buildClosePacket({ session: { ...SESSION, is_final_shift: 1 } });
    expect(p.summary.isFinalShift).toBe(true);
  });

  it('summary.isFinalShift false when is_final_shift === 0', () => {
    const p = buildClosePacket({ session: SESSION });
    expect(p.summary.isFinalShift).toBe(false);
  });

  it('summary.carryForwardFloatCents comes from session', () => {
    const p = buildClosePacket({ session: SESSION });
    expect(p.summary.carryForwardFloatCents).toBe(30000);
  });

  it('summary.carryForwardFloatCents is null when session is null', () => {
    const p = buildClosePacket({});
    expect(p.summary.carryForwardFloatCents).toBeNull();
  });

  it('safeDrops entries have id, register_key, amount_cents, created_at', () => {
    const sd = { id: 1, register_key: 'register_1', amount_cents: 5000, created_at: '2026-05-01T08:00:00.000Z' };
    const p = buildClosePacket({ safeDrops: [sd] });
    expect(p.safeDrops[0]).toMatchObject({ id: 1, register_key: 'register_1', amount_cents: 5000 });
  });
});

// ── PACKET-002: variance aggregation ─────────────────────────────────────────

describe('PACKET-002 variance aggregation', () => {
  it('single positive variance', () => {
    const p = buildClosePacket({ registers: [{ ...REG_A, variance_cents: 500 }] });
    expect(p.summary.totalVarianceCents).toBe(500);
  });

  it('single negative variance', () => {
    const p = buildClosePacket({ registers: [{ ...REG_A, variance_cents: -300 }] });
    expect(p.summary.totalVarianceCents).toBe(-300);
  });

  it('two registers net to zero', () => {
    const p = buildClosePacket({ registers: [
      { ...REG_A, variance_cents:  300 },
      { ...REG_B, variance_cents: -300 },
    ]});
    expect(p.summary.totalVarianceCents).toBe(0);
  });

  it('three registers summed correctly', () => {
    const p = buildClosePacket({ registers: [
      { ...REG_A, variance_cents: 1000 },
      { ...REG_B, variance_cents:  500 },
      { ...REG_A, register_key: 'register_3', variance_cents: -200 },
    ]});
    expect(p.summary.totalVarianceCents).toBe(1300);
  });

  it('null variance_cents treated as 0', () => {
    const p = buildClosePacket({ registers: [{ ...REG_A, variance_cents: null }] });
    expect(p.summary.totalVarianceCents).toBe(0);
    expect(p.registers[0].variance_cents).toBe(0);
  });

  it('tender_mode preserved per register', () => {
    const p = buildClosePacket({ registers: [REG_A, REG_B] });
    expect(p.registers[0].tender_mode).toBe('simple');
    expect(p.registers[1].tender_mode).toBe('advanced');
  });

  it('missing tender_mode defaults to simple', () => {
    const p = buildClosePacket({ registers: [{ register_key: 'r1', variance_cents: 0 }] });
    expect(p.registers[0].tender_mode).toBe('simple');
  });

  it('paid_ins/paid_outs/cash_tips preserved', () => {
    const p = buildClosePacket({ registers: [REG_B] });
    expect(p.registers[0].paid_ins_cents).toBe(100);
    expect(p.registers[0].paid_outs_cents).toBe(50);
    expect(p.registers[0].cash_tips_paid_cents).toBe(25);
  });

  it('empty registers yields totalVarianceCents 0', () => {
    const p = buildClosePacket({ registers: [] });
    expect(p.summary.totalVarianceCents).toBe(0);
  });

  it('summary.safeDropCount matches safeDrops input length', () => {
    const sd = { id: 1, register_key: 'r1', amount_cents: 5000, created_at: null };
    const p = buildClosePacket({ safeDrops: [sd, sd] });
    expect(p.summary.safeDropCount).toBe(2);
  });
});

// ── PACKET-003: approval chain ────────────────────────────────────────────────

describe('PACKET-003 approval chain', () => {
  it('empty approvals produces empty approvalChain', () => {
    const p = buildClosePacket({ approvals: [] });
    expect(p.approvalChain).toHaveLength(0);
  });

  it('single approval entry is included', () => {
    const a = { id: 1, close_session_id: 42, stage: 'submitted', actor_name: 'Bob', actor_role: 'cashier', approval_method: 'typed_name', reason: null, created_at: '2026-05-01T08:00:00.000Z' };
    const p = buildClosePacket({ approvals: [a] });
    expect(p.approvalChain).toHaveLength(1);
    expect(p.approvalChain[0].actor_name).toBe('Bob');
    expect(p.approvalChain[0].stage).toBe('submitted');
  });

  it('multiple approvals sorted chronologically by created_at', () => {
    const a1 = { stage: 'submitted', actor_name: 'Bob',   created_at: '2026-05-01T08:00:00.000Z' };
    const a2 = { stage: 'approved',  actor_name: 'Alice', created_at: '2026-05-01T09:00:00.000Z' };
    const a3 = { stage: 'finalized', actor_name: 'Alice', created_at: '2026-05-01T10:00:00.000Z' };
    // pass out of order
    const p = buildClosePacket({ approvals: [a3, a1, a2] });
    expect(p.approvalChain[0].stage).toBe('submitted');
    expect(p.approvalChain[1].stage).toBe('approved');
    expect(p.approvalChain[2].stage).toBe('finalized');
  });

  it('reopen entry is captured with reason', () => {
    const a = { stage: 'reopened', actor_name: 'Alice', actor_role: 'manager', reason: 'Correction requise', created_at: '2026-05-01T11:00:00.000Z' };
    const p = buildClosePacket({ approvals: [a] });
    expect(p.approvalChain[0].stage).toBe('reopened');
    expect(p.approvalChain[0].reason).toBe('Correction requise');
  });

  it('summary.hasReopened true when any approval stage is reopened', () => {
    const p = buildClosePacket({ approvals: [{ stage: 'reopened', created_at: '2026-05-01T11:00:00.000Z' }] });
    expect(p.summary.hasReopened).toBe(true);
  });

  it('summary.hasReopened false when no reopened approval', () => {
    const p = buildClosePacket({ approvals: [{ stage: 'submitted', created_at: '2026-05-01T08:00:00.000Z' }] });
    expect(p.summary.hasReopened).toBe(false);
  });

  it('approval_method preserved in chain entry', () => {
    const a = { stage: 'approved', actor_name: 'Alice', approval_method: 'pin', created_at: '2026-05-01T09:00:00.000Z' };
    const p = buildClosePacket({ approvals: [a] });
    expect(p.approvalChain[0].approval_method).toBe('pin');
  });

  it('DB round-trip: closeApprovalList feeds buildClosePacket correctly', () => {
    const db = makeDb();
    const session = closeSessionCreateOrLoad({ date_key: '2026-05-10', shift_key: 'morning' }, db);
    closeSessionTransition({ id: session.id, to: 'submitted', actor_name: 'Bob', actor_role: 'cashier', approval_method: 'typed_name' }, db);
    closeSessionTransition({ id: session.id, to: 'approved',  actor_name: 'Alice', actor_role: 'manager', approval_method: 'pin' }, db);
    const approvals = closeApprovalList(session.id, db);
    const p = buildClosePacket({ session, approvals });
    expect(p.approvalChain).toHaveLength(2);
    expect(p.approvalChain[0].stage).toBe('submitted');
    expect(p.approvalChain[1].stage).toBe('approved');
    expect(p.approvalChain[1].actor_name).toBe('Alice');
    db.close();
  });

  it('DB round-trip: reopen entry visible in approval chain', () => {
    const db = makeDb();
    const session = closeSessionCreateOrLoad({ date_key: '2026-05-11', shift_key: 'afternoon' }, db);
    closeSessionTransition({ id: session.id, to: 'submitted', actor_name: 'Bob',   actor_role: 'cashier', approval_method: 'typed_name' }, db);
    closeSessionTransition({ id: session.id, to: 'approved',  actor_name: 'Alice', actor_role: 'manager', approval_method: 'pin' }, db);
    closeSessionTransition({ id: session.id, to: 'finalized', actor_name: 'Alice', actor_role: 'manager', approval_method: 'pin' }, db);
    closeSessionTransition({ id: session.id, to: 'reopened',  actor_name: 'Alice', actor_role: 'manager', reason: 'Montant errone' }, db);
    const approvals = closeApprovalList(session.id, db);
    const p = buildClosePacket({ session, approvals });
    expect(p.summary.hasReopened).toBe(true);
    const reopenEntry = p.approvalChain.find(a => a.stage === 'reopened');
    expect(reopenEntry?.reason).toBe('Montant errone');
    db.close();
  });
});
