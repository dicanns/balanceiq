/**
 * CR-001  refunds in the clientCredits arithmetic (cents)
 * CR-002  refund wiring: handler, cheque path, cash row, undo
 * CR-003  auto-apply setting wiring
 * CR-004  generated invoices go through invoices.commit
 * CR-005  invoices:commitPayment / commitPaymentRemoval and the payment screen
 * CR-006  exports carry the credit rows
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  creditAvailableCents, clientAvailableCents, planRefund, addRefund, removeRefund, findCreditByRefund,
  creditRefundedCents, addApplication, parseAutoApplySetting, CLIENT_CREDIT_AUTO_APPLY_KEY,
} from '../../utils/clientCredits.mjs';
import { commitInvoicePosted, describeNotCreated, failureReason } from '../../utils/invoiceCommit.mjs';

const credit = (id, clientId, date, amountCents, extra = {}) => ({ id, clientId, date, amountCents, applications: [], refunds: [], ...extra });

describe('CR-001 refunds reduce what is available', () => {
  it('available is amount less applications and refunds', () => {
    const c = credit('a', 'c1', '2026-01-01', 10000, { applications: [{ id: 'x', amountCents: 1500 }], refunds: [{ id: 'r', amountCents: 2500 }] });
    expect(creditRefundedCents(c)).toBe(2500);
    expect(creditAvailableCents(c)).toBe(6000);
    expect(creditAvailableCents({ ...c, refunds: [{ id: 'r', amountCents: 99999 }] })).toBe(0);
    expect(clientAvailableCents([c, credit('b', 'c1', 'd', 400)], 'c1')).toBe(6400);
  });
  it('planRefund never refunds more than is available and draws oldest first', () => {
    let n = 0;
    const list = [credit('new', 'c1', '2026-03-01', 1000), credit('old', 'c1', '2026-01-01', 400), credit('other', 'c2', '2025-01-01', 9999)];
    const r = planRefund(list, 'c1', 900, { date: '2026-04-01', mode: 'Comptant', makeId: () => `r${++n}` });
    expect(r.refunds.map((x) => [x.creditId, x.amountCents])).toEqual([['old', 400], ['new', 500]]);
    expect(planRefund(list, 'c1', 999999, { date: 'd', mode: 'Chèque' }).refundedCents).toBe(1400);
    expect(planRefund(list, 'c3', 100, { date: 'd', mode: 'Chèque' }).refunds).toEqual([]);
  });
  it('addRefund is clamped to what is left and removeRefund gives it back', () => {
    const list = [credit('a', 'c1', 'd', 1000)];
    const one = addRefund(list, 'a', { id: 'r1', date: 'd', amountCents: 400, mode: 'Chèque', chequeId: 7, glEntryId: 3 });
    expect(creditAvailableCents(one[0])).toBe(600);
    expect(one[0].refunds[0]).toMatchObject({ id: 'r1', chequeId: 7, glEntryId: 3 });
    const over = addRefund(one, 'a', { id: 'r2', date: 'd', amountCents: 5000, mode: 'Comptant' });
    expect(creditAvailableCents(over[0])).toBe(0);
    expect(creditRefundedCents(over[0])).toBe(1000);
    expect(addRefund(over, 'a', { id: 'r3', date: 'd', amountCents: 1, mode: 'Comptant' })[0].refunds.length).toBe(2);
    expect(findCreditByRefund(over, 'r1').id).toBe('a');
    expect(creditAvailableCents(removeRefund(one, 'r1')[0])).toBe(1000);
  });
  it('an application cannot overdraw a refunded credit', () => {
    const refunded = addRefund([credit('a', 'c1', 'd', 1000)], 'a', { id: 'r', date: 'd', amountCents: 700, mode: 'Chèque' });
    expect(creditAvailableCents(addApplication(refunded, 'a', { id: 'p', factureId: 'f', date: 'd', amountCents: 300 })[0])).toBe(0);
  });
  it('the auto-apply setting reads as off unless stored as true', () => {
    expect(CLIENT_CREDIT_AUTO_APPLY_KEY).toBe('dicann-fac-credit-auto-apply');
    expect(parseAutoApplySetting(null)).toBe(false);
    expect(parseAutoApplySetting({ value: 'true' })).toBe(true);
    expect(parseAutoApplySetting('true')).toBe(true);
    expect(parseAutoApplySetting({ value: 'false' })).toBe(false);
    expect(parseAutoApplySetting('garbage')).toBe(false);
  });
});

const root = path.resolve(__dirname, '../../..');
const APP = fs.readFileSync(path.join(root, 'src/App.jsx'), 'utf8');
const MAIN = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
const PRELOAD = fs.readFileSync(path.join(root, 'preload.js'), 'utf8');
const OPENING = fs.readFileSync(path.join(root, 'src/components/OpeningReceivablesModal.jsx'), 'utf8');
const WORKLIST = fs.readFileSync(path.join(root, 'src/services/todayWorklist.js'), 'utf8');
const encaissement = APP.slice(APP.indexOf('function EncaissementEditor('), APP.indexOf('// ── NOTE DE CRÉDIT ──'));
const factureEditor = APP.slice(APP.indexOf('function FactureEditor('), APP.indexOf('function EncaissementEditor('));

describe('CR-002 refund wiring', () => {
  const refund = MAIN.slice(MAIN.indexOf("ledgerHandle('ledger:credit:refund'"), MAIN.indexOf("ledgerHandle('ledger:credit:refundReverse'"));
  const reverse = MAIN.slice(MAIN.indexOf("ledgerHandle('ledger:credit:refundReverse'"), MAIN.indexOf("ipcMain.handle('ledger:deposit:reverse'"));
  it('the handler debits 2500 and credits the account of the payment mode, once per refund id', () => {
    expect(refund.length).toBeGreaterThan(300);
    expect(refund).toMatch(/PAYMENT_MODE_ACCOUNT\[mode\]/);
    expect(refund).toMatch(/glFindEntryBySource\('credit_refund', refundId\)/);
    expect(refund).toMatch(/source_type: 'credit_refund'/);
    expect(refund).toMatch(/account_id: deposits\.id, debit_cents: amountCents, credit_cents: 0/);
    expect(refund).toMatch(/account_id: cash\.id, debit_cents: 0, credit_cents: amountCents/);
    expect(refund).toMatch(/alreadyPosted: true/);
    expect(reverse).toMatch(/nothingToReverse: true/);
    expect(reverse).toMatch(/glReverseEntry/);
    expect(PRELOAD).toMatch(/creditRefund:\s+\(opts\) => ipcRenderer\.invoke\('ledger:credit:refund'/);
    expect(PRELOAD).toMatch(/creditRefundReverse:\s+\(opts\) => ipcRenderer\.invoke\('ledger:credit:refundReverse'/);
  });
  const doRefund = encaissement.slice(encaissement.indexOf('const doRefundCredit=async'), encaissement.indexOf('const undoCreditRefund=async'));
  it('a cheque refund is a register cheque on 2500 and posts no separate entry', () => {
    const chequeBranch = doRefund.slice(doRefund.indexOf('if(isCheque){'), doRefund.indexOf('}else{'));
    expect(chequeBranch).toMatch(/cheques\?\.record\?\.\(\{direction:"issued",kind:"account",coaAccountId:refundDepositsCoaId/);
    expect(chequeBranch).toMatch(/partyName:client\?\.entreprise/);
    expect(chequeBranch).not.toMatch(/creditRefund/);
    expect(chequeBranch).toMatch(/chequeId=r\.id/);
    const otherBranch = doRefund.slice(doRefund.indexOf('}else{'), doRefund.indexOf('saveClientCredits('));
    expect(otherBranch).toMatch(/ledger\?\.creditRefund\?\.\(/);
    expect(otherBranch).not.toMatch(/cheques/);
  });
  it('the ledger answer comes before the list, and cash adds a payout row', () => {
    expect(doRefund.indexOf('creditRefund')).toBeLessThan(doRefund.indexOf('saveClientCredits('));
    expect(doRefund.indexOf('cheques?.record')).toBeLessThan(doRefund.indexOf('saveClientCredits('));
    expect(doRefund).toMatch(/if\(!r\?\.ok\)\{/);
    expect(doRefund).toMatch(/sorties:\[\.\.\.\(prevDay\.sorties\|\|\[\]\),refundCashRow\(rfd,label\)\]/);
    expect(doRefund).toMatch(/wantCents>availableCreditCents/);
  });
  it('undo voids the cheque or reverses the entry before the credit is available again', () => {
    const undo = encaissement.slice(encaissement.indexOf('const undoCreditRefund=async'), encaissement.indexOf('const unpaid=useMemo'));
    expect(undo.indexOf('cheques?.void?.(')).toBeGreaterThan(-1);
    expect(undo.indexOf('creditRefundReverse')).toBeGreaterThan(-1);
    expect(undo.indexOf('creditRefundReverse')).toBeLessThan(undo.indexOf('removeRefund('));
    expect(undo.indexOf('cheques?.void?.(')).toBeLessThan(undo.indexOf('removeRefund('));
    expect(undo).toMatch(/cheque_cleared/);
  });
});

describe('CR-003 auto-apply', () => {
  const auto = APP.slice(APP.indexOf('async function autoApplyClientCredit('), APP.indexOf('function computeSoumTotals('));
  it('is gated by the stored setting and a positive available credit', () => {
    expect(auto).toMatch(/storage\?\.get\?\.\(CLIENT_CREDIT_AUTO_APPLY_KEY\)/);
    expect(auto.indexOf('parseAutoApplySetting')).toBeLessThan(auto.indexOf('applyClientCreditToInvoice('));
    expect(auto).toMatch(/clientAvailableCents\(getCredits\(\),doc\.clientId\)<=0\)return null/);
    expect(auto).toMatch(/facClientCreditAutoApplyFailed/);
  });
  it('the editor runs it only after a successful commit of an invoice entering the ledger', () => {
    expect(factureEditor).toMatch(/if\(!committed\)return;[\s\S]*?if\(isFinalize\)await runAutoApplyCredit\(afterDeposits\)/);
    const emailSend = factureEditor.slice(factureEditor.indexOf('if(!committed)return;\n setForm(p=>({...p,statut:newStatut'));
    expect(emailSend).toMatch(/await runAutoApplyCredit\(afterDeposits\)/);
  });
  it('the toggle lives in the invoicing settings with one named key', () => {
    expect(APP).toMatch(/<ClientCreditSettingsSection\/><InterestConfigSection/);
    expect((APP.match(/dicann-fac-credit-auto-apply/g) || []).length).toBe(0);
    expect(APP).toMatch(/storage\.set\(CLIENT_CREDIT_AUTO_APPLY_KEY/);
  });
});

describe('CR-004 generated invoices commit in one step', () => {
  it('no renderer code calls invoicePost or paymentPost directly', () => {
    for (const src of [APP, OPENING]) {
      expect(src).not.toMatch(/invoicePost\??\.?\(/);
      expect(src).not.toMatch(/paymentPost\??\.?\(/);
    }
  });
  it('every generator, the royalty poster, the opening import and the backfill use the commit helper', () => {
    expect((APP.match(/commitInvoicePosted\(window\.api,/g) || []).length).toBe(5);
    expect(OPENING).toMatch(/commitInvoicePosted\(window\.api, doc, post,/);
    expect(OPENING).toMatch(/openingBalance: true/);
  });
  it('a refused invoice is skipped and named, and the number sequence only advances for created ones', () => {
    for (const marker of ['const confirmGenerate=async', 'const createRoyaltyInvoices=async', 'const doGenerate=async']) {
      const body = APP.slice(APP.indexOf(marker), APP.indexOf(marker) + 5000);
      expect(body, marker).toMatch(/if\(!cr\.ok\)\{notCreated\.push\(/);
    }
    expect(APP).toMatch(/if\(!cr\.ok\)\{notCreated\.push\(\{numero:fac\.numero,res:cr\}\);continue;\}\s*encNum\+\+;/);
    expect(APP).toMatch(/if\(!cr\.ok\)\{notCreated\.push\(\{numero:num,res:cr\}\);continue;\}\s*encNum\+\+;/);
    expect(APP).toMatch(/if\(!cr\.ok\)\{notCreated\.push\(\{numero:inv\.numero,res:cr\}\);continue;\}/);
    const dep = APP.slice(APP.indexOf('const generateDepositInvoice='), APP.indexOf('const generateDepositInvoice=') + 3500);
    expect(dep.indexOf('if(!cr.ok)')).toBeLessThan(dep.indexOf('saveDocNums('));
    expect(APP).toMatch(/const backfillWarned=new Set\(\)/);
  });
  it('the helper reports the failure and names the invoice', async () => {
    const ok = await commitInvoicePosted({ invoices: { commit: async () => ({ ok: true, doc: { id: 1 }, entryId: 4 }) } }, { id: 1 }, {}, [1]);
    expect(ok.ok).toBe(true);
    const bad = await commitInvoicePosted({ invoices: { commit: async () => ({ ok: false, error: 'post_failed', detail: 'PERIOD_CLOSED' }) } }, { id: 1 }, {}, [1]);
    expect(bad.ok).toBe(false);
    const thrown = await commitInvoicePosted({ invoices: { commit: async () => { throw new Error('boom'); } } }, { id: 1 }, {}, [1]);
    expect(thrown).toMatchObject({ ok: false, error: 'boom' });
    expect(failureReason(bad, 'closed period')).toBe('closed period');
    expect(describeNotCreated([{ numero: 'F-0012', res: bad }, { numero: 'F-0013', res: { error: 'x' } }], 'closed period')).toBe('F-0012 (closed period), F-0013 (x)');
  });
  it('the Today list uses the shared overdue rule', () => {
    expect(WORKLIST).toMatch(/import \{ isOverdue \} from '\.\.\/utils\/invoiceStatus\.mjs'/);
    expect(WORKLIST).toMatch(/\.filter\(f => isOverdue\(f, today\)\)/);
    expect(WORKLIST).not.toMatch(/CLOSED_STATUSES/);
  });
});

describe('CR-005 payments in one step', () => {
  const commit = MAIN.slice(MAIN.indexOf("ledgerHandle('invoices:commitPayment'"), MAIN.indexOf("ledgerHandle('invoices:commitPaymentRemoval'"));
  const removal = MAIN.slice(MAIN.indexOf("ledgerHandle('invoices:commitPaymentRemoval'"), MAIN.indexOf("ledgerHandle('ledger:creditnote:post'"));
  it('posts the payment before saving, inside one transaction, and saves nothing on refusal', () => {
    expect(commit).toMatch(/withTransaction\(\(\) => \{/);
    expect(commit.indexOf('postPaymentToLedger(')).toBeLessThan(commit.indexOf("documentsSaveChanges('facture'"));
    expect(commit).toMatch(/if \(!r\.ok\) throw new CommitRefused\(r\)/);
    expect(commit).toMatch(/glEntryId: r\.entryId/);
    expect(PRELOAD).toMatch(/commitPayment: \(opts\) => ipcRenderer\.invoke\('invoices:commitPayment'/);
    expect(PRELOAD).toMatch(/commitPaymentRemoval: \(opts\) => ipcRenderer\.invoke\('invoices:commitPaymentRemoval'/);
  });
  it('the removal reverses first, inside one transaction, and saves without the row', () => {
    expect(removal).toMatch(/withTransaction\(\(\) => \{/);
    expect(removal.indexOf('reversePaymentInLedger(')).toBeLessThan(removal.indexOf("documentsSaveChanges('facture'"));
    expect(removal).toMatch(/filter\(p => !\(p && String\(p\.id\) === String\(paymentId\)\)\)/);
  });
  it('ledger:payment:post and :reverse share the same plain functions and stay idempotent', () => {
    expect(MAIN).toMatch(/function postPaymentToLedger\(/);
    expect(MAIN).toMatch(/ledgerHandle\('ledger:payment:post'[\s\S]{0,200}postPaymentToLedger\(args/);
    expect(MAIN).toMatch(/glFindEntryBySource\('payment', paymentId\);\n  if \(existing\) return \{ ok: true, entryId: existing\.id, alreadyPosted: true \}/);
    expect(MAIN).toMatch(/function reversePaymentInLedger\(/);
  });
  it('the payment screen does nothing else when the commit failed', () => {
    const apply = encaissement.slice(encaissement.indexOf('const _applyPayment=async'), encaissement.indexOf('// Cash taken in the till'));
    expect(apply).toMatch(/if\(!committed\)return null;/);
    expect(apply.indexOf('if(!committed)return null;')).toBeLessThan(apply.indexOf('logCreate('));
    const save = encaissement.slice(encaissement.indexOf('const doSave=async()'));
    expect(save).toMatch(/const applied=await _applyPayment\(\[\.\.\.factures\],selFac,montant,docNums\.encaissement\);\s*if\(!applied\)return;/);
    expect(save.indexOf('if(!applied)return;')).toBeLessThan(save.indexOf('createCreditForExcess('));
    expect(save.indexOf('if(!applied)return;')).toBeLessThan(save.indexOf('registerCheque('));
    expect(save.indexOf('if(!applied)return;')).toBeLessThan(save.indexOf('persistCashRows('));
    expect(save).toMatch(/if\(!applied\)\{batchStopped=true;break;\}/);
    expect(save).toMatch(/keepAsCredit&&lastResult&&!batchStopped/);
    expect(save).toMatch(/if\(!results\.length\)return;/);
    expect(save).toMatch(/encNum\+\+;\s*const\{updFactures:uf/);
  });
  it('removing a payment in the editor goes through the removal commit', () => {
    const v = factureEditor.slice(factureEditor.indexOf('const voidPaiement='), factureEditor.indexOf('const doPrint='));
    expect(v).toMatch(/commitPaymentRemovalOnInvoice\(/);
    expect(v.indexOf('commitPaymentRemovalOnInvoice(')).toBeLessThan(v.indexOf('upd({paiements:rest'));
    expect(v).toMatch(/\{alreadySaved:true\}/);
  });
});

describe('CR-006 exports', () => {
  const exp = APP.slice(APP.indexOf('function ComptabiliteExport('), APP.indexOf('const doExportExcel=async'));
  it('Acomba and Sage carry the excess received, each application and each refund from the shared account table', () => {
    expect(exp).toMatch(/creditExportEvents/);
    expect((exp.match(/for\(const ev of creditExportEvents\(\)\)/g) || []).length).toBe(2);
    expect(exp).toMatch(/GL\.customerDeposits/);
    expect(exp).toMatch(/GL\.undeposited/);
    expect(exp).not.toMatch(/["']2500["']/);
    expect(exp).not.toMatch(/["']1050["']/);
    expect(exp).toMatch(/inRange\(c\.date\)/);
    expect(exp).toMatch(/inRange\(a\.date\)/);
    expect(exp).toMatch(/inRange\(r\.date\)/);
    expect(APP).toMatch(/customerDeposits:"2500",undeposited:"1050"/);
  });
});
