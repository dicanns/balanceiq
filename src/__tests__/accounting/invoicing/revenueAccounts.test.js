/**
 * REVACC-001  each invoice line goes to its product category's revenue account
 * REVACC-002  the pieces add up exactly to the revenue, discounts shared by value
 * REVACC-003  nothing configured, or a bad account, keeps the default sales account
 * REVACC-004  a chain's remittance deduction goes to Sales returns and allowances
 * REVACC-005  a deposit booked to revenue with tax included: the tax is collected
 *
 * An invoice with a royalties line and a sauce line earns revenue of two kinds.
 * The category each product belongs to says which; the invoice is split when it
 * is posted, and the payment later only clears the receivable. A business that
 * never sets a category account sees exactly what it saw before: one sales account.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { revenueByAccount, allocateCents, planRevenue, DEFAULT_REVENUE_ACCOUNT } from '../../../utils/revenueSplit.mjs';
import { buildAccountingDb } from '../helpers/testSchema.js';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { bankTransactionCategorize, taxPeriodCompute } = require('../../../db/database.js');

const accounts = [
  { id: 1, account_number: '4000', type: 'revenue' },
  { id: 2, account_number: '4025', type: 'revenue' },
  { id: 3, account_number: '4050', type: 'revenue' },
  { id: 4, account_number: '4100', type: 'revenue' },
  { id: 5, account_number: '6100', type: 'expense' },
  { id: 6, account_number: '4070', type: 'revenue', is_archived: 1 },
];
const categories = [
  { id: 'cRoy', compteRevenu: '4050' }, { id: 'cRet', compteRevenu: '4000' }, { id: 'cMgmt', compteRevenu: '4025' },
  { id: 'cBad', compteRevenu: '6100' }, { id: 'cOld', compteRevenu: '4070' }, { id: 'cNone', compteRevenu: '' },
];
const produits = [
  { id: 'pRoy', categorieId: 'cRoy' }, { id: 'pMayo', categorieId: 'cRet' }, { id: 'pMgmt', categorieId: 'cMgmt' },
  { id: 'pBad', categorieId: 'cBad' }, { id: 'pOld', categorieId: 'cOld' }, { id: 'pNone', categorieId: 'cNone' },
];
const ctx = { accounts, produits, categories };
const line = (produitId, prix, extra = {}) => ({ produitId, quantite: 1, prixUnitaire: prix, ...extra });

describe('REVACC-001 split by category account', () => {
  it('a royalties line and a sauce line post to two accounts', () => {
    const plan = planRevenue({ lignes: [line('pRoy', 1000), line('pMayo', 500)] }, 150000, ctx);
    expect(plan).toEqual([{ account_id: 3, cents: 100000 }, { account_id: 1, cents: 50000 }]);
  });

  it('several lines of the same kind are added together', () => {
    const plan = planRevenue({ lignes: [line('pMayo', 200), line('pMgmt', 6000), line('pMayo', 300)] }, 650000, ctx);
    expect(plan).toEqual([{ account_id: 2, cents: 600000 }, { account_id: 1, cents: 50000 }]);
  });
});

describe('REVACC-002 the pieces add up exactly', () => {
  it('rounding cents land on the largest remainders', () => {
    const out = allocateCents([{ account: 'a', amount: 1 }, { account: 'b', amount: 1 }, { account: 'c', amount: 1 }], 100);
    expect(out.reduce((s, o) => s + o.cents, 0)).toBe(100);
  });

  it('a subtotal discount is shared by value, and line discounts count', () => {
    const parts = revenueByAccount([line('pRoy', 1000), line('pMayo', 500, { remise: 100, remiseType: '$' })],
      { remiseGlobale: 10 }, (l) => (l.produitId === 'pRoy' ? '4050' : '4000'));
    expect(parts).toEqual([{ account: '4050', amount: 900 }, { account: '4000', amount: 360 }]);
  });

  it('the revenue the ledger split gives is what is spread, cent for cent', () => {
    const plan = planRevenue({ lignes: [line('pRoy', 333.33), line('pMayo', 666.67)] }, 100001, ctx);
    expect(plan.reduce((s, p) => s + p.cents, 0)).toBe(100001);
  });
});

describe('REVACC-003 the default stays the default', () => {
  it('no lines passed (older callers) books everything to 4000', () => {
    expect(planRevenue({}, 5000, ctx)).toEqual([{ account_id: 1, cents: 5000 }]);
  });

  it('a line with no product, an empty category, a non-revenue or archived account all go to 4000', () => {
    const plan = planRevenue({ lignes: [line(null, 10), line('pNone', 20), line('pBad', 30), line('pOld', 40)] }, 10000, ctx);
    expect(plan).toEqual([{ account_id: 1, cents: 10000 }]);
    expect(DEFAULT_REVENUE_ACCOUNT).toBe('4000');
  });
});

describe('REVACC-004 remittance deductions', () => {
  it('go to 4100 whatever the lines say', () => {
    expect(planRevenue({ deduction: true, lignes: [line('pMayo', 50)] }, 5000, ctx)).toEqual([{ account_id: 4, cents: 5000 }]);
  });
});

describe('REVACC-005 a sale with no invoice, tax included', () => {
  let db;
  beforeEach(() => {
    db = buildAccountingDb();
    for (const [num, name, type] of [['1010', 'Cash', 'asset'], ['2100', 'GST payable', 'liability'], ['2110', 'QST payable', 'liability'],
      ['1400', 'GST rec', 'asset'], ['1410', 'QST rec', 'asset'], ['4000', 'Sales', 'revenue'], ['4900', 'Interest', 'revenue']]) {
      db.prepare(`INSERT OR IGNORE INTO chart_of_accounts (account_number, name_fr, name_en, type, itc_pct) VALUES (?,?,?,?,100)`).run(num, name, name, type);
    }
  });
  afterEach(() => { db?.close(); db = null; });
  const acc = (n) => db.prepare(`SELECT * FROM chart_of_accounts WHERE account_number=?`).get(n);
  const bal = (n) => db.prepare(`SELECT COALESCE(SUM(jl.debit_cents - jl.credit_cents),0) AS c FROM journal_lines jl
    JOIN journal_entries je ON je.id = jl.entry_id AND je.status IN ('posted','reversed') WHERE jl.account_id=?`).get(acc(n).id).c;
  function deposit(amount, date, description) {
    const bank = db.prepare(`INSERT INTO bank_accounts (name, account_type, coa_account_id, opening_balance, opening_date) VALUES ('Chq','bank',?,0,'2026-01-01')`).run(acc('1010').id).lastInsertRowid;
    return db.prepare(`INSERT INTO bank_transactions (bank_account_id, transaction_date, description, amount) VALUES (?,?,?,?)`).run(bank, date, description, amount).lastInsertRowid;
  }

  it('books the sale net and the tax as owed, and the return counts it', () => {
    const tx = deposit(1149.75, '2026-11-20', 'LICENSEE ROYALTIES');
    bankTransactionCategorize(tx, acc('4000').id, null, { tpsPaid: 50, tvqPaid: 99.75 }, db);
    expect(bal('4000')).toBe(-100000);
    expect(bal('2100')).toBe(-5000);
    expect(bal('2110')).toBe(-9975);
    expect(bal('1400')).toBe(0);
    const t = taxPeriodCompute('2026-10-01', '2026-12-31', db);
    expect(t.tpsCollectedFromBank).toBeCloseTo(50, 6);
    expect(t.tvqCollectedFromBank).toBeCloseTo(99.75, 6);
    expect(t.tpsCollected).toBeCloseTo(50, 6);
    expect(t.supplies).toBeCloseTo(1000, 6);
    expect(t.tpsCti).toBe(0);
  });

  it('a revenue deposit with no tax (bank interest, a zero-rated sale) changes nothing on the return', () => {
    const tx = deposit(59.82, '2026-11-29', 'INTEREST');
    bankTransactionCategorize(tx, acc('4900').id, null, {}, db);
    const t = taxPeriodCompute('2026-10-01', '2026-12-31', db);
    expect(t.supplies).toBe(0);
    expect(t.tpsCollected).toBe(0);
  });
});
