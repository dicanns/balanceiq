/**
 * JRNL-001  only entries the Journal owns can be reversed from it
 * JRNL-002  the main process applies the same rule, with a lookup it really has
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { reversibleInJournal } from '../../../utils/journalSources.mjs';

const MAIN = fs.readFileSync(path.resolve(__dirname, '../../../../main.js'), 'utf8');

describe('JRNL-001 what the Journal may reverse', () => {
  it('hand-typed entries and the bookkeeper opening balances, not document entries', () => {
    expect(reversibleInJournal({ source_type: 'manual', source_id: null })).toBe(true);
    expect(reversibleInJournal({ source_type: null, source_id: null })).toBe(true);
    expect(reversibleInJournal({ source_type: 'opening_adjustment', source_id: 'opening:2026-10-31:1' })).toBe(true);
    // A hand-typed entry given a label in the form has no document behind it.
    expect(reversibleInJournal({ source_type: 'invoice', source_id: null })).toBe(true);
    for (const t of ['invoice', 'payment', 'supplier_bill', 'bank_tx', 'cheque', 'bank_opening']) {
      expect(reversibleInJournal({ source_type: t, source_id: '42' })).toBe(false);
    }
    expect(reversibleInJournal(null)).toBe(false);
  });
});

describe('JRNL-002 main process', () => {
  it('guards reverse and correct with the shared rule and never calls a function it does not import', () => {
    expect(MAIN).toMatch(/ipcMain\.handle\('ledger:entry:reverse'[^\n]*assertManualEntry\(id\)/);
    expect(MAIN).toMatch(/ipcMain\.handle\('ledger:entry:correct'[^\n]*assertManualEntry\(id\)/);
    expect(MAIN).toMatch(/reversibleInJournal/);
    expect(MAIN).not.toMatch(/\bgetDb\(\)/);
  });
});
