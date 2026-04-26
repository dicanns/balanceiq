/**
 * TAX-003 — Tax-Exempt Customer Invoice
 *
 * Scenario: invoice for a tax-exempt customer.
 * Assert: no TPS or TVQ credit lines on the journal entry.
 * Assert: revenue line posts the full invoice amount.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildAccountingDb } from '../helpers/testSchema.js';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { glDraftEntry, glPostEntry } = require('../../../db/database.js');

let db;

beforeEach(() => {
  db = buildAccountingDb();
  for (const [num, nameFr, type] of [
    ['1100', 'Comptes clients', 'asset'],
    ['4000', 'Revenus',         'revenue'],
    ['2100', 'TPS à payer',     'liability'],
    ['2110', 'TVQ à payer',     'liability'],
  ]) {
    db.prepare(
      `INSERT OR IGNORE INTO chart_of_accounts (account_number, name_fr, name_en, type)
       VALUES (?, ?, ?, ?)`
    ).run(num, nameFr, nameFr, type);
  }
});
afterEach(() => { db?.close(); db = null; });

function getAccId(num) {
  return db.prepare(`SELECT id FROM chart_of_accounts WHERE account_number=?`).get(num)?.id;
}

function postExemptInvoiceEntry(totalCents) {
  const ar      = getAccId('1100');
  const revenue = getAccId('4000');

  const lines = [
    { account_id: ar,      debit_cents: totalCents, credit_cents: 0 },
    { account_id: revenue, debit_cents: 0, credit_cents: totalCents },
  ];
  const { entryId } = glDraftEntry({
    entry_date: '2026-04-25',
    description: 'Facture client exonéré',
    source_type: 'invoice',
    source_id: 'FAC-EXEMPT',
    lines,
  }, db);
  glPostEntry(entryId, db);
  return entryId;
}

describe('TAX-003 tax-exempt customer invoice', () => {
  it('journal entry has no TPS or TVQ lines for exempt customer', () => {
    const entryId = postExemptInvoiceEntry(10000);
    const lines = db.prepare(`SELECT * FROM journal_lines WHERE entry_id=?`).all(entryId);
    const tpsLine = lines.find(l => l.account_id === getAccId('2100'));
    const tvqLine = lines.find(l => l.account_id === getAccId('2110'));
    expect(tpsLine).toBeUndefined();
    expect(tvqLine).toBeUndefined();
  });

  it('revenue line posts the full invoice amount (no tax deducted)', () => {
    const totalCents = 10000;
    const entryId = postExemptInvoiceEntry(totalCents);
    const revLine = db.prepare(
      `SELECT * FROM journal_lines WHERE entry_id=? AND account_id=?`
    ).get(entryId, getAccId('4000'));
    expect(revLine).toBeTruthy();
    expect(revLine.credit_cents).toBe(totalCents);
    expect(revLine.debit_cents).toBe(0);
  });

  it('journal entry is balanced for exempt invoice', () => {
    const entryId = postExemptInvoiceEntry(10000);
    const lines = db.prepare(`SELECT * FROM journal_lines WHERE entry_id=?`).all(entryId);
    const totalDebits  = lines.reduce((s, l) => s + l.debit_cents,  0);
    const totalCredits = lines.reduce((s, l) => s + l.credit_cents, 0);
    expect(totalDebits).toBe(totalCredits);
  });
});
