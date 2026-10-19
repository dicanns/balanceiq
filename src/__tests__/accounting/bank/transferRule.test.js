/**
 * XFER-001  which side records money moving between two accounts held here
 * XFER-002  categorizing applies it whatever the checkbox said
 * XFER-003  lines saved on the wrong side are repaired once, then nothing to do
 * XFER-004  the categorize screen shows the decision and locks the box
 *
 * Figures are invented.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'module';
import { buildAccountingDb } from '../helpers/testSchema.js';
import { transferRule } from '../../../utils/transferRule.mjs';

const require = createRequire(import.meta.url);
const { bankTransactionCategorize, bankRepairTransferFlags } = require('../../../db/database.js');
const ROOT = path.resolve(__dirname, '../../../..');

const accts = [
  { id: 1, coa_account_id: 10, account_type: 'bank' },        // chequing
  { id: 2, coa_account_id: 11, account_type: 'bank' },        // savings
  { id: 3, coa_account_id: 22, account_type: 'credit_card' }, // card
];

describe('XFER-001 the rule', () => {
  it('a card payment is recorded on the bank side and is a transfer on the card side', () => {
    expect(transferRule({ lineAccount: accts[0], targetCoaId: 22, amount: -100, accounts: accts })).toEqual({ transfer: false, kind: 'card_payment_bank_side' });
    expect(transferRule({ lineAccount: accts[2], targetCoaId: 22, amount: 100, accounts: accts })).toEqual({ transfer: true, kind: 'card_payment_card_side' });
    expect(transferRule({ lineAccount: accts[2], targetCoaId: 10, amount: 100, accounts: accts })).toEqual({ transfer: true, kind: 'card_payment_card_side' });
  });
  it('between two bank accounts, the one the money left records it', () => {
    expect(transferRule({ lineAccount: accts[0], targetCoaId: 11, amount: -500, accounts: accts }).transfer).toBe(false);
    expect(transferRule({ lineAccount: accts[1], targetCoaId: 10, amount: 500, accounts: accts }).transfer).toBe(true);
  });
  it('leaves everything else to the operator', () => {
    expect(transferRule({ lineAccount: accts[0], targetCoaId: 60, amount: -40, accounts: accts })).toBeNull();   // an expense
    expect(transferRule({ lineAccount: accts[2], targetCoaId: 26, amount: 80, accounts: accts })).toBeNull();    // paid from a personal account
    expect(transferRule({ lineAccount: accts[0], targetCoaId: 10, amount: -5, accounts: accts })).toBeNull();    // its own account
  });
});

let db;
beforeEach(() => {
  db = buildAccountingDb();
  for (const [n, name, type] of [['1010', 'Bank', 'asset'], ['2210', 'Card', 'liability'], ['3400', 'Opening', 'equity']]) {
    db.prepare(`INSERT OR IGNORE INTO chart_of_accounts (account_number, name_fr, name_en, type) VALUES (?,?,?,?)`).run(n, name, name, type);
  }
});
afterEach(() => { db?.close(); db = null; });
const coa = (n) => db.prepare(`SELECT id FROM chart_of_accounts WHERE account_number=?`).get(n).id;
const setup = () => {
  const bank = db.prepare(`INSERT INTO bank_accounts (name, account_type, coa_account_id, opening_balance, opening_date) VALUES ('Sample Bank','bank',?,0,'2026-07-01')`).run(coa('1010')).lastInsertRowid;
  const card = db.prepare(`INSERT INTO bank_accounts (name, account_type, coa_account_id, opening_balance, opening_date) VALUES ('Sample Card','credit_card',?,0,'2026-07-01')`).run(coa('2210')).lastInsertRowid;
  const line = (acct, amt) => db.prepare(`INSERT INTO bank_transactions (bank_account_id, transaction_date, description, amount) VALUES (?, '2026-07-24', 'PAYMENT', ?)`).run(acct, amt).lastInsertRowid;
  return { bankLine: line(bank, -300), cardLine: line(card, 300) };
};
const cardBalance = () => db.prepare(`SELECT COALESCE(SUM(jl.debit_cents)-SUM(jl.credit_cents),0) b FROM journal_lines jl JOIN journal_entries je ON je.id=jl.entry_id AND je.status IN ('posted','reversed') WHERE jl.account_id=?`).get(coa('2210')).b;

describe('XFER-002 categorizing applies the rule', () => {
  it('ticking Transfer on both sides still records the payment once, from the bank', () => {
    const { bankLine, cardLine } = setup();
    bankTransactionCategorize(bankLine, coa('2210'), null, { isTransfer: true }, db);
    bankTransactionCategorize(cardLine, coa('2210'), null, { isTransfer: true }, db);
    expect(db.prepare(`SELECT is_transfer FROM bank_transactions WHERE id=?`).get(bankLine).is_transfer).toBe(0);
    expect(db.prepare(`SELECT is_transfer FROM bank_transactions WHERE id=?`).get(cardLine).is_transfer).toBe(1);
    expect(cardBalance()).toBe(30000);   // the payment, once
  });
});

describe('XFER-003 the repair', () => {
  it('records a payment left as a transfer on the bank side, once', () => {
    const { bankLine } = setup();
    db.prepare(`UPDATE bank_transactions SET coa_account_id=?, match_status='manual', is_transfer=1 WHERE id=?`).run(coa('2210'), bankLine);
    expect(cardBalance()).toBe(0);
    expect(bankRepairTransferFlags(db).fixed).toHaveLength(1);
    expect(cardBalance()).toBe(30000);
    expect(bankRepairTransferFlags(db).fixed).toEqual([]);
  });
});

describe('XFER-004 the categorize screen', () => {
  it('shows the decision, locks the box and saves what the rule decided', () => {
    const s = fs.readFileSync(path.join(ROOT, 'src/components/BanqueTab.jsx'), 'utf8');
    expect(s).toMatch(/const effectiveTransfer = transferDecision \? transferDecision\.transfer : catTransfer;/);
    expect(s).toMatch(/disabled=\{!!transferDecision\}/);
    expect(s).toMatch(/isTransfer: effectiveTransfer/);
    for (const k of ['transferRuleBankSide', 'transferRuleCardSide', 'transferRuleOut', 'transferRuleIn']) {
      expect((s.match(new RegExp('\\b' + k + ':', 'g')) || []).length, k).toBe(2);
    }
    expect(fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8')).toMatch(/const r = bankRepairTransferFlags\(\);/);
  });
});
