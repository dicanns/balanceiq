/**
 * OPENAR-001  pasted cells and CSV files both read as rows
 * OPENAR-002  the column roles are guessed from a title line, and dates come in both common shapes
 * OPENAR-003  each good row becomes a sent, untaxed invoice; customers are matched or created
 * OPENAR-004  bad rows are reported, not imported; a number already used is refused
 * OPENAR-005  opening invoices stay out of the sales exports
 *
 * A business moving to BalanceIQ still has invoices its customers owe. They
 * are brought in one by one so each can be paid, reminded and aged, but none
 * of them is revenue again: it was counted, and taxed, in the previous
 * software. That is why the line carries no tax and the ledger books it
 * against opening balance equity (main.js, openingBalance).
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { parseOpeningRows, guessOpeningRoles, buildOpeningInvoices, matchClient, parseDate, parseAmount } from '../../../utils/openingReceivables.mjs';

const ids = (() => { let n = 0; return () => `id${++n}`; })();
const clients = [{ id: 'c1', code: 'ACME', entreprise: 'Acme Épicerie Inc.' }, { id: 'c2', code: 'B2', entreprise: 'Boulangerie B' }];

describe('OPENAR-001 rows', () => {
  it('reads pasted (tab) cells and CSV alike', () => {
    expect(parseOpeningRows('Client\tNo\tDate\tSolde\nAcme\t1209\t2026-08-31\t6 827,75\n')).toEqual([['Client', 'No', 'Date', 'Solde'], ['Acme', '1209', '2026-08-31', '6 827,75']]);
    expect(parseOpeningRows('Client,No,Date,Solde\n"Acme, Inc.",1209,2026-08-31,6827.75\n')[1]).toEqual(['Acme, Inc.', '1209', '2026-08-31', '6827.75']);
  });
});

describe('OPENAR-002 roles and dates', () => {
  it('guesses roles from a title line, two dates being date then due date', () => {
    const rows = parseOpeningRows('Customer,Invoice #,Date,Due date,Balance owed\nAcme,1209,2026-08-31,2026-09-30,100');
    const g = guessOpeningRoles(rows);
    expect(g.hasHeader).toBe(true);
    expect(g.roles).toEqual(['client', 'numero', 'date', 'dateEcheance', 'montant']);
  });
  it('reads ISO and day-first dates, and amounts with spaces, commas or a dollar sign', () => {
    expect(parseDate('2026-08-31')).toBe('2026-08-31');
    expect(parseDate('31/08/2026')).toBe('2026-08-31');
    expect(parseDate('August')).toBeNull();
    expect(parseAmount('6 827,75 $')).toBe(6827.75);
    expect(parseAmount('6827.75')).toBe(6827.75);
    expect(Number.isNaN(parseAmount('n/a'))).toBe(true);
  });
});

describe('OPENAR-003 invoices built', () => {
  const rows = [['Client', 'No', 'Date', 'Échéance', 'Solde'], ['acme', '1209', '2026-08-31', '2026-09-30', '6827.75'], ['Nouveau Resto', '1215', '30/09/2026', '', '3508.96']];
  const roles = ['client', 'numero', 'date', 'dateEcheance', 'montant'];
  it('matches by code or name (accents and case ignored) and creates the rest', () => {
    expect(matchClient('ACME', clients).id).toBe('c1');
    expect(matchClient('acme epicerie inc.', clients).id).toBe('c1');
    expect(matchClient('nobody', clients)).toBeNull();
    const r = buildOpeningInvoices(rows, roles, { hasHeader: true, clients, factures: [], asOf: '2026-10-31', ids });
    expect(r.errors).toEqual([]);
    expect(r.invoices).toHaveLength(2);
    expect(r.newClients).toHaveLength(1);
    expect(r.newClients[0].entreprise).toBe('Nouveau Resto');
    const a = r.invoices[0];
    expect(a).toMatchObject({ numero: '1209', date: '2026-08-31', dateEcheance: '2026-09-30', clientId: 'c1', statut: 'Envoyée', openingBalance: true, openingAsOf: '2026-10-31' });
    expect(a.lignes).toHaveLength(1);
    expect(a.lignes[0]).toMatchObject({ quantite: 1, prixUnitaire: 6827.75, tps: false, tvq: false });
    const b = r.invoices[1];
    expect(b.dateEcheance).toBe('2026-09-30');   // no due date given: the invoice date
    expect(b.clientId).toBe(r.newClients[0].id);
  });
});

describe('OPENAR-004 bad rows', () => {
  it('are reported with their line number and left out', () => {
    const rows = [['Acme', '', '2026-08-31', '10'], ['Acme', '2', 'soon', '10'], ['Acme', '3', '2026-08-31', '0'], ['', '4', '2026-08-31', '10'], ['Acme', 'F-0012', '2026-08-31', '10'], ['Acme', '9', '2026-08-31', '10'], ['Acme', '9', '2026-09-01', '11']];
    const r = buildOpeningInvoices(rows, ['client', 'numero', 'date', 'montant'], { hasHeader: false, clients, factures: [{ numero: 'F-0012' }], ids });
    expect(r.errors.map(e => [e.row, e.error])).toEqual([[1, 'no_number'], [2, 'bad_date'], [3, 'bad_amount'], [4, 'no_client'], [5, 'duplicate_number'], [7, 'duplicate_number']]);
    expect(r.invoices.map(f => f.numero)).toEqual(['9']);
  });
});

describe('OPENAR-005 exports', () => {
  it('the sales line exports skip opening invoices and the journals book them to 3400', () => {
    const s = fs.readFileSync(path.join(__dirname, '../../../App.jsx'), 'utf8');
    expect((s.match(/&&!f\.openingBalance&&/g) || []).length).toBe(2);
    expect((s.match(/if\(fac\.openingBalance\)\{/g) || []).length).toBe(2);
    expect(s).toContain('openingEquity:"3400"');
  });
});
