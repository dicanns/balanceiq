/**
 * FUP-001  generated invoices total with the customer's tax exemption (K8)
 * FUP-002  feature keys used by the screen exist in features.js
 * FUP-003  default GL numbers exist in the seeded chart of accounts
 * FUP-004  business dates use the local date, not the UTC date
 * FUP-005  the Stripe link charges the balance, the Excel summary sums Total
 *
 * Source-level checks, like invoiceLedgerWiring.test.js.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '../../../..');
const APP = fs.readFileSync(path.join(root, 'src/App.jsx'), 'utf8');
const FEATURES = fs.readFileSync(path.join(root, 'src/config/features.js'), 'utf8');
const DB = fs.readFileSync(path.join(root, 'src/db/database.js'), 'utf8');

describe('FUP-001 exemption in generated invoices', () => {
  it('computes the posted totals with the customer exemption in all three generators and the backfill', () => {
    expect(APP).toMatch(/function clientExemptOpts\(client\)/);
    const dep = APP.slice(APP.indexOf('const generateDepositInvoice='), APP.indexOf('const generateDepositInvoice=') + 3000);
    expect(dep).toMatch(/const dTot=computeSoumTotals\(depFac\.lignes\|\|\[\],\{\.\.\.depFac,\.\.\.clientExemptOpts\(/);
    const withExempt = APP.match(/const ft=computeSoumTotals\(f\.lignes\|\|\[\],\{\.\.\.f,\.\.\.clientExemptOpts\(/g) || [];
    expect(withExempt.length).toBe(3); // backfill, interest, recurring
  });
  it('no invoice poster computes totals from the bare invoice any more', () => {
    expect(APP).not.toMatch(/const ft=computeSoumTotals\(f\.lignes\|\|\[\],f\);/);
  });
});

describe('FUP-002 feature keys', () => {
  it('every canUse key in App.jsx is defined in features.js', () => {
    const keys = [...APP.matchAll(/canUse\(['"]([A-Za-z]+)['"]\)/g)].map((m) => m[1]);
    expect(keys.length).toBeGreaterThan(0);
    for (const k of new Set(keys)) expect(FEATURES, k).toMatch(new RegExp(`\\b${k}\\s*:`));
  });
});

describe('FUP-003 default GL accounts', () => {
  it('every default number is seeded in the chart of accounts', () => {
    const block = APP.slice(APP.indexOf('const DEFAULT_GL_ACCOUNTS={'), APP.indexOf('};', APP.indexOf('const DEFAULT_GL_ACCOUNTS={')));
    const nums = [...block.matchAll(/:"(\d{4})"/g)].map((m) => m[1]);
    expect(nums.length).toBeGreaterThan(15);
    for (const n of new Set(nums)) expect(DB, n).toMatch(new RegExp(`'${n}'`));
  });
});

describe('FUP-004 local dates', () => {
  it('App.jsx has no UTC date slices for business dates', () => {
    expect(APP).not.toMatch(/toISOString\(\)\.slice\(0,\s*(10|7)\)/);
  });
});

describe('FUP-005 Stripe link and Excel summary', () => {
  it('the link amount is the balance still owed', () => {
    expect(APP).toMatch(/const amountCents=Math\.round\(soldeDu\*100\);/);
  });
  it('the Excel summary sums the Total column', () => {
    expect(APP).toMatch(/data1\.reduce\(\(s,r\)=>s\+\(r\[15\]\|\|0\),0\)/);
  });
});
