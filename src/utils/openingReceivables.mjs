// Opening receivables: the invoices a business still had open in its previous
// software when it moved to BalanceIQ. Each becomes a real invoice here, so it
// can be paid, reminded, aged and shown on a statement, but it is not revenue
// again: the old books already counted it. The ledger posts Dr receivables /
// Cr opening balance equity, and the sales exports leave it out.
import { parseCsvLines, looksLikeHeader } from './importParse.mjs';
import { stripMarkup } from './htmlSafe.mjs';

export const OPENING_ROLES = ['client', 'numero', 'date', 'dateEcheance', 'montant', 'ignore'];

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// Rows from a CSV file or cells pasted from a spreadsheet (tab-separated).
export function parseOpeningRows(text) {
  const t = String(text || '').replace(/^﻿/, '');
  if (t.includes('\t')) {
    return t.split(/\r?\n/).map(l => l.split('\t').map(c => c.trim())).filter(r => r.some(c => c));
  }
  return (parseCsvLines(t).rows || []).filter(r => r.some(c => String(c).trim()));
}

// A role for each column, from the header when there is one.
export function guessOpeningRoles(rows) {
  const first = rows[0] || [];
  const header = looksLikeHeader(first);
  const roles = first.map((cell, i) => {
    const h = norm(header ? cell : '');
    if (/client|customer|entreprise|company|nom|name/.test(h)) return 'client';
    if (/(^|\b)(no|num|number|numero|#|invoice|facture)/.test(h) && !/date/.test(h)) return 'numero';
    if (/ech|due|echeance/.test(h)) return 'dateEcheance';
    if (/date/.test(h)) return 'date';
    if (/solde|balance|montant|amount|due|owing|total/.test(h)) return 'montant';
    // No header: guess from the shape of the values below.
    const sample = rows.slice(header ? 1 : 0, 6).map(r => String(r[i] ?? '').trim());
    if (sample.length && sample.every(v => /^\d{4}-\d{2}-\d{2}$/.test(v) || /^\d{2}\/\d{2}\/\d{4}$/.test(v))) return i > 0 && roles?.includes?.('date') ? 'dateEcheance' : 'date';
    if (sample.length && sample.every(v => /^-?[\d\s]*[.,]?\d+\s*\$?$/.test(v))) return 'montant';
    return 'ignore';
  });
  // Two date-looking columns: the first is the invoice date, the second the due date.
  let seenDate = false;
  for (let i = 0; i < roles.length; i++) {
    if (roles[i] === 'date') { if (seenDate) roles[i] = 'dateEcheance'; seenDate = true; }
  }
  if (!roles.includes('client')) { const j = roles.indexOf('ignore'); if (j >= 0) roles[j] = 'client'; }
  return { roles, hasHeader: header };
}

export function parseAmount(v) {
  const s = String(v ?? '').replace(/\s|\$/g, '').replace(',', '.');
  const n = parseFloat(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
}

export function parseDate(v) {
  const s = String(v ?? '').trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return null;
}

// Finds the customer a row names: by code, then by company name, accents and
// case ignored. Returns null when nothing matches; the caller may create one.
export function matchClient(name, clients) {
  const n = norm(name);
  if (!n) return null;
  return (clients || []).find(c => norm(c.code) === n)
    || (clients || []).find(c => norm(c.entreprise) === n)
    || null;
}

/**
 * Turns parsed rows into invoices ready to save.
 * Returns { invoices, newClients, errors: [{ row, error }] }.
 * ids: () => string, for the invoices and any customers created.
 */
export function buildOpeningInvoices(rows, roles, { hasHeader = true, clients = [], factures = [], asOf, ids, lineLabel } = {}) {
  const idx = (role) => roles.indexOf(role);
  const invoices = [], newClients = [], errors = [];
  const existingNumbers = new Set((factures || []).map(f => norm(f.numero)));
  const seen = new Set();
  const pool = [...(clients || [])];
  const label = typeof lineLabel === 'function' ? lineLabel : ((num, date) => `Solde d'ouverture - facture ${num}${date ? ' du ' + date : ''}`);
  const data = hasHeader ? rows.slice(1) : rows;
  data.forEach((r, k) => {
    const row = k + (hasHeader ? 2 : 1);
    const name = idx('client') >= 0 ? stripMarkup(r[idx('client')]) : '';
    const numero = idx('numero') >= 0 ? stripMarkup(r[idx('numero')]) : '';
    const date = idx('date') >= 0 ? parseDate(r[idx('date')]) : null;
    const due = idx('dateEcheance') >= 0 ? parseDate(r[idx('dateEcheance')]) : null;
    const amount = idx('montant') >= 0 ? parseAmount(r[idx('montant')]) : NaN;
    if (!name) { errors.push({ row, error: 'no_client' }); return; }
    if (!numero) { errors.push({ row, error: 'no_number' }); return; }
    if (!date) { errors.push({ row, error: 'bad_date' }); return; }
    if (!(amount > 0)) { errors.push({ row, error: 'bad_amount' }); return; }
    if (existingNumbers.has(norm(numero)) || seen.has(norm(numero))) { errors.push({ row, error: 'duplicate_number', numero }); return; }
    seen.add(norm(numero));
    let client = matchClient(name, pool);
    if (!client) {
      client = { id: ids(), code: '', entreprise: name, contact: '', adresse: '', ville: '', province: 'QC', codePostal: '', tel1: '', courriel: '', statut: 'actif', langue: 'Français', conditionsPaiement: 'Net 30' };
      pool.push(client); newClients.push(client);
    }
    const id = ids();
    invoices.push({
      id, numero, date, dateEcheance: due || date, clientId: client.id, statut: 'Envoyée', documentType: 'facture',
      openingBalance: true, openingAsOf: asOf || null,
      lignes: [{ id: `${id}l`, description: label(numero, date), quantite: 1, prixUnitaire: amount, remise: 0, tps: false, tvq: false }],
      paiements: [], acomptes: [], notes: '',
    });
  });
  return { invoices, newClients, errors };
}
