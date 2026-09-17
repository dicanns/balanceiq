/**
 * ONEBILL-001  the monthly P&L no longer records bills of its own
 * ONEBILL-002  the receipt scanner hands its reading to the Bills screen
 * ONEBILL-003  old P&L bills stay visible and still count on the return
 *
 * Two bill systems coexisted: monthly P&L bills as JSON in kv_store, and the
 * supplier_bills table. The ledger and the payables check read one; the tax
 * return read the other; nothing reconciled them. Entry now happens in one
 * place. What was entered the old way is not touched.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../../..');
const APP = fs.readFileSync(path.join(ROOT, 'src/App.jsx'), 'utf8');
const BILLS = fs.readFileSync(path.join(ROOT, 'src/components/BillsTab.jsx'), 'utf8');
const DB = fs.readFileSync(path.join(ROOT, 'src/db/database.js'), 'utf8');

describe('ONEBILL-001 the monthly P&L records no bills', () => {
  it('has no add path left, only the pointer to Bills', () => {
    expect(APP).not.toMatch(/updPL\(`\$\{baseKey\}_bills`,\[\.\.\.bills,bill\]\)/);
    expect(APP).not.toMatch(/updPL\(`\$\{selectedKey\}_bills`,\[\.\.\.existing,bill\]\)/);
    expect(APP).toMatch(/function BillEntry\(\{label,baseKey,plData,updPL,accent="249,115,22",onGoToBills\}\)/);
    expect(APP).toMatch(/\{T\.plBillsGoTo\}/);
    expect((APP.match(/onGoToBills=\{goToBills\}/g) || []).length).toBe(4);
  });
});

describe('ONEBILL-002 the scanner routes to Bills', () => {
  it('writes a prefill and navigates; the Bills screen picks it up once', () => {
    expect(APP).toMatch(/storage\.set\('balanceiq-bill-prefill',JSON\.stringify\(\{supplier_name:result\.supplier/);
    expect(APP).toMatch(/routed:'bills'/);
    expect(BILLS).toMatch(/storage\?\.get\('balanceiq-bill-prefill'\)/);
    expect(BILLS).toMatch(/storage\.set\('balanceiq-bill-prefill', ''\)/);
  });
});

describe('ONEBILL-003 old P&L bills are kept', () => {
  it('are still listed, removable, and read by the tax return', () => {
    expect(APP).toMatch(/const bills=plData\[`\$\{baseKey\}_bills`\]\|\|\[\];/);
    expect(APP).toMatch(/const removeBill=async id=>/);
    expect(DB).toMatch(/if \(!key\.endsWith\('_bills'\)\) continue;/);
  });
});
