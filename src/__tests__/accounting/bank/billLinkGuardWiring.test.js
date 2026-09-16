/**
 * APGUARD-001  the Categorize dialog warns when an unpaid bill matches the amount
 * APGUARD-002  the warning offers the link instead, and can be dismissed
 * APGUARD-003  both languages carry the warning and the link-dialog hint
 * APGUARD-004  the wiring that puts a bill in the ledger stays in place
 *
 * Telling the operator "link it, do not categorize it" only inside the link
 * dialog helps the person who already chose correctly. The one who clicks
 * Categorize - the mistake being guarded against - never sees it. So the warning
 * lives in the Categorize dialog, where the expense would be booked twice.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../../..');
const BANQUE = fs.readFileSync(path.join(ROOT, 'src/components/BanqueTab.jsx'), 'utf8');
const MAIN = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');
const BILLS = fs.readFileSync(path.join(ROOT, 'src/components/BillsTab.jsx'), 'utf8');

describe('APGUARD-001 the warning appears where the mistake is made', () => {
  it('loads unpaid bills of the same amount when the Categorize dialog opens', () => {
    expect(BANQUE).toMatch(/const bills = await window\.api\.supplierBills\.list\(\{ paid: 0 \}\);/);
    expect(BANQUE).toMatch(/if \(!tx \|\| Number\(tx\.amount\) >= 0\) return undefined;/);
    expect(BANQUE).toMatch(/\}, \[categorizingTx\]\);/);
  });

  it('renders the warning in the Categorize dialog', () => {
    expect(BANQUE).toMatch(/\{billMatches\.length > 0 && !billMatchDismissed && \(/);
    expect(BANQUE).toMatch(/\{T\.billMatchTitle\}/);
  });
});

describe('APGUARD-002 the warning offers the right action', () => {
  it('switches to the link dialog, and can be waved off', () => {
    expect(BANQUE).toMatch(/setCategorizingTx\(null\); openPayBill\(tx\);/);
    expect(BANQUE).toMatch(/onClick=\{\(\) => setBillMatchDismissed\(true\)\}/);
  });
});

describe('APGUARD-003 both languages', () => {
  it('carries the warning and the link-dialog hint in French and English', () => {
    for (const key of ['billMatchTitle', 'billMatchBody', 'billMatchLink', 'billMatchIgnore', 'payBillHint', 'payBill:']) {
      const hits = BANQUE.match(new RegExp(key.replace(':', ':'), 'g')) || [];
      expect(hits.length, key).toBeGreaterThanOrEqual(2);
    }
    expect(BANQUE).toMatch(/compterait deux fois/);
    expect(BANQUE).toMatch(/counted twice/);
  });

  it('the bill row says which account paid it, in both languages', () => {
    expect(BILLS).toMatch(/paidVia: \(n\) => `· par \$\{n\}`/);
    expect(BILLS).toMatch(/paidVia: \(n\) => `· via \$\{n\}`/);
    expect(BILLS).toMatch(/\{T\.paidVia\(b\.paid_account_name\)\}/);
  });
});

describe('APGUARD-004 the ledger wiring stays in place', () => {
  it('recording, correcting and paying a bill all reach the books', () => {
    expect(MAIN).toMatch(/posted: bill\?\.id \? supplierBillPost\(bill\.id\)/);
    expect(MAIN).toMatch(/supplierBillUnpost\(id, 'Facture fournisseur corrigee'\);/);
    expect(MAIN).toMatch(/posted: supplierBillPostPayment\(id, \{ paymentDate: bill\?\.payment_date \}\)/);
    expect(MAIN).toMatch(/ipcMain\.handle\('supplier:bill:payByBankTx'/);
  });
});

describe('APGUARD-005 the statement-first order is offered', () => {
  it('after saving a bill, matching statement lines are offered for attaching', () => {
    expect(BILLS).toMatch(/const lines = await window\.api\.supplierBills\.linesForAmount\(payload\.amount\);/);
    expect(BILLS).toMatch(/if \(lines\?\.length\) setAttach\(\{ billId, lines \}\);/);
    expect(BILLS).toMatch(/const r = await window\.api\.supplierBills\.payByBankTx\(txId, attach\.billId\);/);
    expect(BILLS).toMatch(/\{T\.attachTitle\}/);
    expect(BILLS).toMatch(/\{T\.attachDismiss\}/);
  });

  it('carries the attach wording in both languages', () => {
    for (const key of ['attachTitle', 'attachBody', 'attachBtn', 'attachDismiss']) {
      expect((BILLS.match(new RegExp(key + ':', 'g')) || []).length, key).toBe(2);
    }
  });

  it('the main process exposes the lookup', () => {
    expect(MAIN).toMatch(/ipcMain\.handle\('supplier:bill:linesForAmount'/);
  });
});

describe('APGUARD-006 one payment covering several bills', () => {
  it('the dialog ticks bills and only links when the total agrees', () => {
    expect(BANQUE).toMatch(/const \[payPicked, setPayPicked\]/);
    expect(BANQUE).toMatch(/const togglePayBill = \(id\) =>/);
    expect(BANQUE).toMatch(/const payTotalsAgree = !!payingTx && paySelectedCents > 0 && paySelectedCents === payTxCents;/);
    expect(BANQUE).toMatch(/disabled=\{!payTotalsAgree\}/);
    expect(BANQUE).toMatch(/payByBankTx\(payingTx\.id, payPicked\)/);
    expect((BANQUE.match(/payBillSelected/g) || []).length).toBeGreaterThanOrEqual(3);
  });
});
