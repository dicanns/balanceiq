/**
 * DEMO-PURGE-001 - "Clear demo data" must leave a genuinely empty ledger.
 *
 * Regression guard for the bug found 2026-07: clearDemoData() only blanked a
 * fixed list of kv keys and 6 months of P&L, so posted journal entries seeded
 * with source_type='demo' survived the clear and silently contaminated the
 * trial balance once real invoices were entered.
 *
 * DEMO-PURGE-002 - the FTS5 trigger fix (migration v33): deleting a forecast
 * product must not raise "SQL logic error".
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildAccountingDb } from '../helpers/testSchema.js';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
// Note: only functions accepting an explicit _db are used here - trialBalance()
// calls getDb() internally, which requires Electron's app.getPath (CLAUDE.md #7).
const { demoPurgeSqlite, glDraftEntry, glPostEntry } = require('../../../db/database.js');

let db;
beforeEach(() => { db = buildAccountingDb(); });
afterEach(() => { db?.close(); db = null; });

function accId(num, nameFr, type) {
  db.prepare(
    `INSERT OR IGNORE INTO chart_of_accounts (account_number, name_fr, name_en, type) VALUES (?,?,?,?)`
  ).run(num, nameFr, nameFr, type);
  return db.prepare(`SELECT id FROM chart_of_accounts WHERE account_number=?`).get(num).id;
}

function postDemoEntry(sourceType) {
  const cash = accId('1000', 'Encaisse', 'asset');
  const rev  = accId('4000', 'Revenus', 'revenue');
  const { entryId } = glDraftEntry({
    entry_date: '2026-01-15',
    description: 'Ventes semaine (démo)',
    source_type: sourceType,
    lines: [
      { account_id: cash, debit_cents: 50000, credit_cents: 0 },
      { account_id: rev,  debit_cents: 0,     credit_cents: 50000 },
    ],
  }, db);
  glPostEntry(entryId, db);
  return entryId;
}

describe('DEMO-PURGE-001 clear demo data empties the ledger', () => {
  it('removes posted journal entries seeded with source_type=demo', () => {
    postDemoEntry('demo');
    expect(db.prepare(`SELECT COUNT(*) c FROM journal_entries`).get().c).toBe(1);

    demoPurgeSqlite(db);

    expect(db.prepare(`SELECT COUNT(*) c FROM journal_entries`).get().c).toBe(0);
    expect(db.prepare(`SELECT COUNT(*) c FROM journal_lines`).get().c).toBe(0);
  });

  it('removes the seeded opening_balance entry', () => {
    postDemoEntry('opening_balance');
    demoPurgeSqlite(db);
    expect(db.prepare(
      `SELECT COUNT(*) c FROM journal_entries WHERE source_type='opening_balance'`
    ).get().c).toBe(0);
  });

  it('leaves no posted lines, so a trial balance starts from zero', () => {
    postDemoEntry('demo');
    const before = db.prepare(
      `SELECT COUNT(*) c FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl.entry_id AND je.status='posted'`
    ).get().c;
    expect(before).toBeGreaterThan(0);

    demoPurgeSqlite(db);

    // No posted lines remain, so nothing to aggregate.
    const tb = db.prepare(
      `SELECT COUNT(*) c FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl.entry_id AND je.status='posted'`
    ).get().c;
    expect(tb).toBe(0);
  });

  it('does NOT delete a user-created manual entry', () => {
    const cash = accId('1000', 'Encaisse', 'asset');
    const rev  = accId('4000', 'Revenus', 'revenue');
    const { entryId } = glDraftEntry({
      entry_date: '2026-06-01',
      description: 'Vraie facture client',
      source_type: 'invoice',
      lines: [
        { account_id: cash, debit_cents: 11498, credit_cents: 0 },
        { account_id: rev,  debit_cents: 0,     credit_cents: 11498 },
      ],
    }, db);
    glPostEntry(entryId, db);

    demoPurgeSqlite(db);

    const survivor = db.prepare(`SELECT * FROM journal_entries WHERE id=?`).get(entryId);
    expect(survivor).toBeTruthy();
    expect(survivor.source_type).toBe('invoice');
  });

  it('is idempotent - purging twice does not throw', () => {
    postDemoEntry('demo');
    expect(() => { demoPurgeSqlite(db); demoPurgeSqlite(db); }).not.toThrow();
  });

  it('reports what it removed', () => {
    postDemoEntry('demo');
    const res = demoPurgeSqlite(db);
    expect(res.ok).toBe(true);
    expect(res.removed.journal_entries).toBe(1);
  });
});

/**
 * Builds the forecast_products + FTS5 index pair exactly as the shipped schema
 * does, then installs the CORRECTED (migration v33) triggers. Reproduces the
 * real-world shape: a plain, non-external-content FTS5 table.
 */
function buildForecastFts(database) {
  database.prepare(`CREATE TABLE IF NOT EXISTS forecast_products (
    id TEXT PRIMARY KEY, name TEXT, category TEXT)`).run();
  database.prepare(`CREATE VIRTUAL TABLE IF NOT EXISTS fts_forecast_products USING fts5(
    fp_id UNINDEXED, name, category, tokenize='unicode61')`).run();
  database.prepare(`DROP TRIGGER IF EXISTS fts_fp_insert`).run();
  database.prepare(`DROP TRIGGER IF EXISTS fts_fp_update`).run();
  database.prepare(`DROP TRIGGER IF EXISTS fts_fp_delete`).run();
  database.prepare(`CREATE TRIGGER fts_fp_insert AFTER INSERT ON forecast_products BEGIN
    INSERT INTO fts_forecast_products(fp_id, name, category)
      VALUES (new.id, new.name, COALESCE(new.category,''));
  END`).run();
  database.prepare(`CREATE TRIGGER fts_fp_delete AFTER DELETE ON forecast_products BEGIN
    DELETE FROM fts_forecast_products WHERE rowid IN (
      SELECT rowid FROM fts_forecast_products WHERE fp_id = old.id);
  END`).run();
  database.prepare(`CREATE TRIGGER fts_fp_update AFTER UPDATE ON forecast_products BEGIN
    DELETE FROM fts_forecast_products WHERE rowid IN (
      SELECT rowid FROM fts_forecast_products WHERE fp_id = old.id);
    INSERT INTO fts_forecast_products(fp_id, name, category)
      VALUES (new.id, new.name, COALESCE(new.category,''));
  END`).run();
}

describe('DEMO-PURGE-002 forecast product delete no longer raises SQL logic error', () => {
  beforeEach(() => { buildForecastFts(db); });

  it('deletes a forecast product without throwing (migration v33 trigger fix)', () => {
    db.prepare(`INSERT INTO forecast_products (id,name,category) VALUES ('p1','Croissant','Viennoiserie')`).run();
    expect(db.prepare(`SELECT COUNT(*) c FROM fts_forecast_products`).get().c).toBe(1);

    expect(() => db.prepare(`DELETE FROM forecast_products WHERE id='p1'`).run()).not.toThrow();
    expect(db.prepare(`SELECT COUNT(*) c FROM forecast_products`).get().c).toBe(0);
    expect(db.prepare(`SELECT COUNT(*) c FROM fts_forecast_products`).get().c).toBe(0);
  });

  it('updating a forecast product does not throw and keeps the index in sync', () => {
    db.prepare(`INSERT INTO forecast_products (id,name,category) VALUES ('p2','Baguette','Pain')`).run();

    expect(() =>
      db.prepare(`UPDATE forecast_products SET name='Baguette tradition' WHERE id='p2'`).run()
    ).not.toThrow();

    const row = db.prepare(`SELECT name FROM fts_forecast_products WHERE fp_id='p2'`).get();
    expect(row?.name).toBe('Baguette tradition');
    expect(db.prepare(`SELECT COUNT(*) c FROM fts_forecast_products`).get().c).toBe(1);
  });

  it('bulk delete (what forecast:clearAll does) succeeds - the reported bug', () => {
    for (let i = 0; i < 20; i++) {
      db.prepare(`INSERT INTO forecast_products (id,name,category) VALUES (?,?,?)`).run(`id-${i}`, `Produit ${i}`, 'Cat');
    }
    expect(() => db.prepare(`DELETE FROM forecast_products`).run()).not.toThrow();
    expect(db.prepare(`SELECT COUNT(*) c FROM fts_forecast_products`).get().c).toBe(0);
  });
});
