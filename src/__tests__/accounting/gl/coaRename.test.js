/**
 * COARENAME-001  a built-in account can be renamed
 * COARENAME-002  its number and type are left alone
 * COARENAME-003  the ledger keeps working after a rename
 *
 * The seeded chart is written for a restaurant: "Ventes - repas", "Achats -
 * nourriture", "Equipement de cuisine". Every one of those is the wrong words for
 * a manufacturer, a consultancy, or anyone whose 4000 is royalty income - and the
 * account they appear on is a system account, so coaUpdate refused it and the
 * Chart of Accounts screen did not even offer an Edit button. There was no way to
 * fix the vocabulary of your own books.
 *
 * A name is a label. The number and the type are load-bearing: code posts
 * invoices to '4000' and receivables to '1100' by number, and every report groups
 * by type. So renaming is allowed everywhere and restructuring still is not.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildAccountingDb } from '../helpers/testSchema.js';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { coaRename, incomeStatement } = require('../../../db/database.js');

let db;
beforeEach(() => {
  db = buildAccountingDb();
  for (const [num, fr, en, type, sys] of [
    ['1010', 'Encaisse',        'Cash',          'asset',   1],
    ['4000', 'Ventes - repas',  'Sales - meals', 'revenue', 1],
    ['6900', 'Divers',          'Miscellaneous', 'expense', 0],
  ]) {
    db.prepare(
      `INSERT OR IGNORE INTO chart_of_accounts (account_number, name_fr, name_en, type, is_system)
       VALUES (?,?,?,?,?)`
    ).run(num, fr, en, type, sys);
  }
});
afterEach(() => { db?.close(); db = null; });

const acc = (n) => db.prepare(`SELECT * FROM chart_of_accounts WHERE account_number=?`).get(n);

describe('COARENAME-001 a built-in account can be renamed', () => {
  it('renames a system account, which coaUpdate would not touch', () => {
    expect(acc('4000').is_system).toBe(1);
    coaRename(acc('4000').id, { name_fr: 'Revenus de redevances', name_en: 'Royalty income' }, db);
    expect(acc('4000').name_en).toBe('Royalty income');
    expect(acc('4000').name_fr).toBe('Revenus de redevances');
  });

  it('renames an ordinary account too', () => {
    coaRename(acc('6900').id, { name_fr: 'Autres charges', name_en: 'Other expenses' }, db);
    expect(acc('6900').name_en).toBe('Other expenses');
  });

  it('one language given fills the other rather than blanking it', () => {
    coaRename(acc('4000').id, { name_en: 'Royalty income' }, db);
    expect(acc('4000').name_en).toBe('Royalty income');
    expect(acc('4000').name_fr).toBe('Royalty income');
  });

  it('trims what was typed', () => {
    coaRename(acc('4000').id, { name_fr: '  Redevances  ', name_en: '  Royalties  ' }, db);
    expect(acc('4000').name_fr).toBe('Redevances');
    expect(acc('4000').name_en).toBe('Royalties');
  });

  it('refuses to blank an account name', () => {
    expect(coaRename(acc('4000').id, { name_fr: '', name_en: '' }, db)).toBe(false);
    expect(acc('4000').name_en).toBe('Sales - meals');
  });

  it('refuses nonsense without throwing', () => {
    for (const junk of [{}, { name_fr: null, name_en: undefined }, { name_fr: '   ' }]) {
      expect(() => coaRename(acc('4000').id, junk, db)).not.toThrow();
    }
    expect(acc('4000').name_en).toBe('Sales - meals');
  });
});

describe('COARENAME-002 the load-bearing parts are left alone', () => {
  it('the account number is untouched: code posts to it by number', () => {
    coaRename(acc('4000').id, { name_fr: 'Redevances', name_en: 'Royalty income' }, db);
    expect(acc('4000')).toBeTruthy();
    expect(acc('4000').account_number).toBe('4000');
  });

  it('the type is untouched: reports group by it', () => {
    coaRename(acc('4000').id, { name_fr: 'Redevances', name_en: 'Royalty income' }, db);
    expect(acc('4000').type).toBe('revenue');
  });

  it('it stays a system account, so it is still protected from restructuring', () => {
    coaRename(acc('4000').id, { name_fr: 'Redevances', name_en: 'Royalty income' }, db);
    expect(acc('4000').is_system).toBe(1);
  });

  it('renaming one account does not disturb another', () => {
    const before = acc('1010').name_en;
    coaRename(acc('4000').id, { name_fr: 'Redevances', name_en: 'Royalty income' }, db);
    expect(acc('1010').name_en).toBe(before);
  });
});

describe('COARENAME-003 the ledger keeps working afterwards', () => {
  const periodFor = (date) => {
    const year = Number(date.slice(0, 4));
    const start = `${year}-01-01`, end = `${year}-12-31`;
    const found = db.prepare(`SELECT id FROM accounting_periods WHERE start_date=?`).get(start);
    if (found) return found.id;
    return db.prepare(
      `INSERT INTO accounting_periods (period_type, fiscal_year, start_date, end_date, status)
       VALUES ('month', ?, ?, ?, 'open')`
    ).run(year, start, end).lastInsertRowid;
  };

  function post(date, lines) {
    const { lastInsertRowid } = db.prepare(
      `INSERT INTO journal_entries (entry_number, entry_date, period_id, description, source_type, source_id, status, device_uuid)
       VALUES (?,?,?,'x','invoice','INV-1','draft','test-device')`
    ).run(`JE-${Math.random().toString(36).slice(2, 8)}`, date, periodFor(date));
    lines.forEach((l, i) => db.prepare(
      `INSERT INTO journal_lines (entry_id, line_number, account_id, debit_cents, credit_cents)
       VALUES (?,?,?,?,?)`
    ).run(lastInsertRowid, i + 1, acc(l.a).id, l.dr || 0, l.cr || 0));
    db.prepare(`UPDATE journal_entries SET status='posted' WHERE id=?`).run(lastInsertRowid);
  }

  it('entries already posted keep their balance under the new name', () => {
    post('2026-08-04', [{ a: '1010', dr: 500000 }, { a: '4000', cr: 500000 }]);
    coaRename(acc('4000').id, { name_fr: 'Revenus de redevances', name_en: 'Royalty income' }, db);
    const r = incomeStatement('2026-01-01', '2026-12-31', { _db: db });
    expect(r.revenueCents).toBe(500000);
  });

  it('the income statement shows the name the owner chose', () => {
    post('2026-08-04', [{ a: '1010', dr: 500000 }, { a: '4000', cr: 500000 }]);
    coaRename(acc('4000').id, { name_fr: 'Revenus de redevances', name_en: 'Royalty income' }, db);
    const line = incomeStatement('2026-01-01', '2026-12-31', { _db: db })
      .lines.find(l => l.accountNumber === '4000');
    expect(line.nameEn).toBe('Royalty income');
    expect(line.nameFr).toBe('Revenus de redevances');
  });

  it('a later invoice still finds 4000 by number and posts to it', () => {
    coaRename(acc('4000').id, { name_fr: 'Revenus de redevances', name_en: 'Royalty income' }, db);
    post('2026-09-01', [{ a: '1010', dr: 250000 }, { a: '4000', cr: 250000 }]);
    const r = incomeStatement('2026-01-01', '2026-12-31', { _db: db });
    expect(r.revenueCents).toBe(250000);
  });
});
