/**
 * SHIFT-001  carry-forward float
 * SHIFT-002  final shift aggregation
 * SHIFT-003  shift mode toggling
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { createRequire } from 'module';
import { SHIFT_KEYS, precedingShiftKey, isFinalShift, resolveOpeningFloat } from '../../services/shiftKeys.js';

const require = createRequire(import.meta.url);
const { runMigrations } = require('../../db/migrations.js');
const {
  closeSessionCreateOrLoad,
  closeStoreCarryForward,
  closeGetPrecedingCarryForward,
  closeDaySummary,
  closeSessionsByDate,
  closeSessionTransition,
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

function insertRegisterClosure(db, close_session_id, variance_cents) {
  db.prepare(`INSERT INTO register_closures
    (close_session_id, register_key, variance_cents, status)
    VALUES (?, ?, ?, 'draft')`
  ).run(close_session_id, `register_1`, variance_cents);
}

// ── SHIFT-001: carry-forward float ───────────────────────────────────────────

describe('SHIFT-001 carry-forward float', () => {
  let db;
  beforeEach(() => { db = makeDb(); });
  afterEach(() => { db.close(); });

  it('SHIFT_KEYS contains all 6 expected shifts in order', () => {
    expect(SHIFT_KEYS).toEqual(['dawn', 'morning', 'afternoon', 'evening', 'night', 'final']);
  });

  it('precedingShiftKey returns null for dawn (first shift)', () => {
    expect(precedingShiftKey('dawn')).toBeNull();
  });

  it('precedingShiftKey returns dawn for morning', () => {
    expect(precedingShiftKey('morning')).toBe('dawn');
  });

  it('precedingShiftKey returns morning for afternoon', () => {
    expect(precedingShiftKey('morning')).toBe('dawn');
    expect(precedingShiftKey('afternoon')).toBe('morning');
  });

  it('precedingShiftKey returns night for final', () => {
    expect(precedingShiftKey('final')).toBe('night');
  });

  it('precedingShiftKey returns null for unknown shift', () => {
    expect(precedingShiftKey('unknown')).toBeNull();
  });

  it('isFinalShift returns true only for final', () => {
    expect(isFinalShift('final')).toBe(true);
    expect(isFinalShift('morning')).toBe(false);
    expect(isFinalShift(null)).toBe(false);
  });

  it('resolveOpeningFloat uses carry-forward when no override', () => {
    expect(resolveOpeningFloat(40000, null)).toBe(40000);
  });

  it('resolveOpeningFloat uses override when provided', () => {
    expect(resolveOpeningFloat(40000, 25000)).toBe(25000);
  });

  it('resolveOpeningFloat returns 0 when both are absent', () => {
    expect(resolveOpeningFloat(null, null)).toBe(0);
  });

  it('next shift opening_float equals previous shift carry_forward_float_cents', () => {
    const morning = closeSessionCreateOrLoad({ date_key: '2026-05-10', shift_key: 'morning' }, db);
    closeStoreCarryForward({ id: morning.id, carry_forward_float_cents: 40000 }, db);
    const retrieved = closeGetPrecedingCarryForward('2026-05-10', 'morning', db);
    expect(retrieved).toBe(40000);
  });

  it('user override: closeStoreCarryForward stores any value you give it', () => {
    const session = closeSessionCreateOrLoad({ date_key: '2026-05-11', shift_key: 'afternoon' }, db);
    const updated = closeStoreCarryForward({ id: session.id, carry_forward_float_cents: 12345 }, db);
    expect(updated.carry_forward_float_cents).toBe(12345);
  });

  it('closeGetPrecedingCarryForward returns null when no preceding session exists', () => {
    expect(closeGetPrecedingCarryForward('2026-05-12', 'morning', db)).toBeNull();
  });

  it('closeGetPrecedingCarryForward returns null when preceding_shift_key is null', () => {
    expect(closeGetPrecedingCarryForward('2026-05-13', null, db)).toBeNull();
  });

  it('is_final_shift flag stored and retrievable', () => {
    const session = closeSessionCreateOrLoad({ date_key: '2026-05-14', shift_key: 'final' }, db);
    const updated = closeStoreCarryForward({ id: session.id, carry_forward_float_cents: 0, is_final_shift: true }, db);
    expect(updated.is_final_shift).toBe(1);
  });
});

// ── SHIFT-002: final shift aggregation ───────────────────────────────────────

describe('SHIFT-002 final shift aggregation', () => {
  let db;
  beforeEach(() => { db = makeDb(); });
  afterEach(() => { db.close(); });

  it('closeDaySummary returns all sessions for the date', () => {
    closeSessionCreateOrLoad({ date_key: '2026-05-20', shift_key: 'morning' }, db);
    closeSessionCreateOrLoad({ date_key: '2026-05-20', shift_key: 'afternoon' }, db);
    closeSessionCreateOrLoad({ date_key: '2026-05-20', shift_key: 'final' }, db);
    const { sessions } = closeDaySummary('2026-05-20', db);
    expect(sessions).toHaveLength(3);
  });

  it('total day variance = sum of shift variances', () => {
    const morning   = closeSessionCreateOrLoad({ date_key: '2026-05-21', shift_key: 'morning' }, db);
    const afternoon = closeSessionCreateOrLoad({ date_key: '2026-05-21', shift_key: 'afternoon' }, db);
    insertRegisterClosure(db, morning.id, 500);    // +$5.00 surplus
    insertRegisterClosure(db, afternoon.id, -300); // -$3.00 shortage
    const { totalVarianceCents } = closeDaySummary('2026-05-21', db);
    expect(totalVarianceCents).toBe(200); // net +$2.00
  });

  it('closeDaySummary handles day with no register_closures (zero variance)', () => {
    closeSessionCreateOrLoad({ date_key: '2026-05-22', shift_key: 'morning' }, db);
    const { totalVarianceCents } = closeDaySummary('2026-05-22', db);
    expect(totalVarianceCents).toBe(0);
  });

  it('closeDaySummary returns empty sessions for a date with no activity', () => {
    const { sessions, totalVarianceCents } = closeDaySummary('2026-05-23', db);
    expect(sessions).toHaveLength(0);
    expect(totalVarianceCents).toBe(0);
  });

  it('closeSessionsByDate returns sessions ordered by created_at', () => {
    closeSessionCreateOrLoad({ date_key: '2026-05-24', shift_key: 'dawn' }, db);
    closeSessionCreateOrLoad({ date_key: '2026-05-24', shift_key: 'morning' }, db);
    const rows = closeSessionsByDate('2026-05-24', db);
    expect(rows).toHaveLength(2);
    expect(rows[0].shift_key).toBe('dawn');
    expect(rows[1].shift_key).toBe('morning');
  });

  it('multiple shifts with register_closures all contribute to total', () => {
    const s1 = closeSessionCreateOrLoad({ date_key: '2026-05-25', shift_key: 'morning' }, db);
    const s2 = closeSessionCreateOrLoad({ date_key: '2026-05-25', shift_key: 'afternoon' }, db);
    const s3 = closeSessionCreateOrLoad({ date_key: '2026-05-25', shift_key: 'evening' }, db);
    insertRegisterClosure(db, s1.id, 1000);
    insertRegisterClosure(db, s2.id, 1000);
    insertRegisterClosure(db, s3.id, 1000);
    const { totalVarianceCents } = closeDaySummary('2026-05-25', db);
    expect(totalVarianceCents).toBe(3000);
  });
});

// ── SHIFT-003: shift mode toggling ───────────────────────────────────────────

describe('SHIFT-003 shift mode toggling', () => {
  let db;
  beforeEach(() => { db = makeDb(); });
  afterEach(() => { db.close(); });

  it('shift_mode=false: createOrLoad with no shift_key creates single session', () => {
    const s1 = closeSessionCreateOrLoad({ date_key: '2026-05-30' }, db);
    const s2 = closeSessionCreateOrLoad({ date_key: '2026-05-30' }, db);
    expect(s1.id).toBe(s2.id);
    expect(s1.shift_key).toBeNull();
  });

  it('shift_mode=false: second call returns same draft session', () => {
    const s1 = closeSessionCreateOrLoad({ date_key: '2026-05-31' }, db);
    expect(s1.status).toBe('draft');
    const s2 = closeSessionCreateOrLoad({ date_key: '2026-05-31' }, db);
    expect(s2.id).toBe(s1.id);
  });

  it('shift_mode=true: different shift_keys create separate sessions for the same date', () => {
    const morning   = closeSessionCreateOrLoad({ date_key: '2026-06-01', shift_key: 'morning' }, db);
    const afternoon = closeSessionCreateOrLoad({ date_key: '2026-06-01', shift_key: 'afternoon' }, db);
    expect(morning.id).not.toBe(afternoon.id);
    expect(morning.shift_key).toBe('morning');
    expect(afternoon.shift_key).toBe('afternoon');
  });

  it('shift_mode=true: same shift_key returns the existing draft session', () => {
    const s1 = closeSessionCreateOrLoad({ date_key: '2026-06-02', shift_key: 'evening' }, db);
    const s2 = closeSessionCreateOrLoad({ date_key: '2026-06-02', shift_key: 'evening' }, db);
    expect(s1.id).toBe(s2.id);
  });

  it('shift_mode=true: all 6 shifts can coexist for the same date', () => {
    SHIFT_KEYS.forEach(k => closeSessionCreateOrLoad({ date_key: '2026-06-03', shift_key: k }, db));
    const rows = closeSessionsByDate('2026-06-03', db);
    expect(rows).toHaveLength(6);
    const keys = rows.map(r => r.shift_key);
    SHIFT_KEYS.forEach(k => expect(keys).toContain(k));
  });

  it('null and non-null shift_key do not collide for the same date', () => {
    const noShift = closeSessionCreateOrLoad({ date_key: '2026-06-04' }, db);
    const morning  = closeSessionCreateOrLoad({ date_key: '2026-06-04', shift_key: 'morning' }, db);
    expect(noShift.id).not.toBe(morning.id);
    expect(noShift.shift_key).toBeNull();
  });

  it('shift sessions are independent FSM instances', () => {
    const morning = closeSessionCreateOrLoad({ date_key: '2026-06-05', shift_key: 'morning' }, db);
    closeSessionTransition({ id: morning.id, to: 'submitted', actor_name: 'Alice' }, db);
    const afternoon = closeSessionCreateOrLoad({ date_key: '2026-06-05', shift_key: 'afternoon' }, db);
    expect(afternoon.status).toBe('draft');
    const morningRow = db.prepare('SELECT * FROM close_sessions WHERE id=?').get(morning.id);
    expect(morningRow.status).toBe('submitted');
  });
});
