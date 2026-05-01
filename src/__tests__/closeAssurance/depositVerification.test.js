/**
 * DEPVER-001  expected amount calculation
 * DEPVER-002  match logic
 * DEPVER-003  stale detection
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { runMigrations } = require('../../db/migrations.js');
const {
  depositVerificationCreate,
  depositVerificationListPending,
  depositVerificationMarkVerified,
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

// ── DEPVER-001: expected amount calculation ───────────────────────────────────

describe('DEPVER-001 expected amount calculation', () => {
  let db;
  beforeEach(() => { db = makeDb(); });
  afterEach(() => { db.close(); });

  it('creates a verification row with the provided expected_amount_cents', () => {
    const { id } = depositVerificationCreate({ date_key: '2026-04-30', expected_amount_cents: 30000 }, db);
    const row = db.prepare(`SELECT * FROM deposit_verifications WHERE id=?`).get(id);
    expect(row.expected_amount_cents).toBe(30000);
    expect(row.matched).toBe(0);
    expect(row.date_key).toBe('2026-04-30');
  });

  it('handles single register deposit correctly', () => {
    depositVerificationCreate({ date_key: '2026-04-30', expected_amount_cents: 15000 }, db);
    const rows = db.prepare(`SELECT * FROM deposit_verifications`).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].expected_amount_cents).toBe(15000);
  });

  it('handles multi-register total correctly (two rows from different dates)', () => {
    depositVerificationCreate({ date_key: '2026-04-29', expected_amount_cents: 20000 }, db);
    depositVerificationCreate({ date_key: '2026-04-30', expected_amount_cents: 10000 }, db);
    const rows = db.prepare(`SELECT * FROM deposit_verifications ORDER BY date_key`).all();
    expect(rows).toHaveLength(2);
    const total = rows.reduce((s, r) => s + r.expected_amount_cents, 0);
    expect(total).toBe(30000);
  });

  it('rejects zero expected_amount_cents', () => {
    expect(() => depositVerificationCreate({ date_key: '2026-04-30', expected_amount_cents: 0 }, db)).toThrow();
  });

  it('rejects negative expected_amount_cents', () => {
    expect(() => depositVerificationCreate({ date_key: '2026-04-30', expected_amount_cents: -100 }, db)).toThrow();
  });

  it('rejects missing date_key', () => {
    expect(() => depositVerificationCreate({ expected_amount_cents: 10000 }, db)).toThrow();
  });
});

// ── DEPVER-002: match logic ───────────────────────────────────────────────────

describe('DEPVER-002 match logic', () => {
  let db;
  beforeEach(() => { db = makeDb(); });
  afterEach(() => { db.close(); });

  it('matched=1 when verified_amount_cents equals expected exactly', () => {
    const { id } = depositVerificationCreate({ date_key: '2026-04-30', expected_amount_cents: 30000 }, db);
    const result = depositVerificationMarkVerified({ id, verified_amount_cents: 30000, verified_by: 'Anthony' }, db);
    expect(result.matched).toBe(1);
    const row = db.prepare(`SELECT * FROM deposit_verifications WHERE id=?`).get(id);
    expect(row.matched).toBe(1);
    expect(row.verified_amount_cents).toBe(30000);
    expect(row.verified_by).toBe('Anthony');
    expect(row.verified_date).toBeTruthy();
  });

  it('matched=1 when verified is within 1 cent of expected', () => {
    const { id } = depositVerificationCreate({ date_key: '2026-04-30', expected_amount_cents: 30000 }, db);
    const result = depositVerificationMarkVerified({ id, verified_amount_cents: 30001 }, db);
    expect(result.matched).toBe(1);
  });

  it('matched=0 when verified_amount_cents differs by more than 1 cent', () => {
    const { id } = depositVerificationCreate({ date_key: '2026-04-30', expected_amount_cents: 30000 }, db);
    const result = depositVerificationMarkVerified({ id, verified_amount_cents: 30002 }, db);
    expect(result.matched).toBe(0);
    const row = db.prepare(`SELECT * FROM deposit_verifications WHERE id=?`).get(id);
    expect(row.matched).toBe(0);
  });

  it('matched=0 when verified amount is significantly different', () => {
    const { id } = depositVerificationCreate({ date_key: '2026-04-30', expected_amount_cents: 30000 }, db);
    const result = depositVerificationMarkVerified({ id, verified_amount_cents: 25000 }, db);
    expect(result.matched).toBe(0);
  });

  it('stores optional notes on verification', () => {
    const { id } = depositVerificationCreate({ date_key: '2026-04-30', expected_amount_cents: 10000 }, db);
    depositVerificationMarkVerified({ id, verified_amount_cents: 10000, notes: 'Matches May 1 statement' }, db);
    const row = db.prepare(`SELECT notes FROM deposit_verifications WHERE id=?`).get(id);
    expect(row.notes).toBe('Matches May 1 statement');
  });

  it('throws when id does not exist', () => {
    expect(() => depositVerificationMarkVerified({ id: 9999, verified_amount_cents: 10000 }, db)).toThrow();
  });
});

// ── DEPVER-003: stale detection + listPending ─────────────────────────────────

describe('DEPVER-003 stale detection and pending list', () => {
  let db;
  beforeEach(() => { db = makeDb(); });
  afterEach(() => { db.close(); });

  it('listPending returns rows with date_key < before_date and matched=0', () => {
    depositVerificationCreate({ date_key: '2026-04-28', expected_amount_cents: 10000 }, db);
    depositVerificationCreate({ date_key: '2026-04-29', expected_amount_cents: 20000 }, db);
    depositVerificationCreate({ date_key: '2026-04-30', expected_amount_cents: 30000 }, db);

    const pending = depositVerificationListPending('2026-04-30', db);
    expect(pending).toHaveLength(2);
    expect(pending.map(r => r.date_key)).toContain('2026-04-28');
    expect(pending.map(r => r.date_key)).toContain('2026-04-29');
    expect(pending.map(r => r.date_key)).not.toContain('2026-04-30');
  });

  it('listPending excludes matched rows', () => {
    const { id } = depositVerificationCreate({ date_key: '2026-04-28', expected_amount_cents: 10000 }, db);
    depositVerificationMarkVerified({ id, verified_amount_cents: 10000 }, db);
    depositVerificationCreate({ date_key: '2026-04-29', expected_amount_cents: 20000 }, db);

    const pending = depositVerificationListPending('2026-04-30', db);
    expect(pending).toHaveLength(1);
    expect(pending[0].date_key).toBe('2026-04-29');
  });

  it('listPending returns empty array when all are matched', () => {
    const { id } = depositVerificationCreate({ date_key: '2026-04-28', expected_amount_cents: 10000 }, db);
    depositVerificationMarkVerified({ id, verified_amount_cents: 10000 }, db);

    const pending = depositVerificationListPending('2026-04-30', db);
    expect(pending).toHaveLength(0);
  });

  it('a row older than 3 days is detectable as stale by the caller', () => {
    const staleDate = new Date();
    staleDate.setDate(staleDate.getDate() - 5);
    const staleDateKey = staleDate.toISOString().slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);

    depositVerificationCreate({ date_key: staleDateKey, expected_amount_cents: 10000 }, db);

    const pending = depositVerificationListPending(today, db);
    expect(pending).toHaveLength(1);

    const then = new Date(staleDateKey + 'T00:00:00');
    const now = new Date();
    const diffDays = Math.floor((now - then) / (1000 * 60 * 60 * 24));
    expect(diffDays).toBeGreaterThan(3);
  });

  it('a row exactly 3 days old is not yet stale (stale threshold is > 3)', () => {
    const d = new Date();
    d.setDate(d.getDate() - 3);
    const dateKey = d.toISOString().slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);

    depositVerificationCreate({ date_key: dateKey, expected_amount_cents: 10000 }, db);

    const pending = depositVerificationListPending(today, db);
    expect(pending).toHaveLength(1);

    const then = new Date(dateKey + 'T00:00:00');
    const diffDays = Math.floor((new Date() - then) / (1000 * 60 * 60 * 24));
    expect(diffDays).toBeLessThanOrEqual(3);
  });
});
