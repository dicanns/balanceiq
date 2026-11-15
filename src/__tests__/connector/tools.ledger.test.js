/**
 * CONN-050  chart_of_accounts, trial_balance, balance_sheet, tax_position
 * CONN-051  account_activity, list_journal_entries, get_journal_entry, audit_trail
 * CONN-052  accounting_periods, fixed_assets, tax_filings
 *
 * The data functions are stubbed with invented data shaped like the real ones.
 */
import { describe, it, expect } from 'vitest';
import { ledgerTools } from '../../connector/tools/ledger.mjs';
import { checkArguments } from '../../connector/protocol.mjs';
import { expectWellFormed, expectPlainAnswer } from './_conformance.js';

const calls = {};
const coa = [
  { id: 1, account_number: '1010', name_fr: 'Encaisse', name_en: 'Cash', type: 'asset', is_archived: 0, secret_internal: 'x' },
  { id: 2, account_number: '1400', name_fr: 'TPS a recevoir', name_en: 'GST receivable', type: 'asset', is_archived: 0 },
  { id: 3, account_number: '2100', name_fr: 'TPS a payer', name_en: 'GST payable', type: 'liability', is_archived: 0 },
  { id: 4, account_number: '2110', name_fr: 'TVQ a payer', name_en: 'QST payable', type: 'liability', is_archived: 0 },
  { id: 5, account_number: '4000', name_fr: 'Ventes', name_en: 'Sales', type: 'revenue', is_archived: 0 },
  { id: 6, account_number: '9999', name_fr: 'Ancien', name_en: 'Old', type: 'expense', is_archived: 1 },
];
const tb = [
  { account_id: 1, account_number: '1010', name_fr: 'Encaisse', name_en: 'Cash', type: 'asset', is_contra: 0, total_debit_cents: 150000, total_credit_cents: 20000, balance_cents: 130000, secret_internal: 'x' },
  { account_id: 2, account_number: '1400', name_fr: 'TPS a recevoir', name_en: 'GST receivable', type: 'asset', is_contra: 0, total_debit_cents: 3000, total_credit_cents: 0, balance_cents: 3000 },
  { account_id: 3, account_number: '2100', name_fr: 'TPS a payer', name_en: 'GST payable', type: 'liability', is_contra: 0, total_debit_cents: 0, total_credit_cents: 7500, balance_cents: -7500 },
  { account_id: 4, account_number: '2110', name_fr: 'TVQ a payer', name_en: 'QST payable', type: 'liability', is_contra: 0, total_debit_cents: 0, total_credit_cents: 14975, balance_cents: -14975 },
  { account_id: 5, account_number: '4000', name_fr: 'Ventes', name_en: 'Sales', type: 'revenue', is_contra: 0, total_debit_cents: 0, total_credit_cents: 110525, balance_cents: -110525 },
];
const entry = {
  id: 7, entry_number: 'JE-0007', entry_date: '2026-06-02', description: 'Sale', source_type: 'invoice', status: 'posted', reversal_reason: null, device_uuid: 'secret-device',
  lines: [
    { line_number: 1, account_number: '1010', name_fr: 'Encaisse', name_en: 'Cash', type: 'asset', debit_cents: 11500, credit_cents: 0, memo: null, tax_code: 'secret' },
    { line_number: 2, account_number: '4000', name_fr: 'Ventes', name_en: 'Sales', type: 'revenue', debit_cents: 0, credit_cents: 10000, memo: 'Goods' },
    { line_number: 3, account_number: '2100', name_fr: 'TPS a payer', name_en: 'GST payable', type: 'liability', debit_cents: 0, credit_cents: 500, memo: null },
    { line_number: 4, account_number: '2110', name_fr: 'TVQ a payer', name_en: 'QST payable', type: 'liability', debit_cents: 0, credit_cents: 1000, memo: null },
  ],
};
const history = [
  { entry_number: 'JE-0001', entry_date: '2026-05-01', description: 'Opening', source_type: 'opening_balance', debit_cents: 100000, credit_cents: 0, memo: null, account_number: '1010', name_fr: 'Encaisse', secret_internal: 'x' },
  { entry_number: 'JE-0007', entry_date: '2026-06-02', description: 'Sale', source_type: 'invoice', debit_cents: 11500, credit_cents: 0, memo: 'Goods' },
  { entry_number: 'JE-0009', entry_date: '2026-06-09', description: 'Rent', source_type: 'manual', debit_cents: 0, credit_cents: 20000, memo: null },
];
const sheetLine = (n, fr, en, balance) => ({ account_number: n, name_fr: fr, name_en: en, is_contra: 0, balance, secret_internal: 'x' });
const sheet = {
  asOfDate: '2026-06-15', isBalanced: true, trialBalanceDiff: 0, status: 'draft',
  blockers: [],
  sections: {
    currentAssets: { accounts: [sheetLine('1010', 'Encaisse', 'Cash', 1300)], total: 1300 },
    longTermAssets: { accounts: [], total: 0 },
    totalAssets: 1300,
    currentLiab: { accounts: [sheetLine('2100', 'TPS a payer', 'GST payable', 75)], total: 75 },
    longTermLiab: { accounts: [], total: 0 },
    totalLiabilities: 75,
    equity: { accounts: [sheetLine('3000', 'Capital', 'Capital', 1000)], netIncome: 150, retainedEarlier: 75, fiscalYearStart: '2025-11-01', total: 1225 },
    totalLiabAndEquity: 1300,
  },
};
const blockers = [
  { type: 'no_opening_balance', label_fr: 'Solde d\'ouverture non comptabilise', label_en: 'Opening balance not posted' },
  { type: 'overdue_ap', count: 2, label_fr: '2 facture(s) fournisseur en souffrance', label_en: '2 overdue supplier bills', blocking: false },
];
const auditRows = [
  { id: 3, timestamp: '2026-06-10 14:30:05', device_id: 'dev-secret', user_name: 'Alex', module: 'GL', action: 'post', record_type: 'journal_entry', record_id: 7, field_name: null, old_value: 'OLD-SECRET', new_value: 'NEW-SECRET', reason: 'Posted from invoice', metadata: 'META-SECRET' },
  { id: 2, timestamp: '2026-06-09 09:00:00', device_id: 'dev-secret', user_name: 'local', module: 'tax', action: 'period_filed', record_type: 'tax_period', record_id: '4', field_name: 'status', old_value: 'a', new_value: 'b', reason: null, metadata: null },
  { id: 1, timestamp: '2026-06-01 08:00:00', device_id: 'dev-secret', user_name: 'local', module: 'GL', action: 'close', record_type: 'period', record_id: '1', field_name: null, old_value: null, new_value: null, reason: null, metadata: null },
];

const data = {
  coaList: () => coa,
  trialBalance: (asOf, opts) => { calls.tb = [asOf, opts]; return tb; },
  buildBalanceSheet: (asOf, opts) => { calls.bs = [asOf, opts]; return sheet; },
  getBalanceSheetBlockers: (asOf, db) => { calls.blockers = [asOf, db]; return blockers; },
  glGetAccountHistory: (id, opts) => { calls.history = [id, opts]; return history; },
  glListEntries: (opts) => {
    calls.list = opts;
    const all = [
      { id: 9, entry_number: 'JE-0009', entry_date: '2026-06-09', description: 'Rent', source_type: 'manual', status: 'posted', device_uuid: 'secret-device', period_start: '2026-06-01' },
      { id: 7, entry_number: 'JE-0007', entry_date: '2026-06-02', description: null, source_type: 'invoice', status: 'draft', device_uuid: 'secret-device' },
      { id: 1, entry_number: 'JE-0001', entry_date: '2026-05-01', description: 'Opening', source_type: 'opening_balance', status: 'posted' },
    ];
    return { entries: all.slice(0, opts.limit), total: all.length };
  },
  glGetEntry: (id) => (id === 7 ? entry : null),
  periodList: () => [
    { id: 1, period_type: 'month', fiscal_year: 2026, start_date: '2026-05-01', end_date: '2026-05-31', status: 'closed', closed_by_device_uuid: 'secret-device' },
    { id: 2, period_type: 'month', fiscal_year: 2026, start_date: '2026-06-01', end_date: '2026-06-30', status: 'open', closed_by_device_uuid: null },
  ],
  fiscalYearEndGet: () => ({ month: 10, day: 31, set: true }),
  fiscalYearList: (db, today) => { calls.fy = [db, today]; return { fiscalYearEnd: { month: 10, day: 31 }, years: [
    { start: '2025-11-01', end: '2026-10-31', ended: false, status: 'open', netIncomeCents: 15000, closedAt: null, blockers: [{ code: 'drafts', count: 1 }, { code: 'statements_open', items: ['Chequing 2026-05-31'] }] },
    { start: '2024-11-01', end: '2025-10-31', ended: true, status: 'closed', netIncomeCents: 7500, closedAt: '2025-12-01', blockers: [] },
  ] }; },
  assetList: (opts) => { calls.assets = opts; return [
    { id: 11, name: 'Mixer', coa_account_id: 30, cca_class: '8', acquisition_date: '2025-03-10', acquisition_cost: 4000, personal_use_pct: 25, disposal_date: null, notes: 'secret note', account_number: '1500', coa_name_fr: 'Equipement' },
    { id: 12, name: 'Van', coa_account_id: 31, cca_class: '10', acquisition_date: '2026-02-01', acquisition_cost: 20000.5, personal_use_pct: 0, disposal_date: null, account_number: null },
  ]; },
  ccaScheduleForYear: (year) => { calls.cca = year; return [
    { asset_id: 11, fiscal_year: year, ucc_opening: 3000, additions: 0, disposals: 0, cca_claimed: 450, ucc_closing: 2550, formula_version: 'v1' },
    { asset_id: 12, fiscal_year: year, ucc_opening: 0, additions: 20000.5, disposals: 0, cca_claimed: 3000.08, ucc_closing: 17000.42, formula_version: 'v1' },
  ]; },
  taxPeriodList: () => [
    { id: 4, period_type: 'quarterly', period_start: '2026-01-01', period_end: '2026-03-31', tps_collected: 500, tvq_collected: 997.5, tps_cti: 100, tvq_rti: 199.5, net_tps_owed: 400, net_tvq_owed: 798, status: 'filed', filed_at: '2026-04-20T10:00:00Z', paid_at: null, confirmation_number: 'CONF-SECRET', notes: 'secret note' },
  ],
  taxRegistrationGet: (loc) => { calls.reg = loc; return { id: 1, business_number: 'BN-SECRET-123', neq: 'NEQ-SECRET', tps_registered_at: '2020-01-01', tvq_registered_at: null, filing_frequency: 'quarterly', cra_contact: 'secret' }; },
  auditQuery: (opts) => { calls.audit = opts; return auditRows; },
};
const base = { company: { id: 'co1', name: 'Demo Inc.' }, today: '2026-06-15', lang: 'en', level: 'read', db: { marker: 'db' }, data, kv: () => null };
const tool = (name) => ledgerTools.find((t) => t.name === name);
const run = (name, args = {}, ctx = base) => {
  expect(checkArguments(tool(name).inputSchema, args), `${name} arguments`).toBeNull();
  const result = tool(name).run(args, ctx);
  expectPlainAnswer(result, name);
  return result;
};
const noLeak = (r) => {
  const s = JSON.stringify(r);
  for (const word of ['secret', 'SECRET', 'device', 'metadata']) expect(s).not.toContain(word);
};

describe('CONN-050 the ledger tools are well formed', () => {
  it('describes every tool and keeps them read-only', () => {
    expectWellFormed(ledgerTools);
    expect(ledgerTools.map((t) => t.name)).toEqual(['chart_of_accounts', 'trial_balance', 'balance_sheet', 'account_activity', 'list_journal_entries', 'get_journal_entry', 'accounting_periods', 'fixed_assets', 'tax_position', 'tax_filings', 'audit_trail']);
  });
});

describe('CONN-050 chart, trial balance, balance sheet, tax position', () => {
  it('chart_of_accounts hides archived accounts, filters by type and speaks the company language', () => {
    const r = run('chart_of_accounts');
    expect(r).toEqual({ count: 5, truncated: false, accounts: [
      { number: '1010', name: 'Cash', type: 'asset', archived: false },
      { number: '1400', name: 'GST receivable', type: 'asset', archived: false },
      { number: '2100', name: 'GST payable', type: 'liability', archived: false },
      { number: '2110', name: 'QST payable', type: 'liability', archived: false },
      { number: '4000', name: 'Sales', type: 'revenue', archived: false },
    ] });
    expect(run('chart_of_accounts', { include_archived: true, type: 'expense' }).accounts).toEqual([{ number: '9999', name: 'Old', type: 'expense', archived: true }]);
    expect(run('chart_of_accounts', { type: 'asset' }, { ...base, lang: 'fr' }).accounts[0].name).toBe('Encaisse');
    expect(checkArguments(tool('chart_of_accounts').inputSchema, { type: 'income' })).not.toBeNull();
    noLeak(r);
  });

  it('trial_balance gives dollars per account, totals and whether debits equal credits', () => {
    const r = run('trial_balance', { as_of: '2026-05-31' });
    expect(calls.tb[0]).toBe('2026-05-31');
    expect(r.accounts[0]).toEqual({ account: '1010', name: 'Cash', type: 'asset', debit: 1500, credit: 200, balance: 1300 });
    expect(r).toMatchObject({ as_of: '2026-05-31', count: 5, truncated: false, total_debit: 1530, total_credit: 1530, balanced: true });
    expect(run('trial_balance').as_of).toBe('2026-06-15');
    noLeak(r);
  });

  it('trial_balance says when the books do not balance', () => {
    const off = { ...base, data: { ...data, trialBalance: () => [tb[0]] } };
    expect(run('trial_balance', {}, off)).toMatchObject({ total_debit: 1500, total_credit: 200, balanced: false });
  });

  it('balance_sheet returns the sections, the check and the warnings with their blocking flag', () => {
    const r = run('balance_sheet', { as_of: '2026-06-15' });
    expect(calls.bs).toEqual(['2026-06-15', { _db: base.db }]);
    expect(calls.blockers).toEqual(['2026-06-15', base.db]);
    expect(r).toEqual({
      as_of: '2026-06-15', status: 'draft', balances: true,
      assets: { current: { accounts: [{ account: '1010', name: 'Cash', balance: 1300 }], total: 1300 }, long_term: { accounts: [], total: 0 }, total: 1300 },
      liabilities: { current: { accounts: [{ account: '2100', name: 'GST payable', balance: 75 }], total: 75 }, long_term: { accounts: [], total: 0 }, total: 75 },
      equity: { accounts: [{ account: '3000', name: 'Capital', balance: 1000 }], current_year_profit: 150, earlier_years_profit: 75, total: 1225 },
      total_liabilities_and_equity: 1300,
      warnings: [
        { warning: 'Opening balance not posted', blocking: true },
        { warning: '2 overdue supplier bills', blocking: false },
      ],
    });
    expect(run('balance_sheet', {}, { ...base, lang: 'fr' }).warnings[0].warning).toBe('Solde d\'ouverture non comptabilise');
    noLeak(r);
  });

  it('tax_position nets payable against receivable from the ledger and never computes a return', () => {
    const r = run('tax_position', { as_of: '2026-06-15' });
    expect(r).toEqual({
      as_of: '2026-06-15',
      gst: { collected_payable: 75, paid_receivable: 30, net_owed: 45 },
      qst: { collected_payable: 149.75, paid_receivable: 0, net_owed: 149.75 },
      net_owed_total: 194.75,
      accounts: { gst_payable: '2100', qst_payable: '2110', gst_receivable: '1400', qst_receivable: '1410' },
    });
    expect(Object.keys(data)).not.toContain('taxPeriodCompute');
    noLeak(r);
  });
});

describe('CONN-051 entries, account activity, audit trail', () => {
  it('account_activity lists the lines of one account by number', () => {
    const r = run('account_activity', { account: '1010', from: '2026-05-01', to: '2026-06-30' });
    expect(calls.history).toEqual([1, { dateFrom: '2026-05-01', dateTo: '2026-06-30' }]);
    expect(r).toEqual({
      account: '1010', name: 'Cash', from: '2026-05-01', to: '2026-06-30', count: 3, truncated: false,
      total_debit: 1115, total_credit: 200, net_debit: 915,
      lines: [
        { date: '2026-05-01', entry: 'JE-0001', description: 'Opening', memo: null, source: 'opening_balance', debit: 1000, credit: 0 },
        { date: '2026-06-02', entry: 'JE-0007', description: 'Sale', memo: 'Goods', source: 'invoice', debit: 115, credit: 0 },
        { date: '2026-06-09', entry: 'JE-0009', description: 'Rent', memo: null, source: 'manual', debit: 0, credit: 200 },
      ],
    });
    noLeak(r);
  });

  it('account_activity keeps the most recent lines when cut, and refuses an unknown account', () => {
    const cut = run('account_activity', { account: '1010', limit: 2 });
    expect([cut.count, cut.truncated, cut.lines.map((l) => l.entry)]).toEqual([3, true, ['JE-0007', 'JE-0009']]);
    expect(cut.total_debit).toBe(1115);
    expect(() => run('account_activity', { account: '0000' })).toThrow('No ledger account has the number 0000.');
    expect(() => run('account_activity', { account: '1010', from: '2026-06-30', to: '2026-06-01' })).toThrow('The period ends before it starts.');
    expect(checkArguments(tool('account_activity').inputSchema, {})).not.toBeNull();
  });

  it('list_journal_entries gives headers and the full count, and says when it cuts', () => {
    const r = run('list_journal_entries', { from: '2026-05-01', source: 'manual', status: 'posted' });
    expect(calls.list).toMatchObject({ dateFrom: '2026-05-01', dateTo: null, sourceType: 'manual', status: 'posted', limit: 50 });
    expect(r).toEqual({ count: 3, truncated: false, entries: [
      { id: 9, date: '2026-06-09', number: 'JE-0009', description: 'Rent', source: 'manual', status: 'posted' },
      { id: 7, date: '2026-06-02', number: 'JE-0007', description: null, source: 'invoice', status: 'draft' },
      { id: 1, date: '2026-05-01', number: 'JE-0001', description: 'Opening', source: 'opening_balance', status: 'posted' },
    ] });
    const cut = run('list_journal_entries', { limit: 1 });
    expect([cut.count, cut.entries.length, cut.truncated]).toEqual([3, 1, true]);
    expect(() => run('list_journal_entries', { from: '2026-07-01', to: '2026-06-01' })).toThrow('The period ends before it starts.');
    expect(checkArguments(tool('list_journal_entries').inputSchema, { status: 'voided' })).not.toBeNull();
    noLeak(r);
  });

  it('get_journal_entry gives the header and its lines, and says plainly when the id is unknown', () => {
    const r = run('get_journal_entry', { id: 7 });
    expect(r).toEqual({
      id: 7, date: '2026-06-02', number: 'JE-0007', description: 'Sale', source: 'invoice', status: 'posted', reversal_reason: null,
      total_debit: 115, total_credit: 115,
      lines: [
        { account: '1010', name: 'Cash', debit: 115, credit: 0, memo: null },
        { account: '4000', name: 'Sales', debit: 0, credit: 100, memo: 'Goods' },
        { account: '2100', name: 'GST payable', debit: 0, credit: 5, memo: null },
        { account: '2110', name: 'QST payable', debit: 0, credit: 10, memo: null },
      ],
    });
    noLeak(r);
    expect(() => run('get_journal_entry', { id: 99 })).toThrow('No journal entry has the id 99.');
    expect(checkArguments(tool('get_journal_entry').inputSchema, { id: 'seven' })).not.toBeNull();
    expect(checkArguments(tool('get_journal_entry').inputSchema, {})).not.toBeNull();
  });

  it('audit_trail names who, when and what, never the before and after values', () => {
    const r = run('audit_trail', { from: '2026-06-01', to: '2026-06-10', module: 'GL' });
    expect(calls.audit).toMatchObject({ module: 'GL', dateFrom: '2026-06-01', dateTo: '2026-06-10 23:59:59' });
    expect(r.events[0]).toEqual({ when: '2026-06-10 14:30', who: 'Alex', module: 'GL', action: 'post', record_type: 'journal_entry', record_id: '7', summary: 'Posted from invoice' });
    expect(r.events[1].summary).toBe('status');
    expect(r.events[2].summary).toBeNull();
    expect([r.count, r.count_is_at_least, r.truncated]).toEqual([3, false, false]);
    noLeak(r);
    expect(JSON.stringify(r)).not.toContain('dev-secret');
  });

  it('audit_trail cuts to the limit and says so', () => {
    const cut = run('audit_trail', { limit: 2 });
    expect([cut.count, cut.events.length, cut.truncated]).toEqual([3, 2, true]);
    expect(() => run('audit_trail', { from: '2026-07-01', to: '2026-06-01' })).toThrow('The period ends before it starts.');
  });
});

describe('CONN-052 periods, fixed assets, tax filings', () => {
  it('accounting_periods gives periods, fiscal years and what is still open', () => {
    const r = run('accounting_periods');
    expect(calls.fy).toEqual([base.db, '2026-06-15']);
    expect(r).toEqual({
      fiscal_year_ends_on: '10-31', count: 2, truncated: false,
      periods: [
        { fiscal_year: 2026, type: 'month', start: '2026-05-01', end: '2026-05-31', closed: true },
        { fiscal_year: 2026, type: 'month', start: '2026-06-01', end: '2026-06-30', closed: false },
      ],
      fiscal_years: [
        { start: '2025-11-01', end: '2026-10-31', ended: false, closed: false, net_income: 150, open_issues: ['drafts', 'statements_open'] },
        { start: '2024-11-01', end: '2025-10-31', ended: true, closed: true, net_income: 75, open_issues: [] },
      ],
    });
    noLeak(r);
  });

  it('fixed_assets lists assets and the allowance schedule for the year asked, default the current year', () => {
    const r = run('fixed_assets', { year: 2026 });
    expect(calls.cca).toBe(2026);
    expect(calls.assets).toEqual({ includeArchived: false });
    expect(r).toEqual({
      year: 2026, count: 2, truncated: false,
      assets: [
        { name: 'Mixer', cca_class: '8', cost: 4000, date_acquired: '2025-03-10', disposal_date: null, business_use_pct: 75, ledger_account: '1500' },
        { name: 'Van', cca_class: '10', cost: 20000.5, date_acquired: '2026-02-01', disposal_date: null, business_use_pct: 100, ledger_account: null },
      ],
      allowance_schedule: [
        { asset: 'Mixer', opening_balance: 3000, additions: 0, disposals: 0, allowance_claimed: 450, closing_balance: 2550 },
        { asset: 'Van', opening_balance: 0, additions: 20000.5, disposals: 0, allowance_claimed: 3000.08, closing_balance: 17000.42 },
      ],
    });
    noLeak(r);
    run('fixed_assets');
    expect(calls.cca).toBe(2026);
    expect(checkArguments(tool('fixed_assets').inputSchema, { year: '2026' })).not.toBeNull();
  });

  it('tax_filings gives saved periods as stored and only the frequency and registration, never the numbers', () => {
    const r = run('tax_filings');
    expect(calls.reg).toBeNull();
    expect(r).toEqual({
      registered: true, filing_frequency: 'quarterly', count: 1, truncated: false,
      periods: [{
        start: '2026-01-01', end: '2026-03-31', type: 'quarterly', status: 'filed',
        gst_collected: 500, qst_collected: 997.5, gst_input_credits: 100, qst_input_refunds: 199.5,
        gst_net_owed: 400, qst_net_owed: 798, filed_on: '2026-04-20', paid_on: null,
      }],
    });
    noLeak(r);
    expect(JSON.stringify(r)).not.toContain('CONF-');
  });

  it('tax_filings copes with a company that has no registration yet', () => {
    const none = { ...base, data: { ...data, taxRegistrationGet: () => null, taxPeriodList: () => [] } };
    expect(run('tax_filings', {}, none)).toEqual({ registered: false, filing_frequency: null, count: 0, truncated: false, periods: [] });
  });
});
