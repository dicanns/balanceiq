/**
 * BalanceIQ — Accounting Test Schema Builder
 *
 * Creates in-memory SQLite databases mirroring the production accounting schema
 * (migrations v8-v11: COA, GL, Bank, Tax). No Electron dependency.
 *
 * Usage:
 *   import { buildAccountingDb, buildPreLedgerDb, gl, assertBalanced } from './testSchema.js';
 */
import Database from 'better-sqlite3';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { MIGRATIONS, runMigrations } = require('../../../db/migrations.js');

// Creates the base tables that getDb() creates unconditionally (before migrations run).
function _applyBaseTables(db) {
  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS kv_store (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      device_id TEXT NOT NULL DEFAULT 'test-device',
      user_name TEXT DEFAULT 'local',
      module TEXT NOT NULL,
      action TEXT NOT NULL,
      record_type TEXT NOT NULL,
      record_id TEXT NOT NULL,
      field_name TEXT,
      old_value TEXT,
      new_value TEXT,
      reason TEXT,
      metadata TEXT
    );

    CREATE TABLE IF NOT EXISTS daily_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      snapshot_timestamp TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      data TEXT NOT NULL,
      device_id TEXT NOT NULL DEFAULT 'test-device'
    );

    CREATE TABLE IF NOT EXISTS forecast_products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT DEFAULT '',
      base_quantity INTEGER DEFAULT 0,
      shelf_life_days INTEGER DEFAULT 1,
      weather_sensitivity INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1,
      notes TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS ingredients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name_fr TEXT NOT NULL,
      name_en TEXT DEFAULT '',
      category TEXT DEFAULT 'other',
      current_unit_price REAL,
      active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS checklist_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      template_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      completed INTEGER DEFAULT 0,
      UNIQUE(template_id, date)
    );
  `);
}

/**
 * Builds a full accounting DB (all tables through v11) on an in-memory SQLite.
 * Suitable for GL, Bank, and Tax unit tests.
 */
export function buildAccountingDb() {
  const db = new Database(':memory:');
  _applyBaseTables(db);
  // Set user_version to 7 so runMigrations applies only v8-v11
  db.pragma('user_version = 7');
  runMigrations(db);
  return db;
}

/**
 * Builds a pre-ledger DB (user_version=7) with optional legacy data.
 * Simulates a real user's database before the accounting suite was installed.
 */
export function buildPreLedgerDb({ withLegacyData = false } = {}) {
  const db = new Database(':memory:');
  _applyBaseTables(db);
  // Apply v1-v7 migration effects (tables they create that aren't in base)
  db.exec(`
    CREATE TABLE IF NOT EXISTS upgrade_prompt_dismissals (
      prompt_key TEXT NOT NULL PRIMARY KEY,
      dismissed_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );
    CREATE TABLE IF NOT EXISTS onboarding_progress (
      item_key TEXT PRIMARY KEY,
      completed INTEGER DEFAULT 0,
      completed_at TEXT
    );
    CREATE TABLE IF NOT EXISTS pl_invoice_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      supplier_key TEXT NOT NULL,
      supplier_name TEXT NOT NULL,
      amount REAL NOT NULL,
      bill_date TEXT DEFAULT '',
      note TEXT DEFAULT '',
      month_key TEXT NOT NULL,
      bill_id TEXT NOT NULL UNIQUE,
      recorded_at TEXT DEFAULT (datetime('now','localtime'))
    );
    CREATE TABLE IF NOT EXISTS search_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      query TEXT NOT NULL,
      searched_at TEXT DEFAULT (datetime('now','localtime'))
    );
  `);
  db.pragma('user_version = 7');

  if (withLegacyData) {
    // Seed representative legacy data (invoices + P&L in kv_store, audit entries)
    const legacyInvoices = JSON.stringify([
      { id: 'FAC-001', client: 'Acme Corp', total: 226.00, tps: 10.00, tvq: 9.975, status: 'paid' },
      { id: 'FAC-002', client: 'Boulangerie Nord', total: 113.00, tps: 5.00, tvq: 4.9875, status: 'sent' },
    ]);
    db.prepare(`INSERT INTO kv_store (key, value) VALUES (?, ?)`).run('dicann-fac-factures', legacyInvoices);

    const legacyPl = JSON.stringify({
      _revenueOverride: 45000,
      loyer_bills: [
        { id: 'bill-1', supplier: 'Proprio Inc', amount: 3500, note: 'Loyer avril' },
      ],
    });
    db.prepare(`INSERT INTO kv_store (key, value) VALUES (?, ?)`).run('dicann-pl-2026-03', legacyPl);

    db.prepare(`INSERT INTO audit_log (device_id, module, action, record_type, record_id) VALUES (?,?,?,?,?)`)
      .run('test-device', 'daily', 'create', 'caisse', 'legacy-record-1');
  }

  return db;
}

// ── GL helpers (mirror production logic without Electron) ─────────────────────

let _entrySeq = 1;

function _nextEntryNumber(db, year) {
  const row = db.prepare(
    `SELECT entry_number FROM journal_entries WHERE entry_number LIKE ? ORDER BY entry_number DESC LIMIT 1`
  ).get(`JE-${year}-%`);
  if (!row) return `JE-${year}-000001`;
  const seq = parseInt(row.entry_number.split('-')[2], 10) + 1;
  return `JE-${year}-${String(seq).padStart(6, '0')}`;
}

function _ensurePeriod(db, entryDate, locationId = null) {
  const d = new Date(entryDate);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const start = `${year}-${month}-01`;
  const lastDay = new Date(year, d.getUTCMonth() + 1, 0).getDate();
  const end = `${year}-${month}-${String(lastDay).padStart(2, '0')}`;
  let period = db.prepare(
    `SELECT * FROM accounting_periods WHERE period_type='month' AND start_date=? AND end_date=? AND (location_id IS ? OR location_id=?)`
  ).get(start, end, locationId, locationId);
  if (!period) {
    const info = db.prepare(
      `INSERT OR IGNORE INTO accounting_periods (period_type, fiscal_year, start_date, end_date, status, location_id)
       VALUES ('month', ?, ?, ?, 'open', ?)`
    ).run(year, start, end, locationId);
    period = db.prepare(`SELECT * FROM accounting_periods WHERE id=?`).get(info.lastInsertRowid) ||
             db.prepare(`SELECT * FROM accounting_periods WHERE period_type='month' AND start_date=? AND end_date=?`).get(start, end);
  }
  return period;
}

export const gl = {
  /**
   * Draft a journal entry. Returns { entryId, entryNumber }.
   * lines: [{ account_id, debit_cents, credit_cents, memo? }]
   */
  draft(db, { entry_date, description, source_type = 'manual', source_id = null, lines = [], location_id = null }) {
    const year = new Date(entry_date).getUTCFullYear();
    const period = _ensurePeriod(db, entry_date, location_id);
    const entryNumber = _nextEntryNumber(db, year);

    return db.transaction(() => {
      const { lastInsertRowid: entryId } = db.prepare(
        `INSERT INTO journal_entries (entry_number, entry_date, period_id, description, source_type, source_id, status, device_uuid, location_id)
         VALUES (?, ?, ?, ?, ?, ?, 'draft', 'test-device', ?)`
      ).run(entryNumber, entry_date, period.id, description || null, source_type, source_id || null, location_id || null);

      for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        db.prepare(
          `INSERT INTO journal_lines (entry_id, line_number, account_id, debit_cents, credit_cents, memo)
           VALUES (?, ?, ?, ?, ?, ?)`
        ).run(entryId, i + 1, l.account_id, l.debit_cents || 0, l.credit_cents || 0, l.memo || null);
      }
      return { entryId, entryNumber };
    })();
  },

  /**
   * Post a draft entry (validates balance, flips status).
   */
  post(db, entryId) {
    const entry = db.prepare(`SELECT * FROM journal_entries WHERE id=?`).get(entryId);
    if (!entry) throw new Error('Entry not found');
    if (entry.status === 'posted') throw new Error('Already posted');
    if (entry.status === 'reversed') throw new Error('Cannot post a reversed entry');

    const period = db.prepare(`SELECT * FROM accounting_periods WHERE id=?`).get(entry.period_id);
    if (period && period.status === 'closed') throw new Error('Period is closed');

    // Opening balance must be unique per location
    if (entry.source_type === 'opening_balance') {
      const existing = db.prepare(
        `SELECT id FROM journal_entries
         WHERE source_type='opening_balance' AND status='posted'
           AND (location_id IS ? OR location_id=?) AND id != ?`
      ).get(entry.location_id, entry.location_id, entryId);
      if (existing) throw new Error('Opening balance already posted for this location');
    }

    const lines = db.prepare(`SELECT * FROM journal_lines WHERE entry_id=?`).all(entryId);
    if (!lines.length) throw new Error('No lines on entry');

    const totalDebits = lines.reduce((s, l) => s + l.debit_cents, 0);
    const totalCredits = lines.reduce((s, l) => s + l.credit_cents, 0);
    if (totalDebits !== totalCredits) {
      throw new Error(`Imbalanced: debit ${totalDebits} != credit ${totalCredits}`);
    }

    const now = new Date().toISOString();
    db.prepare(
      `UPDATE journal_entries SET status='posted', posted_at=?, posted_by_device_uuid='test-device', posting_date=? WHERE id=?`
    ).run(now, now.slice(0, 10), entryId);

    return { posted: true, entryNumber: entry.entry_number };
  },

  /**
   * Post a balanced set of lines in one shot. Returns { entryId, entryNumber }.
   */
  draftAndPost(db, opts) {
    const { entryId, entryNumber } = gl.draft(db, opts);
    gl.post(db, entryId);
    return { entryId, entryNumber };
  },

  /**
   * Trial balance as of a date: [{ account_id, total_debit_cents, total_credit_cents, balance_cents }]
   */
  trialBalance(db, asOfDate) {
    return db.prepare(
      `SELECT coa.id AS account_id, coa.account_number,
              SUM(jl.debit_cents) AS total_debit_cents, SUM(jl.credit_cents) AS total_credit_cents
       FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl.entry_id AND je.status='posted' AND je.entry_date <= ?
       JOIN chart_of_accounts coa ON coa.id = jl.account_id
       GROUP BY jl.account_id`
    ).all(asOfDate).map(r => ({
      ...r,
      balance_cents: r.total_debit_cents - r.total_credit_cents,
    }));
  },

  /** Look up a COA account_id by account_number. */
  coaId(db, accountNumber) {
    const row = db.prepare(`SELECT id FROM chart_of_accounts WHERE account_number=?`).get(accountNumber);
    if (!row) throw new Error(`Account ${accountNumber} not found in COA`);
    return row.id;
  },
};

/**
 * Assert that sum(debit_cents) == sum(credit_cents) for lines on an entry.
 * Throws if not balanced.
 */
export function assertBalanced(db, entryId) {
  const lines = db.prepare(`SELECT debit_cents, credit_cents FROM journal_lines WHERE entry_id=?`).all(entryId);
  const d = lines.reduce((s, l) => s + l.debit_cents, 0);
  const c = lines.reduce((s, l) => s + l.credit_cents, 0);
  if (d !== c) throw new Error(`Entry ${entryId} not balanced: debit=${d} credit=${c}`);
  return true;
}

// ── Tax helpers ───────────────────────────────────────────────────────────────

/**
 * Inline CTI computation from kv_store bill data (mirrors taxPeriodCompute).
 * Reads bills from kv_store, sums tps_paid and tvq_paid fields.
 * Bank transactions do NOT contribute to CTI (tax_claimable flag is for suspense tracking only).
 */
export function computeCtiFromDb(db, periodStart, periodEnd) {
  const months = [];
  const [sy, sm] = periodStart.split('-').map(Number);
  const [ey, em] = periodEnd.split('-').map(Number);
  let y = sy, m = sm;
  while (y < ey || (y === ey && m <= em)) {
    months.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }

  let tpsCti = 0, tvqRti = 0;
  const billIds = [];

  for (const month of months) {
    const row = db.prepare(`SELECT value FROM kv_store WHERE key=?`).get(`dicann-pl-${month}`);
    if (!row?.value) continue;
    let plData;
    try { plData = JSON.parse(row.value); } catch { continue; }

    for (const key of Object.keys(plData)) {
      if (!key.endsWith('_bills')) continue;
      const bills = plData[key];
      if (!Array.isArray(bills)) continue;
      for (const bill of bills) {
        const tps = parseFloat(bill.tps_paid) || 0;
        const tvq = parseFloat(bill.tvq_paid) || 0;
        const pct = (parseFloat(bill.business_use_pct) || 100) / 100;
        if (tps > 0 || tvq > 0) {
          tpsCti += tps * pct;
          tvqRti += tvq * pct;
          billIds.push(`${month}/${key}/${bill.id}`);
        }
      }
    }
  }

  return { tpsCti, tvqRti, billCount: billIds.length, billIds };
}
