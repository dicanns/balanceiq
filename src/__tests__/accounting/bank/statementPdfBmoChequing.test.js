/**
 * PDFST-009  a BMO-chequing-shaped statement: two-line column titles, the opening
 *            balance and the column totals printed as dated rows, "period ending",
 *            no labelled closing balance
 *
 * Invented statement; only the layout copies a real one.
 */
import { describe, it, expect } from 'vitest';
import { parseStatementPdf } from '../../../utils/statementPdf.mjs';

const at = (page, y, x, str, w) => ({ str, x, y, w: w ?? str.length * 4.5, h: 8, page });
const items = [
  at(1, 60, 62, 'Business Banking statement'),
  at(1, 80, 62, 'For the period ending July 31, 2026'),
  at(1, 100, 62, 'BMO Bank of Montreal'),
  at(1, 140, 309, 'Amounts debited'), at(1, 140, 395, 'Amounts credited'),
  at(1, 149, 62, 'Date'), at(1, 149, 102, 'Description'), at(1, 149, 292, 'from your account ($)', 80),
  at(1, 149, 390, 'to your account ($)', 72), at(1, 149, 493, 'Balance ($)', 40),
  at(1, 170, 102, 'Business Account # 0000 0000-000'),
  at(1, 190, 62, 'Jul 01'), at(1, 190, 102, 'Opening balance'), at(1, 190, 500, '1,000.00', 33),
  at(1, 204, 62, 'Jul 02'), at(1, 204, 102, 'INTERAC e-Transfer Sent'), at(1, 204, 342, '250.00', 30), at(1, 204, 502, '750.00', 31),
  at(1, 218, 62, 'Jul 15'), at(1, 218, 102, 'Pre-Authorized Payment No Fee, SAMPLE FEE'), at(1, 218, 352, '10.50', 22), at(1, 218, 502, '739.50', 31),
  at(1, 227, 102, 'REF/0001'),
  at(1, 241, 62, 'Jul 20'), at(1, 241, 102, 'Direct Deposit, SAMPLE CLIENT'), at(1, 241, 426, '1,200.00', 33), at(1, 241, 497, '1,939.50', 36),
  at(1, 260, 62, 'Jul 31'), at(1, 260, 102, 'Closing totals'), at(1, 260, 337, '260.50', 30), at(1, 260, 425, '1,200.00', 33),
  at(1, 280, 62, 'Number of items processed'),
];

describe('PDFST-009 a BMO chequing statement', () => {
  const r = parseStatementPdf(items);
  it('reads the two-line debit and credit titles and every line', () => {
    expect(r.columns).toEqual(['date', 'postDate', 'description', 'debit', 'credit', 'balance']);
    expect(r.rows.map(x => [x.date, x.description, x.delta])).toEqual([
      ['2026-07-02', 'INTERAC e-Transfer Sent', -250],
      ['2026-07-15', 'Pre-Authorized Payment No Fee, SAMPLE FEE', -10.5],
      ['2026-07-20', 'Direct Deposit, SAMPLE CLIENT', 1200],
    ]);
    expect(r.rows[1].note).toBe('REF/0001');
  });
  it('does not import the opening row or the totals row, and uses them', () => {
    expect(r.rows.some(x => /Opening balance|Closing totals/.test(x.description))).toBe(false);
    expect(r.period).toEqual({ start: '2026-07-01', end: '2026-07-31' });
    expect(r.opening).toBe(1000);
    expect(r.printed).toEqual({ payments: 260.5, purchases: 1200 });
  });
  it('closes on the last running balance and balances to the cent', () => {
    expect(r.closing).toBe(1939.5);
    expect(r.check).toEqual({ ok: true, direction: 1, gap: 0 });
  });
});
