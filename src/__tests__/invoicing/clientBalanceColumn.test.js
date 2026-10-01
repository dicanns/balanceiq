/**
 * CLIBAL-001  the client list's Balance Due is the statement's balance owed, not a fixed 0,00 $
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { accountStanding } from '../../services/accountStanding.js';
import { computeInvoiceTotals } from '../../utils/calculations.js';

const app = fs.readFileSync(path.resolve(__dirname, '../../../src/App.jsx'), 'utf8');
const section = app.slice(app.indexOf('function ClientsSection('), app.indexOf('\nfunction ', app.indexOf('function ClientsSection(') + 10));

describe('CLIBAL-001 the Balance Due column', () => {
  it('is computed per customer from account standing and sorts as a number', () => {
    expect(section).not.toMatch(/>0,00 \$</);
    expect(section).toMatch(/accountStanding\(\{clientId:c\.id,factures:factures\|\|\[\],creditNotes:creditNotes\|\|\[\]/);
    expect(section).toMatch(/\{fmt\(c\._solde\)\}/);
    expect(section).toMatch(/if\(sortCol==="_solde"\)return sortAsc\?a\._solde-b\._solde:b\._solde-a\._solde/);
  });
  it('nets an unapplied credit against open invoices, as the statement does', () => {
    const lignes = [{ quantite: 1, prixUnitaire: 100, tps: false, tvq: false }];
    const st = accountStanding({
      clientId: 'c1', asOf: '2026-10-01',
      factures: [{ id: 'f1', clientId: 'c1', statut: 'Envoyée', lignes, paiements: [{ montant: 30 }], dateEcheance: '2026-10-15' }],
      creditNotes: [{ numero: 'NC-1', clientId: 'c1', statut: 'Émise', lignes: [{ quantite: 1, prixUnitaire: 20, tps: false, tvq: false }] }],
      totalOf: (d) => computeInvoiceTotals(d.lignes || [], d).total,
    });
    expect(st.balanceOwed).toBe(50);
  });
});
