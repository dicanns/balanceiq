/**
 * CC-001  clientCredits arithmetic (cents)
 * CC-002  a customer-credit row is not money received
 * CC-003  account standing nets the available credit
 * CC-004  wiring: handlers, payment screen order, removal paths
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  creditAvailableCents, clientAvailableCents, applyCredits, addApplication,
  removeApplication, findCreditByPayment, CLIENT_CREDITS_KEY, CLIENT_CREDIT_MODE,
} from '../../utils/clientCredits.mjs';
import { isCashPayment } from '../../utils/invoiceStatus.mjs';
import { statusAfterPayments } from '../../utils/creditNotes.js';
import { accountStanding } from '../../services/accountStanding.js';

const credit = (id, clientId, date, amountCents, applications = []) => ({ id, clientId, date, amountCents, applications });

describe('CC-001 arithmetic', () => {
  it('available is the amount less its applications', () => {
    expect(creditAvailableCents(credit('a', 'c1', '2026-01-01', 5000))).toBe(5000);
    expect(creditAvailableCents(credit('a', 'c1', '2026-01-01', 5000, [{ id: 'x', amountCents: 1200 }, { id: 'y', amountCents: 300 }]))).toBe(3500);
    expect(creditAvailableCents(credit('a', 'c1', '2026-01-01', 100, [{ id: 'x', amountCents: 500 }]))).toBe(0);
    expect(creditAvailableCents(null)).toBe(0);
  });
  it('clientAvailableCents sums one customer only', () => {
    const list = [credit('a', 'c1', '2026-01-01', 1000), credit('b', 'c2', '2026-01-02', 700), credit('c', 'c1', '2026-01-03', 250, [{ id: 'z', amountCents: 50 }])];
    expect(clientAvailableCents(list, 'c1')).toBe(1200);
    expect(clientAvailableCents(list, 'c2')).toBe(700);
    expect(clientAvailableCents(list, 'nobody')).toBe(0);
    expect(clientAvailableCents(undefined, 'c1')).toBe(0);
  });
  it('applyCredits draws on the oldest credit first and spills to the next', () => {
    let n = 0;
    const list = [credit('new', 'c1', '2026-03-01', 1000), credit('old', 'c1', '2026-01-01', 400), credit('other', 'c2', '2025-01-01', 9999)];
    const r = applyCredits(list, 'c1', 900, { factureId: 'f1', date: '2026-04-01', makeId: () => `app${++n}` });
    expect(r.applications.map((a) => [a.creditId, a.amountCents, a.id])).toEqual([['old', 400, 'app1'], ['new', 500, 'app2']]);
    expect(r.appliedCents).toBe(900);
    expect(creditAvailableCents(r.credits.find((c) => c.id === 'old'))).toBe(0);
    expect(creditAvailableCents(r.credits.find((c) => c.id === 'new'))).toBe(500);
    expect(r.credits.find((c) => c.id === 'other')).toBe(list[2]);
    expect(list[0].applications).toEqual([]); // input untouched
  });
  it('never applies more than is available or asked', () => {
    const list = [credit('a', 'c1', '2026-01-01', 300)];
    const r = applyCredits(list, 'c1', 1000, { factureId: 'f', date: 'd', makeId: () => 'x' });
    expect(r.appliedCents).toBe(300);
    expect(applyCredits(list, 'c1', 0, { factureId: 'f', date: 'd' }).applications).toEqual([]);
    expect(applyCredits(list, 'c2', 100, { factureId: 'f', date: 'd' }).applications).toEqual([]);
  });
  it('add and remove an application are inverses', () => {
    const list = [credit('a', 'c1', '2026-01-01', 1000)];
    const added = addApplication(list, 'a', { id: 'p1', factureId: 'f', date: 'd', amountCents: 400, glEntryId: 7 });
    expect(creditAvailableCents(added[0])).toBe(600);
    expect(creditAvailableCents(removeApplication(added, 'p1')[0])).toBe(1000);
  });
  it('findCreditByPayment finds the credit an overpaying payment created', () => {
    const list = [{ ...credit('a', 'c1', 'd', 100), sourcePaymentId: 'pay1' }];
    expect(findCreditByPayment(list, 'pay1').id).toBe('a');
    expect(findCreditByPayment(list, 'nope')).toBeNull();
  });
  it('has one storage key and one mode label', () => {
    expect(CLIENT_CREDITS_KEY).toBe('dicann-fac-client-credits');
    expect(CLIENT_CREDIT_MODE).toBe('Crédit client');
  });
});

describe('CC-002 not money received', () => {
  it('isCashPayment excludes fromClientCredit', () => {
    expect(isCashPayment({ montant: 10, mode: 'Virement/E-Transfer' })).toBe(true);
    expect(isCashPayment({ montant: 10, mode: CLIENT_CREDIT_MODE, fromClientCredit: true })).toBe(false);
    expect(isCashPayment({ montant: 10, fromCredit: true })).toBe(false);
  });
  it('an invoice settled only by a customer credit is Payée, not Créditée', () => {
    const paiements = [{ montant: 50, fromClientCredit: true }];
    expect(statusAfterPayments({ paiements }, 50, 'Envoyée')).toBe('Payée');
    expect(statusAfterPayments({ paiements }, 80, 'Envoyée')).toBe('Payée partiellement');
  });
});

describe('CC-003 account standing', () => {
  const inv = { id: 'f1', clientId: 'c1', statut: 'Envoyée', dateEcheance: '2026-12-31', total: 100, paiements: [] };
  const base = { clientId: 'c1', factures: [inv], asOf: '2026-06-01', totalOf: (d) => d.total };
  it('is unchanged without credits (backward compatible)', () => {
    const st = accountStanding(base);
    expect(st.outstanding).toBe(100);
    expect(st.creditsAvailable).toBe(0);
    expect(st.balanceOwed).toBe(100);
  });
  it('nets the available customer credit', () => {
    const st = accountStanding({ ...base, clientCredits: [credit('k', 'c1', '2026-05-01', 3000), credit('z', 'c2', '2026-05-01', 9000)] });
    expect(st.creditsAvailable).toBe(30);
    expect(st.balanceOwed).toBe(70);
    expect(st.credits).toHaveLength(1);
  });
  it('an applied part is on the invoice, only the rest counts as available', () => {
    const applied = { ...inv, paiements: [{ montant: 20, fromClientCredit: true }] };
    const st = accountStanding({ ...base, factures: [applied], clientCredits: [credit('k', 'c1', '2026-05-01', 3000, [{ id: 'p', amountCents: 2000 }])] });
    expect(st.outstanding).toBe(80);
    expect(st.creditsAvailable).toBe(10);
    expect(st.balanceOwed).toBe(70);
  });
});

const root = path.resolve(__dirname, '../../..');
const APP = fs.readFileSync(path.join(root, 'src/App.jsx'), 'utf8');
const MAIN = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
const PRELOAD = fs.readFileSync(path.join(root, 'preload.js'), 'utf8');
const encaissement = APP.slice(APP.indexOf('function EncaissementEditor('), APP.indexOf('// ── NOTE DE CRÉDIT ──'));
const factureEditor = APP.slice(APP.indexOf('function FactureEditor('), APP.indexOf('function EncaissementEditor('));

describe('CC-004 wiring', () => {
  const applyHandler = MAIN.slice(MAIN.indexOf("ledgerHandle('ledger:credit:apply'"), MAIN.indexOf("ledgerHandle('ledger:credit:applyReverse'"));
  const reverseHandler = MAIN.slice(MAIN.indexOf("ledgerHandle('ledger:credit:applyReverse'"), MAIN.indexOf("ipcMain.handle('ledger:deposit:reverse'"));
  it('both handlers go through ledgerHandle and are exposed to the renderer', () => {
    expect(applyHandler.length).toBeGreaterThan(200);
    expect(reverseHandler.length).toBeGreaterThan(100);
    expect(PRELOAD).toMatch(/creditApply:\s+\(opts\) => ipcRenderer\.invoke\('ledger:credit:apply'/);
    expect(PRELOAD).toMatch(/creditApplyReverse:\s+\(opts\) => ipcRenderer\.invoke\('ledger:credit:applyReverse'/);
  });
  it('the apply handler never posts a receipt and is idempotent on the application id', () => {
    expect(applyHandler).not.toMatch(/postDepositReceipt/);
    expect(applyHandler).toMatch(/glFindEntryBySource\('credit_apply', applicationId\)/);
    expect(applyHandler).toMatch(/source_type: 'credit_apply'/);
    expect(applyHandler).toMatch(/return \{ ok: false/);
  });
  it('the reverse handler is ok when there is nothing to reverse and deletes drafts', () => {
    expect(reverseHandler).toMatch(/nothingToReverse: true/);
    expect(reverseHandler).toMatch(/glDeleteDraft/);
  });
  it('the payment screen creates the credit only after the invoice payment was recorded', () => {
    const single = encaissement.slice(encaissement.indexOf('const doSave=async()'));
    const savedAt = single.indexOf('saveFactures(updFactures,{alreadySaved:true});');
    const creditAt = single.indexOf('await createCreditForExcess(');
    expect(savedAt).toBeGreaterThan(-1);
    expect(creditAt).toBeGreaterThan(savedAt);
    const bulkSaved = single.indexOf('saveFactures(updFactures,{alreadySaved:true});', single.indexOf('let updFactures=[...factures];'));
    const bulkCredit = single.indexOf('await createCreditForExcess(', bulkSaved);
    expect(bulkCredit).toBeGreaterThan(bulkSaved);
  });
  it('the credit is saved only when the receipt posted ok, and the ledger call precedes the row on apply', () => {
    const create = encaissement.slice(encaissement.indexOf('const createCreditForExcess='), encaissement.indexOf('const applyClientCredit='));
    expect(create.indexOf('depositPost')).toBeLessThan(create.indexOf('saveClientCredits('));
    expect(create).toMatch(/if\(!res\?\.ok\)\{alert\(T\.facClientCreditNotCreated\);return null;\}/);
    // The core shared by the Apply button and the auto-apply setting.
    const apply = APP.slice(APP.indexOf('async function applyClientCreditToInvoice('), APP.indexOf('// Record a payment on an invoice as one step'));
    expect(apply.indexOf('creditApply?.(')).toBeGreaterThan(-1);
    expect(apply.indexOf('creditApply?.(')).toBeLessThan(apply.indexOf('saveFactures('));
    expect(apply).toMatch(/if\(!r\?\.ok\)return\{/);
    expect(apply).toMatch(/fromClientCredit:true/);
    expect(apply).not.toMatch(/paymentPost/);
    const button = encaissement.slice(encaissement.indexOf('const applyClientCredit='), encaissement.indexOf('// ── Refund a credit'));
    expect(button).toMatch(/applyClientCreditToInvoice\(/);
  });
  it('removing an applied-credit row reverses it before changing the invoice', () => {
    const v = factureEditor.slice(factureEditor.indexOf('const voidPaiement='), factureEditor.indexOf('const doPrint='));
    expect(v.indexOf('creditApplyReverse')).toBeGreaterThan(-1);
    expect(v.indexOf('creditApplyReverse')).toBeLessThan(v.indexOf('upd({paiements:rest'));
    expect(v).toMatch(/findCreditByPayment/);
    expect(v).toMatch(/depositReverse\?\.\(\{depositId:ownCredit\.id/);
    expect(v).toMatch(/facCreditAlreadyApplied/);
  });
  it('voiding an invoice releases applied credits first', () => {
    expect(factureEditor).toMatch(/const releaseClientCreditRows=async/);
    expect((factureEditor.match(/releaseClientCreditRows\(\)/g) || []).length).toBeGreaterThanOrEqual(2);
  });
  it('no cash path posts or counts a customer-credit row', () => {
    expect(APP).not.toMatch(/paymentPost\?\.\(\{[^}]*fromClientCredit/);
    expect((APP.match(/p\.fromCredit\|\|p\.fromClientCredit\)continue/g) || []).length).toBe(2); // Acomba + Sage exports
    expect(APP).toMatch(/if\(p\.fromClientCredit\)continue; \/\/ its own line/); // statement rows
  });
});
