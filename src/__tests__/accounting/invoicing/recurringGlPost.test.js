/**
 * FAC-GL-001 — Recurring Invoice GL Post
 *
 * Scenario: simulate RecurringGenerateModal's doGenerate logic for one
 * recurring rule, then call ledger:invoice:post (the IPC handler logic)
 * directly and assert a balanced journal entry was posted.
 *
 * This test exercises the same path that RecurringGenerateModal fires
 * after saveFactures — it verifies the GL layer accepts the generated
 * invoice and records a balanced, posted entry.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildAccountingDb } from '../helpers/testSchema.js';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { glDraftEntry, glPostEntry } = require('../../../db/database.js');

let db;

beforeEach(() => {
  db = buildAccountingDb();
  // Seed the four accounts the IPC handler looks up by account_number
  for (const [num, nameFr, type] of [
    ['1100', 'Comptes clients',  'asset'],
    ['4000', 'Revenus',          'revenue'],
    ['2100', 'TPS à payer',      'liability'],
    ['2110', 'TVQ à payer',      'liability'],
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

/**
 * Replicates the ledger:invoice:post IPC handler logic using the injected db.
 * Subtotal $100, TPS $5, TVQ $9.98, total $114.98 (all in cents).
 */
function postRecurringInvoiceEntry({ subtotalCents, tpsCents, tvqCents, totalCents, taxExempt = false }) {
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
    description: 'Facture récurrente générée',
    source_type: 'invoice',
    source_id: 'FAC-REC-001',
    lines,
  }, db);
  glPostEntry(entryId, db);
  return entryId;
}

describe('FAC-GL-001 recurring invoice GL post', () => {
  it('posts a journal entry for a generated recurring invoice', () => {
    const entryId = postRecurringInvoiceEntry({
      subtotalCents: 10000,
      tpsCents: 500,
      tvqCents: 998,
      totalCents: 11498,
    });
    const entry = db.prepare(`SELECT * FROM journal_entries WHERE id=?`).get(entryId);
    expect(entry).toBeTruthy();
    expect(entry.status).toBe('posted');
  });

  it('journal entry has AR debit, Revenue credit, TPS credit, TVQ credit', () => {
    const entryId = postRecurringInvoiceEntry({
      subtotalCents: 10000,
      tpsCents: 500,
      tvqCents: 998,
      totalCents: 11498,
    });
    const lines = db.prepare(`SELECT * FROM journal_lines WHERE entry_id=?`).all(entryId);
    const arLine  = lines.find(l => l.account_id === getAccId('1100'));
    const revLine = lines.find(l => l.account_id === getAccId('4000'));
    const tpsLine = lines.find(l => l.account_id === getAccId('2100'));
    const tvqLine = lines.find(l => l.account_id === getAccId('2110'));

    expect(arLine.debit_cents).toBe(11498);
    expect(arLine.credit_cents).toBe(0);
    expect(revLine.credit_cents).toBe(10000);
    expect(tpsLine.credit_cents).toBe(500);
    expect(tvqLine.credit_cents).toBe(998);
  });

  it('journal entry is balanced (debits == credits)', () => {
    const entryId = postRecurringInvoiceEntry({
      subtotalCents: 10000,
      tpsCents: 500,
      tvqCents: 998,
      totalCents: 11498,
    });
    const lines = db.prepare(`SELECT * FROM journal_lines WHERE entry_id=?`).all(entryId);
    const totalDebits  = lines.reduce((s, l) => s + l.debit_cents,  0);
    const totalCredits = lines.reduce((s, l) => s + l.credit_cents, 0);
    expect(totalDebits).toBe(totalCredits);
  });

  it('tax-exempt recurring invoice: no TPS/TVQ lines, revenue = full amount', () => {
    const entryId = postRecurringInvoiceEntry({
      subtotalCents: 10000,
      tpsCents: 0,
      tvqCents: 0,
      totalCents: 10000,
      taxExempt: true,
    });
    const lines = db.prepare(`SELECT * FROM journal_lines WHERE entry_id=?`).all(entryId);
    expect(lines.find(l => l.account_id === getAccId('2100'))).toBeUndefined();
    expect(lines.find(l => l.account_id === getAccId('2110'))).toBeUndefined();
    const revLine = lines.find(l => l.account_id === getAccId('4000'));
    expect(revLine.credit_cents).toBe(10000);
  });
});
