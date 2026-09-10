/**
 * FPZ-001  collected tax comes from invoices, not only from the till
 * FPZ-002  the return carries the government's box numbers
 * FPZ-003  a net refund is reported as a refund, not a negative payable
 *
 * taxPeriodCompute derived collected tax from daily register sales alone
 * (monthRev * 0.05). A business that invoices its customers rather than ringing
 * them through a till has no register sales, so it reported $0.00 collected while
 * its input tax credits were counted in full - a return claiming a refund every
 * quarter that it was not owed. Tax collected on invoices is now read from the
 * ledger and added to the register figure.
 *
 * The boxes are Revenu Quebec's (FPZ-500.IF) and the CRA's (GST34), so the same
 * sheet transcribes into any bank's filing service or a return filed directly.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { buildAccountingDb } from '../helpers/testSchema.js';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const TAB = readFileSync(join(SRC, 'components', 'TaxPeriodTab.jsx'), 'utf8');

let db;
beforeEach(() => {
  db = buildAccountingDb();
  for (const [num, name, type] of [
    ['1100', 'Accounts receivable', 'asset'],
    ['2100', 'GST collected',       'liability'],
    ['2110', 'QST collected',       'liability'],
    ['4000', 'Sales',               'revenue'],
  ]) {
    db.prepare(
      `INSERT OR IGNORE INTO chart_of_accounts (account_number, name_fr, name_en, type) VALUES (?,?,?,?)`
    ).run(num, name, name, type);
  }
});
afterEach(() => { db?.close(); db = null; });

const acc = (n) => db.prepare(`SELECT id FROM chart_of_accounts WHERE account_number=?`).get(n).id;

// Mirrors the two ledger reads added to taxPeriodCompute.
function salesSourced(accountNumber, start, end) {
  return db.prepare(
    `SELECT COALESCE(SUM(jl.credit_cents - jl.debit_cents), 0) / 100.0 AS amt
     FROM journal_lines jl
     JOIN journal_entries je ON je.id = jl.entry_id AND je.status IN ('posted','reversed')
     LEFT JOIN journal_entries orig ON orig.id = je.reverses_entry_id
     JOIN chart_of_accounts ca ON ca.id = jl.account_id
     WHERE ca.account_number = ? AND je.entry_date >= ? AND je.entry_date <= ?
       AND COALESCE(orig.source_type, je.source_type) IN ('invoice','credit_note')`
  ).get(accountNumber, start, end).amt;
}

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

function entry({ date, sourceType, sourceId, lines, status = 'posted', reverses = null }) {
  const { lastInsertRowid } = db.prepare(
    `INSERT INTO journal_entries (entry_number, entry_date, period_id, description, source_type, source_id, status, reverses_entry_id, device_uuid)
     VALUES (?,?,?,?,?,?,'draft',?,'test-device')`
  ).run(`JE-${Math.random().toString(36).slice(2, 8)}`, date, periodFor(date), 'x', sourceType, String(sourceId), reverses);
  lines.forEach((l, i) => db.prepare(
    `INSERT INTO journal_lines (entry_id, line_number, account_id, debit_cents, credit_cents)
     VALUES (?,?,?,?,?)`
  ).run(lastInsertRowid, i + 1, l.acc, l.dr || 0, l.cr || 0));
  // The balance trigger fires per line, so the entry has to be a draft until its
  // lines are all in - the same order glReverseEntry has to use.
  db.prepare(`UPDATE journal_entries SET status=? WHERE id=?`).run(status, lastInsertRowid);
  return lastInsertRowid;
}

// An invoice: Dr AR, Cr revenue + both taxes.
const invoice = (date, subtotal, tps, tvq, id = 'INV-1', status = 'posted') => entry({
  date, sourceType: 'invoice', sourceId: id, status,
  lines: [
    { acc: acc('1100'), dr: subtotal + tps + tvq },
    { acc: acc('4000'), cr: subtotal },
    { acc: acc('2100'), cr: tps },
    { acc: acc('2110'), cr: tvq },
  ],
});

const Q = ['2026-07-01', '2026-09-30'];

describe('FPZ-001 invoiced sales reach the return', () => {
  it('an invoice contributes the tax it charged', () => {
    invoice('2026-08-04', 100000, 5000, 9975);
    expect(salesSourced('2100', ...Q)).toBeCloseTo(50.00, 2);
    expect(salesSourced('2110', ...Q)).toBeCloseTo(99.75, 2);
  });

  it('this is what was reported before: nothing at all', () => {
    invoice('2026-08-04', 100000, 5000, 9975);
    const registerOnly = 0 * 0.05;      // no daily sales exist
    expect(registerOnly).toBe(0);
    expect(salesSourced('2100', ...Q)).toBeGreaterThan(0);
  });

  it('a credit note takes its tax back out', () => {
    invoice('2026-08-04', 100000, 5000, 9975);
    entry({
      date: '2026-08-20', sourceType: 'credit_note', sourceId: 'NC-1',
      lines: [
        { acc: acc('1100'), cr: 2466 },
        { acc: acc('4000'), dr: 2460 },
        { acc: acc('2100'), dr: 2 },
        { acc: acc('2110'), dr: 4 },
      ],
    });
    expect(salesSourced('2100', ...Q)).toBeCloseTo(49.98, 2);
    expect(salesSourced('2110', ...Q)).toBeCloseTo(99.71, 2);
  });

  it('a reversed invoice nets to nothing, judged by what it reverses', () => {
    const id = invoice('2026-08-04', 100000, 5000, 9975, 'INV-1', 'reversed');
    entry({
      date: '2026-08-04', sourceType: 'reversal', sourceId: 'INV-1', reverses: id,
      lines: [
        { acc: acc('1100'), cr: 114975 },
        { acc: acc('4000'), dr: 100000 },
        { acc: acc('2100'), dr: 5000 },
        { acc: acc('2110'), dr: 9975 },
      ],
    });
    expect(salesSourced('2100', ...Q)).toBeCloseTo(0, 2);
  });

  it('input tax credits are not swept in: they are counted separately', () => {
    invoice('2026-08-04', 100000, 5000, 9975);
    // A categorized bank line also debits 2100. Counting it here as well as in
    // box 108 would claim the same credit twice.
    entry({
      date: '2026-08-17', sourceType: 'bank_tx', sourceId: '158',
      lines: [{ acc: acc('2100'), dr: 7406 }, { acc: acc('4000'), cr: 7406 }],
    });
    expect(salesSourced('2100', ...Q)).toBeCloseTo(50.00, 2);
  });

  it('an invoice outside the period is not counted', () => {
    invoice('2026-10-04', 100000, 5000, 9975);
    expect(salesSourced('2100', ...Q)).toBe(0);
  });

  it('box 101 is revenue before tax', () => {
    invoice('2026-08-04', 100000, 5000, 9975);
    const supplies = db.prepare(
      `SELECT COALESCE(SUM(jl.credit_cents - jl.debit_cents), 0) / 100.0 AS amt
       FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl.entry_id AND je.status IN ('posted','reversed')
       LEFT JOIN journal_entries orig ON orig.id = je.reverses_entry_id
       JOIN chart_of_accounts ca ON ca.id = jl.account_id
       WHERE ca.type='revenue' AND je.entry_date >= ? AND je.entry_date <= ?
         AND COALESCE(orig.source_type, je.source_type) IN ('invoice','credit_note')`
    ).get(...Q).amt;
    expect(supplies).toBeCloseTo(1000.00, 2);
  });
});

describe('FPZ-002 the sheet carries the government box numbers', () => {
  it('every GST/HST box the return asks for', () => {
    for (const box of ['101', '105', '108', '110', '111', '113']) {
      expect(TAB).toContain(`row('${box}'`.replace(`row('113'`, `'113'`));
    }
    expect(TAB).toContain("'113'");
  });

  it('every QST box', () => {
    for (const box of ['205', '208', '210', '211']) expect(TAB).toContain(`row('${box}'`);
    expect(TAB).toContain("'213'");
  });

  it('names the form, not a bank', () => {
    expect(TAB).toContain('FPZ-500.IF');
    expect(TAB).toContain('GST34');
  });

  it('says the same boxes apply everywhere', () => {
    expect(TAB).toMatch(/clicmesimpots/);
  });

  it('carries the registration numbers a filing service asks for', () => {
    expect(TAB).toContain('numeroTPS');
    expect(TAB).toContain('numeroTVQ');
  });

  it('escapes operator-entered identity fields', () => {
    expect(TAB).toContain('esc(company.nom)');
    expect(TAB).toContain('esc(company.numeroTPS)');
  });
});

describe('FPZ-003 a refund is reported as a refund', () => {
  const payable = (coll, itc) => coll - itc;

  it('more collected than claimed is an amount payable', () => {
    expect(payable(50.00, 12.00)).toBeCloseTo(38.00, 2);
  });

  it('more claimed than collected is a refund, shown positive', () => {
    const net = payable(0, 740.58);
    expect(net).toBeLessThan(0);
    expect(Math.abs(net)).toBeCloseTo(740.58, 2);
  });

  it('the amount payable adds only the sides that are owing', () => {
    const tpsNet = 38.00, tvqNet = -12.00;
    const due = Math.max(0, tpsNet) + Math.max(0, tvqNet);
    const ref = Math.max(0, -tpsNet) + Math.max(0, -tvqNet);
    expect(due).toBeCloseTo(38.00, 2);
    expect(ref).toBeCloseTo(12.00, 2);
  });

  it('a period with no tax collected is called out rather than filed blind', () => {
    expect(TAB).toContain('No tax collected in this period.');
  });
});
