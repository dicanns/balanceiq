/**
 * STMTDEL-001  deleting an import undoes what its lines posted and paid
 * OPENRE-001   the opening entry follows the account's opening balance and date
 * OPENRE-002   openings corrected before this are brought in line once, at start
 * OPENDATE-001 a first import moves an opening date that falls after its first line
 * STMTUI-001   the screen: delete spelled out, closed months folded, one-click date fix
 *
 * Figures are invented.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'module';
import { buildAccountingDb } from '../helpers/testSchema.js';

const require = createRequire(import.meta.url);
const {
  glDraftEntry, glPostEntry, bankStatementImport, bankStatementDelete, bankAccountUpdate,
  bankAccountPostOpeningBalance, bankResyncOpeningEntries,
} = require('../../../db/database.js');
const ROOT = path.resolve(__dirname, '../../../..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

let db;
beforeEach(() => {
  db = buildAccountingDb();
  for (const [num, name, type] of [['2210', 'Card', 'liability'], ['3400', 'Opening equity', 'equity'], ['6100', 'Supplies', 'expense']]) {
    db.prepare(`INSERT OR IGNORE INTO chart_of_accounts (account_number, name_fr, name_en, type) VALUES (?,?,?,?)`).run(num, name, name, type);
  }
});
afterEach(() => { db?.close(); db = null; });

const coa = (n) => db.prepare(`SELECT id FROM chart_of_accounts WHERE account_number=?`).get(n).id;
const card = (opening = 0, date = '2026-07-05') => db.prepare(
  `INSERT INTO bank_accounts (name, account_type, coa_account_id, opening_balance, opening_date) VALUES ('Sample Card','credit_card',?,?,?)`
).run(coa('2210'), opening, date).lastInsertRowid;
const balance = (num) => db.prepare(
  `SELECT COALESCE(SUM(jl.debit_cents),0) - COALESCE(SUM(jl.credit_cents),0) AS b
     FROM journal_lines jl JOIN journal_entries je ON je.id=jl.entry_id AND je.status IN ('posted','reversed')
    WHERE jl.account_id=?`
).get(coa(num)).b;
const openingEntries = (id) => db.prepare(
  `SELECT id, entry_date, status FROM journal_entries WHERE source_type='bank_opening' AND source_id=? ORDER BY id`
).all(`bank:${id}`);
const csv = '07/24/2026,SAMPLE STORE,40.00\n07/26/2026,SAMPLE CAFE,5.00\n';

describe('STMTDEL-001 deleting an import', () => {
  it('reverses the entries its categorized lines posted and releases a bill they paid', () => {
    const id = card();
    const { statementId } = bankStatementImport({ bankAccountId: id, fileText: csv, fileName: 'a.csv', fileType: 'csv' }, db);
    const tx = db.prepare(`SELECT id, amount FROM bank_transactions WHERE bank_statement_id=? AND description='SAMPLE STORE'`).get(statementId);
    // What categorizing does: a posted entry the line points at.
    const { entryId } = glDraftEntry({
      entry_date: '2026-07-24', description: 'SAMPLE STORE', source_type: 'bank_tx', source_id: String(tx.id),
      lines: [{ account_id: coa('6100'), debit_cents: 4000, credit_cents: 0 }, { account_id: coa('2210'), debit_cents: 0, credit_cents: 4000 }],
    }, db);
    glPostEntry(entryId, db);
    db.prepare(`UPDATE bank_transactions SET journal_entry_id=?, coa_account_id=? WHERE id=?`).run(entryId, coa('6100'), tx.id);
    const bill = db.prepare(
      `INSERT INTO supplier_bills (month_key, supplier_name, bill_date, amount, paid, payment_date, bank_transaction_id) VALUES ('2026-07','Sample Supplier','2026-07-20',5,1,'2026-07-26',?)`
    ).run(db.prepare(`SELECT id FROM bank_transactions WHERE description='SAMPLE CAFE'`).get().id).lastInsertRowid;
    expect(balance('6100')).toBe(4000);

    const r = bankStatementDelete(statementId, db);
    expect(r).toMatchObject({ removedTransactions: 2, reversedEntries: 1 });
    expect(balance('6100')).toBe(0);                     // no expense left without its line
    expect(db.prepare(`SELECT paid, bank_transaction_id FROM supplier_bills WHERE id=?`).get(bill)).toEqual({ paid: 0, bank_transaction_id: null });
    const orphans = db.prepare(
      `SELECT COUNT(*) n FROM journal_entries je WHERE je.source_type='bank_tx' AND je.status='posted'
         AND NOT EXISTS (SELECT 1 FROM bank_transactions bt WHERE bt.journal_entry_id=je.id)`
    ).get().n;
    expect(orphans).toBe(0);
  });
});

describe('OPENRE-001 the opening entry follows the account', () => {
  it('a corrected amount reverses the old entry and posts the new one', () => {
    const id = card(-116);
    bankAccountPostOpeningBalance(id, db);
    expect(balance('2210')).toBe(-11600);
    const r = bankAccountUpdate(id, { opening_balance: -185 }, db);
    expect(r.openingReposted).toBe(true);
    expect(balance('2210')).toBe(-18500);
    expect(balance('3400')).toBe(18500);
    expect(openingEntries(id).map(e => e.status)).toEqual(['reversed', 'posted']);
  });
  it('a corrected date moves it', () => {
    const id = card(-50, '2026-09-17');
    bankAccountPostOpeningBalance(id, db);
    bankAccountUpdate(id, { opening_date: '2026-07-05' }, db);
    const live = openingEntries(id).filter(e => e.status === 'posted');
    expect(live).toHaveLength(1);
    expect(live[0].entry_date).toBe('2026-07-05');
  });
  it('a name change touches nothing, and an opening never posted is left alone', () => {
    const id = card(-50);
    bankAccountPostOpeningBalance(id, db);
    expect(bankAccountUpdate(id, { name: 'Renamed' }, db).openingReposted).toBe(false);
    const other = card(-20);
    expect(bankAccountUpdate(other, { opening_balance: -30 }, db).openingReposted).toBe(false);
    expect(openingEntries(other)).toEqual([]);
  });
  it('an opening set to zero is reversed and not re-posted', () => {
    const id = card(-50);
    bankAccountPostOpeningBalance(id, db);
    bankAccountUpdate(id, { opening_balance: 0 }, db);
    expect(balance('2210')).toBe(0);
    expect(openingEntries(id).filter(e => e.status === 'posted')).toEqual([]);
  });
  it('in a closed period the correction is refused whole, account included', () => {
    const id = card(-50);
    bankAccountPostOpeningBalance(id, db);
    const periodId = db.prepare(`SELECT period_id FROM journal_entries WHERE source_type='bank_opening'`).get().period_id;
    db.prepare(`UPDATE accounting_periods SET status='closed' WHERE id=?`).run(periodId);
    expect(() => bankAccountUpdate(id, { opening_balance: -80 }, db)).toThrow('ERR_PERIOD_CLOSED_REVERSE');
    expect(db.prepare(`SELECT opening_balance FROM bank_accounts WHERE id=?`).get(id).opening_balance).toBe(-50);
  });
});

describe('OPENRE-002 the one-time repair', () => {
  it('lines up every entry left on an old amount or date, then finds nothing', () => {
    const a = card(-116, '2026-07-05');
    const b = card(-50, '2026-09-17');
    bankAccountPostOpeningBalance(a, db);
    bankAccountPostOpeningBalance(b, db);
    // Corrected the way earlier versions did: the account only.
    db.prepare(`UPDATE bank_accounts SET opening_balance=-185 WHERE id=?`).run(a);
    db.prepare(`UPDATE bank_accounts SET opening_date='2026-07-05' WHERE id=?`).run(b);
    expect(bankResyncOpeningEntries(db).fixed.sort()).toEqual([a, b].sort());
    expect(balance('2210')).toBe(-23500);
    expect(openingEntries(b).find(e => e.status === 'posted').entry_date).toBe('2026-07-05');
    expect(bankResyncOpeningEntries(db).fixed).toEqual([]);
  });
});

describe('OPENDATE-001 a first import and a late opening date', () => {
  it('moves the date to the day before the first line, never the amount, and the entry with it', () => {
    const id = card(-10, '2026-09-17');       // created today, date left at today
    bankAccountPostOpeningBalance(id, db);
    const r = bankStatementImport({ bankAccountId: id, fileText: csv, fileName: 'a.csv', fileType: 'csv' }, db);
    expect(r.openingDateMoved).toEqual({ from: '2026-09-17', to: '2026-07-23' });
    expect(db.prepare(`SELECT opening_balance, opening_date FROM bank_accounts WHERE id=?`).get(id)).toEqual({ opening_balance: -10, opening_date: '2026-07-23' });
    expect(openingEntries(id).find(e => e.status === 'posted').entry_date).toBe('2026-07-23');
  });
  it('leaves the date alone once the account has a statement', () => {
    const id = card(-10, '2026-07-01');
    bankStatementImport({ bankAccountId: id, fileText: csv, fileName: 'a.csv', fileType: 'csv' }, db);
    db.prepare(`UPDATE bank_accounts SET opening_date='2026-09-17' WHERE id=?`).run(id);
    const r = bankStatementImport({ bankAccountId: id, fileText: '08/03/2026,SAMPLE LATER,7.00\n', fileName: 'b.csv', fileType: 'csv' }, db);
    expect(r.openingDateMoved).toBeNull();
  });
});

describe('STMTUI-001 the screen', () => {
  const s = read('src/components/BanqueTab.jsx');
  it('spells delete out and says what it undoes', () => {
    expect(s).toMatch(/deleteStmt:\s+"Supprimer l'import"/);
    expect(s).toMatch(/deleteStmt:\s+'Delete import'/);
    expect(s).toMatch(/To finish a month, use Close under Reconciliations/);
    expect(s).not.toMatch(/padding: 0, lineHeight: 1 \}\}>×<\/button>/);
  });
  it('shows open statements and the last closed one, the rest folded', () => {
    expect(s).toMatch(/byEnd\.filter\(st => !st\.reconciled \|\| st === lastClosed\)/);
    expect(s).toMatch(/T\.stmtOlder\(foldable\)/);
  });
  it('offers the late opening date fix, and a card opening reads as owed', () => {
    expect(s).toMatch(/T\.openingDateFix\(fmtDate\(dayBefore\)\)/);
    expect(s).toMatch(/owedAccount\(acc\) \? ` \$\{T\.openingOwed\}`/);
  });
  it('the repair runs at start, after the backup', () => {
    expect(read('main.js')).toMatch(/const r = bankResyncOpeningEntries\(\);/);
  });
});
