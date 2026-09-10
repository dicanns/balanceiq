/**
 * ITCPCT-001  a restricted account claims only its share of the tax
 * ITCPCT-002  the part that cannot be claimed stays in the expense
 * ITCPCT-003  the ledger and the return agree about what was claimed
 *
 * Meals and entertainment carry a 50% limit on the input tax credit. Knowing to
 * halve it by hand is exactly the kind of thing a new business owner does not
 * know, and getting it wrong overstates the claim on every restaurant receipt for
 * as long as nobody notices. The rate now lives on the account, so choosing the
 * account is the only decision anyone has to make: the operator enters the full
 * tax printed on the invoice and the restriction is applied for them.
 *
 * The half that cannot be claimed is not lost - it was never a credit, it is part
 * of what the meal cost, so it belongs in the expense.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildAccountingDb } from '../helpers/testSchema.js';

let db;
beforeEach(() => {
  db = buildAccountingDb();
  const cols = db.prepare(`PRAGMA table_info(chart_of_accounts)`).all().map(c => c.name);
  if (!cols.includes('itc_pct')) {
    db.prepare(`ALTER TABLE chart_of_accounts ADD COLUMN itc_pct INTEGER DEFAULT 100`).run();
  }
  for (const [num, name, type, pct] of [
    ['1010', 'Cash',                    'asset',     100],
    ['2100', 'GST paid',                'liability', 100],
    ['2110', 'QST paid',                'liability', 100],
    ['6100', 'Rent',                    'expense',   100],
    ['6800', 'Travel',                  'expense',   100],
    ['6810', 'Meals and entertainment', 'expense',    50],
  ]) {
    db.prepare(
      `INSERT OR IGNORE INTO chart_of_accounts (account_number, name_fr, name_en, type, itc_pct)
       VALUES (?,?,?,?,?)`
    ).run(num, name, name, type, pct);
  }
});
afterEach(() => { db?.close(); db = null; });

const acc = (n) => db.prepare(`SELECT * FROM chart_of_accounts WHERE account_number=?`).get(n);

// Mirrors the split in _postBankTransactionEntry: claimable tax to 2100/2110,
// whatever is left in the expense.
function split(grossCents, tpsCents, tvqCents, accountNumber) {
  const target = acc(accountNumber);
  const pct = target.itc_pct == null ? 100 : Number(target.itc_pct);
  let tps = tpsCents, tvq = tvqCents;
  if (pct !== 100) {
    tps = Math.round((tps * pct) / 100);
    tvq = Math.round((tvq * pct) / 100);
  }
  if (tps + tvq >= grossCents) { tps = 0; tvq = 0; }
  return { claimedTps: tps, claimedTvq: tvq, expenseCents: grossCents - tps - tvq };
}

// A $100.00 restaurant bill: $5.00 GST, $9.98 QST, $114.98 off the bank.
const MEAL = { gross: 11498, tps: 500, tvq: 998 };

describe('ITCPCT-001 a restricted account claims only its share', () => {
  it('meals claim half the tax', () => {
    const r = split(MEAL.gross, MEAL.tps, MEAL.tvq, '6810');
    expect(r.claimedTps).toBe(250);
    expect(r.claimedTvq).toBe(499);
  });

  it('the operator still enters the full amounts from the invoice', () => {
    // Nothing is asked of the user beyond what the receipt says.
    const r = split(MEAL.gross, MEAL.tps, MEAL.tvq, '6810');
    expect(r.claimedTps + r.claimedTvq).toBeLessThan(MEAL.tps + MEAL.tvq);
  });

  it('an unrestricted account claims all of it', () => {
    const r = split(MEAL.gross, MEAL.tps, MEAL.tvq, '6100');
    expect(r.claimedTps).toBe(500);
    expect(r.claimedTvq).toBe(998);
  });

  it('travel is unrestricted, which is why it is its own account now', () => {
    const r = split(MEAL.gross, MEAL.tps, MEAL.tvq, '6800');
    expect(r.claimedTps).toBe(500);
  });

  it('an account set to zero claims nothing', () => {
    db.prepare(`UPDATE chart_of_accounts SET itc_pct=0 WHERE account_number='6100'`).run();
    const r = split(MEAL.gross, MEAL.tps, MEAL.tvq, '6100');
    expect(r.claimedTps).toBe(0);
    expect(r.claimedTvq).toBe(0);
  });

  it('an account with no rate set behaves as unrestricted', () => {
    db.prepare(`UPDATE chart_of_accounts SET itc_pct=NULL WHERE account_number='6100'`).run();
    expect(split(MEAL.gross, MEAL.tps, MEAL.tvq, '6100').claimedTps).toBe(500);
  });

  it('rounds to the cent rather than carrying a fraction', () => {
    const r = split(10000, 501, 999, '6810');
    expect(Number.isInteger(r.claimedTps)).toBe(true);
    expect(r.claimedTps).toBe(251);   // 250.5 rounds up
    expect(r.claimedTvq).toBe(500);   // 499.5 rounds up
  });
});

describe('ITCPCT-002 the unclaimable part stays in the expense', () => {
  it('the meal costs what was paid, less only what was actually claimed', () => {
    const r = split(MEAL.gross, MEAL.tps, MEAL.tvq, '6810');
    expect(r.expenseCents).toBe(11498 - 250 - 499);
    expect(r.expenseCents).toBe(10749);
  });

  it('the entry still balances: expense plus claimed tax equals the money out', () => {
    const r = split(MEAL.gross, MEAL.tps, MEAL.tvq, '6810');
    expect(r.expenseCents + r.claimedTps + r.claimedTvq).toBe(MEAL.gross);
  });

  it('an unrestricted expense is recorded net of all its tax', () => {
    const r = split(MEAL.gross, MEAL.tps, MEAL.tvq, '6100');
    expect(r.expenseCents).toBe(10000);
  });

  it('nothing is lost: the restricted meal costs more than the unrestricted one', () => {
    const restricted   = split(MEAL.gross, MEAL.tps, MEAL.tvq, '6810').expenseCents;
    const unrestricted = split(MEAL.gross, MEAL.tps, MEAL.tvq, '6100').expenseCents;
    expect(restricted - unrestricted).toBe(749);   // the half that was not a credit
  });

  it('a nonsense tax larger than the payment is refused outright', () => {
    const r = split(1000, 900, 900, '6100');
    expect(r.claimedTps).toBe(0);
    expect(r.expenseCents).toBe(1000);
  });
});

describe('ITCPCT-003 the ledger and the return agree', () => {
  let bankId;
  beforeEach(() => {
    bankId = db.prepare(
      `INSERT INTO bank_accounts (name, account_type, coa_account_id, opening_balance, opening_date)
       VALUES ('Chequing','bank',?,0,'2026-07-01')`
    ).run(acc('1010').id).lastInsertRowid;
  });

  function addTx(date, amount, accountNumber, tps, tvq) {
    db.prepare(
      `INSERT INTO bank_transactions (bank_account_id, transaction_date, description, amount, coa_account_id, tps_paid, tvq_paid)
       VALUES (?,?,?,?,?,?,?)`
    ).run(bankId, date, 'x', amount, acc(accountNumber).id, tps, tvq);
  }

  // Mirrors the CTI sum in taxPeriodCompute.
  const claimed = (start, end) => db.prepare(
    `SELECT COALESCE(SUM(bt.tps_paid * COALESCE(ca.itc_pct, 100) / 100.0), 0) AS tps,
            COALESCE(SUM(bt.tvq_paid * COALESCE(ca.itc_pct, 100) / 100.0), 0) AS tvq
     FROM bank_transactions bt
     JOIN chart_of_accounts ca ON ca.id = bt.coa_account_id
     WHERE bt.transaction_date >= ? AND bt.transaction_date <= ?
       AND bt.coa_account_id IS NOT NULL
       AND (COALESCE(bt.tps_paid,0) <> 0 OR COALESCE(bt.tvq_paid,0) <> 0)`
  ).get(start, end);

  const Q = ['2026-07-01', '2026-09-30'];

  it('the return claims half the tax on a meal, matching the ledger', () => {
    addTx('2026-08-04', -114.98, '6810', 5.00, 9.98);
    const c = claimed(...Q);
    expect(c.tps).toBeCloseTo(2.50, 2);
    expect(c.tvq).toBeCloseTo(4.99, 2);
  });

  it('and all of it on rent', () => {
    addTx('2026-08-01', -1149.80, '6100', 50.00, 99.80);
    const c = claimed(...Q);
    expect(c.tps).toBeCloseTo(50.00, 2);
    expect(c.tvq).toBeCloseTo(99.80, 2);
  });

  it('a mixed period claims each line at its own rate', () => {
    addTx('2026-08-01', -1149.80, '6100', 50.00, 99.80);
    addTx('2026-08-04', -114.98,  '6810',  5.00,  9.98);
    const c = claimed(...Q);
    expect(c.tps).toBeCloseTo(52.50, 2);
    expect(c.tvq).toBeCloseTo(104.79, 2);
  });

  it('the overstatement this prevents, on one receipt', () => {
    addTx('2026-08-04', -114.98, '6810', 5.00, 9.98);
    const c = claimed(...Q);
    const unrestricted = 5.00 + 9.98;
    expect(unrestricted - (c.tps + c.tvq)).toBeCloseTo(7.49, 2);
  });

  it('changing the rate changes what the return claims', () => {
    addTx('2026-08-04', -114.98, '6810', 5.00, 9.98);
    db.prepare(`UPDATE chart_of_accounts SET itc_pct=100 WHERE account_number='6810'`).run();
    expect(claimed(...Q).tps).toBeCloseTo(5.00, 2);
  });

  it('a line with no account is left out entirely', () => {
    db.prepare(
      `INSERT INTO bank_transactions (bank_account_id, transaction_date, description, amount, tps_paid, tvq_paid)
       VALUES (?,'2026-08-09','uncategorized',-50,2.17,4.33)`
    ).run(bankId);
    expect(claimed(...Q).tps).toBe(0);
  });
});
