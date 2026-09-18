/**
 * BALSET-001  an import records where its closing balance came from
 * BALSET-002  the closing balance can be corrected afterwards, and is audited
 * BALSET-003  a reconciled statement is locked, a nonsense amount refused
 * BALSET-004  a card is compared and entered as the amount owed
 * BALSET-005  an opening balance dated after the first line is reported
 * BALSET-007  the balance is figured to the cent, and never reads as minus zero
 *
 * A CSV carries no closing balance, so an import with the optional field blank
 * stored 0 and the reconciliation could never clear: the statement balance read
 * $0.00 against a real balance, and nothing could correct it but deleting the
 * import. A real zero and a missing figure also looked identical.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'module';
import { buildAccountingDb } from '../helpers/testSchema.js';

const require = createRequire(import.meta.url);
const {
  bankStatementImport, bankStatementUpdate, bankStatementsList, bankReconcilePreview, bankReconcileClose,
} = require('../../../db/database.js');
const ROOT = path.resolve(__dirname, '../../../..');

// 19 charges of 35.746... is not a real file; two lines are enough, invented.
const CARD_CSV = 'Date,Description,Amount\n2026-07-10,SAMPLE SUPPLIER,679.18\n2026-07-25,PAYMENT RECEIVED,-500.00\n';

let db;
beforeEach(() => {
  db = buildAccountingDb();
  for (const [num, name, type] of [['1010', 'Encaisse', 'asset'], ['2210', 'Carte', 'liability']]) {
    db.prepare(`INSERT OR IGNORE INTO chart_of_accounts (account_number, name_fr, name_en, type) VALUES (?,?,?,?)`).run(num, name, name, type);
  }
});
afterEach(() => { db?.close(); db = null; });

const account = ({ type = 'credit_card', coa = '2210', opening = 0, openingDate = '2026-07-01' } = {}) => db.prepare(
  `INSERT INTO bank_accounts (name, account_type, coa_account_id, opening_balance, opening_date)
   VALUES ('Amex', ?, (SELECT id FROM chart_of_accounts WHERE account_number=?), ?, ?)`
).run(type, coa, opening, openingDate).lastInsertRowid;
const importCard = (id, opts = {}) => bankStatementImport({ bankAccountId: id, fileText: CARD_CSV, fileName: 'activity.csv', fileType: 'csv', ...opts }, db);
const markCounted = (id) => db.prepare(`UPDATE bank_transactions SET match_status='manual' WHERE bank_account_id=?`).run(id);

describe('BALSET-001 where the balance came from', () => {
  it('none for a CSV with the field blank, user when it is given', () => {
    const id = account();
    importCard(id);
    expect(bankStatementsList(id, db)[0]).toMatchObject({ ending_balance: 0, ending_balance_source: 'none' });
    const id2 = account();
    // A card statement says what is owed; the caller stores it signed.
    bankStatementImport({ bankAccountId: id2, fileText: CARD_CSV, fileName: 'b.csv', fileType: 'csv', endingBalance: -179.18 }, db);
    expect(bankStatementsList(id2, db)[0]).toMatchObject({ ending_balance: -179.18, ending_balance_source: 'user' });
  });
});

describe('BALSET-002 correcting it afterwards', () => {
  it('updates the figure, records the source and writes an audit row', () => {
    const id = account();
    importCard(id);
    const [stmt] = bankStatementsList(id, db);
    const after = bankStatementUpdate(stmt.id, { ending_balance: -179.18 }, db);
    expect(after).toMatchObject({ ending_balance: -179.18, ending_balance_source: 'user' });
    expect(db.prepare(`SELECT action, old_value, new_value FROM audit_log WHERE record_type='bank_statement' ORDER BY id DESC`).get())
      .toMatchObject({ action: 'set_statement_balance', old_value: '0', new_value: '-179.18' });
  });
});

describe('BALSET-003 what is refused', () => {
  it('a reconciled statement is locked and a nonsense amount rejected', () => {
    const id = account();
    importCard(id);
    markCounted(id);
    const [stmt] = bankStatementsList(id, db);
    expect(() => bankStatementUpdate(stmt.id, { ending_balance: 'abc' }, db)).toThrow(/ERR_STATEMENT_BALANCE_INVALID/);
    bankStatementUpdate(stmt.id, { ending_balance: -179.18 }, db);
    expect(bankReconcilePreview(id, '2026-08-05', db).ecart).toBe(0);
    bankReconcileClose(id, stmt.id, db);
    expect(() => bankStatementUpdate(stmt.id, { ending_balance: -1 }, db)).toThrow(/ERR_STATEMENT_RECONCILED_LOCKED/);
    expect(() => bankStatementUpdate(999999, { ending_balance: 1 }, db)).toThrow(/ERR_STATEMENT_NOT_FOUND/);
  });
});

describe('BALSET-004 a card is judged as the amount owed', () => {
  it('reports owedView and the source, and clears when the owed figures agree', () => {
    const id = account();
    importCard(id);
    markCounted(id);
    const before = bankReconcilePreview(id, '2026-08-05', db);
    expect(before).toMatchObject({ owedView: true, accountType: 'credit_card', balanceSource: 'none' });
    expect(before.biqBalance).toBe(-179.18);       // stored signed: owes 179.18
    expect(before.ecart).toBe(179.18);
    bankStatementUpdate(before.statementId, { ending_balance: -179.18 }, db);
    expect(bankReconcilePreview(id, '2026-08-05', db)).toMatchObject({ ecart: 0, balanceSource: 'user' });

    const chq = account({ type: 'bank', coa: '1010' });
    bankStatementImport({ bankAccountId: chq, fileText: 'Date,Description,Amount\n2026-07-10,RENT,-1200.00\n', fileName: 'c.csv', fileType: 'csv' }, db);
    expect(bankReconcilePreview(chq, '2026-08-05', db).owedView).toBe(false);
  });
});

describe('BALSET-005 an opening balance dated too late', () => {
  it('is reported with both dates', () => {
    // A first import now moves a late date back by itself (OPENDATE-001), so
    // the warning is for a date set too late afterwards.
    const id = account({ openingDate: '2026-07-01' });
    importCard(id);
    db.prepare(`UPDATE bank_accounts SET opening_date='2026-09-17' WHERE id=?`).run(id);
    expect(bankReconcilePreview(id, '2026-08-05', db)).toMatchObject({
      openingDateAfterFirstLine: true, openingDate: '2026-09-17', firstLineDate: '2026-07-10',
    });
    const ok = account({ openingDate: '2026-07-01' });
    importCard(ok, { fileName: 'd.csv' });
    expect(bankReconcilePreview(ok, '2026-08-05', db).openingDateAfterFirstLine).toBe(false);
  });
});

describe('BALSET-006 the screen', () => {
  it('offers the edit, converts a card both ways, and warns when nothing is set', () => {
    const BANQUE = fs.readFileSync(path.join(ROOT, 'src/components/BanqueTab.jsx'), 'utf8');
    expect(BANQUE).toMatch(/const toStored = \(entered, acc\) => \(owedAccount\(acc\) \? -Math\.abs\(Number\(entered\)\) : Number\(entered\)\)/);
    expect(BANQUE).toMatch(/const toShown = \(stored, acc\) =>/);
    expect(BANQUE).toMatch(/bank\.statement\.update\(stmt\.id, \{ ending_balance: toStored\(entered, selectedAccount\) \}\)/);
    expect(BANQUE).toMatch(/recPreview\.balanceUnset &&/);
    expect(BANQUE).toMatch(/recPreview\.openingDateAfterFirstLine &&/);
    expect(BANQUE).toMatch(/owedView \? T\.stmtBalanceOwed : T\.stmtBalance/);
  });
});

describe('BALSET-007 to the cent', () => {
  it('no float dust in the balance, and a cleared variance is plain zero', () => {
    const id = account();
    importCard(id);
    markCounted(id);
    const p1 = bankReconcilePreview(id, '2026-08-05', db);
    expect(p1.biqBalance).toBe(-179.18);
    bankStatementUpdate(p1.statementId, { ending_balance: -179.18 }, db);
    const p2 = bankReconcilePreview(id, '2026-08-05', db);
    expect(p2.ecart).toBe(0);
    expect(Object.is(p2.ecart, -0)).toBe(false);
  });
});

describe('BALSET-008 a statement imported before this was tracked', () => {
  it('reads as unset, not as a real zero, and blocks the close until set', () => {
    const id = account();
    importCard(id);
    markCounted(id);
    // As an older install left it: a zero with no source recorded.
    db.prepare(`UPDATE bank_statements SET ending_balance_source=NULL WHERE bank_account_id=?`).run(id);
    const p = bankReconcilePreview(id, '2026-08-05', db);
    expect(p).toMatchObject({ balanceUnset: true, balanceSource: 'unknown' });
    const [st] = require('../../../db/database.js').bankReconciliationStatus(db);
    expect(st.blockers).toContain('balance_not_set');
    expect(st.canClose).toBe(false);

    bankStatementUpdate(p.statementId, { ending_balance: -179.18 }, db);
    expect(bankReconcilePreview(id, '2026-08-05', db)).toMatchObject({ balanceUnset: false, ecart: 0 });
  });

  it('a genuine zero that someone set is respected', () => {
    const id = account();
    importCard(id);
    markCounted(id);
    const p = bankReconcilePreview(id, '2026-08-05', db);
    bankStatementUpdate(p.statementId, { ending_balance: 0 }, db);
    expect(bankReconcilePreview(id, '2026-08-05', db)).toMatchObject({ balanceUnset: false, balanceSource: 'user' });
  });
});

describe('BALSET-009 a card opening balance is entered as what was owed', () => {
  it('the screen converts both ways', () => {
    const BANQUE = fs.readFileSync(path.join(ROOT, 'src/components/BanqueTab.jsx'), 'utf8');
    expect(BANQUE).toMatch(/opening_balance: String\(toShown\(acc\.opening_balance, acc\)\)/);
    expect(BANQUE).toMatch(/opening_balance: toStored\(parseFloat\(accountForm\.opening_balance\) \|\| 0, \{ account_type: accountForm\.account_type \}\)/);
    expect(BANQUE).toMatch(/owedAccount\(\{ account_type: accountForm\.account_type \}\) \? T\.openingBalanceOwed : T\.openingBalance/);
    expect(BANQUE).toMatch(/\{T\.openingHintOwed\}/);
  });
});
