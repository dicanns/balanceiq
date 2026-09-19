/**
 * REFUND-001  money in against an expense (a refund) gives back the tax claimed
 * REFUND-002  money in against revenue still captures no tax: the invoice did
 * REFUND-003  the categorize screen offers the tax fields for a refund
 * PDFST-008   a box of text beside the table does not split a transaction's line
 *
 * Figures, merchants and layouts are invented.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'module';
import { buildAccountingDb } from '../helpers/testSchema.js';
import { parseStatementPdf } from '../../../utils/statementPdf.mjs';

const require = createRequire(import.meta.url);
const { bankPostMissingEntries } = require('../../../db/database.js');
const ROOT = path.resolve(__dirname, '../../../..');

let db;
beforeEach(() => {
  db = buildAccountingDb();
  for (const [num, name, type] of [
    ['2210', 'Card', 'liability'], ['6100', 'Supplies', 'expense'], ['4000', 'Sales', 'revenue'],
    ['1400', 'GST receivable', 'asset'], ['1410', 'QST receivable', 'asset'],
  ]) db.prepare(`INSERT OR IGNORE INTO chart_of_accounts (account_number, name_fr, name_en, type) VALUES (?,?,?,?)`).run(num, name, name, type);
});
afterEach(() => { db?.close(); db = null; });

const coa = (n) => db.prepare(`SELECT id FROM chart_of_accounts WHERE account_number=?`).get(n).id;
const lineOn = (target, amount, tps, tvq) => {
  const acct = db.prepare(`INSERT INTO bank_accounts (name, account_type, coa_account_id, opening_balance, opening_date) VALUES ('Sample Card','credit_card',?,0,'2026-08-01')`).run(coa('2210')).lastInsertRowid;
  db.prepare(`INSERT INTO bank_transactions (bank_account_id, transaction_date, description, amount, match_status, coa_account_id, tps_paid, tvq_paid)
              VALUES (?, '2026-08-20', 'SAMPLE STORE REFUND', ?, 'manual', ?, ?, ?)`).run(acct, amount, coa(target), tps, tvq);
  bankPostMissingEntries(acct, db);
};
const net = (num) => db.prepare(
  `SELECT COALESCE(SUM(jl.debit_cents),0) - COALESCE(SUM(jl.credit_cents),0) AS b FROM journal_lines jl
     JOIN journal_entries je ON je.id=jl.entry_id AND je.status='posted' WHERE jl.account_id=?`
).get(coa(num)).b;

describe('REFUND-001 a refund of a purchase', () => {
  it('credits the expense net and takes the tax back off the claim', () => {
    lineOn('6100', 57.49, 2.50, 4.99);
    expect(net('2210')).toBe(5749);     // what is owed on the card goes down
    expect(net('6100')).toBe(-5000);
    expect(net('1400')).toBe(-250);
    expect(net('1410')).toBe(-499);
  });
});

describe('REFUND-002 a customer paying', () => {
  it('captures no tax, whatever was typed', () => {
    lineOn('4000', 57.49, 2.50, 4.99);
    expect(net('4000')).toBe(-5749);
    expect(net('1400')).toBe(0);
    expect(net('1410')).toBe(0);
  });
});

describe('REFUND-003 the categorize screen', () => {
  it('shows the tax fields for money in against an expense, with its own hint', () => {
    const s = fs.readFileSync(path.join(ROOT, 'src/components/BanqueTab.jsx'), 'utf8');
    expect(s).toMatch(/const refund = Number\(categorizingTx\.amount\) > 0 && \(chosenType === 'expense' \|\| chosenType === 'cogs'\)/);
    expect(s).toMatch(/return \(Number\(categorizingTx\.amount\) < 0 \|\| refund\) && !catTransfer/);
    expect((s.match(/\btaxRefundHint:/g) || []).length).toBe(2);
  });
});

describe('PDFST-008 a box beside the table', () => {
  // As TD prints it: the interest-rate box in a larger font, its baseline a few
  // points above the transaction beside it; the description in a smaller font.
  const items = [
    { str: 'STATEMENT PERIOD:', x: 47, y: 60, w: 80, h: 8, page: 1 },
    { str: 'Aug 06, 2026 to Sep 05, 2026', x: 130, y: 60, w: 120, h: 8, page: 1 },
    ...[['DATE', 49], ['DATE', 97], ['ACTIVITY', 140], ['DESCRIPTION', 170], ['AMOUNT($)', 309]].map(([str, x]) => ({ str, x, y: 190, w: str === 'AMOUNT($)' ? 35 : 30, h: 8, page: 1 })),
    { str: 'PREVIOUS STATEMENT BALANCE', x: 140, y: 205, w: 110, h: 8, page: 1 },
    { str: '$20.00', x: 316, y: 205, w: 28, h: 8, page: 1 },
    ...['Annual', 'Interest', 'Rate:'].map((str, i) => ({ str, x: 361 + i * 30, y: 227.4, w: 25, h: 9.6, page: 1 })),
    { str: 'AUG 23', x: 47, y: 231, w: 25, h: 8, page: 1 },
    { str: 'AUG 24', x: 95, y: 231, w: 25, h: 8, page: 1 },
    { str: '-$20.00', x: 316, y: 231, w: 28, h: 8, page: 1 },
    { str: 'PAYMENT - THANK YOU', x: 140, y: 232, w: 90, h: 7, page: 1 },
    { str: 'AUG 26', x: 47, y: 250, w: 25, h: 8, page: 1 },
    { str: 'AUG 27', x: 95, y: 250, w: 25, h: 8, page: 1 },
    { str: '$9.50', x: 322, y: 250, w: 22, h: 8, page: 1 },
    { str: 'SAMPLE PARKING', x: 140, y: 251, w: 70, h: 7, page: 1 },
    { str: 'TOTAL NEW BALANCE', x: 140, y: 280, w: 80, h: 8, page: 1 },
    { str: '$9.50', x: 316, y: 280, w: 28, h: 8, page: 1 },
  ];
  it('keeps each description on its own line of the table', () => {
    const r = parseStatementPdf(items);
    expect(r.rows.map(x => [x.date, x.description, x.delta, x.note])).toEqual([
      ['2026-08-23', 'PAYMENT - THANK YOU', -20, ''],
      ['2026-08-26', 'SAMPLE PARKING', 9.5, ''],
    ]);
    expect(r.check.ok).toBe(true);
  });
});
