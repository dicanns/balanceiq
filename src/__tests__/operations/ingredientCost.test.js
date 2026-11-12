/**
 * COST-001  pack price to unit price helper
 * COST-002  ingredientUpsert computes, stamps and records price changes
 * COST-003  recipe cost follows a changed case price
 * COST-004  migration 52 is additive, idempotent and identical in both chains
 */
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'module';
import { convertQty, unitPriceFromPack, round6 } from '../../utils/ingredientCost.mjs';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const { MIGRATIONS, runMigrations } = require('../../db/migrations.js');
const dbMod = require('../../db/database.js');
const ROOT = path.resolve(__dirname, '../../..');

function buildDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE ingredients (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name_fr TEXT NOT NULL, name_en TEXT DEFAULT '',
      category TEXT DEFAULT 'other', default_unit TEXT DEFAULT 'kg', current_unit_price REAL,
      last_price_update TEXT, supplier_id TEXT DEFAULT '', sku TEXT DEFAULT '', notes TEXT DEFAULT '',
      active INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime('now','localtime')));
    CREATE TABLE supplier_price_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT, ingredient_id INTEGER NOT NULL, supplier_name TEXT DEFAULT '',
      unit_price REAL NOT NULL, quantity REAL, unit TEXT DEFAULT 'kg', invoice_date TEXT NOT NULL,
      invoice_ref TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now','localtime')));
    CREATE TABLE recipes (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name_fr TEXT NOT NULL, name_en TEXT DEFAULT '',
      category TEXT DEFAULT 'main', yield_qty REAL DEFAULT 1, yield_unit TEXT DEFAULT 'portions',
      active INTEGER DEFAULT 1, notes TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now','localtime')));
    CREATE TABLE recipe_ingredients (
      id INTEGER PRIMARY KEY AUTOINCREMENT, recipe_id INTEGER NOT NULL, ingredient_id INTEGER NOT NULL,
      quantity REAL NOT NULL, unit TEXT NOT NULL, notes TEXT DEFAULT '');
  `);
  db.pragma('user_version = 51');
  runMigrations(db);
  return db;
}
const cols = (db, t) => db.prepare(`PRAGMA table_info(${t})`).all().map(c => c.name);

describe('COST-001 helper', () => {
  it('convertQty', () => {
    expect(convertQty(2, 'kg', 'g')).toBe(2000);
    expect(convertQty(1, 'L', 'mL')).toBe(1000);
    expect(convertQty(1, 'lb', 'g')).toBeCloseTo(453.59237, 6);
    expect(convertQty(16, 'oz', 'lb')).toBeCloseTo(1, 6);
    expect(convertQty(5, 'slice', 'slice')).toBe(5);
    expect(convertQty(1, 'kg', 'mL')).toBeNull();
    expect(convertQty(1, 'slice', 'g')).toBeNull();
  });
  it('example prices', () => {
    expect(round6(unitPriceFromPack({ packPriceCents: 10163, packQty: 1111, packUnit: 'count', unit: 'slice' }))).toBeCloseTo(0.09148, 5);
    expect(unitPriceFromPack({ packPriceCents: 975, packQty: 7.2, packUnit: 'count', unit: 'patty' })).toBeCloseTo(1.35417, 5);
    const g = unitPriceFromPack({ packPriceCents: 3609, packQty: 27, packUnit: 'lb', unit: 'g' });
    expect(g).toBeCloseTo(0.0029468, 6);
    expect(g * 128).toBeCloseTo(0.3772, 3);
    expect(g * 240).toBeCloseTo(0.7072, 3);
    expect(unitPriceFromPack({ packPriceCents: 4975, packQty: 25, packUnit: 'lb', unit: 'g' }) * 15).toBeCloseTo(0.0658, 3);
    expect(unitPriceFromPack({ packPriceCents: 500, packQty: 10, packUnit: 'kg', unit: 'kg' })).toBeCloseTo(0.5, 9);
  });
  it('null when it cannot be computed', () => {
    const base = { packPriceCents: 1000, packQty: 10, packUnit: 'count', unit: 'slice' };
    expect(unitPriceFromPack({ ...base, packUnit: 'lb' })).toBeNull();
    expect(unitPriceFromPack({ ...base, packQty: 0 })).toBeNull();
    expect(unitPriceFromPack({ ...base, packQty: -3 })).toBeNull();
    expect(unitPriceFromPack({ ...base, packPriceCents: 0 })).toBeNull();
    expect(unitPriceFromPack({ ...base, packPriceCents: -5 })).toBeNull();
    expect(unitPriceFromPack({ ...base, packQty: null })).toBeNull();
    expect(unitPriceFromPack({ ...base, packQty: 'abc' })).toBeNull();
    expect(unitPriceFromPack()).toBeNull();
  });
});

describe('COST-002 ingredientUpsert', () => {
  let db;
  beforeEach(() => { db = buildDb(); });
  const pepperoni = { name_fr: 'Pepperoni', default_unit: 'slice', pack_price_cents: 10163, pack_qty: 1111, pack_unit: 'count', pack_label: 'box' };
  const history = (id) => db.prepare('SELECT * FROM supplier_price_history WHERE ingredient_id=?').all(id);

  it('computes the unit price, stamps the date and writes one history row', () => {
    const id = dbMod.ingredientUpsert({ ...pepperoni, current_unit_price: 99 }, db);
    expect(typeof id).toBe('number');
    const row = db.prepare('SELECT * FROM ingredients WHERE id=?').get(id);
    expect(row.current_unit_price).toBeCloseTo(0.09148, 5);
    expect(row.pack_label).toBe('box');
    expect(row.needs_verify).toBe(0);
    expect(row.last_price_update).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const h = history(id);
    expect(h).toHaveLength(1);
    expect(h[0].supplier_name).toBe('manual');
    expect(h[0].unit).toBe('slice');
    expect(h[0].unit_price).toBeCloseTo(0.09148, 5);
  });
  it('refuses incompatible units without writing', () => {
    const r = dbMod.ingredientUpsert({ ...pepperoni, pack_unit: 'lb' }, db);
    expect(r).toEqual({ ok: false, error: 'pack_units_incompatible' });
    expect(db.prepare('SELECT COUNT(*) n FROM ingredients').get().n).toBe(0);
    expect(db.prepare('SELECT COUNT(*) n FROM supplier_price_history').get().n).toBe(0);
  });
  it('history only on a real change', () => {
    const id = dbMod.ingredientUpsert(pepperoni, db);
    dbMod.ingredientUpsert({ ...pepperoni, id, notes: 'same price' }, db);
    expect(history(id)).toHaveLength(1);
    dbMod.ingredientUpsert({ ...pepperoni, id, pack_price_cents: 11000 }, db);
    expect(history(id)).toHaveLength(2);
    expect(db.prepare('SELECT current_unit_price p FROM ingredients WHERE id=?').get(id).p).toBeCloseTo(0.099010, 5);
  });
  it('keeps old callers working and keeps last_price_update when unchanged', () => {
    const id = dbMod.ingredientUpsert({ name_fr: 'Sel', default_unit: 'kg', current_unit_price: 2.5, last_price_update: '2026-01-01' }, db);
    expect(db.prepare('SELECT last_price_update d FROM ingredients WHERE id=?').get(id).d).not.toBe('2026-01-01');
    dbMod.ingredientUpsert({ id, name_fr: 'Sel', default_unit: 'kg', current_unit_price: 2.5, last_price_update: '2026-01-01' }, db);
    expect(db.prepare('SELECT last_price_update d FROM ingredients WHERE id=?').get(id).d).toBe('2026-01-01');
    const noPrice = dbMod.ingredientUpsert({ name_fr: 'Eau' }, db);
    expect(history(noPrice)).toHaveLength(0);
    expect(dbMod.ingredientsGetAll(db).length).toBe(2);
  });
  it('needs_verify round trips', () => {
    const id = dbMod.ingredientUpsert({ ...pepperoni, needs_verify: true }, db);
    expect(db.prepare('SELECT needs_verify v FROM ingredients WHERE id=?').get(id).v).toBe(1);
  });
});

describe('COST-003 recipe cost follows the case price', () => {
  it('updates every recipe that uses the ingredient', () => {
    const db = buildDb();
    const ing = dbMod.ingredientUpsert({ name_fr: 'Pepperoni', default_unit: 'slice', pack_price_cents: 10163, pack_qty: 1111, pack_unit: 'count' }, db);
    const rA = dbMod.recipeUpsert({ name_fr: 'Pizza A', sell_price_cents: 1500 }, db);
    const rB = dbMod.recipeUpsert({ name_fr: 'Pizza B' }, db);
    dbMod.recipeIngredientsSetAll(rA, [{ ingredient_id: ing, quantity: 20, unit: 'slice', notes: '' }], db);
    dbMod.recipeIngredientsSetAll(rB, [{ ingredient_id: ing, quantity: 10, unit: 'slice', notes: '' }], db);
    const cost = (r) => dbMod.recipeIngredientsGet(r, db).reduce((s, x) => s + x.quantity * x.current_unit_price, 0);
    expect(cost(rA)).toBeCloseTo(1.8296, 3);
    dbMod.ingredientUpsert({ id: ing, name_fr: 'Pepperoni', default_unit: 'slice', pack_price_cents: 20326, pack_qty: 1111, pack_unit: 'count' }, db);
    expect(cost(rA)).toBeCloseTo(3.6592, 3);
    expect(cost(rB)).toBeCloseTo(1.8296, 3);
    expect(dbMod.recipesGetAll(db).find(r => r.id === rA).sell_price_cents).toBe(1500);
    // a caller that does not send the selling price keeps it
    dbMod.recipeUpsert({ id: rA, name_fr: 'Pizza A', yield_qty: 1 }, db);
    expect(dbMod.recipesGetAll(db).find(r => r.id === rA).sell_price_cents).toBe(1500);
  });
});

describe('COST-004 migration 52', () => {
  const block = (file) => {
    const s = fs.readFileSync(path.join(ROOT, file), 'utf8');
    const i = s.indexOf('version: 52,');
    return s.slice(i, s.indexOf('\n];', i));
  };
  it('is identical in both chains and restoreSafe', () => {
    const a = block('src/db/database.js');
    expect(a).toBe(block('src/db/migrations.js'));
    expect(a).toMatch(/restoreSafe: true,/);
    expect(MIGRATIONS.find(m => m.version === 52).restoreSafe).toBe(true);
  });
  it('adds the columns and can run twice', () => {
    const db = buildDb();
    expect(cols(db, 'ingredients')).toEqual(expect.arrayContaining(['pack_price_cents', 'pack_qty', 'pack_unit', 'pack_label', 'needs_verify']));
    expect(cols(db, 'recipes')).toContain('sell_price_cents');
    const m = MIGRATIONS.find(x => x.version === 52);
    expect(() => m.up(db)).not.toThrow();
    expect(cols(db, 'ingredients').filter(c => c === 'pack_qty')).toHaveLength(1);
  });
  it('tolerates a schema without the recipe tables', () => {
    const db = new Database(':memory:');
    expect(() => MIGRATIONS.find(x => x.version === 52).up(db)).not.toThrow();
  });
});
