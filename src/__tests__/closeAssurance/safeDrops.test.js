/**
 * SAFEDROP-001  amount validation
 * SAFEDROP-002  chain integrity
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { runMigrations } = require('../../db/migrations.js');
const { safeDropSave, safeDropList } = require('../../db/database.js');

function makeDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS kv_store (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT NOT NULL DEFAULT 'test',
      module TEXT NOT NULL,
      action TEXT NOT NULL,
      record_type TEXT NOT NULL,
      record_id TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS forecast_products (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS ingredients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name_fr TEXT NOT NULL, name_en TEXT DEFAULT '', category TEXT DEFAULT 'other'
    );
  `);
  db.pragma('user_version = 7');
  runMigrations(db);
  return db;
}

function seedClosure(db) {
  const session = db.prepare(
    `INSERT INTO close_sessions (date_key, status) VALUES ('2026-04-30', 'draft')`
  ).run();
  const closure = db.prepare(
    `INSERT INTO register_closures (close_session_id, register_key, variance_cents) VALUES (?, 'register_0', 0)`
  ).run(session.lastInsertRowid);
  return Number(closure.lastInsertRowid);
}

const DATE = '2026-04-30';

// ── SAFEDROP-001: amount validation ──────────────────────────────────────────

describe('SAFEDROP-001 amount validation', () => {
  let db;
  beforeEach(() => { db = makeDb(); });
  afterEach(() => { db.close(); });

  it('rejects zero amount', () => {
    expect(() => safeDropSave({ date_key: DATE, amount_cents: 0, dropped_by: 'Anthony' }, db)).toThrow();
  });

  it('rejects negative amount', () => {
    expect(() => safeDropSave({ date_key: DATE, amount_cents: -500, dropped_by: 'Anthony' }, db)).toThrow();
  });

  it('rejects missing dropped_by', () => {
    expect(() => safeDropSave({ date_key: DATE, amount_cents: 20000, dropped_by: '' }, db)).toThrow();
  });

  it('rejects null dropped_by', () => {
    expect(() => safeDropSave({ date_key: DATE, amount_cents: 20000, dropped_by: null }, db)).toThrow();
  });

  it('stores amount as integer cents exactly', () => {
    const result = safeDropSave({ date_key: DATE, amount_cents: 20000, dropped_by: 'Anthony' }, db);
    expect(result.id).toBeGreaterThan(0);
    const row = db.prepare('SELECT amount_cents FROM safe_drop_events WHERE id=?').get(result.id);
    expect(row.amount_cents).toBe(20000);
  });

  it('accepts a valid drop and returns id + timestamp', () => {
    const result = safeDropSave({
      date_key: DATE, amount_cents: 15000,
      bag_reference: 'BAG-001', dropped_by: 'Anthony',
      witnessed_by: 'Marie', notes: 'afternoon',
    }, db);
    expect(result.id).toBeGreaterThan(0);
    expect(result.event_timestamp).toBeTruthy();
  });
});

// ── SAFEDROP-002: chain integrity ─────────────────────────────────────────────

describe('SAFEDROP-002 chain integrity', () => {
  let db;
  beforeEach(() => { db = makeDb(); });
  afterEach(() => { db.close(); });

  it('multiple safe drops sum correctly', () => {
    safeDropSave({ date_key: DATE, amount_cents: 20000, dropped_by: 'Anthony' }, db);
    safeDropSave({ date_key: DATE, amount_cents: 15000, dropped_by: 'Marie' }, db);

    const drops = safeDropList(DATE, db);
    const total = drops.reduce((s, d) => s + d.amount_cents, 0);
    expect(total).toBe(35000);
  });

  it('safeDropList returns rows in ascending timestamp order', () => {
    safeDropSave({ date_key: DATE, amount_cents: 20000, dropped_by: 'First' }, db);
    safeDropSave({ date_key: DATE, amount_cents: 15000, dropped_by: 'Second' }, db);

    const drops = safeDropList(DATE, db);
    expect(drops).toHaveLength(2);
    expect(drops[0].dropped_by).toBe('First');
    expect(drops[1].dropped_by).toBe('Second');
  });

  it('per-register safe drops linked to register_closure_id', () => {
    const closureId = seedClosure(db);
    safeDropSave({
      date_key: DATE, amount_cents: 20000, dropped_by: 'Anthony',
      register_closure_id: closureId,
    }, db);

    const row = db.prepare(
      'SELECT register_closure_id FROM safe_drop_events WHERE date_key=?'
    ).get(DATE);
    expect(row.register_closure_id).toBe(closureId);
  });

  it('safeDropList only returns drops for the given date', () => {
    safeDropSave({ date_key: DATE,         amount_cents: 20000, dropped_by: 'Today' }, db);
    safeDropSave({ date_key: '2026-04-29', amount_cents: 10000, dropped_by: 'Yesterday' }, db);

    const today = safeDropList(DATE, db);
    expect(today).toHaveLength(1);
    expect(today[0].dropped_by).toBe('Today');
  });

  it('optional fields are stored and retrieved correctly', () => {
    safeDropSave({
      date_key: DATE, amount_cents: 20000, dropped_by: 'Anthony',
      bag_reference: 'BAG-001', witnessed_by: 'Marie', notes: 'afternoon drop',
    }, db);

    const drop = safeDropList(DATE, db)[0];
    expect(drop.bag_reference).toBe('BAG-001');
    expect(drop.witnessed_by).toBe('Marie');
    expect(drop.notes).toBe('afternoon drop');
  });

  it('returns empty array when no drops for date', () => {
    const drops = safeDropList('2099-12-31', db);
    expect(drops).toEqual([]);
  });
});
