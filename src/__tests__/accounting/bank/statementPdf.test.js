/**
 * PDFST-001  money, dates and years as statements print them
 * PDFST-002  a TD-shaped statement: balances in the table, margin codes, a year boundary
 * PDFST-003  a BMO-shaped statement: two cardholders, CR credits, joined dates, a sentence with a date
 * PDFST-004  an Amex-shaped statement: period in titles, lines on two pages, references and conversions
 * PDFST-005  a chequing statement with withdrawal, deposit and balance columns
 * PDFST-006  the check: what balances, which way, and by how much it does not
 * PDFST-007  a scan, and a PDF with no statement in it
 *
 * Every statement here is invented. The layouts copy what real TD, BMO and
 * American Express statements do (positions, wording, quirks); no figure,
 * name or merchant comes from a real one.
 */
import { describe, it, expect } from 'vitest';
import {
  parseStatementPdf, moneyValue, shortDates, fullDates, resolveYear, balanceCheck, monthOf,
} from '../../../utils/statementPdf.mjs';

// A page as pdf-worker.js reports it: every word with its position, top-left origin.
// Each line is [y, [x, text, width?], ...].
function page(n, lines) {
  const items = [];
  for (const [y, ...cells] of lines) {
    for (const [x, str, w] of cells) items.push({ str, x, y, w: w ?? str.length * 4.5, h: 8, page: n });
  }
  return items;
}

describe('PDFST-001 printed money and dates', () => {
  it('reads amounts however they are printed', () => {
    expect(moneyValue('$264.44')).toBe(264.44);
    expect(moneyValue('-$198.34')).toBe(-198.34);
    expect(moneyValue('1,307.69 CR')).toBe(-1307.69);
    expect(moneyValue('+3,249.95')).toBe(3249.95);
    expect(moneyValue('1 307,69')).toBe(1307.69);
    expect(moneyValue('(12.00)')).toBe(-12);
    expect(moneyValue('12.00-')).toBe(-12);
    // Not money: points, years, rates, words.
    for (const s of ['3386', '2026', '1.44439', '20.99000', 'UNITED STATES DOLLAR 37.94', '']) expect(moneyValue(s), s).toBeNull();
  });
  it('reads month names in both languages and both orders', () => {
    expect(shortDates('MAY 6')).toEqual([{ month: 5, day: 6 }]);
    expect(shortDates('Aug. 10 Aug. 11')).toEqual([{ month: 8, day: 10 }, { month: 8, day: 11 }]);
    expect(shortDates('06 juil.')).toEqual([{ month: 7, day: 6 }]);
    expect(monthOf('June')).toBe(6);
    expect(monthOf('Sept.')).toBe(9);
    expect(monthOf('Marche')).toBeNull();
    expect(fullDates('May 06, 2026 to June 05, 2026').map(d => d.iso)).toEqual(['2026-05-06', '2026-06-05']);
  });
  it('gives a date its year from the close of the statement', () => {
    expect(resolveYear(12, 20, '2027-01-05')).toBe('2026-12-20');
    expect(resolveYear(1, 3, '2027-01-05')).toBe('2027-01-03');
    expect(resolveYear(7, 28, '2026-08-28')).toBe('2026-07-28');
    expect(resolveYear(2, 30, '2026-03-05')).toBeNull();
  });
});

// ── TD-shaped ────────────────────────────────────────────────────────────────
const TD = [
  ...page(1, [
    [60, [47, 'STATEMENT PERIOD:'], [130, 'Dec 06, 2026 to Jan 05, 2027']],
    [182, [49, 'TRANSACTION'], [97, 'POSTING']],
    [189, [49, 'DATE'], [97, 'DATE'], [140, 'ACTIVITY'], [170, 'DESCRIPTION'], [309, 'AMOUNT($)', 35]],
    [201, [140, 'PREVIOUS'], [183, 'STATEMENT'], [234, 'BALANCE'], [314, '$410.00', 32], [602, '0000000 ABC - - 01 - 01 - -']],
    [220, [47, 'DEC 8'], [95, 'DEC 9'], [140, 'PAYMENT - THANK YOU'], [316, '-$410.00', 34]],
    [239, [47, 'DEC 20'], [95, 'DEC 21'], [140, 'SAMPLE HARDWARE STORE'], [319, '$120.50', 30]],
    [244, [602, 'SAMPLESTM000_0000_000']],
    [258, [47, 'JAN 3'], [95, 'JAN 4'], [140, 'SAMPLE CAFE'], [322, '$8.25', 27]],
    [268, [140, 'X']],
    [300, [140, 'TOTAL'], [172, 'NEW'], [196, 'BALANCE'], [313, '$128.75', 32]],
    [440, [361, 'Payments'], [405, '&'], [414, 'Credits'], [546, '$410.00']],
    [452, [361, 'Purchases'], [405, '&'], [414, 'Other'], [440, 'Charges'], [548, '$128.75']],
    [470, [81, 'TD'], [92, 'CANADA'], [126, 'TRUST']],
  ]),
  ...page(2, [[40, [18, 'Statements: This statement covers the statement period shown on this statement.']]]),
];

describe('PDFST-002 a TD-shaped statement', () => {
  const r = parseStatementPdf(TD);
  it('finds the period, both balances and every line, across the new year', () => {
    expect(r.bank).toBe('td');
    expect(r.period).toEqual({ start: '2026-12-06', end: '2027-01-05' });
    expect(r.opening).toBe(410);
    expect(r.closing).toBe(128.75);
    expect(r.rows.map(x => [x.date, x.description, x.delta])).toEqual([
      ['2026-12-08', 'PAYMENT - THANK YOU', -410],
      ['2026-12-20', 'SAMPLE HARDWARE STORE', 120.5],
      ['2027-01-03', 'SAMPLE CAFE', 8.25],
    ]);
    expect(r.check).toEqual({ ok: true, direction: 1, gap: 0 });
  });
  it('leaves the margin codes out and keeps a wrapped fragment with its line', () => {
    expect(r.rows.some(x => /SAMPLESTM|ABC/.test(x.description + x.note))).toBe(false);
    expect(r.rows[2].note).toBe('X');
  });
  it('knows the printed totals, to point at the side that is off', () => {
    expect(r.printed).toEqual({ payments: 410, purchases: 128.75 });
    expect(r.found).toEqual({ payments: 410, purchases: 128.75 });
  });
});

// ── BMO-shaped ───────────────────────────────────────────────────────────────
const BMO = [
  ...page(1, [
    [40, [53, 'BMO Sample Rewards']],
    [80, [80, 'Previous total balance, Oct. 28, 2026'], [299, '$200.00'], [376, 'Card number'], [505, 'XXXX XXXX XXXX 0000']],
    [92, [80, 'Payments and credits'], [301, '-200.00'], [376, 'Statement date'], [542, 'Nov. 28, 2026']],
    [104, [80, 'Purchases and other charges'], [298, '+355.40'], [376, 'Statement period'], [482, 'Oct. 29, 2026 - Nov. 28, 2026']],
    [150, [80, 'Total balance'], [299, '$355.40'], [376, 'Base points earned'], [562, '355']],
    [170, [80, 'Balance due'], [299, '$355.40']],
  ]),
  ...page(3, [
    [100, [54, 'TRANS'], [88, 'POSTING']],
    [106, [54, 'DATE'], [88, 'DATE'], [142, 'DESCRIPTION'], [366, 'AMOUNT ($)', 45]],
    [118, [54, 'Card number:'], [99, 'XXXX XXXX XXXX 0000'], [184, 'SAMPLE PRIMARY']],
    [133, [54, 'Nov. 3 Nov. 4'], [142, 'SAMPLE FUEL'], [236, 'LAVAL'], [283, 'QC'], [373, '45.10', 22]],
    [146, [54, 'Nov. 20'], [88, 'Nov. 20'], [142, 'AUTOMATIC PYMT RECEIVED'], [366, '200.00', 26], [403, 'CR']],
    [161, [54, 'Subtotal for SAMPLE PRIMARY'], [366, '45.10']],
    [175, [54, 'Card number:'], [99, 'XXXX XXXX XXXX 0001'], [184, 'SAMPLE SECOND']],
    [190, [54, 'Oct. 28'], [88, 'Oct. 29'], [142, 'SAMPLE MUSIC'], [241, 'TORONTO'], [300, 'ON'], [373, '310.30', 26]],
    [205, [54, 'Subtotal for SAMPLE SECOND'], [373, '310.30']],
    [220, [54, 'Total for card number XXXX XXXX XXXX 0000'], [361, '$355.40']],
    [270, [54, 'Pre-authorized debit (Auto-Pay) is in effect. The payment will be withdrawn on Dec. 22, 2026']],
  ]),
];

describe('PDFST-003 a BMO-shaped statement', () => {
  const r = parseStatementPdf(BMO);
  it('reads the summary page and the lines on another page', () => {
    expect(r.bank).toBe('bmo');
    expect(r.period).toEqual({ start: '2026-10-29', end: '2026-11-28' });
    expect(r.opening).toBe(200);            // "Previous total balance", not the closing
    expect(r.closing).toBe(355.4);
    expect(r.check.ok).toBe(true);
  });
  it('splits two dates printed as one, and reads CR as a credit', () => {
    expect(r.rows.map(x => [x.date, x.postDate, x.delta])).toEqual([
      ['2026-11-03', '2026-11-04', 45.1],
      ['2026-11-20', '2026-11-20', -200],
      ['2026-10-28', '2026-10-29', 310.3],
    ]);
    expect(r.rows[0].description).toBe('SAMPLE FUEL LAVAL QC');
  });
  it('keeps each cardholder with their lines, and no subtotal or sentence becomes a line', () => {
    expect(r.cardholders).toEqual(['SAMPLE PRIMARY', 'SAMPLE SECOND']);
    expect(r.rows.map(x => x.cardholder)).toEqual(['SAMPLE PRIMARY', 'SAMPLE PRIMARY', 'SAMPLE SECOND']);
    expect(r.rows).toHaveLength(3);
  });
});

// ── Amex-shaped ──────────────────────────────────────────────────────────────
const AMEX_HEAD = [
  [40, [67, 'Sample Express Business Card']],
  [60, [17, 'Prepared For'], [329, 'Account Number'], [419, 'Opening Date'], [497, 'Closing Date']],
  [71, [17, 'SAMPLE HOLDER'], [280, 'XXXX XXXXX0 00000'], [399, 'Jul 06, 2026'], [470, 'Aug 05, 2026']],
  [100, [18, 'Transaction'], [58, 'Posting'], [97, 'Details'], [501, 'Amount ($)', 40]],
  [107, [18, 'Date'], [58, 'Date']],
];
const AMEX = [
  ...page(1, [
    [30, [439, 'americanexpress.ca']],
    [60, [16, 'Prepared For'], [332, 'Account Number'], [419, 'Opening Date'], [500, 'Closing Date']],
    [71, [16, 'SAMPLE HOLDER'], [278, 'XXXX XXXXX0 00000'], [400, 'Jul 06, 2026'], [473, 'Aug 05, 2026']],
    [110, [46, 'Previous Balance'], [237, '$50.00'], [276, 'Credit Limit'], [493, '$9,000.00']],
    [120, [17, 'Less'], [46, 'Payments'], [239, '$50.00']],
    [140, [17, 'Plus'], [46, 'Purchases'], [235, '$90.00']],
    [160, [17, 'Equals New Balance'], [233, '$90.00']],
    [180, [276, 'Payment Period Remaining']],
  ]),
  ...page(2, [
    ...AMEX_HEAD,
    [127, [18, 'New Payments']],
    [144, [18, 'Jul 26'], [58, 'Jul 26'], [97, 'PAYMENT RECEIVED - THANK YOU'], [495, '-50.00', 26]],
    [152, [97, 'Reference AB0000000000']],
    [170, [18, 'Total of Payment Activity'], [496, '-50.00']],
    [200, [18, 'New Transactions for SAMPLE HOLDER']],
    [217, [18, 'Jul 24'], [58, 'Jul 24'], [101, 'SAMPLE SOFTWARE'], [202, 'NEW YORK'], [504, '60.00', 22]],
    [226, [101, 'UNITED STATES DOLLAR 43.00'], [193, '@'], [201, '1.39535']],
  ]),
  ...page(3, [
    ...AMEX_HEAD,
    [127, [18, 'Aug 2'], [58, 'Aug 3'], [101, 'SAMPLE GOLF'], [505, '30.00', 22]],
    [150, [18, 'Total of New Transactions for'], [494, '90.00']],
    [162, [18, 'SAMPLE HOLDER']],
  ]),
  ...page(5, [[60, [18, '1, 2020 - 2.5%; August 1, 2021 - 3%; August 1, 2022 - 3.5%'], [510, '.']]]),
];

describe('PDFST-004 an Amex-shaped statement', () => {
  const r = parseStatementPdf(AMEX);
  it('takes the period from the Opening and Closing Date titles', () => {
    expect(r.bank).toBe('amex');
    expect(r.period).toEqual({ start: '2026-07-06', end: '2026-08-05' });
    expect([r.opening, r.closing]).toEqual([50, 90]);
  });
  it('reads lines on both pages, and no total, heading or repeated title', () => {
    expect(r.rows.map(x => [x.date, x.description, x.delta])).toEqual([
      ['2026-07-26', 'PAYMENT RECEIVED - THANK YOU', -50],
      ['2026-07-24', 'SAMPLE SOFTWARE NEW YORK', 60],
      ['2026-08-02', 'SAMPLE GOLF', 30],
    ]);
    expect(r.check.ok).toBe(true);
  });
  it('keeps a reference and a currency conversion as the line\'s note', () => {
    expect(r.rows[0].note).toBe('Reference AB0000000000');
    expect(r.rows[1].note).toBe('UNITED STATES DOLLAR 43.00 @ 1.39535');
  });
});

// ── Chequing ─────────────────────────────────────────────────────────────────
describe('PDFST-005 a chequing statement', () => {
  const r = parseStatementPdf(page(1, [
    [40, [40, 'Statement period Mar 1, 2026 to Mar 31, 2026']],
    [80, [40, 'Date'], [100, 'Description'], [300, 'Withdrawals', 55], [380, 'Deposits', 45], [460, 'Balance', 40]],
    [95, [100, 'Opening balance'], [465, '1,000.00', 30]],
    [110, [40, 'Mar 2'], [100, 'SAMPLE RENT'], [305, '500.00', 30], [465, '500.00', 30]],
    [125, [40, 'Mar 5'], [100, 'SAMPLE CLIENT'], [385, '250.00', 30], [465, '750.00', 30]],
    [140, [100, 'Closing balance'], [465, '750.00', 30]],
  ]));
  it('puts each amount under its own column and balances deposits against withdrawals', () => {
    expect(r.columns).toEqual(['date', 'postDate', 'description', 'debit', 'credit', 'balance']);
    expect(r.rows.map(x => [x.date, x.debit, x.credit, x.balance, x.delta])).toEqual([
      ['2026-03-02', 500, null, 500, -500],
      ['2026-03-05', null, 250, 750, 250],
    ]);
    expect([r.opening, r.closing, r.check.ok]).toEqual([1000, 750, true]);
  });
});

describe('PDFST-006 the check', () => {
  it('balances either way round, and says by how much when it does not', () => {
    expect(balanceCheck(100, 150, [80, -30])).toEqual({ ok: true, direction: 1, gap: 0 });
    expect(balanceCheck(100, 150, [-80, 30])).toEqual({ ok: true, direction: -1, gap: 0 });
    expect(balanceCheck(100, 150, [80])).toEqual({ ok: false, direction: 1, gap: -30 });
    expect(balanceCheck(null, 150, [80]).ok).toBeNull();
  });
  it('catches a line the reader missed', () => {
    const missing = TD.filter(i => !(i.page === 1 && i.y === 258));   // drop the SAMPLE CAFE line
    const r = parseStatementPdf(missing);
    expect(r.check.ok).toBe(false);
    expect(r.check.gap).toBe(8.25);
    expect(r.found.purchases).toBe(120.5);
    expect(r.printed.purchases).toBe(128.75);
  });
});

describe('PDFST-007 nothing to read', () => {
  it('says a scan has no text, and a letter has no lines', () => {
    expect(parseStatementPdf([]).hasText).toBe(false);
    const letter = parseStatementPdf(page(1, [[40, [40, 'Important changes to your card agreement, effective July 2, 2026.']]]));
    expect(letter.hasText).toBe(true);
    expect(letter.rows).toEqual([]);
  });
});
