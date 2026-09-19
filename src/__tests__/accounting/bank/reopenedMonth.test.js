/**
 * RECPICK-001  a reopened older month is compared with its own statement
 * RECPICK-002  with no date given, the preview is the month to close next
 *
 * Reopening July after August was closed compared July's lines with August's
 * closing balance: a variance of the difference between the two statements,
 * and a month that could never close again. Figures are invented.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
import { buildAccountingDb } from '../helpers/testSchema.js';

const require = createRequire(import.meta.url);
const { bankStatementImport, bankReconcilePreview, bankReconcileClose } = require('../../../db/database.js');

let db, id, july, august;
beforeEach(() => {
  db = buildAccountingDb();
  db.prepare(`INSERT OR IGNORE INTO chart_of_accounts (account_number, name_fr, name_en, type) VALUES ('2210','Carte','Card','liability')`).run();
  id = db.prepare(
    `INSERT INTO bank_accounts (name, account_type, coa_account_id, opening_balance, opening_date)
     VALUES ('Sample Card','credit_card',(SELECT id FROM chart_of_accounts WHERE account_number='2210'),-50,'2026-07-06')`
  ).run().lastInsertRowid;
  const imp = (start, end, bal, csv) => bankStatementImport(
    { bankAccountId: id, fileText: csv, fileName: `${start}.csv`, fileType: 'csv', periodStart: start, periodEnd: end, endingBalance: bal }, db
  ).statementId;
  july = imp('2026-07-07', '2026-08-05', -60, '07/20/2026,SAMPLE CAFE,10.00\n');
  august = imp('2026-08-06', '2026-09-05', -45, '08/10/2026,PAYMENT - THANK YOU,-60.00\n08/20/2026,SAMPLE STORE,45.00\n');
  // Categorized, as the operator would.
  db.prepare(`UPDATE bank_transactions SET match_status='manual' WHERE bank_account_id=?`).run(id);
});
afterEach(() => { db?.close(); db = null; });

describe('RECPICK-001 a reopened month', () => {
  it('closes against its own closing balance while the next month is closed', () => {
    expect(bankReconcileClose(id, july, db).success).toBe(true);
    expect(bankReconcileClose(id, august, db).success).toBe(true);
    db.prepare(`UPDATE bank_statements SET reconciled=0, reconciled_at=NULL WHERE id=?`).run(july);   // reopened

    const p = bankReconcilePreview(id, '2026-08-05', db);
    expect(p).toMatchObject({ statementId: july, statementBalance: -60, biqBalance: -60, ecart: 0 });
    expect(bankReconcileClose(id, july, db).success).toBe(true);
  });
});

describe('RECPICK-002 the month to close next', () => {
  it('is the oldest still open, counted to its own end', () => {
    expect(bankReconcilePreview(id, undefined, db)).toMatchObject({ statementId: july, statementBalance: -60, biqBalance: -60 });
    bankReconcileClose(id, july, db);
    expect(bankReconcilePreview(id, undefined, db)).toMatchObject({ statementId: august, statementBalance: -45, biqBalance: -45 });
  });
});
