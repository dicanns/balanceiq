import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { recurringInvoiceHtmlArgs } from '../../utils/recurringInvoiceEmail.js';
import { computeInvoiceTotals } from '../../utils/calculations.js';

const APP = fs.readFileSync(path.resolve(__dirname, '../../App.jsx'), 'utf8');
const between = (start, end) => {
  const a = APP.indexOf(start);
  return APP.slice(a, APP.indexOf(end, a + start.length));
};
const MODAL = between('function RecurringGenerateModal(', '\nfunction ClientProfile(');

const clients = [
  { id: 'c1', entreprise: 'Other Co' },
  { id: 'c2', entreprise: 'Acme', courriel: 'billing@acme.test', langue: 'English' },
];
const fac = {
  id: 'f1',
  clientId: 'c2',
  numero: 'F-0042',
  date: '2026-10-21',
  dateEcheance: '',
  statut: 'Envoyée',
  notes: '',
  paiements: [],
  lignes: [{ description: 'Monthly service', quantite: 2, prixUnitaire: 50 }],
};

describe('RECUR-SEND recurring auto-send builds a real invoice', () => {
  it('RECUR-SEND-001 passes the fields buildFactureHTML reads, with totals computed', () => {
    const args = recurringInvoiceHtmlArgs({ fac, clients, companyInfo: { nom: 'GQ' }, invoiceTemplate: { accentColor: '#123456' } });
    expect(args.numero).toBe('F-0042');
    expect(args.statut).toBe('Envoyée');
    expect(args.lignes).toEqual(fac.lignes);
    expect(args.totals).toEqual(computeInvoiceTotals(fac.lignes, fac));
    expect(args.totals.sousTotal).toBe(100);
    expect(args.totals.total).toBe(100);
    expect(args.companyInfo).toEqual({ nom: 'GQ' });
    expect(args.invoiceTemplate).toEqual({ accentColor: '#123456' });
    expect(args.montantPaye).toBe(0);
    expect(args.acomptes).toEqual([]);
    expect(args).not.toHaveProperty('facture');
  });

  it('RECUR-SEND-002 resolves the invoice client from the client list', () => {
    expect(recurringInvoiceHtmlArgs({ fac, clients, companyInfo: {} }).client).toBe(clients[1]);
    expect(recurringInvoiceHtmlArgs({ fac: { ...fac, clientId: 'nope' }, clients, companyInfo: {} }).client).toBeNull();
  });

  it('RECUR-SEND-003 tolerates a missing template and empty lines', () => {
    const args = recurringInvoiceHtmlArgs({ fac: { ...fac, lignes: undefined }, clients });
    expect(args.invoiceTemplate).toEqual({});
    expect(args.companyInfo).toEqual({});
    expect(args.lignes).toEqual([]);
    expect(args.totals.total).toBe(0);
  });

  it('RECUR-SEND-004 the modal builds its email from the helper, with the template passed in', () => {
    expect(MODAL).toMatch(/buildFactureHTML\(recurringInvoiceHtmlArgs\(\{fac,clients,companyInfo,invoiceTemplate\}\)\)/);
    expect(MODAL).not.toMatch(/buildFactureHTML\(\{facture:/);
    expect(APP).toMatch(/<RecurringGenerateModal [^>]*invoiceTemplate=\{invoiceTemplate\}/);
  });

  it('RECUR-SEND-005 a failed send is recorded and shown, never swallowed', () => {
    expect(MODAL).not.toMatch(/catch\(_\)\{\}/);
    expect(MODAL).toMatch(/row\.emailError=/);
    expect(MODAL).toMatch(/console\.warn\('\[recurring\] auto-send failed'/);
    expect(MODAL).toMatch(/T\.recurringEmailFailed/);
  });
});
