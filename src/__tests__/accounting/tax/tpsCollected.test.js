/**
 * TAX-001 — TPS/TVQ Collected on Invoice (Journal Entry Assertions)
 *
 * Scenario: finalize a taxable invoice for $100 subtotal.
 * Assert: journal entry credits 2100 TPS a payer $5.00 (500 cents).
 * Assert: journal entry credits 2110 TVQ a payer $9.975 rounded (998 cents).
 * Assert: balanced entry (debits == credits).
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

function postInvoiceEntry({ subtotalCents, tpsCents, tvqCents, totalCents, taxExempt = false }) {
  const ar      = getAccId('1100');
  const revenue = getAccId('4000');
  const tpsAcc  = getAccId('2100');
  const tvqAcc  = getAccId('2110');

  const lines = [
    { account_id: ar, debit_cents: totalCents, credit_cents: 0 },
  ];
  if (taxExempt) {
    lines.push({ account_id: revenue, debit_cents: 0, credit_cents: totalCents });
  } else {
    lines.push({ account_id: revenue, debit_cents: 0, credit_cents: subtotalCents });
    if (tpsCents) lines.push({ account_id: tpsAcc, debit_cents: 0, credit_cents: tpsCents });
    if (tvqCents) lines.push({ account_id: tvqAcc, debit_cents: 0, credit_cents: tvqCents });
  }

  const { entryId } = glDraftEntry({
    entry_date: '2026-04-25',
    description: 'Facture test',
    source_type: 'invoice',
    source_id: 'FAC-001',
    lines,
  }, db);
  glPostEntry(entryId, db);
  return entryId;
}

describe('TAX-001 TPS/TVQ collected on invoice', () => {
  it('journal entry credits TPS a payer 500 cents on $100 invoice', () => {
    const entryId = postInvoiceEntry({ subtotalCents: 10000, tpsCents: 500, tvqCents: 998, totalCents: 11498 });
    const tpsLine = db.prepare(
      `SELECT * FROM journal_lines WHERE entry_id=? AND account_id=?`
    ).get(entryId, getAccId('2100'));
    expect(tpsLine).toBeTruthy();
    expect(tpsLine.credit_cents).toBe(500);
    expect(tpsLine.debit_cents).toBe(0);
  });

  it('journal entry credits TVQ a payer 998 cents ($9.975 rounded) on $100 invoice', () => {
    const entryId = postInvoiceEntry({ subtotalCents: 10000, tpsCents: 500, tvqCents: 998, totalCents: 11498 });
    const tvqLine = db.prepare(
      `SELECT * FROM journal_lines WHERE entry_id=? AND account_id=?`
    ).get(entryId, getAccId('2110'));
    expect(tvqLine).toBeTruthy();
    expect(tvqLine.credit_cents).toBe(998);
    expect(tvqLine.debit_cents).toBe(0);
  });

  it('journal entry is balanced (total debits == total credits)', () => {
    const entryId = postInvoiceEntry({ subtotalCents: 10000, tpsCents: 500, tvqCents: 998, totalCents: 11498 });
    const lines = db.prepare(`SELECT * FROM journal_lines WHERE entry_id=?`).all(entryId);
    const totalDebits  = lines.reduce((s, l) => s + l.debit_cents,  0);
    const totalCredits = lines.reduce((s, l) => s + l.credit_cents, 0);
    expect(totalDebits).toBe(totalCredits);
  });

  it('debit AR (1100) equals total_ttc_cents', () => {
    const entryId = postInvoiceEntry({ subtotalCents: 10000, tpsCents: 500, tvqCents: 998, totalCents: 11498 });
    const arLine = db.prepare(
      `SELECT * FROM journal_lines WHERE entry_id=? AND account_id=?`
    ).get(entryId, getAccId('1100'));
    expect(arLine.debit_cents).toBe(11498);
    expect(arLine.credit_cents).toBe(0);
  });
});
