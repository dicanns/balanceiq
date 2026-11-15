/**
 * CONN-060  bank_accounts, bank_transactions, bank_reconciliation_status, bank_statements, cheques
 *
 * The data functions are stubbed with made-up data shaped like the real ones.
 */
import { describe, it, expect } from 'vitest';
import { bankTools } from '../../connector/tools/bank.mjs';
import { checkArguments } from '../../connector/protocol.mjs';
import { expectWellFormed, expectPlainAnswer } from './_conformance.js';

const TODAY = '2026-06-15';
const calls = {};
const accounts = [
  { id: 1, name: 'Business Chequing', account_type: 'bank', coa_account_id: 3, is_archived: 0, account_number: '1010', coa_name_fr: 'Banque', coa_name_en: 'Bank', secret_internal: 'x' },
  { id: 2, name: 'Business Visa', account_type: 'credit_card', coa_account_id: 9, is_archived: 0, account_number: '2050', coa_name_fr: 'Carte', coa_name_en: 'Credit card' },
  { id: 3, name: 'Savings Visa Reserve', account_type: 'bank', coa_account_id: 4, is_archived: 0, account_number: '1020', coa_name_fr: 'Epargne', coa_name_en: 'Savings' },
];
const tx = (id, date, description, amount, match_status, extra = {}) => ({ id, transaction_date: date, description, amount, match_status, is_transfer: 0, account_number: null, coa_name_fr: null, coa_name_en: null, ...extra });
const lines = [
  tx(5, '2026-06-10', 'HYDRO PAYMENT', -120.5, 'matched', { account_number: '6200', coa_name_en: 'Utilities', coa_name_fr: 'Services', secret_internal: 'x' }),
  tx(4, '2026-06-05', 'DEPOSIT STORE', 1500, 'manual', { account_number: '4000', coa_name_en: 'Sales', coa_name_fr: 'Ventes' }),
  tx(3, '2026-05-28', 'UNKNOWN SHOP', -33.333, 'unmatched'),
  tx(2, '2026-05-20', 'MAYO MAKER INC', -80, 'suggested', { account_number: '5000', coa_name_en: 'Purchases', coa_name_fr: 'Achats' }),
  tx(1, '2026-05-02', 'TRANSFER TO VISA', -200, 'unmatched', { is_transfer: 1 }),
];
const cheque = (over) => ({ id: 1, direction: 'issued', cheque_number: '101', cheque_date: '2026-06-01', party_name: 'Mayo Maker', amount_cents: 50050, bank_account_id: 1, bank_account_name: 'Business Chequing', status: 'outstanding', cleared_date: null, memo: 'private memo', secret_internal: 'x', ...over });
const chequeRows = [
  cheque({}),
  cheque({ id: 2, cheque_number: '100', cheque_date: '2026-05-01', amount_cents: 12000, status: 'cleared', cleared_date: '2026-05-09' }),
  cheque({ id: 3, direction: 'received', cheque_number: null, cheque_date: '2026-05-15', party_name: 'Acme Foods', amount_cents: 30000, bank_account_id: null, bank_account_name: null }),
];
const data = {
  bankAccountsList: () => accounts,
  bankTransactionsList: (id, opts) => { calls.tx = [id, opts]; return lines; },
  bankReconciliationStatus: (db, today) => { calls.rec = [db, today]; return [
    { accountId: 1, name: 'Business Chequing', accountType: 'bank', state: 'in_progress', lastReconciledEnd: '2026-04-30', lastStatementEnd: '2026-05-31', openCount: 1, notCounted: 4, uncategorized: 2, canClose: false, ecart: 1.5, secret_internal: 'x' },
    { accountId: 2, name: 'Business Visa', accountType: 'credit_card', state: 'no_statements', lastReconciledEnd: null, lastStatementEnd: null, openCount: 0, notCounted: 0, uncategorized: 0, canClose: false },
  ]; },
  bankNeedsCategorizingCount: () => 2,
  bankStatementsList: (id) => (id === 1 ? [
    { id: 11, bank_account_id: 1, period_start: '2026-05-01', period_end: '2026-05-31', ending_balance: 2500.25, imported_at: '2026-06-02 09:30:00', reconciled: 0, file_opening_cents: 100000, line_count: 4, source_file_hash: 'zzz' },
    { id: 10, bank_account_id: 1, period_start: '2026-04-01', period_end: '2026-04-30', ending_balance: 1000, imported_at: '2026-05-02 10:00:00', reconciled: 1, file_opening_cents: null, line_count: 9 },
  ] : id === 2 ? [{ id: 12, bank_account_id: 2, period_start: '2026-05-01', period_end: '2026-05-31', ending_balance: -45.1, imported_at: '2026-06-03', reconciled: 0, file_opening_cents: null, line_count: 3 }] : []),
  chequeList: (opts) => { calls.cheque = opts; return chequeRows.filter((c) => (!opts.direction || c.direction === opts.direction) && (!opts.status || c.status === opts.status)); },
  chequeOutstandingSummary: (id, asOf) => { calls.summary = asOf; return id === 1 ? { issued: { count: 1, cents: 50050 }, received: { count: 0, cents: 0 } } : id == null ? { issued: { count: 1, cents: 50050 }, received: { count: 1, cents: 30000 } } : { issued: { count: 0, cents: 0 }, received: { count: 0, cents: 0 } }; },
};
const ctx = { company: { id: 'co1', name: 'Demo Inc.' }, today: TODAY, lang: 'en', level: 'read', db: { marker: 1 }, data, kv: () => null };
const tool = (name) => bankTools.find((t) => t.name === name);
const run = (name, args = {}, c = ctx) => {
  expect(checkArguments(tool(name).inputSchema, args)).toBeNull();
  const r = tool(name).run(args, c);
  expectPlainAnswer(r);
  return r;
};

describe('CONN-060 bank tools', () => {
  it('are well formed', () => {
    expectWellFormed(bankTools);
    expect(bankTools.map((t) => t.name)).toEqual(['bank_accounts', 'bank_transactions', 'bank_reconciliation_status', 'bank_statements', 'cheques']);
  });

  it('bank_accounts lists name, kind and ledger account', () => {
    expect(run('bank_accounts')).toEqual({
      count: 3,
      accounts: [
        { name: 'Business Chequing', kind: 'bank', ledger_account: '1010', ledger_account_name: 'Bank', active: true },
        { name: 'Business Visa', kind: 'credit_card', ledger_account: '2050', ledger_account_name: 'Credit card', active: true },
        { name: 'Savings Visa Reserve', kind: 'bank', ledger_account: '1020', ledger_account_name: 'Savings', active: true },
      ],
    });
    expect(run('bank_accounts', {}, { ...ctx, lang: 'fr' }).accounts[0].ledger_account_name).toBe('Banque');
  });

  it('bank_transactions gives signed dollars, ledger account and a status word', () => {
    const r = run('bank_transactions', { account: 'chequing', from: '2026-05-01', to: '2026-06-30' });
    expect(calls.tx).toEqual([1, { dateFrom: '2026-05-01', dateTo: '2026-06-30', statusFilter: 'all', limit: 20000 }]);
    expect(r).toEqual({
      account: 'Business Chequing',
      count: 5,
      money_in: 1500,
      money_out: -433.83,
      truncated: false,
      transactions: [
        { date: '2026-06-10', description: 'HYDRO PAYMENT', amount: -120.5, ledger_account: '6200', ledger_account_name: 'Utilities', status: 'matched' },
        { date: '2026-06-05', description: 'DEPOSIT STORE', amount: 1500, ledger_account: '4000', ledger_account_name: 'Sales', status: 'matched' },
        { date: '2026-05-28', description: 'UNKNOWN SHOP', amount: -33.33, ledger_account: null, ledger_account_name: null, status: 'to_review' },
        { date: '2026-05-20', description: 'MAYO MAKER INC', amount: -80, ledger_account: '5000', ledger_account_name: 'Purchases', status: 'to_review' },
        { date: '2026-05-02', description: 'TRANSFER TO VISA', amount: -200, ledger_account: null, ledger_account_name: null, status: 'transfer' },
      ],
    });
  });

  it('bank_transactions filters by status and text, and says when it cuts the list', () => {
    expect(run('bank_transactions', { account: 'Business Chequing', status: 'to_review' }).transactions.map((t) => t.date)).toEqual(['2026-05-28', '2026-05-20']);
    expect(run('bank_transactions', { account: 'chequing', status: 'matched' }).count).toBe(2);
    expect(run('bank_transactions', { account: 'chequing', search: 'mayo' }).transactions.map((t) => t.description)).toEqual(['MAYO MAKER INC']);
    const cut = run('bank_transactions', { account: 'chequing', limit: 2 });
    expect([cut.count, cut.transactions.length, cut.truncated]).toEqual([5, 2, true]);
  });

  it('bank_transactions names the accounts when the name matches none or several', () => {
    expect(() => run('bank_transactions', { account: 'nothing' })).toThrow('No bank accounts match "nothing". The accounts are: Business Chequing, Business Visa, Savings Visa Reserve.');
    expect(() => run('bank_transactions', { account: 'visa' })).toThrow('Several bank accounts match "visa".');
    // an exact name wins over a partial match
    expect(run('bank_transactions', { account: 'Business Visa' }).account).toBe('Business Visa');
  });

  it('bank_transactions refuses a missing account, a bad date and an unknown status', () => {
    expect(checkArguments(tool('bank_transactions').inputSchema, {})).not.toBeNull();
    expect(checkArguments(tool('bank_transactions').inputSchema, { account: 'x', from: '06/01/2026' })).not.toBeNull();
    expect(checkArguments(tool('bank_transactions').inputSchema, { account: 'x', status: 'suggested' })).not.toBeNull();
    expect(() => run('bank_transactions', { account: 'chequing', from: '2026-06-30', to: '2026-06-01' })).toThrow('The period ends before it starts.');
  });

  it('bank_reconciliation_status says where each account stands', () => {
    expect(run('bank_reconciliation_status')).toEqual({
      as_of: TODAY,
      statement_lines_to_review: 2,
      accounts: [
        { account: 'Business Chequing', kind: 'bank', state: 'in_progress', last_reconciled_date: '2026-04-30', last_statement_end: '2026-05-31', open_statements: 1, lines_not_counted: 4, lines_to_categorize: 2, can_close: false },
        { account: 'Business Visa', kind: 'credit_card', state: 'no_statements', last_reconciled_date: null, last_statement_end: null, open_statements: 0, lines_not_counted: 0, lines_to_categorize: 0, can_close: false },
      ],
    });
    expect(calls.rec).toEqual([ctx.db, TODAY]);
  });

  it('bank_statements lists periods, line counts and balances', () => {
    expect(run('bank_statements', { account: 'chequing' })).toEqual({
      count: 2,
      truncated: false,
      statements: [
        { account: 'Business Chequing', period_start: '2026-05-01', period_end: '2026-05-31', imported_on: '2026-06-02', line_count: 4, opening_balance: 1000, closing_balance: 2500.25, reconciled: false },
        { account: 'Business Chequing', period_start: '2026-04-01', period_end: '2026-04-30', imported_on: '2026-05-02', line_count: 9, opening_balance: null, closing_balance: 1000, reconciled: true },
      ],
    });
    expect(run('bank_statements').count).toBe(3);
    expect(() => run('bank_statements', { account: 'nothing' })).toThrow('No bank account matches "nothing".');
  });

  it('cheques gives number, party, dollars, status and the outstanding totals', () => {
    const r = run('cheques');
    expect(r.count).toBe(3);
    expect(r.cheques[0]).toEqual({ number: '101', date: '2026-06-01', direction: 'issued', party: 'Mayo Maker', amount: 500.5, status: 'outstanding', account: 'Business Chequing', cleared_on: null });
    expect(r.outstanding).toEqual({
      as_of: TODAY,
      issued: { count: 1, total: 500.5 },
      received: { count: 1, total: 300 },
      by_account: [{ account: 'Business Chequing', issued: { count: 1, total: 500.5 }, received: { count: 0, total: 0 } }],
    });
    expect(calls.summary).toBe(TODAY);
  });

  it('cheques filters by direction and status, and says when it cuts the list', () => {
    expect(run('cheques', { direction: 'received' }).cheques.map((c) => c.party)).toEqual(['Acme Foods']);
    expect(calls.cheque).toEqual({ direction: 'received', status: null });
    expect(run('cheques', { status: 'cleared' }).cheques.map((c) => c.number)).toEqual(['100']);
    const cut = run('cheques', { limit: 1 });
    expect([cut.count, cut.cheques.length, cut.truncated]).toEqual([3, 1, true]);
    expect(checkArguments(tool('cheques').inputSchema, { direction: 'sent' })).not.toBeNull();
  });

  it('never hands over a field it was not asked to name', () => {
    const everything = JSON.stringify(bankTools.map((t) => t.run(t.name === 'bank_transactions' ? { account: 'chequing' } : {}, ctx)));
    expect(everything).not.toContain('secret_internal');
    expect(everything).not.toContain('private memo');
    expect(everything).not.toContain('zzz');
  });
});
