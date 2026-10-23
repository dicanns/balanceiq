/**
 * BADDEBT-001  the tax inside an unpaid balance is its share of the invoice's tax
 * BADDEBT-002  a write-off moves the receivable to bad debts and takes the tax back
 * BADDEBT-003  the tax return shows the write-off, and a later recovery, in their own periods
 * BADDEBT-004  posting twice books once; amounts that do not add up are refused
 * BADDEBT-005  a written-off invoice is closed everywhere and cash reports ignore it
 *
 * A customer who will not pay leaves a receivable that is not worth anything, and
 * GST/QST that was remitted on a sale never collected. Writing the balance off
 * moves it to an expense and takes the tax inside it back on the return for the
 * period of the write-off (GST line 107 / QST line 207). If the customer pays
 * after all, the tax is owed again in the period of the recovery, not the one the
 * write-off was claimed on.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildAccountingDb } from '../helpers/testSchema.js';
import { createRequire } from 'module';
import { badDebtTaxShare } from '../../../utils/calculations.js';
import { statusAfterPayments } from '../../../utils/creditNotes.js';
import { accountStanding } from '../../../services/accountStanding.js';
import { WRITTEN_OFF, CLOSED_INVOICE_STATUSES, isCashPayment } from '../../../utils/invoiceStatus.mjs';

const require = createRequire(import.meta.url);
const {
  invoiceBadDebtWriteOff, invoiceBadDebtRecover, taxPeriodCompute, glDraftEntry, glPostEntry,
} = require('../../../db/database.js');

let db;
beforeEach(() => {
  db = buildAccountingDb();
  for (const [num, name, type] of [
    ['1010', 'Cash', 'asset'],
    ['1100', 'AR', 'asset'],
    ['2100', 'GST payable', 'liability'],
    ['2110', 'QST payable', 'liability'],
    ['4000', 'Sales', 'revenue'],
    ['6430', 'Bad debts', 'expense'],
  ]) {
    db.prepare(
      `INSERT OR IGNORE INTO chart_of_accounts (account_number, name_fr, name_en, type, itc_pct)
       VALUES (?,?,?,?,100)`
    ).run(num, name, name, type);
  }
});
afterEach(() => { db?.close(); db = null; });

const acc = (n) => db.prepare(`SELECT * FROM chart_of_accounts WHERE account_number=?`).get(n);
const bal = (n) => db.prepare(
  `SELECT COALESCE(SUM(jl.debit_cents - jl.credit_cents), 0) AS c
   FROM journal_lines jl JOIN journal_entries je ON je.id = jl.entry_id AND je.status IN ('posted','reversed')
   WHERE jl.account_id = ?`
).get(acc(n).id).c;

// A $1,000 royalty invoice: $50 GST, $99.75 QST, $1,149.75 owed.
function postInvoice(id = 'inv-1', date = '2026-07-31') {
  const { entryId } = glDraftEntry({
    entry_date: date, description: `Facture ${id}`, source_type: 'invoice', source_id: id,
    lines: [
      { account_id: acc('1100').id, debit_cents: 114975, credit_cents: 0 },
      { account_id: acc('4000').id, debit_cents: 0, credit_cents: 100000 },
      { account_id: acc('2100').id, debit_cents: 0, credit_cents: 5000 },
      { account_id: acc('2110').id, debit_cents: 0, credit_cents: 9975 },
    ],
  }, db);
  glPostEntry(entryId, db);
}
const FULL = badDebtTaxShare({ writtenOff: 1149.75, total: 1149.75, tps: 50, tvq: 99.75 });

describe('BADDEBT-001 the tax share', () => {
  it('the whole balance unpaid takes back all the tax', () => {
    expect(FULL).toEqual({ amountCents: 114975, tpsCents: 5000, tvqCents: 9975, netCents: 100000 });
  });

  it('a partly paid invoice takes back the tax on what is left', () => {
    const s = badDebtTaxShare({ writtenOff: 574.88, total: 1149.75, tps: 50, tvq: 99.75 });
    expect(s.tpsCents).toBe(2500);
    expect(s.tvqCents).toBe(4988);
    expect(s.amountCents - s.tpsCents - s.tvqCents).toBe(s.netCents);
  });

  it('a zero-rated invoice has no tax to take back', () => {
    expect(badDebtTaxShare({ writtenOff: 500, total: 500, tps: 0, tvq: 0 }).netCents).toBe(50000);
  });
});

describe('BADDEBT-002 the write-off entry', () => {
  it('clears the receivable, books the expense net of tax, and takes the tax back', () => {
    postInvoice();
    const r = invoiceBadDebtWriteOff({ writeOffId: 'bd-1', invoiceId: 'inv-1', invoiceNumber: 'F-0001', date: '2026-11-15', ...FULL }, db);
    expect(r.ok).toBe(true);
    expect(bal('1100')).toBe(0);
    expect(bal('6430')).toBe(100000);
    expect(bal('2100')).toBe(0);
    expect(bal('2110')).toBe(0);
  });
});

describe('BADDEBT-003 the tax return', () => {
  it('the write-off quarter shows the tax taken back; the original quarter is untouched', () => {
    postInvoice();
    invoiceBadDebtWriteOff({ writeOffId: 'bd-1', invoiceId: 'inv-1', date: '2026-11-15', ...FULL }, db);
    const q3 = taxPeriodCompute('2026-07-01', '2026-09-30', db);
    expect(q3.tpsCollected).toBeCloseTo(50, 6);
    expect(q3.tpsBadDebtWrittenOff).toBe(0);
    const q4 = taxPeriodCompute('2026-10-01', '2026-12-31', db);
    expect(q4.tpsBadDebtWrittenOff).toBeCloseTo(50, 6);
    expect(q4.tvqBadDebtWrittenOff).toBeCloseTo(99.75, 6);
    expect(q4.netTpsOwed).toBeCloseTo(-50, 6);
    expect(q4.netTvqOwed).toBeCloseTo(-99.75, 6);
  });

  it('a recovery the next quarter puts the tax back there', () => {
    postInvoice();
    invoiceBadDebtWriteOff({ writeOffId: 'bd-1', invoiceId: 'inv-1', date: '2026-11-15', ...FULL }, db);
    const r = invoiceBadDebtRecover({ writeOffId: 'bd-1', invoiceId: 'inv-1', date: '2027-02-10' }, db);
    expect(r.ok).toBe(true);
    expect(bal('1100')).toBe(114975);
    expect(bal('6430')).toBe(0);
    const q1 = taxPeriodCompute('2027-01-01', '2027-03-31', db);
    expect(q1.tpsBadDebtRecovered).toBeCloseTo(50, 6);
    expect(q1.tvqBadDebtRecovered).toBeCloseTo(99.75, 6);
    expect(q1.netTpsOwed).toBeCloseTo(50, 6);
    // Q4 keeps the write-off it claimed.
    expect(taxPeriodCompute('2026-10-01', '2026-12-31', db).tpsBadDebtWrittenOff).toBeCloseTo(50, 6);
  });
});

describe('BADDEBT-004 safeguards', () => {
  it('posting the same write-off twice books it once', () => {
    postInvoice();
    const a = invoiceBadDebtWriteOff({ writeOffId: 'bd-1', invoiceId: 'inv-1', date: '2026-11-15', ...FULL }, db);
    const b = invoiceBadDebtWriteOff({ writeOffId: 'bd-1', invoiceId: 'inv-1', date: '2026-11-15', ...FULL }, db);
    expect(b.alreadyPosted).toBe(true);
    expect(b.entryId).toBe(a.entryId);
    expect(bal('6430')).toBe(100000);
  });

  it('tax larger than the balance is refused and nothing is posted', () => {
    const r = invoiceBadDebtWriteOff({ writeOffId: 'bd-2', invoiceId: 'inv-1', date: '2026-11-15', amountCents: 1000, tpsCents: 900, tvqCents: 900 }, db);
    expect(r.ok).toBe(false);
    expect(bal('6430')).toBe(0);
  });

  it('a recovery with no write-off is refused', () => {
    expect(invoiceBadDebtRecover({ writeOffId: 'nope', date: '2027-01-01' }, db).ok).toBe(false);
  });
});

describe('BADDEBT-005 the invoice afterwards', () => {
  const inv = {
    id: 'inv-1', clientId: 'c1', statut: WRITTEN_OFF, dateEcheance: '2026-08-30', documentType: 'facture',
    paiements: [{ id: 'bd-1', montant: 1149.75, badDebt: true, date: '2026-11-15' }],
  };

  it('stays written off when its payments are recounted', () => {
    expect(statusAfterPayments(inv, 1149.75, 'Envoyée')).toBe(WRITTEN_OFF);
  });

  it('is closed, so it ages nowhere and owes nothing', () => {
    expect(CLOSED_INVOICE_STATUSES).toContain(WRITTEN_OFF);
    const st = accountStanding({ clientId: 'c1', factures: [inv], creditNotes: [], asOf: '2026-12-01', totalOf: () => 1149.75 });
    expect(st.outstanding).toBe(0);
  });

  it('is not money received', () => {
    expect(isCashPayment(inv.paiements[0])).toBe(false);
    expect(isCashPayment({ montant: 10 })).toBe(true);
    expect(isCashPayment({ montant: 10, fromCredit: true })).toBe(false);
  });
});
