/**
 * ASSET-001  the fixed assets list leaves archived assets out
 *
 * The assets table and the chart of accounts both have an is_archived column.
 * The list joins the two, so the filter has to say which one it means: found
 * when the list was first read on real books (it was refused as ambiguous).
 */
import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { assetList } from '../../../db/database.js';

function makeDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE chart_of_accounts (id INTEGER PRIMARY KEY, account_number TEXT, name_fr TEXT, name_en TEXT, is_archived INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE assets (id INTEGER PRIMARY KEY, name TEXT, coa_account_id INTEGER, cca_class TEXT, acquisition_date TEXT, acquisition_cost REAL, is_archived INTEGER NOT NULL DEFAULT 0);
    INSERT INTO chart_of_accounts (id, account_number, name_fr, name_en, is_archived) VALUES (1, '1500', 'Équipement', 'Equipment', 0), (2, '1510', 'Véhicules', 'Vehicles', 1);
    INSERT INTO assets (id, name, coa_account_id, cca_class, acquisition_date, acquisition_cost, is_archived) VALUES
      (1, 'Oven', 1, '8', '2025-03-01', 4200, 0),
      (2, 'Old van', 2, '10', '2021-06-15', 18000, 1),
      (3, 'Mixer', 2, '8', '2024-01-10', 900, 0);
  `);
  return db;
}

describe('ASSET-001 fixed assets list', () => {
  it('lists the assets in use, oldest first, with their ledger account', () => {
    const rows = assetList({}, makeDb());
    expect(rows.map((a) => a.name)).toEqual(['Mixer', 'Oven']);
    expect(rows[1]).toMatchObject({ name: 'Oven', account_number: '1500', coa_name_en: 'Equipment', acquisition_cost: 4200 });
    // An asset in use stays listed even when its ledger account was archived.
    expect(rows[0]).toMatchObject({ name: 'Mixer', account_number: '1510' });
  });

  it('includes archived assets when asked', () => {
    expect(assetList({ includeArchived: true }, makeDb()).map((a) => a.name)).toEqual(['Old van', 'Mixer', 'Oven']);
  });
});
