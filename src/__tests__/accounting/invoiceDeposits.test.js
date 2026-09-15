import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { applyDepositsOnSend, appliedDepositsTotal, depositApplyDate } from '../../utils/invoiceDeposits.js';

const ROOT = path.resolve(__dirname, '../../..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const draft = {
  id: 'inv-1', numero: 'F-TEST', statut: 'Brouillon', date: '2026-03-10',
  acomptes: [
    { id: 'dep-a', date: '2026-03-01', montant: 100, mode: 'Chèque', reference: 'CHQ 12', glEntryId: 71 },
    { id: 'dep-b', date: '2026-03-05', montant: 50, mode: 'Comptant' },
  ],
  paiements: [],
};

describe('DEPOSIT sending an invoice applies its deposits', () => {
  it('DEPOSIT-001 a draft keeps its deposits as deposits', () => {
    const r = applyDepositsOnSend(draft, 400);
    expect(r.applied).toEqual([]);
    expect(r.doc).toBe(draft);
  });

  it('DEPOSIT-002 a sent invoice turns each deposit into a flagged payment', () => {
    const { doc, applied } = applyDepositsOnSend({ ...draft, statut: 'Envoyée' }, 400);
    expect(applied.map(p => p.id)).toEqual(['dep-a', 'dep-b']);
    expect(doc.acomptes).toEqual([]);
    expect(doc.paiements).toHaveLength(2);
    expect(doc.paiements[0]).toMatchObject({ id: 'dep-a', montant: 100, mode: 'Chèque', reference: 'CHQ 12', isDeposit: true, appliedDeposit: true, receiptEntryId: 71 });
    expect(doc.statut).toBe('Payée partiellement');
  });

  it('DEPOSIT-003 deposits covering the whole invoice mark it paid', () => {
    expect(applyDepositsOnSend({ ...draft, statut: 'Envoyée' }, 150).doc.statut).toBe('Payée');
  });

  it('DEPOSIT-004 applying twice adds nothing the second time', () => {
    const once = applyDepositsOnSend({ ...draft, statut: 'Envoyée' }, 400).doc;
    const again = applyDepositsOnSend({ ...once, acomptes: draft.acomptes }, 400);
    expect(again.applied).toEqual([]);
    expect(again.doc.paiements).toHaveLength(2);
  });

  it('DEPOSIT-005 cancelled invoices and proformas are left alone', () => {
    expect(applyDepositsOnSend({ ...draft, statut: 'Annulée' }, 400).applied).toEqual([]);
    expect(applyDepositsOnSend({ ...draft, statut: 'Envoyée', documentType: 'proforma' }, 400).applied).toEqual([]);
  });

  it('DEPOSIT-006 the printed invoice can still tell deposits from payments', () => {
    const { doc } = applyDepositsOnSend({ ...draft, statut: 'Envoyée', paiements: [{ id: 'pay-1', montant: 30 }] }, 400);
    expect(appliedDepositsTotal(doc.paiements)).toBe(150);
  });

  it('DEPOSIT-007 a deposit is applied no earlier than it was received', () => {
    expect(depositApplyDate('2026-03-01', '2026-03-10')).toBe('2026-03-10');
    expect(depositApplyDate('2026-03-12', '2026-03-10')).toBe('2026-03-12');
    expect(depositApplyDate(null, '2026-03-10')).toBe('2026-03-10');
  });
});

describe('DEPOSIT ledger wiring', () => {
  const MAIN = read('main.js');
  const APP = read('src/App.jsx');
  const FE = APP.slice(APP.indexOf('function FactureEditor('), APP.indexOf('\nfunction EncaissementEditor('));

  it('DEPOSIT-008 receipts go to 2500 and applications take 2500 to receivables, idempotently', () => {
    expect(MAIN).toMatch(/ipcMain\.handle\('ledger:deposit:post'/);
    expect(MAIN).toMatch(/ipcMain\.handle\('ledger:deposit:apply'/);
    expect(MAIN).toMatch(/ipcMain\.handle\('ledger:deposit:reverse'/);
    expect(MAIN).toMatch(/glFindEntryBySource\('deposit', depositId\)/);
    expect(MAIN).toMatch(/glFindEntryBySource\('deposit_apply', depositId\)/);
    expect(MAIN).toMatch(/find\('2500'\)/);
    const preload = read('preload.js');
    for (const k of ['depositPost', 'depositApply', 'depositReverse']) expect(preload).toMatch(new RegExp(`${k}:`));
  });

  it('DEPOSIT-009 the invoice editor posts receipts on save and applies deposits on both send paths', () => {
    expect(FE).toMatch(/else if\(form\.statut==='Brouillon'\)postDepositReceipts\(id,numero,doc\.acomptes\)/);
    expect(FE).toMatch(/settleDepositsOnSend\(id,numero,doc\)/);
    expect(FE).toMatch(/settleDepositsOnSend\(savedId,savedNumero,doc\)/);
    expect(FE).toMatch(/p\.appliedDeposit\?window\.api\?\.ledger\?\.depositReverse/);
  });
});

describe('PDFSAFE PDFs are parsed out of the main process', () => {
  const MAIN = read('main.js');
  const WORKER = read('pdf-worker.js');

  it('PDFSAFE-001 the main process never loads pdfjs itself', () => {
    expect(MAIN).not.toMatch(/require\(['"]pdfjs-dist/);
    expect(MAIN).toMatch(/utilityProcess\.fork\(path\.join\(__dirname, 'pdf-worker\.js'\)/);
    expect(MAIN).toMatch(/PDF_MAX_BYTES/);
    expect(MAIN).toMatch(/pdf_timeout/);
  });

  it('PDFSAFE-002 the worker runs pdfjs 4 with eval disabled and a page ceiling', () => {
    expect(WORKER).toMatch(/import\('pdfjs-dist\/legacy\/build\/pdf\.mjs'\)/);
    expect(WORKER).toMatch(/isEvalSupported: false/);
    expect(WORKER).toMatch(/HARD_PAGE_LIMIT/);
    const version = JSON.parse(read('package.json')).dependencies['pdfjs-dist'];
    expect(Number(version.replace(/^\D*/, '').split('.')[0])).toBeGreaterThanOrEqual(4);
  });

  it('PDFSAFE-003 the POS scan screen uses the same build with eval disabled', () => {
    const pos = read('src/components/POSScanModal.jsx');
    expect(pos).toMatch(/pdfjs-dist\/legacy\/build\/pdf\.mjs/);
    expect(pos).toMatch(/isEvalSupported: false/);
    expect(pos).not.toMatch(/pdf\.js['"]/);
  });
});

describe('CRONAUTH scheduled functions', () => {
  it.each(['weekly-digest', 'payment-alert'])('CRONAUTH-001 %s checks the Vault secret and reports failed email', (fn) => {
    const src = read(`supabase/functions/${fn}/index.ts`);
    expect(src).toMatch(/requireCronSecret\(req, supabase\)/);
    expect(src).not.toMatch(/Deno\.env\.get\('CRON_SECRET'\)/);
    expect(src).toMatch(/if \(!sent\.ok\)/);
  });

  it('CRONAUTH-002 the digest counts new installs by first seen', () => {
    expect(read('supabase/functions/weekly-digest/index.ts')).toMatch(/\.gte\('first_seen_at', weekAgo\)/);
  });
});
