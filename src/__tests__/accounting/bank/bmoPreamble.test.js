/**
 * BMOCSV-001  BMO's CSV export reads: the title line above the table is skipped
 * BMOCSV-002  a file without such a line is unchanged, first transaction included
 *
 * Card number and figures are invented.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import { parseCsvLines, dropPreamble } from '../../../utils/importParse.mjs';

const require = createRequire(import.meta.url);
const { parseBankCsvFile } = require('../../../db/database.js');

const BMO = [
  'Following data is valid as of 20261019111550 (Year/Month/Day/Hour/Minute/Second)',
  '', '',
  'First Bank Card,Transaction Type,Date Posted, Transaction Amount,Description',
  '', '',
  "'0000000000000000',DEBIT,20260903,-45.10,[DN]SAMPLE HYDRO          ",
  "'0000000000000000',CREDIT,20260915,1200.00,[DN]SAMPLE CLIENT PAYMENT ",
  "'0000000000000000',CREDIT,20260929,12.34,[IN]                        ",
].join('\n');

describe('BMOCSV-001 the BMO export', () => {
  it('skips the title line and reads date, amount and description by their titles', () => {
    expect(parseCsvLines(BMO).rows[0][2]).toBe('Date Posted');
    const r = parseBankCsvFile(BMO, null);
    expect(r.meta.hadHeader).toBe(true);
    expect(r.rows.map(x => [x.transaction_date, x.amount, x.description])).toEqual([
      ['2026-09-03', -45.1, '[DN]SAMPLE HYDRO'],
      ['2026-09-15', 1200, '[DN]SAMPLE CLIENT PAYMENT'],
      ['2026-09-29', 12.34, '[IN]'],
    ]);
  });
});

describe('BMOCSV-002 nothing else changes', () => {
  it('keeps a headerless file whole and leaves narrow files alone', () => {
    const plain = '07/24/2026,SAMPLE CAFE,19.50,,301.24\n07/23/2026,SAMPLE STORE,4.00,,281.74\n';
    expect(parseCsvLines(plain).rows).toHaveLength(2);
    expect(dropPreamble([['a'], ['b']])).toEqual([['a'], ['b']]);
    expect(dropPreamble([['title'], ['x', 'y', 'z'], ['1', '2', '3']])).toEqual([['x', 'y', 'z'], ['1', '2', '3']]);
  });
});
