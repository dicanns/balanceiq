/**
 * INCSTMT-001  the statement says where the money went
 * INCSTMT-002  signs are normalised so every figure reads positive
 * INCSTMT-003  the categories a reviewer tests are their own accounts
 *
 * The app could prove the ledger added up (trial balance) and prove it matched
 * the bank (control accounts), but it could not answer the question an owner
 * actually asks: what did I spend it on. That report did not exist, so the only
 * way to see a breakdown by category was to wait for the accountant.
 *
 * 6800 also lumped travel together with meals and entertainment. Only the meals
 * half carries the 50% restriction on the deduction and on the input tax credit,
 * so with the two in one account the restricted figure could not be read off the
 * books at all - and it is the first line a reviewer tests.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildAccountingDb } from '../helpers/testSchema.js';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { incomeStatement } = require('../../../db/database.js');

let db;
const ACCOUNTS = [
  ['4000', 'Ventes',                        'Sales',                     'revenue', 0],
  ['4100', 'Remises et remboursements',     'Sales returns',             'revenue', 1],
  ['5000', 'Achats',                        'Purchases',                 'cogs',    0],
  ['6100', 'Loyer',                         'Rent',                      'expense', 0],
  ['6800', 'Déplacements',                  'Travel',                    'expense', 0],
  ['6810', 'Repas et représentation (50%)', 'Meals and entertainment',   'expense', 0],
  ['6820', 'Cadeaux et dons',               'Gifts and donations',       'expense', 0],
  ['1010', 'Encaisse',                      'Cash',                      'asset',   0],
];

beforeEach(() => {
  db = buildAccountingDb();
  for (const [num, fr, en, type, contra] of ACCOUNTS) {
    db.prepare(
      `INSERT OR IGNORE INTO chart_of_accounts (account_number, name_fr, name_en, type, is_contra)
       VALUES (?,?,?,?,?)`
    ).run(num, fr, en, type, contra);
  }
});
afterEach(() => { db?.close(); db = null; });

const acc = (n) => db.prepare(`SELECT id FROM chart_of_accounts WHERE account_number=?`).get(n).id;

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

// The balance trigger fires per line, so the entry stays a draft until its lines
// are all in - the same order glReverseEntry has to use.
function post(date, lines) {
  const { lastInsertRowid } = db.prepare(
    `INSERT INTO journal_entries (entry_number, entry_date, period_id, description, source_type, source_id, status, device_uuid)
     VALUES (?,?,?,'x','manual','m','draft','test-device')`
  ).run(`JE-${Math.random().toString(36).slice(2, 8)}`, date, periodFor(date));
  lines.forEach((l, i) => db.prepare(
    `INSERT INTO journal_lines (entry_id, line_number, account_id, debit_cents, credit_cents)
     VALUES (?,?,?,?,?)`
  ).run(lastInsertRowid, i + 1, acc(l.a), l.dr || 0, l.cr || 0));
  db.prepare(`UPDATE journal_entries SET status='posted' WHERE id=?`).run(lastInsertRowid);
}

const Y = ['2026-01-01', '2026-12-31'];
const run = () => incomeStatement(...Y, { _db: db });
const line = (r, num) => r.lines.find(l => l.accountNumber === num);

describe('INCSTMT-001 the statement says where the money went', () => {
  beforeEach(() => {
    post('2026-03-01', [{ a: '1010', dr: 1000000 }, { a: '4000', cr: 1000000 }]);
    post('2026-03-05', [{ a: '5000', dr: 400000 },  { a: '1010', cr: 400000 }]);
    post('2026-04-01', [{ a: '6100', dr: 120000 },  { a: '1010', cr: 120000 }]);
    post('2026-04-12', [{ a: '6810', dr: 40000 },   { a: '1010', cr: 40000 }]);
  });

  it('totals revenue, cost of sales and expenses separately', () => {
    const r = run();
    expect(r.revenueCents).toBe(1000000);
    expect(r.cogsCents).toBe(400000);
    expect(r.expenseCents).toBe(160000);
  });

  it('gross profit is revenue less cost of sales', () => {
    expect(run().grossProfitCents).toBe(600000);
  });

  it('net income is what is left after everything', () => {
    expect(run().netIncomeCents).toBe(440000);
  });

  it('each expense carries its share of sales', () => {
    expect(line(run(), '6810').pctOfRevenue).toBeCloseTo(4.0, 1);
    expect(line(run(), '6100').pctOfRevenue).toBeCloseTo(12.0, 1);
  });

  it('margins are reported as percentages', () => {
    const r = run();
    expect(r.grossMarginPct).toBeCloseTo(60.0, 1);
    expect(r.netMarginPct).toBeCloseTo(44.0, 1);
  });

  it('balance sheet accounts stay out of it', () => {
    expect(line(run(), '1010')).toBeUndefined();
  });

  it('an account with no activity is not listed', () => {
    expect(line(run(), '6820')).toBeUndefined();
  });

  it('only entries inside the range count', () => {
    post('2027-02-01', [{ a: '6100', dr: 999999 }, { a: '1010', cr: 999999 }]);
    expect(run().expenseCents).toBe(160000);
  });

  it('a period with no sales still reports its costs, without a share', () => {
    const r = incomeStatement('2026-04-01', '2026-04-30', { _db: db });
    expect(r.revenueCents).toBe(0);
    expect(r.expenseCents).toBe(160000);
    expect(r.netMarginPct).toBeNull();
    expect(line(r, '6100').pctOfRevenue).toBeNull();
  });
});

describe('INCSTMT-002 signs read positive', () => {
  it('revenue is credit-natured and reports positive', () => {
    post('2026-03-01', [{ a: '1010', dr: 500000 }, { a: '4000', cr: 500000 }]);
    expect(line(run(), '4000').amountCents).toBe(500000);
  });

  it('an expense is debit-natured and reports positive', () => {
    post('2026-03-01', [{ a: '6100', dr: 120000 }, { a: '1010', cr: 120000 }]);
    expect(line(run(), '6100').amountCents).toBe(120000);
  });

  it('a contra revenue account reduces revenue instead of posing as income', () => {
    post('2026-03-01', [{ a: '1010', dr: 500000 }, { a: '4000', cr: 500000 }]);
    post('2026-03-10', [{ a: '4100', dr: 50000 },  { a: '1010', cr: 50000 }]);
    const r = run();
    expect(line(r, '4100').amountCents).toBe(-50000);
    expect(r.revenueCents).toBe(450000);
  });

  it('a refunded expense nets down rather than appearing twice', () => {
    post('2026-03-01', [{ a: '6100', dr: 120000 }, { a: '1010', cr: 120000 }]);
    post('2026-03-20', [{ a: '1010', dr: 20000 },  { a: '6100', cr: 20000 }]);
    expect(line(run(), '6100').amountCents).toBe(100000);
  });

  it('a reversed entry and its mirror cancel out', () => {
    post('2026-03-01', [{ a: '6100', dr: 120000 }, { a: '1010', cr: 120000 }]);
    post('2026-03-01', [{ a: '1010', dr: 120000 }, { a: '6100', cr: 120000 }]);
    expect(line(run(), '6100')).toBeUndefined();  // nets to zero, so not listed
  });
});

describe('INCSTMT-003 the scrutinised categories stand on their own', () => {
  it('meals and travel are separate accounts', () => {
    post('2026-04-01', [{ a: '6800', dr: 90000 }, { a: '1010', cr: 90000 }]);
    post('2026-04-02', [{ a: '6810', dr: 30000 }, { a: '1010', cr: 30000 }]);
    const r = run();
    expect(line(r, '6800').amountCents).toBe(90000);
    expect(line(r, '6810').amountCents).toBe(30000);
  });

  it('the restricted half can be read off on its own, which is the point', () => {
    post('2026-04-01', [{ a: '6800', dr: 90000 }, { a: '1010', cr: 90000 }]);
    post('2026-04-02', [{ a: '6810', dr: 30000 }, { a: '1010', cr: 30000 }]);
    // Lumped into one account this was 120000 with no way to tell the halves apart.
    expect(line(run(), '6810').amountCents).toBe(30000);
  });

  it('gifts are their own account too', () => {
    post('2026-05-01', [{ a: '6820', dr: 15000 }, { a: '1010', cr: 15000 }]);
    expect(line(run(), '6820').amountCents).toBe(15000);
  });

  it('each is shown against sales, which is how a reviewer reads them', () => {
    post('2026-03-01', [{ a: '1010', dr: 1000000 }, { a: '4000', cr: 1000000 }]);
    post('2026-04-02', [{ a: '6810', dr: 30000 },   { a: '1010', cr: 30000 }]);
    expect(line(run(), '6810').pctOfRevenue).toBeCloseTo(3.0, 1);
  });
});
