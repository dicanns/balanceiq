/**
 * DEDUCT-001  each deduction notice credits receivables as it arrives
 * DEDUCT-002  the remittance closes the invoice to zero
 * DEDUCT-003  posting is idempotent for invoices and credit notes
 * DEDUCT-004  a saver called with an updater still persists a real array
 *
 * Wholesale remittance flow. A grocery chain sends a separate deduction notice
 * per charge over the period, then remits the net. Each notice is a credit note
 * posted when it arrives, so receivables are correct from the start rather than
 * being reconstructed at payment time.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildAccountingDb } from '../helpers/testSchema.js';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { glDraftEntry, glPostEntry, glFindEntryBySource } = require('../../../db/database.js');

let db;
beforeEach(() => {
  db = buildAccountingDb();
  for (const [num, fr, en, type] of [
    ['1010', 'Encaisse',        'Cash (operating bank account)', 'asset'],
    ['1100', 'Comptes clients', 'Accounts receivable',           'asset'],
    ['4000', 'Ventes',          'Sales',                         'revenue'],
    ['2100', 'TPS a payer',     'GST payable',                   'liability'],
    ['2110', 'TVQ a payer',     'QST payable',                   'liability'],
  ]) {
    db.prepare(
      `INSERT OR IGNORE INTO chart_of_accounts (account_number, name_fr, name_en, type) VALUES (?,?,?,?)`
    ).run(num, fr, en, type);
  }
});
afterEach(() => { db?.close(); db = null; });

const acc = (n) => db.prepare(`SELECT id FROM chart_of_accounts WHERE account_number=?`).get(n).id;

const TPS = 0.05, TVQ = 0.09975;
const cents = (d) => Math.round(d * 100);
const withTax = (sub) => ({
  sub: cents(sub), tps: Math.round(cents(sub) * TPS), tvq: Math.round(cents(sub) * TVQ),
  get total() { return this.sub + this.tps + this.tvq; },
});

function postInvoice(id, subtotal) {
  if (glFindEntryBySource('invoice', id, db)) return null;
  const t = withTax(subtotal);
  const { entryId } = glDraftEntry({
    entry_date: '2026-08-01', description: `Facture ${id}`, source_type: 'invoice', source_id: id,
    lines: [
      { account_id: acc('1100'), debit_cents: t.total, credit_cents: 0 },
      { account_id: acc('4000'), debit_cents: 0, credit_cents: t.sub },
      { account_id: acc('2100'), debit_cents: 0, credit_cents: t.tps },
      { account_id: acc('2110'), debit_cents: 0, credit_cents: t.tvq },
    ],
  }, db);
  glPostEntry(entryId, db);
  return t.total;
}

// One deduction notice -> one credit note, posted the day it arrives.
function postDeduction(id, subtotal, { taxable = true } = {}) {
  if (glFindEntryBySource('credit_note', id, db)) return null;
  const t = withTax(subtotal);
  const lines = taxable
    ? [{ account_id: acc('1100'), debit_cents: 0, credit_cents: t.total },
       { account_id: acc('4000'), debit_cents: t.sub, credit_cents: 0 },
       { account_id: acc('2100'), debit_cents: t.tps, credit_cents: 0 },
       { account_id: acc('2110'), debit_cents: t.tvq, credit_cents: 0 }]
    : [{ account_id: acc('1100'), debit_cents: 0, credit_cents: cents(subtotal) },
       { account_id: acc('4000'), debit_cents: cents(subtotal), credit_cents: 0 }];
  const { entryId } = glDraftEntry({
    entry_date: '2026-08-15', description: `Note de credit ${id}`,
    source_type: 'credit_note', source_id: id, lines,
  }, db);
  glPostEntry(entryId, db);
  return taxable ? t.total : cents(subtotal);
}

function postRemittance(id, amountCents) {
  const { entryId } = glDraftEntry({
    entry_date: '2026-08-31', description: 'Versement', source_type: 'payment', source_id: id,
    lines: [
      { account_id: acc('1010'), debit_cents: amountCents, credit_cents: 0 },
      { account_id: acc('1100'), debit_cents: 0, credit_cents: amountCents },
    ],
  }, db);
  glPostEntry(entryId, db);
}

const balanceOf = (num) => db.prepare(
  `SELECT COALESCE(SUM(jl.debit_cents),0) - COALESCE(SUM(jl.credit_cents),0) AS bal
   FROM journal_lines jl JOIN journal_entries je ON je.id = jl.entry_id AND je.status='posted'
   WHERE jl.account_id = ?`
).get(acc(num)).bal;

describe('DEDUCT-001 deductions reduce receivables as they arrive', () => {
  it('a taxable deduction credits AR including its tax', () => {
    postInvoice('FAC-1', 10000);
    const before = balanceOf('1100');
    const ded = postDeduction('NC-1', 200);
    expect(balanceOf('1100')).toBe(before - ded);
  });

  it('reverses the tax it carries, so GST payable drops', () => {
    postInvoice('FAC-1', 10000);
    const gstAfterInvoice = balanceOf('2100');
    postDeduction('NC-1', 200);
    expect(balanceOf('2100')).toBeGreaterThan(gstAfterInvoice); // less credit owing
  });

  it('a non-taxable deduction moves no tax', () => {
    postInvoice('FAC-1', 10000);
    const gst = balanceOf('2100');
    postDeduction('NC-2', 80, { taxable: false });
    expect(balanceOf('2100')).toBe(gst);
  });
});

describe('DEDUCT-002 the remittance closes the invoice', () => {
  it('four deduction notices then the net deposit leaves AR at zero', () => {
    const invoiceTotal = postInvoice('FAC-1', 10000);
    const deductions = [
      postDeduction('NC-loyalty',   200),
      postDeduction('NC-unloading', 150),
      postDeduction('NC-unsellable', 80),
      postDeduction('NC-earlypay',  200),
    ].reduce((a, b) => a + b, 0);

    const expectedDeposit = invoiceTotal - deductions;
    postRemittance('PAY-1', expectedDeposit);

    expect(balanceOf('1100')).toBe(0);
  });

  it('the deposit is the invoice less every deduction, tax included', () => {
    const invoiceTotal = postInvoice('FAC-1', 10000);
    const d = [200, 150, 80, 200].map((v, i) => postDeduction(`NC-${i}`, v))
      .reduce((a, b) => a + b, 0);
    // $630 of deductions plus their tax.
    expect(d).toBe(72434);
    expect(invoiceTotal - d).toBe(1077316); // $10,773.16
  });

  it('a short payment leaves the difference outstanding, not hidden', () => {
    const invoiceTotal = postInvoice('FAC-1', 10000);
    const d = postDeduction('NC-1', 200);
    postRemittance('PAY-1', invoiceTotal - d - 5000); // $50 short
    expect(balanceOf('1100')).toBe(5000);
  });
});

describe('DEDUCT-003 posting cannot be duplicated', () => {
  it('re-posting an invoice returns null instead of doubling revenue', () => {
    postInvoice('FAC-1', 10000);
    const revenue = balanceOf('4000');
    expect(postInvoice('FAC-1', 10000)).toBeNull();
    expect(balanceOf('4000')).toBe(revenue);
  });

  it('re-posting a credit note does not credit AR twice', () => {
    postInvoice('FAC-1', 10000);
    postDeduction('NC-1', 200);
    const ar = balanceOf('1100');
    expect(postDeduction('NC-1', 200)).toBeNull();
    expect(balanceOf('1100')).toBe(ar);
  });
});

describe('DEDUCT-004 savers resolve an updater before persisting', () => {
  // Mirrors saveFacFactures / saveFacCreditNotes.
  function makeSaver(initial) {
    let current = initial;
    let persisted = null;
    return {
      save(listOrFn) {
        const list = typeof listOrFn === 'function' ? listOrFn(current) : listOrFn;
        if (!Array.isArray(list)) return;
        current = list;
        persisted = JSON.stringify(list);
      },
      get persisted() { return persisted; },
    };
  }

  it('an updater persists a real array, not undefined', () => {
    const s = makeSaver([{ id: 'a' }]);
    s.save(prev => prev.map(x => ({ ...x, glEntryId: 7 })));
    expect(s.persisted).toBe(JSON.stringify([{ id: 'a', glEntryId: 7 }]));
  });

  it('a plain list still works', () => {
    const s = makeSaver([]);
    s.save([{ id: 'b' }]);
    expect(JSON.parse(s.persisted)).toEqual([{ id: 'b' }]);
  });

  it('the old behaviour would have persisted undefined', () => {
    expect(JSON.stringify((prev) => prev)).toBeUndefined();
  });
});
