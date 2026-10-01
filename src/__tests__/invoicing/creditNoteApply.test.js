/**
 * CNAPPLY-001  a saved credit note applies to an open invoice, never past either balance
 * CNAPPLY-002  what is left of a credit counts every application, and none once cancelled
 * CNAPPLY-003  cancelling takes the credit off every invoice it was applied to
 * CNAPPLY-004  the editor: apply panel, cancel reverses the entry, tax per line, why Save is off
 * CNAPPLY-005  the client profile lists credit notes with what is left
 *
 * Figures are invented.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { applyCreditToInvoice, creditRemaining, invoiceBalance, statusAfterPayments, unapplyCredit } from '../../utils/creditNotes.js';

const ROOT = path.resolve(__dirname, '../../..');
const app = fs.readFileSync(path.join(ROOT, 'src/App.jsx'), 'utf8');
const editor = app.slice(app.indexOf('function NoteDeCreditEditor('), app.indexOf('// ── SPRINT 9 - DEPOSIT SCHEDULE'));

const invoice = (over = {}) => ({ id: 'f1', numero: 'F-0101', clientId: 'c1', statut: 'Envoyée', paiements: [], ...over });
const cn = (over = {}) => ({ id: 'n1', numero: 'NC-0101', clientId: 'c1', statut: 'Émise', factureId: '', ...over });

describe('CNAPPLY-001 applying', () => {
  it('settles what the invoice still owes after a partial payment, and marks the credit applied', () => {
    const inv = invoice({ paiements: [{ montant: 900, mode: 'Virement' }] });
    const r = applyCreditToInvoice({ creditNote: cn(), creditTotal: 100, invoice: inv, invoiceTotal: 1000, factures: [inv], amount: 100, date: '2026-09-30' });
    expect(r.applied).toBe(100);
    expect(r.invoice.statut).toBe('Payée');
    expect(r.invoice.paiements.at(-1)).toMatchObject({ montant: 100, fromCredit: true, reference: 'NC-0101' });
    expect(r.creditNote).toMatchObject({ statut: 'Appliquée', factureId: 'f1' });
  });
  it('never applies more than the invoice owes; the rest of the credit stays available', () => {
    const inv = invoice({ paiements: [{ montant: 960, mode: 'Virement' }] });
    const r = applyCreditToInvoice({ creditNote: cn(), creditTotal: 100, invoice: inv, invoiceTotal: 1000, factures: [inv], amount: 100, date: '2026-09-30' });
    expect(r.applied).toBe(40);
    expect(r.leftAfter).toBe(60);
    expect(r.creditNote.statut).toBe('Émise');
  });
  it('refuses another customer, a cancelled credit, a draft invoice, and nothing left', () => {
    const base = { creditTotal: 50, invoiceTotal: 100, date: '2026-09-30', amount: 50 };
    expect(applyCreditToInvoice({ ...base, creditNote: cn(), invoice: invoice({ clientId: 'c2' }), factures: [] }).error).toBe('other_client');
    expect(applyCreditToInvoice({ ...base, creditNote: cn({ statut: 'Annulée' }), invoice: invoice(), factures: [] }).error).toBe('cancelled');
    expect(applyCreditToInvoice({ ...base, creditNote: cn(), invoice: invoice({ statut: 'Brouillon' }), factures: [] }).error).toBe('invoice_not_open');
    const used = invoice({ paiements: [{ montant: 50, fromCredit: true, reference: 'NC-0101' }] });
    expect(applyCreditToInvoice({ ...base, creditNote: cn(), invoice: invoice({ id: 'f2' }), factures: [used] }).error).toBe('nothing_left');
  });
});

describe('CNAPPLY-002 what is left', () => {
  it('counts applications on every invoice, and is zero once cancelled', () => {
    const fs_ = [invoice({ paiements: [{ montant: 10, fromCredit: true, reference: 'NC-0101' }] }), invoice({ id: 'f2', paiements: [{ montant: 15.5, fromCredit: true, reference: 'NC-0101' }, { montant: 99, fromCredit: true, reference: 'NC-0999' }] })];
    expect(creditRemaining(cn(), 50, fs_)).toBe(24.5);
    expect(creditRemaining(cn({ statut: 'Annulée' }), 50, fs_)).toBe(0);
    expect(invoiceBalance(invoice({ paiements: [{ montant: 30 }] }), 100)).toBe(70);
    expect(statusAfterPayments({ paiements: [{ montant: 100, fromCredit: true }] }, 100)).toBe('Créditée');
  });
});

describe('CNAPPLY-003 cancelling', () => {
  it('removes the credit from each invoice and puts its status back', () => {
    const fs_ = [invoice({ statut: 'Payée', paiements: [{ montant: 90, mode: 'Virement' }, { montant: 10, fromCredit: true, reference: 'NC-0101' }] })];
    const out = unapplyCredit(cn(), fs_, () => 100);
    expect(out[0].paiements).toHaveLength(1);
    expect(out[0].statut).toBe('Payée partiellement');
  });
});

describe('CNAPPLY-004 the editor', () => {
  it('offers to apply a saved credit to an open invoice', () => {
    expect(editor).toMatch(/applyCreditToInvoice\(\{creditNote:savedRec/);
    expect(editor).toMatch(/Apply to an invoice/);
    expect(editor).toMatch(/Appliquer à une facture/);
  });
  it('cancelling reverses the ledger entry and unapplies, and an issued note changes only its status', () => {
    expect(editor).toMatch(/form\.statut==="Annulée"&&prevStatut!=="Annulée"/);
    expect(editor).toMatch(/creditNoteReverse\(\{creditNoteId:id,reason:T===EN\?"Credit note cancelled"/);
    expect(editor).toMatch(/unapplyCredit\(rec,prev/);
    expect(editor).toMatch(/if\(savedId&&prevStatut&&prevStatut!=="Brouillon"\)\{/);
  });
  it('takes tax per line, stores the sums so every screen agrees, and prints them', () => {
    expect(editor).toMatch(/const lineTaxSums=useMemo/);
    expect(editor).toMatch(/\.\.\.\(form\.taxPerLine\?\{tpsOverride:taxOpts\.tpsOverride,tvqOverride:taxOpts\.tvqOverride\}:\{\}\)/);
    expect(app).toMatch(/const totals=computeSoumTotals\(lignes,\{tpsOverride,tvqOverride\}\);/);
  });
  it('says why Save is off, labels the custom-line columns, and speaks English', () => {
    expect(editor).toMatch(/\{!canSave&&saveBlocker&&<span/);
    expect(editor).toMatch(/"Enter a reason\."/);
    expect(editor).toMatch(/T===EN\?"Amount before tax":"Montant avant taxes"/);
    expect(editor).toMatch(/\{STATUTS_NC\.map\(s=><option key=\{s\} value=\{s\}>\{stLbl\(s\)\}<\/option>\)\}/);
    expect(editor).toMatch(/T===EN\?"CREDIT TOTAL":"CRÉDIT TOTAL"/);
    const tr = fs.readFileSync(path.join(ROOT, 'src/i18n/translations.js'), 'utf8');
    expect(tr).toMatch(/"Émise":"Issued","Appliquée":"Applied"/);
  });
});

describe('CNAPPLY-005 the client profile', () => {
  it('has a Credit notes tab showing what is not applied', () => {
    expect(app).toMatch(/\{id:"credits",label:`\$\{T===EN\?"Credit notes":"Notes de crédit"\}/);
    expect(app).toMatch(/profileTab==="credits"/);
    expect(app).toMatch(/_left:creditRemaining\(n,tot,factures\|\|\[\]\)/);
  });
});
