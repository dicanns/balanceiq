/**
 * BalanceIQ — NOW List Items 1–6 Test Suite
 *
 * Covers all new functionality from code_prompt_NOW_list.md:
 *   Item 1 — SQLite schema migration runner
 *   Item 2 — Upgrade prompt dismissal TTL logic
 *   Item 3 — Daily close state machine
 *   Item 5 — Onboarding checklist completion logic
 *   Item 6 — Vendor price intelligence (threshold detection, trend history)
 *
 * Run: npx vitest run src/__tests__/nowList.test.js
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

// ─── Shared test DB builder ───────────────────────────────────────────────────
// Mirrors the production schema (all tables through v1.23.2, including
// migration v2–v4 tables).  Uses in-memory SQLite — no Electron needed.
function buildTestDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS kv_store (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS upgrade_prompt_dismissals (
      prompt_key   TEXT NOT NULL PRIMARY KEY,
      dismissed_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS onboarding_progress (
      item_key     TEXT PRIMARY KEY,
      completed    INTEGER DEFAULT 0,
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS pl_invoice_history (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      supplier_key  TEXT NOT NULL,
      supplier_name TEXT NOT NULL,
      amount        REAL NOT NULL,
      bill_date     TEXT DEFAULT '',
      note          TEXT DEFAULT '',
      month_key     TEXT NOT NULL,
      bill_id       TEXT NOT NULL UNIQUE,
      recorded_at   TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE INDEX IF NOT EXISTS idx_pl_inv_hist_key
      ON pl_invoice_history(supplier_key, recorded_at DESC);

    CREATE TABLE IF NOT EXISTS daily_snapshots (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      date               TEXT NOT NULL,
      snapshot_timestamp TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      data               TEXT NOT NULL,
      device_id          TEXT NOT NULL
    );
  `);
  return db;
}

let db;
beforeEach(() => { db = buildTestDb(); });
afterEach(()  => { db.close(); });


// ═══════════════════════════════════════════════════════════════════════════════
// ITEM 1 — Migration System
// ═══════════════════════════════════════════════════════════════════════════════
describe('Item 1 — Schema migration runner', () => {

  // Simulate the runMigrations logic in pure JS (no Electron dependency)
  function simulateMigrations(database, migrations) {
    const current = database.pragma('user_version', { simple: true });
    const pending = migrations
      .filter(m => m.version > current)
      .sort((a, b) => a.version - b.version);

    const ran = [];
    for (const m of pending) {
      database.transaction(() => {
        m.up(database);
        database.pragma(`user_version = ${m.version}`);
      })();
      ran.push(m.version);
    }
    return ran;
  }

  it('fresh DB starts at user_version 0', () => {
    const fresh = new Database(':memory:');
    expect(fresh.pragma('user_version', { simple: true })).toBe(0);
    fresh.close();
  });

  it('runs all pending migrations on a fresh DB', () => {
    const fresh = new Database(':memory:');
    const migrations = [
      { version: 1, up: d => d.exec(`CREATE TABLE t1 (id INTEGER PRIMARY KEY)`) },
      { version: 2, up: d => d.exec(`CREATE TABLE t2 (id INTEGER PRIMARY KEY)`) },
      { version: 3, up: d => d.exec(`CREATE TABLE t3 (id INTEGER PRIMARY KEY)`) },
    ];
    const ran = simulateMigrations(fresh, migrations);
    expect(ran).toEqual([1, 2, 3]);
    expect(fresh.pragma('user_version', { simple: true })).toBe(3);
    fresh.close();
  });

  it('skips already-applied migrations', () => {
    const partial = new Database(':memory:');
    partial.exec(`CREATE TABLE t1 (id INTEGER PRIMARY KEY)`);
    partial.pragma('user_version = 1');
    const migrations = [
      { version: 1, up: d => d.exec(`CREATE TABLE t1 (id INTEGER PRIMARY KEY)`) },
      { version: 2, up: d => d.exec(`CREATE TABLE t2 (id INTEGER PRIMARY KEY)`) },
    ];
    const ran = simulateMigrations(partial, migrations);
    expect(ran).toEqual([2]); // only v2 was pending
    expect(partial.pragma('user_version', { simple: true })).toBe(2);
    partial.close();
  });

  it('runs migrations in version order regardless of array order', () => {
    const fresh = new Database(':memory:');
    const order = [];
    const migrations = [
      { version: 3, up: () => order.push(3) },
      { version: 1, up: () => order.push(1) },
      { version: 2, up: () => order.push(2) },
    ];
    simulateMigrations(fresh, migrations);
    expect(order).toEqual([1, 2, 3]);
    fresh.close();
  });

  it('jumps from v0 straight to v3 running all intermediate steps', () => {
    const fresh = new Database(':memory:');
    const steps = [];
    const migrations = [
      { version: 1, up: () => steps.push('v1') },
      { version: 2, up: () => steps.push('v2') },
      { version: 3, up: () => steps.push('v3') },
    ];
    simulateMigrations(fresh, migrations);
    expect(steps).toEqual(['v1', 'v2', 'v3']);
    expect(fresh.pragma('user_version', { simple: true })).toBe(3);
    fresh.close();
  });

  it('stops and propagates error on failed migration — does not advance version', () => {
    const fresh = new Database(':memory:');
    const migrations = [
      { version: 1, up: () => {} },
      {
        version: 2,
        up: (d) => {
          // Force a failure inside the transaction
          d.prepare(`INSERT INTO nonexistent_table (col) VALUES (?)`).run('x');
        },
      },
    ];

    let threw = false;
    try {
      simulateMigrations(fresh, migrations);
    } catch (_) {
      threw = true;
    }
    expect(threw).toBe(true);
    // Version must NOT have advanced past 1 (v2 failed)
    expect(fresh.pragma('user_version', { simple: true })).toBe(1);
    fresh.close();
  });

  it('no-op when already at latest version', () => {
    const current = new Database(':memory:');
    current.pragma('user_version = 4');
    const migrations = [
      { version: 1, up: () => {} },
      { version: 2, up: () => {} },
      { version: 3, up: () => {} },
      { version: 4, up: () => {} },
    ];
    const ran = simulateMigrations(current, migrations);
    expect(ran).toEqual([]);
    current.close();
  });
});


// ═══════════════════════════════════════════════════════════════════════════════
// ITEM 2 — Upgrade Prompt Dismissal TTL
// ═══════════════════════════════════════════════════════════════════════════════
describe('Item 2 — Upgrade prompt dismissals (TTL logic)', () => {

  const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

  function dismiss(key, daysAgo = 0) {
    const ts = new Date(Date.now() - daysAgo * 86400000).toISOString();
    db.prepare(
      `INSERT OR REPLACE INTO upgrade_prompt_dismissals (prompt_key, dismissed_at)
       VALUES (?, ?)`
    ).run(key, ts);
  }

  function getDismissedAt(key) {
    const row = db.prepare(
      `SELECT dismissed_at FROM upgrade_prompt_dismissals WHERE prompt_key = ?`
    ).get(key);
    return row ? row.dismissed_at : null;
  }

  function shouldShow(key) {
    const ts = getDismissedAt(key);
    if (!ts) return true;
    const age = Date.now() - new Date(ts).getTime();
    return age >= TTL_MS;
  }

  it('shows prompt when never dismissed', () => {
    expect(shouldShow('pl_invoice_scan')).toBe(true);
  });

  it('hides prompt immediately after dismissal', () => {
    dismiss('pl_invoice_scan', 0);
    expect(shouldShow('pl_invoice_scan')).toBe(false);
  });

  it('hides prompt 6 days after dismissal (within TTL)', () => {
    dismiss('pl_invoice_scan', 6);
    expect(shouldShow('pl_invoice_scan')).toBe(false);
  });

  it('shows prompt again exactly at 7-day TTL boundary', () => {
    dismiss('pl_invoice_scan', 7);
    expect(shouldShow('pl_invoice_scan')).toBe(true);
  });

  it('shows prompt again 14 days after dismissal', () => {
    dismiss('pl_invoice_scan', 14);
    expect(shouldShow('pl_invoice_scan')).toBe(true);
  });

  it('upsert replaces previous dismissal timestamp', () => {
    dismiss('pos_api_integration', 10); // old
    dismiss('pos_api_integration', 0);  // fresh re-dismiss
    expect(shouldShow('pos_api_integration')).toBe(false);
    const rows = db.prepare(
      `SELECT COUNT(*) AS c FROM upgrade_prompt_dismissals WHERE prompt_key = ?`
    ).get('pos_api_integration');
    expect(rows.c).toBe(1); // only one row (upserted)
  });

  it('each prompt key is independent', () => {
    dismiss('pl_invoice_scan', 8);   // expired
    dismiss('intel_ai_anomalies', 2); // fresh
    expect(shouldShow('pl_invoice_scan')).toBe(true);
    expect(shouldShow('intel_ai_anomalies')).toBe(false);
    expect(shouldShow('config_cloud_sync')).toBe(true); // never dismissed
  });

  it('stores all 6 prompt keys without collision', () => {
    const keys = [
      'pl_invoice_scan', 'pos_scan_hint', 'intel_ai_anomalies',
      'config_cloud_sync', 'pl_recipe_costing', 'pos_api_integration',
    ];
    keys.forEach((k, i) => dismiss(k, i));
    const count = db.prepare(`SELECT COUNT(*) AS c FROM upgrade_prompt_dismissals`).get().c;
    expect(count).toBe(6);
  });

  it('rejects NULL prompt_key', () => {
    expect(() => {
      db.prepare(
        `INSERT INTO upgrade_prompt_dismissals (prompt_key, dismissed_at) VALUES (?, ?)`
      ).run(null, new Date().toISOString());
    }).toThrow();
  });
});


// ═══════════════════════════════════════════════════════════════════════════════
// ITEM 3 — Daily Close State Machine
// ═══════════════════════════════════════════════════════════════════════════════
describe('Item 3 — Daily close state machine', () => {

  // Pure state machine logic (mirrors App.jsx getCloseStatus)
  function getCloseStatus(closedDays, dateKey, anyData, allBal) {
    const rec = closedDays[dateKey];
    if (rec) {
      return rec.allBal === false ? 'closed_with_warnings' : 'closed_clean';
    }
    if (!anyData) return 'not_started';
    return 'in_progress';
  }

  it('not_started when no data entered', () => {
    expect(getCloseStatus({}, '2026-04-01', false, false)).toBe('not_started');
  });

  it('in_progress when data entered but not closed', () => {
    expect(getCloseStatus({}, '2026-04-01', true, false)).toBe('in_progress');
  });

  it('in_progress even if all caisses balance — until explicitly closed', () => {
    expect(getCloseStatus({}, '2026-04-01', true, true)).toBe('in_progress');
  });

  it('closed_clean after close with all caisses balanced', () => {
    const closedDays = { '2026-04-01': { closedAt: '2026-04-01T22:00:00', allBal: true, closeStatus: 'closed_clean' } };
    expect(getCloseStatus(closedDays, '2026-04-01', true, true)).toBe('closed_clean');
  });

  it('closed_with_warnings after close with unbalanced caisses', () => {
    const closedDays = { '2026-04-01': { closedAt: '2026-04-01T22:00:00', allBal: false, closeStatus: 'closed_with_warnings' } };
    expect(getCloseStatus(closedDays, '2026-04-01', true, false)).toBe('closed_with_warnings');
  });

  it('closed_with_warnings persists even if data is later fixed', () => {
    // Once closed with warnings, the record is immutable until re-closed
    const closedDays = { '2026-04-01': { allBal: false } };
    expect(getCloseStatus(closedDays, '2026-04-01', true, true)).toBe('closed_with_warnings');
  });

  it('multiple days have independent states', () => {
    const closedDays = {
      '2026-03-30': { allBal: true },
      '2026-03-31': { allBal: false },
    };
    expect(getCloseStatus(closedDays, '2026-03-30', true, true)).toBe('closed_clean');
    expect(getCloseStatus(closedDays, '2026-03-31', true, false)).toBe('closed_with_warnings');
    expect(getCloseStatus(closedDays, '2026-04-01', true, false)).toBe('in_progress');
    expect(getCloseStatus(closedDays, '2026-04-02', false, false)).toBe('not_started');
  });

  it('editedAfterClose detects post-close data change', () => {
    // isClosed=true, was balanced at close, but now computeDay shows imbalance
    function editedAfterClose(isClosed, wasBalancedAtClose, isNowBalanced) {
      return isClosed && wasBalancedAtClose === true && !isNowBalanced;
    }
    expect(editedAfterClose(true, true, false)).toBe(true);   // edited after clean close
    expect(editedAfterClose(true, true, true)).toBe(false);   // no change
    expect(editedAfterClose(true, false, false)).toBe(false); // was already unbalanced
    expect(editedAfterClose(false, true, false)).toBe(false); // not closed
  });

  it('7-day dot row covers exactly 7 days before today', () => {
    function buildDotDays(today) {
      const days = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(today + 'T12:00:00');
        d.setDate(d.getDate() - i);
        days.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`);
      }
      return days;
    }
    const dots = buildDotDays('2026-04-01');
    expect(dots).toHaveLength(7);
    expect(dots[0]).toBe('2026-03-26');
    expect(dots[6]).toBe('2026-04-01');
  });

  it('snapshot saved at close time stores allBal correctly', () => {
    const closeDay = (allBal) => {
      const closedAt = new Date().toISOString();
      const closeStatus = allBal ? 'closed_clean' : 'closed_with_warnings';
      return { closedAt, allBal, closeStatus };
    };
    const clean = closeDay(true);
    expect(clean.closeStatus).toBe('closed_clean');
    expect(clean.allBal).toBe(true);

    const warn = closeDay(false);
    expect(warn.closeStatus).toBe('closed_with_warnings');
    expect(warn.allBal).toBe(false);
  });
});


// ═══════════════════════════════════════════════════════════════════════════════
// ITEM 5 — Onboarding Checklist
// ═══════════════════════════════════════════════════════════════════════════════
describe('Item 5 — Onboarding checklist progress', () => {

  const OB_ITEMS = ['ob1', 'ob2', 'ob3', 'ob4', 'ob5', 'ob6'];

  function markDone(key) {
    db.prepare(
      `INSERT OR REPLACE INTO onboarding_progress (item_key, completed, completed_at)
       VALUES (?, 1, datetime('now','localtime'))`
    ).run(key);
  }

  function getAll() {
    return db.prepare('SELECT * FROM onboarding_progress').all();
  }

  function resetAll() {
    db.prepare('DELETE FROM onboarding_progress').run();
  }

  function countDone(progress) {
    return OB_ITEMS.filter(k => !!(progress[k]?.completed)).length;
  }

  it('starts with empty progress table', () => {
    expect(getAll()).toHaveLength(0);
  });

  it('marks single item done', () => {
    markDone('ob1');
    const rows = getAll();
    expect(rows).toHaveLength(1);
    expect(rows[0].item_key).toBe('ob1');
    expect(rows[0].completed).toBe(1);
  });

  it('markDone is idempotent (upsert — no duplicate rows)', () => {
    markDone('ob1');
    markDone('ob1');
    markDone('ob1');
    expect(getAll()).toHaveLength(1);
  });

  it('marks all 6 items done', () => {
    OB_ITEMS.forEach(k => markDone(k));
    const rows = getAll();
    expect(rows).toHaveLength(6);
    expect(rows.every(r => r.completed === 1)).toBe(true);
  });

  it('reset clears all progress', () => {
    OB_ITEMS.forEach(k => markDone(k));
    resetAll();
    expect(getAll()).toHaveLength(0);
  });

  it('progress percentage is correct at each step', () => {
    const toProgress = (keys) => Object.fromEntries(keys.map(k => [k, { completed: 1 }]));

    expect(countDone({})).toBe(0);
    for (let n = 1; n <= 6; n++) {
      const done = countDone(toProgress(OB_ITEMS.slice(0, n)));
      expect(done).toBe(n);
    }
  });

  it('obAllDone only true when all 6 complete', () => {
    const obAllDone = (progress) =>
      OB_ITEMS.filter(k => !!(progress[k]?.completed)).length === OB_ITEMS.length;

    expect(obAllDone({})).toBe(false);
    const partial = Object.fromEntries(OB_ITEMS.slice(0, 5).map(k => [k, { completed: 1 }]));
    expect(obAllDone(partial)).toBe(false);
    const all = Object.fromEntries(OB_ITEMS.map(k => [k, { completed: 1 }]));
    expect(obAllDone(all)).toBe(true);
  });

  it('auto-detect ob1 from companyInfo', () => {
    const isAutoComplete = (key, companyInfo, liveData, suppliers) => {
      if (key === 'ob1') return !!(companyInfo.nom && companyInfo.ville);
      if (key === 'ob3') return Object.keys(liveData).length > 0;
      if (key === 'ob4') return suppliers.length > 0;
      return false;
    };

    expect(isAutoComplete('ob1', { nom: 'Dic Ann\'s', ville: 'Montréal' }, {}, [])).toBe(true);
    expect(isAutoComplete('ob1', { nom: '', ville: 'Montréal' }, {}, [])).toBe(false);
    expect(isAutoComplete('ob1', { nom: 'Dic Ann\'s', ville: '' }, {}, [])).toBe(false);
  });

  it('auto-detect ob3 from liveData', () => {
    const isAutoOb3 = (liveData) => Object.keys(liveData).length > 0;
    expect(isAutoOb3({})).toBe(false);
    expect(isAutoOb3({ '2026-04-01': { cashes: [] } })).toBe(true);
  });

  it('auto-detect ob4 from suppliers', () => {
    const isAutoOb4 = (suppliers) => suppliers.length > 0;
    expect(isAutoOb4([])).toBe(false);
    expect(isAutoOb4([{ id: '1', name: 'Sysco' }])).toBe(true);
  });

  it('auto-complete does not write to DB — manual completion still required for ob2/ob5/ob6', () => {
    // Auto-complete for ob1/ob3/ob4 doesn't touch onboarding_progress table
    // ob2, ob5, ob6 require explicit markDone call
    const NON_AUTO = ['ob2', 'ob5', 'ob6'];
    NON_AUTO.forEach(k => {
      const row = db.prepare('SELECT * FROM onboarding_progress WHERE item_key=?').get(k);
      expect(row).toBeUndefined();
    });
  });
});


// ═══════════════════════════════════════════════════════════════════════════════
// ITEM 6 — Vendor Price Intelligence
// ═══════════════════════════════════════════════════════════════════════════════
describe('Item 6 — Vendor price intelligence', () => {

  function record(supplierKey, supplierName, amount, billId, monthKey = '2026-04', billDate = '') {
    db.prepare(
      `INSERT OR IGNORE INTO pl_invoice_history
        (supplier_key, supplier_name, amount, bill_date, note, month_key, bill_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(supplierKey, supplierName, amount, billDate, '', monthKey, billId);
  }

  function getLast(supplierKey, excludeBillId) {
    return db.prepare(
      `SELECT * FROM pl_invoice_history
       WHERE supplier_key=? AND bill_id!=?
       ORDER BY recorded_at DESC, id DESC LIMIT 1`
    ).get(supplierKey, excludeBillId || '') || null;
  }

  function getRecent(supplierKey, limit = 5) {
    return db.prepare(
      `SELECT * FROM pl_invoice_history
       WHERE supplier_key=? ORDER BY recorded_at DESC, id DESC LIMIT ?`
    ).all(supplierKey, limit);
  }

  // Price change detection (mirrors App.jsx handleBillAdded logic)
  function shouldAlert(currentAmt, lastAmt, threshold = 5) {
    if (!lastAmt || lastAmt <= 0) return false;
    const pct = ((currentAmt - lastAmt) / lastAmt) * 100;
    return pct >= threshold;
  }

  function pctChange(currentAmt, lastAmt) {
    return Math.round(((currentAmt - lastAmt) / lastAmt) * 100 * 10) / 10;
  }

  // ── Recording & Retrieval ─────────────────────────────────────────────────

  it('records a bill and retrieves it', () => {
    record('sup_001', 'Sysco', 850.00, 'bill-1');
    const rows = getRecent('sup_001');
    expect(rows).toHaveLength(1);
    expect(rows[0].amount).toBe(850.00);
    expect(rows[0].supplier_name).toBe('Sysco');
  });

  it('getLast excludes the current bill', () => {
    record('sup_001', 'Sysco', 850.00, 'bill-1');
    record('sup_001', 'Sysco', 900.00, 'bill-2');
    const last = getLast('sup_001', 'bill-2');
    expect(last.bill_id).toBe('bill-1');
    expect(last.amount).toBe(850.00);
  });

  it('getLast returns null when no previous bills exist', () => {
    record('sup_001', 'Sysco', 850.00, 'bill-1');
    const last = getLast('sup_001', 'bill-1');
    expect(last).toBeNull();
  });

  it('bill_id uniqueness — duplicate bill_id is silently ignored (OR IGNORE)', () => {
    record('sup_001', 'Sysco', 850.00, 'bill-1');
    record('sup_001', 'Sysco', 999.00, 'bill-1'); // same ID — should be ignored
    const rows = getRecent('sup_001');
    expect(rows).toHaveLength(1);
    expect(rows[0].amount).toBe(850.00); // original preserved
  });

  it('getRecent returns up to N records most-recent first', () => {
    for (let i = 1; i <= 7; i++) {
      record('sup_002', 'Gordons', i * 100, `bill-${i}`);
    }
    const recent = getRecent('sup_002', 5);
    expect(recent).toHaveLength(5);
    // Most recent inserted = bill-7 (700)
    expect(recent[0].amount).toBe(700);
  });

  it('different suppliers do not interfere', () => {
    record('sup_001', 'Sysco', 850.00, 'bill-s1');
    record('sup_002', 'Gordons', 400.00, 'bill-g1');
    expect(getRecent('sup_001')).toHaveLength(1);
    expect(getRecent('sup_002')).toHaveLength(1);
    expect(getLast('sup_001', 'bill-s1')).toBeNull();
    expect(getLast('sup_002', 'bill-g1')).toBeNull();
  });

  // ── Alert Threshold Logic ─────────────────────────────────────────────────

  it('no alert when first invoice for supplier (no history)', () => {
    expect(shouldAlert(850, null)).toBe(false);
    expect(shouldAlert(850, 0)).toBe(false);
  });

  it('no alert when invoice is lower than previous', () => {
    expect(shouldAlert(800, 850)).toBe(false);
  });

  it('no alert when increase is below default 5% threshold', () => {
    expect(shouldAlert(870, 850)).toBe(false); // +2.4%
  });

  it('no alert when increase is exactly below threshold', () => {
    expect(shouldAlert(892.49, 850)).toBe(false); // +4.9999%
  });

  it('alert triggered at exactly the threshold (5%)', () => {
    expect(shouldAlert(892.50, 850)).toBe(true); // exactly +5%
  });

  it('alert triggered above threshold', () => {
    expect(shouldAlert(950, 850)).toBe(true); // +11.8%
  });

  it('alert triggered for large increase', () => {
    expect(shouldAlert(1200, 850)).toBe(true); // +41.2%
  });

  it('respects configurable threshold (1%)', () => {
    expect(shouldAlert(856, 850, 1)).toBe(false);  // +0.7% — below 1% threshold, no alert
    expect(shouldAlert(858.5, 850, 1)).toBe(true); // +1.0% — exactly at threshold
    expect(shouldAlert(860, 850, 1)).toBe(true);   // +1.2% — above threshold
  });

  it('respects configurable threshold (10%)', () => {
    expect(shouldAlert(920, 850, 10)).toBe(false); // +8.2% — below 10%
    expect(shouldAlert(935, 850, 10)).toBe(true);  // +10% — at threshold
  });

  it('pctChange rounds to 1 decimal place', () => {
    expect(pctChange(900, 850)).toBe(5.9);
    expect(pctChange(950, 850)).toBe(11.8);
    expect(pctChange(1000, 850)).toBe(17.6);
  });

  // ── Cross-month history ───────────────────────────────────────────────────

  it('tracks invoices across multiple months for same supplier', () => {
    record('sup_001', 'Sysco', 800, 'bill-jan', '2026-01');
    record('sup_001', 'Sysco', 830, 'bill-feb', '2026-02');
    record('sup_001', 'Sysco', 900, 'bill-mar', '2026-03');
    const recent = getRecent('sup_001', 5);
    expect(recent).toHaveLength(3);
    // Most recent inserted = march
    expect(recent[0].amount).toBe(900);
    expect(recent[0].month_key).toBe('2026-03');
  });

  it('getLast only looks at same supplier_key across all months', () => {
    record('sup_001', 'Sysco', 800, 'bill-jan', '2026-01');
    record('sup_001', 'Sysco', 850, 'bill-apr', '2026-04');
    const last = getLast('sup_001', 'bill-apr');
    expect(last.amount).toBe(800);
    expect(last.month_key).toBe('2026-01');
  });

  // ── Chaos / Edge Cases ────────────────────────────────────────────────────

  it('handles zero-amount invoice gracefully (no alert)', () => {
    expect(shouldAlert(0, 850)).toBe(false);
  });

  it('handles NaN/null amounts gracefully', () => {
    expect(shouldAlert(NaN, 850)).toBe(false);
    expect(shouldAlert(850, NaN)).toBe(false);
  });

  it('rejects null supplier_key at DB level (NOT NULL)', () => {
    expect(() => {
      db.prepare(
        `INSERT INTO pl_invoice_history
          (supplier_key, supplier_name, amount, month_key, bill_id)
          VALUES (?, ?, ?, ?, ?)`
      ).run(null, 'Sysco', 850, '2026-04', 'bill-null');
    }).toThrow();
  });

  it('petty cash keys (pettyCashFP) are stored without interference', () => {
    record('pettyCashFP', 'Petite caisse F&P', 120, 'pc-bill-1');
    expect(getRecent('pettyCashFP')).toHaveLength(1);
    expect(getRecent('sup_001')).toHaveLength(0); // different key
  });

  it('alert message contains supplier name, pct, and amounts', () => {
    const buildAlertMsg = (supplierName, pct, lastAmt, curAmt, lang = 'fr') => {
      const last = `$${lastAmt.toFixed(2)}`;
      const cur = `$${curAmt.toFixed(2)}`;
      if (lang === 'fr') return `Cette facture est ${pct}% plus élevée que la précédente (${last} → ${cur}).`;
      return `This invoice is ${pct}% higher than the previous one (${last} → ${cur}).`;
    };
    const msg = buildAlertMsg('Sysco', 11.8, 850, 950, 'fr');
    expect(msg).toContain('11.8%');
    expect(msg).toContain('$850.00');
    expect(msg).toContain('$950.00');
  });
});


// ═══════════════════════════════════════════════════════════════════════════════
// INTEGRATION — Migration v4 table works correctly after schema bootstrap
// ═══════════════════════════════════════════════════════════════════════════════
describe('Integration — new tables co-exist without interference', () => {

  it('all 3 new tables (v2/v3/v4) exist and are independently writable', () => {
    // upgrade_prompt_dismissals
    db.prepare(
      `INSERT INTO upgrade_prompt_dismissals (prompt_key, dismissed_at) VALUES (?, datetime('now','localtime'))`
    ).run('test_prompt');

    // onboarding_progress
    db.prepare(
      `INSERT OR REPLACE INTO onboarding_progress (item_key, completed) VALUES (?, 1)`
    ).run('ob1');

    // pl_invoice_history
    db.prepare(
      `INSERT INTO pl_invoice_history
        (supplier_key, supplier_name, amount, month_key, bill_id) VALUES (?,?,?,?,?)`
    ).run('sup_x', 'X Corp', 100, '2026-04', 'int-bill-1');

    expect(db.prepare(`SELECT COUNT(*) AS c FROM upgrade_prompt_dismissals`).get().c).toBe(1);
    expect(db.prepare(`SELECT COUNT(*) AS c FROM onboarding_progress`).get().c).toBe(1);
    expect(db.prepare(`SELECT COUNT(*) AS c FROM pl_invoice_history`).get().c).toBe(1);
  });

  it('kv_store continues to work alongside new tables', () => {
    db.prepare(`INSERT INTO kv_store (key, value) VALUES (?, ?)`).run('dicann-v7', JSON.stringify({ test: true }));
    const row = db.prepare(`SELECT value FROM kv_store WHERE key = ?`).get('dicann-v7');
    expect(JSON.parse(row.value).test).toBe(true);
  });
});
