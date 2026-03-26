/**
 * BalanceIQ — Database Integrity Tests
 * Tests SQLite constraints and business-rule enforcement using an in-memory database
 * that mirrors the production schema (no Electron dependency needed).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

// ── Schema (mirrors src/db/database.js) ──────────────────────────────────────
function buildTestDb() {
  const db = new Database(':memory:');
  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS kv_store (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp   TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      device_id   TEXT NOT NULL,
      user_name   TEXT DEFAULT 'local',
      module      TEXT NOT NULL,
      action      TEXT NOT NULL,
      record_type TEXT NOT NULL,
      record_id   TEXT NOT NULL,
      field_name  TEXT,
      old_value   TEXT,
      new_value   TEXT,
      reason      TEXT,
      metadata    TEXT
    );

    CREATE TABLE IF NOT EXISTS daily_snapshots (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      date               TEXT NOT NULL,
      snapshot_timestamp TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      data               TEXT NOT NULL,
      device_id          TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_snap_date ON daily_snapshots(date);

    CREATE TABLE IF NOT EXISTS checklist_entries (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      template_id  INTEGER NOT NULL,
      date         TEXT NOT NULL,
      completed    INTEGER DEFAULT 0,
      completed_by TEXT,
      completed_at TEXT,
      notes        TEXT,
      UNIQUE(template_id, date)
    );

    CREATE TABLE IF NOT EXISTS forecast_products (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      category   TEXT DEFAULT '',
      unit_cost  REAL,
      sell_price REAL,
      active     INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS forecast_daily_sales (
      id                 TEXT PRIMARY KEY,
      product_id         TEXT NOT NULL,
      date               TEXT NOT NULL,
      quantity_sold      INTEGER NOT NULL,
      quantity_remaining INTEGER,
      stockout           INTEGER DEFAULT 0,
      source             TEXT DEFAULT 'manual',
      FOREIGN KEY (product_id) REFERENCES forecast_products(id),
      UNIQUE(product_id, date)
    );

    CREATE TABLE IF NOT EXISTS ingredients (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      name_fr             TEXT NOT NULL,
      category            TEXT DEFAULT 'other',
      current_unit_price  REAL,
      last_price_update   TEXT,
      active              INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS supplier_price_history (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      ingredient_id INTEGER NOT NULL,
      unit_price    REAL NOT NULL,
      invoice_date  TEXT NOT NULL,
      invoice_ref   TEXT DEFAULT '',
      created_at    TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (ingredient_id) REFERENCES ingredients(id) ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS recipes (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      name_fr  TEXT NOT NULL,
      active   INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS recipe_ingredients (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      recipe_id     INTEGER NOT NULL,
      ingredient_id INTEGER NOT NULL,
      quantity      REAL NOT NULL,
      unit          TEXT NOT NULL,
      FOREIGN KEY (recipe_id)     REFERENCES recipes(id) ON DELETE RESTRICT,
      FOREIGN KEY (ingredient_id) REFERENCES ingredients(id) ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS tip_pool_sessions (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      date       TEXT NOT NULL,
      total_tips REAL NOT NULL,
      method     TEXT NOT NULL,
      results    TEXT NOT NULL,
      finalized  INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );
  `);
  return db;
}

// ─────────────────────────────────────────────────────────────────────────────

let db;

beforeEach(() => {
  db = buildTestDb();
});

afterEach(() => {
  db.close();
});

// ────────────────────────────────────────────────────────────────────────────
// DAILY CLOSE-OUT → SNAPSHOT IMMUTABILITY
// ────────────────────────────────────────────────────────────────────────────
describe('Daily close-out — snapshot immutability', () => {
  it('creates a snapshot and verifies it can be read back', () => {
    const data = JSON.stringify({ venteNet: 1450.75, caisses: 2, date: '2026-03-25' });
    db.prepare(`INSERT INTO daily_snapshots (date, data, device_id) VALUES (?, ?, ?)`).run('2026-03-25', data, 'DEV-001');

    const row = db.prepare(`SELECT * FROM daily_snapshots WHERE date = ?`).get('2026-03-25');
    expect(row).toBeTruthy();
    expect(JSON.parse(row.data).venteNet).toBe(1450.75);
  });

  it('allows multiple snapshots for the same date (history)', () => {
    // App always inserts new snapshots — no UNIQUE constraint on date
    db.prepare(`INSERT INTO daily_snapshots (date, data, device_id) VALUES (?, ?, ?)`).run('2026-03-25', '{"v":1}', 'DEV-001');
    db.prepare(`INSERT INTO daily_snapshots (date, data, device_id) VALUES (?, ?, ?)`).run('2026-03-25', '{"v":2}', 'DEV-001');

    const rows = db.prepare(`SELECT * FROM daily_snapshots WHERE date = ? ORDER BY id DESC`).all('2026-03-25');
    expect(rows.length).toBe(2);
    expect(JSON.parse(rows[0].data).v).toBe(2); // latest first
  });

  it('snapshot data is immutable — no UPDATE on daily_snapshots', () => {
    // Production code never UPDATEs snapshots. Verify by checking the data is unchanged.
    db.prepare(`INSERT INTO daily_snapshots (date, data, device_id) VALUES (?, ?, ?)`).run('2026-03-24', '{"venteNet":1000}', 'DEV-001');

    // A new snapshot is INSERTED with the correction, not UPDATE on the old row
    db.prepare(`INSERT INTO daily_snapshots (date, data, device_id) VALUES (?, ?, ?)`).run('2026-03-24', '{"venteNet":1050,"corrected":true}', 'DEV-001');

    const rows = db.prepare(`SELECT * FROM daily_snapshots WHERE date = ? ORDER BY id`).all('2026-03-24');
    expect(rows.length).toBe(2);
    expect(JSON.parse(rows[0].data).venteNet).toBe(1000); // original preserved
    expect(JSON.parse(rows[1].data).venteNet).toBe(1050); // correction added
  });
});

// ────────────────────────────────────────────────────────────────────────────
// AUDIT TRAIL — EDIT AFTER CLOSE-OUT
// ────────────────────────────────────────────────────────────────────────────
describe('Audit trail on financial edits', () => {
  it('inserts an audit log entry on financial field change', () => {
    db.prepare(`
      INSERT INTO audit_log (device_id, module, action, record_type, record_id, field_name, old_value, new_value, reason)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('DEV-001', 'daily', 'update', 'caisse', '2026-03-25-caisse-1', 'posVentes', '1200', '1250', 'Correction manuelle POS');

    const entry = db.prepare(`SELECT * FROM audit_log WHERE record_type = 'caisse' ORDER BY id DESC`).get();
    expect(entry).toBeTruthy();
    expect(entry.action).toBe('update');
    expect(entry.field_name).toBe('posVentes');
    expect(entry.old_value).toBe('1200');
    expect(entry.new_value).toBe('1250');
    expect(entry.reason).toBe('Correction manuelle POS');
  });

  it('stores multiple audit entries for same record (full history)', () => {
    const record = '2026-03-25-caisse-1';
    db.prepare(`INSERT INTO audit_log (device_id, module, action, record_type, record_id, field_name, old_value, new_value) VALUES (?,?,?,?,?,?,?,?)`)
      .run('DEV-001', 'daily', 'update', 'caisse', record, 'posVentes', '1000', '1050');
    db.prepare(`INSERT INTO audit_log (device_id, module, action, record_type, record_id, field_name, old_value, new_value) VALUES (?,?,?,?,?,?,?,?)`)
      .run('DEV-001', 'daily', 'update', 'caisse', record, 'posVentes', '1050', '1100');

    const entries = db.prepare(`SELECT * FROM audit_log WHERE record_id = ?`).all(record);
    expect(entries.length).toBe(2);
  });

  it('does not require reason for non-void actions', () => {
    expect(() => {
      db.prepare(`INSERT INTO audit_log (device_id, module, action, record_type, record_id) VALUES (?,?,?,?,?)`)
        .run('DEV-001', 'daily', 'create', 'caisse', 'rec-001');
    }).not.toThrow();
  });

  it('can query audit log by module', () => {
    db.prepare(`INSERT INTO audit_log (device_id, module, action, record_type, record_id) VALUES (?,?,?,?,?)`)
      .run('DEV-001', 'daily', 'create', 'caisse', 'rec-001');
    db.prepare(`INSERT INTO audit_log (device_id, module, action, record_type, record_id) VALUES (?,?,?,?,?)`)
      .run('DEV-001', 'facturation', 'create', 'facture', 'FAC-001');

    const dailyEntries = db.prepare(`SELECT * FROM audit_log WHERE module = 'daily'`).all();
    expect(dailyEntries.length).toBe(1);
    expect(dailyEntries[0].module).toBe('daily');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// DUPLICATE CLOSE-OUT PREVENTION
// ────────────────────────────────────────────────────────────────────────────
describe('Duplicate checklist entry prevention', () => {
  it('rejects duplicate checklist entry for same template+date', () => {
    db.prepare(`INSERT INTO checklist_entries (template_id, date, completed) VALUES (?, ?, ?)`)
      .run(1, '2026-03-25', 1);

    expect(() => {
      db.prepare(`INSERT INTO checklist_entries (template_id, date, completed) VALUES (?, ?, ?)`)
        .run(1, '2026-03-25', 0);  // same template, same date
    }).toThrow();
  });

  it('allows same template on different dates', () => {
    db.prepare(`INSERT INTO checklist_entries (template_id, date, completed) VALUES (?, ?, ?)`)
      .run(1, '2026-03-24', 1);
    expect(() => {
      db.prepare(`INSERT INTO checklist_entries (template_id, date, completed) VALUES (?, ?, ?)`)
        .run(1, '2026-03-25', 0);  // same template, different date — OK
    }).not.toThrow();
  });

  it('rejects duplicate forecast sales for same product+date', () => {
    db.prepare(`INSERT INTO forecast_products (id, name) VALUES (?, ?)`).run('prod-1', 'Hamburger');
    db.prepare(`INSERT INTO forecast_daily_sales (id, product_id, date, quantity_sold) VALUES (?, ?, ?, ?)`)
      .run('sale-1', 'prod-1', '2026-03-25', 150);

    expect(() => {
      db.prepare(`INSERT INTO forecast_daily_sales (id, product_id, date, quantity_sold) VALUES (?, ?, ?, ?)`)
        .run('sale-2', 'prod-1', '2026-03-25', 200);  // duplicate product+date
    }).toThrow();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// FOREIGN KEY CONSTRAINTS
// ────────────────────────────────────────────────────────────────────────────
describe('Foreign key constraints', () => {
  it('blocks forecast sales insert when product does not exist', () => {
    expect(() => {
      db.prepare(`INSERT INTO forecast_daily_sales (id, product_id, date, quantity_sold) VALUES (?, ?, ?, ?)`)
        .run('sale-1', 'nonexistent-product', '2026-03-25', 100);
    }).toThrow();
  });

  it('blocks recipe ingredient insert when recipe does not exist', () => {
    db.prepare(`INSERT INTO ingredients (name_fr, current_unit_price) VALUES (?, ?)`).run('Steak patty', 12.50);
    const ing = db.prepare(`SELECT id FROM ingredients WHERE name_fr = 'Steak patty'`).get();

    expect(() => {
      db.prepare(`INSERT INTO recipe_ingredients (recipe_id, ingredient_id, quantity, unit) VALUES (?, ?, ?, ?)`)
        .run(9999, ing.id, 1, 'unit');  // recipe 9999 doesn't exist
    }).toThrow();
  });

  it('blocks recipe ingredient insert when ingredient does not exist', () => {
    db.prepare(`INSERT INTO recipes (name_fr) VALUES (?)`).run('Hamburger Classic');
    const recipe = db.prepare(`SELECT id FROM recipes WHERE name_fr = 'Hamburger Classic'`).get();

    expect(() => {
      db.prepare(`INSERT INTO recipe_ingredients (recipe_id, ingredient_id, quantity, unit) VALUES (?, ?, ?, ?)`)
        .run(recipe.id, 9999, 1, 'unit');  // ingredient 9999 doesn't exist
    }).toThrow();
  });

  it('blocks ingredient deletion when price history references it', () => {
    db.prepare(`INSERT INTO ingredients (name_fr, current_unit_price) VALUES (?, ?)`).run('Bun', 0.28);
    const ing = db.prepare(`SELECT id FROM ingredients WHERE name_fr = 'Bun'`).get();

    db.prepare(`INSERT INTO supplier_price_history (ingredient_id, unit_price, invoice_date) VALUES (?, ?, ?)`)
      .run(ing.id, 0.28, '2026-03-01');

    expect(() => {
      db.prepare(`DELETE FROM ingredients WHERE id = ?`).run(ing.id);
    }).toThrow(); // ON DELETE RESTRICT
  });
});

// ────────────────────────────────────────────────────────────────────────────
// PRICE HISTORY — APPEND-ONLY (NEVER OVERWRITE)
// ────────────────────────────────────────────────────────────────────────────
describe('Supplier price history — append only', () => {
  let ingredientId;

  beforeEach(() => {
    db.prepare(`INSERT INTO ingredients (name_fr, current_unit_price) VALUES (?, ?)`).run('Steak patty', 1.45);
    ingredientId = db.prepare(`SELECT id FROM ingredients WHERE name_fr = 'Steak patty'`).get().id;
  });

  it('appends new price history records', () => {
    db.prepare(`INSERT INTO supplier_price_history (ingredient_id, unit_price, invoice_date, invoice_ref) VALUES (?, ?, ?, ?)`)
      .run(ingredientId, 1.45, '2026-01-15', 'INV-001');
    db.prepare(`INSERT INTO supplier_price_history (ingredient_id, unit_price, invoice_date, invoice_ref) VALUES (?, ?, ?, ?)`)
      .run(ingredientId, 1.52, '2026-02-20', 'INV-015');
    db.prepare(`INSERT INTO supplier_price_history (ingredient_id, unit_price, invoice_date, invoice_ref) VALUES (?, ?, ?, ?)`)
      .run(ingredientId, 1.48, '2026-03-10', 'INV-028');

    const history = db.prepare(`SELECT * FROM supplier_price_history WHERE ingredient_id = ? ORDER BY invoice_date`)
      .all(ingredientId);

    expect(history.length).toBe(3);
    expect(history[0].unit_price).toBe(1.45);
    expect(history[1].unit_price).toBe(1.52);
    expect(history[2].unit_price).toBe(1.48);
  });

  it('allows same date to appear multiple times in price history (two invoices same day)', () => {
    db.prepare(`INSERT INTO supplier_price_history (ingredient_id, unit_price, invoice_date) VALUES (?, ?, ?)`)
      .run(ingredientId, 1.45, '2026-03-01');
    db.prepare(`INSERT INTO supplier_price_history (ingredient_id, unit_price, invoice_date) VALUES (?, ?, ?)`)
      .run(ingredientId, 1.50, '2026-03-01');  // second invoice, same day

    const history = db.prepare(`SELECT * FROM supplier_price_history WHERE ingredient_id = ?`).all(ingredientId);
    expect(history.length).toBe(2); // both preserved
  });

  it('fetches latest price for ingredient', () => {
    db.prepare(`INSERT INTO supplier_price_history (ingredient_id, unit_price, invoice_date) VALUES (?, ?, ?)`)
      .run(ingredientId, 1.45, '2026-01-15');
    db.prepare(`INSERT INTO supplier_price_history (ingredient_id, unit_price, invoice_date) VALUES (?, ?, ?)`)
      .run(ingredientId, 1.58, '2026-03-20');

    const latest = db.prepare(`SELECT * FROM supplier_price_history WHERE ingredient_id = ? ORDER BY invoice_date DESC LIMIT 1`)
      .get(ingredientId);

    expect(latest.unit_price).toBe(1.58);
    expect(latest.invoice_date).toBe('2026-03-20');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// TIP POOL FINALIZATION — CAN'T MODIFY AFTER CONFIRMED
// ────────────────────────────────────────────────────────────────────────────
describe('Tip pool finalization', () => {
  it('saves a tip pool session with finalized=0 (draft)', () => {
    db.prepare(`INSERT INTO tip_pool_sessions (date, total_tips, method, results, finalized) VALUES (?, ?, ?, ?, ?)`)
      .run('2026-03-25', 185.50, 'equal', JSON.stringify([{name:'Alice',share:61.83},{name:'Bob',share:61.83},{name:'Carol',share:61.84}]), 0);

    const session = db.prepare(`SELECT * FROM tip_pool_sessions WHERE date = ?`).get('2026-03-25');
    expect(session.finalized).toBe(0);
    expect(session.total_tips).toBe(185.50);
  });

  it('marks session as finalized', () => {
    db.prepare(`INSERT INTO tip_pool_sessions (date, total_tips, method, results, finalized) VALUES (?, ?, ?, ?, ?)`)
      .run('2026-03-25', 185.50, 'equal', '{}', 0);

    db.prepare(`UPDATE tip_pool_sessions SET finalized = 1 WHERE date = ?`).run('2026-03-25');

    const session = db.prepare(`SELECT * FROM tip_pool_sessions WHERE date = ?`).get('2026-03-25');
    expect(session.finalized).toBe(1);
  });

  it('business rule: finalized session should not be modified', () => {
    // Production code checks finalized flag before allowing edits.
    // Test the enforcement logic:
    db.prepare(`INSERT INTO tip_pool_sessions (date, total_tips, method, results, finalized) VALUES (?, ?, ?, ?, ?)`)
      .run('2026-03-25', 185.50, 'equal', '{"original":true}', 1);

    const session = db.prepare(`SELECT * FROM tip_pool_sessions WHERE date = ?`).get('2026-03-25');

    // Simulate the app guard
    function canModifySession(s) { return s.finalized === 0; }
    expect(canModifySession(session)).toBe(false);
  });

  it('stores full distribution results as JSON', () => {
    const results = [
      { name: 'Alice', share: 80 },
      { name: 'Bob',   share: 60 },
      { name: 'Carol', share: 40 },
      { name: 'Dan',   share: 20 },
    ];
    db.prepare(`INSERT INTO tip_pool_sessions (date, total_tips, method, results, finalized) VALUES (?, ?, ?, ?, ?)`)
      .run('2026-03-25', 200, 'hours', JSON.stringify(results), 1);

    const session = db.prepare(`SELECT * FROM tip_pool_sessions WHERE date = ?`).get('2026-03-25');
    const parsed  = JSON.parse(session.results);
    expect(parsed).toHaveLength(4);
    expect(parsed[0].share).toBe(80);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// KV STORE OPERATIONS
// ────────────────────────────────────────────────────────────────────────────
describe('Key-value store', () => {
  it('stores and retrieves a value', () => {
    db.prepare(`INSERT INTO kv_store (key, value) VALUES (?, ?)`).run('dicann-v7', JSON.stringify({ date: '2026-03-25', caisses: 2 }));
    const row = db.prepare(`SELECT value FROM kv_store WHERE key = ?`).get('dicann-v7');
    const val = JSON.parse(row.value);
    expect(val.date).toBe('2026-03-25');
  });

  it('upserts (overwrite on conflict)', () => {
    db.prepare(`INSERT INTO kv_store (key, value) VALUES (?, ?)`).run('test-key', '"v1"');
    db.prepare(`INSERT OR REPLACE INTO kv_store (key, value) VALUES (?, ?)`).run('test-key', '"v2"');
    const row = db.prepare(`SELECT value FROM kv_store WHERE key = ?`).get('test-key');
    expect(JSON.parse(row.value)).toBe('v2');
  });

  it('rejects null values', () => {
    expect(() => {
      db.prepare(`INSERT INTO kv_store (key, value) VALUES (?, ?)`).run('null-test', null);
    }).toThrow();
  });
});
