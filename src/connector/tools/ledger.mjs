// The general ledger: accounts, trial balance, balance sheet, entries, periods,
// fixed assets, sales tax position, saved tax filings and the audit trail.
// Read only: every figure comes from an existing data function.

import { ToolError, round2, dollars, dateArg, limitArg, clampLimit, capped, NO_ARGS } from './shared.mjs';

const ACCOUNT_TYPES = ['asset', 'liability', 'equity', 'revenue', 'cogs', 'expense'];
const ENTRY_STATUSES = ['draft', 'posted', 'reversed'];

// Sales tax accounts of the standard chart (the same numbers the app seeds).
const GST_PAYABLE = '2100';
const QST_PAYABLE = '2110';
const GST_RECEIVABLE = '1400';
const QST_RECEIVABLE = '1410';

// Hard ceilings for lists that have no limit argument, so an answer stays small.
const MAX_ACCOUNTS = 1000;
const MAX_TRIAL_ROWS = 1000;
const MAX_PERIODS = 200;
const MAX_ASSETS = 200;
const MAX_FILINGS = 200;
// How many audit rows are read before the caller's limit is applied.
const AUDIT_FETCH = 2000;
const SUMMARY_LENGTH = 160;

const nameIn = (ctx, fr, en) => (ctx.lang === 'fr' ? fr : en) || fr || en || '';
const text = (v) => (v == null || v === '' ? null : String(v));
const asOfOf = (args, ctx) => args.as_of || ctx.today;

/** The chart of accounts, by account number. */
const chartOf = (ctx) => ctx.data.coaList() || [];

const chartOfAccounts = {
  name: 'chart_of_accounts',
  title: { en: 'Chart of accounts', fr: 'Plan comptable' },
  description: 'The list of general ledger accounts: number, name, type and whether it is archived. Use it to find which account number holds something, before asking for a trial balance or an account\'s activity.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      type: { type: 'string', enum: ACCOUNT_TYPES, description: 'Only accounts of this type' },
      include_archived: { type: 'boolean', description: 'Also list archived accounts (default false)' },
    },
  },
  run(args, ctx) {
    const all = chartOf(ctx)
      .filter((a) => (!args.type || a.type === args.type) && (args.include_archived || !a.is_archived))
      .map((a) => ({ number: String(a.account_number), name: nameIn(ctx, a.name_fr, a.name_en), type: a.type, archived: !!a.is_archived }));
    const { rows, truncated } = capped(all, MAX_ACCOUNTS);
    return { count: all.length, truncated, accounts: rows };
  },
};

const trialBalance = {
  name: 'trial_balance',
  title: { en: 'Trial balance', fr: 'Balance de vérification' },
  description: 'Every ledger account that has posted entries up to a date, with total debits, total credits and balance (debits minus credits), and whether the debits equal the credits. Use it to check the books or to see a balance by account number.',
  inputSchema: { type: 'object', additionalProperties: false, properties: { as_of: dateArg('Balances at the end of this date; default today') } },
  run(args, ctx) {
    const asOf = asOfOf(args, ctx);
    const all = ctx.data.trialBalance(asOf) || [];
    const debit = all.reduce((s, r) => s + (Number(r.total_debit_cents) || 0), 0);
    const credit = all.reduce((s, r) => s + (Number(r.total_credit_cents) || 0), 0);
    const { rows, truncated } = capped(all, MAX_TRIAL_ROWS);
    return {
      as_of: asOf,
      count: all.length,
      truncated,
      total_debit: dollars(debit),
      total_credit: dollars(credit),
      balanced: debit === credit,
      accounts: rows.map((r) => ({
        account: String(r.account_number),
        name: nameIn(ctx, r.name_fr, r.name_en),
        type: r.type,
        debit: dollars(r.total_debit_cents),
        credit: dollars(r.total_credit_cents),
        balance: dollars(r.balance_cents),
      })),
    };
  },
};

const sectionOf = (ctx, s) => ({
  accounts: (s?.accounts || []).map((a) => ({ account: String(a.account_number), name: nameIn(ctx, a.name_fr, a.name_en), balance: round2(a.balance) })),
  total: round2(s?.total),
});

const balanceSheet = {
  name: 'balance_sheet',
  title: { en: 'Balance sheet', fr: 'Bilan' },
  description: 'The balance sheet from the general ledger at a date: assets, liabilities and equity with their accounts and totals, whether it balances, and the warnings that make it a draft (drafts, unreconciled statements, no opening balance).',
  inputSchema: { type: 'object', additionalProperties: false, properties: { as_of: dateArg('Balance sheet at the end of this date; default today') } },
  run(args, ctx) {
    const asOf = asOfOf(args, ctx);
    const b = ctx.data.buildBalanceSheet(asOf, { _db: ctx.db });
    const s = b.sections || {};
    const eq = s.equity || {};
    return {
      as_of: asOf,
      status: b.status === 'final' ? 'final' : 'draft',
      balances: !!b.isBalanced,
      assets: { current: sectionOf(ctx, s.currentAssets), long_term: sectionOf(ctx, s.longTermAssets), total: round2(s.totalAssets) },
      liabilities: { current: sectionOf(ctx, s.currentLiab), long_term: sectionOf(ctx, s.longTermLiab), total: round2(s.totalLiabilities) },
      equity: {
        accounts: sectionOf(ctx, eq).accounts,
        current_year_profit: round2(eq.netIncome),
        earlier_years_profit: round2(eq.retainedEarlier),
        total: round2(eq.total),
      },
      total_liabilities_and_equity: round2(s.totalLiabAndEquity),
      warnings: (ctx.data.getBalanceSheetBlockers(asOf, ctx.db) || []).map((w) => ({
        warning: nameIn(ctx, w.label_fr, w.label_en),
        blocking: w.blocking !== false,
      })),
    };
  },
};

const accountActivity = {
  name: 'account_activity',
  title: { en: 'Account activity', fr: 'Activité d\'un compte' },
  description: 'The posted ledger lines of one account, oldest first: date, entry number, description, debit and credit. Use it to see what makes up a balance. Give the account number (find it with chart_of_accounts). When cut, the most recent lines are kept.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['account'],
    properties: {
      account: { type: 'string', description: 'The account number, for example 1010' },
      from: dateArg('First day to include'),
      to: dateArg('Last day to include'),
      limit: limitArg(500, 100),
    },
  },
  run(args, ctx) {
    const wanted = String(args.account).trim();
    const account = chartOf(ctx).find((a) => String(a.account_number) === wanted);
    if (!account) throw new ToolError(`No ledger account has the number ${wanted}.`);
    if (args.from && args.to && args.from > args.to) throw new ToolError('The period ends before it starts.');
    const history = ctx.data.glGetAccountHistory(account.id, { dateFrom: args.from || null, dateTo: args.to || null }) || [];
    const debit = history.reduce((s, r) => s + (Number(r.debit_cents) || 0), 0);
    const credit = history.reduce((s, r) => s + (Number(r.credit_cents) || 0), 0);
    const limit = clampLimit(args.limit, 500, 100);
    const { rows, truncated } = capped([...history].reverse(), limit);
    return {
      account: String(account.account_number),
      name: nameIn(ctx, account.name_fr, account.name_en),
      from: args.from || null,
      to: args.to || null,
      count: history.length,
      truncated,
      total_debit: dollars(debit),
      total_credit: dollars(credit),
      net_debit: dollars(debit - credit),
      lines: rows.reverse().map((r) => ({
        date: r.entry_date,
        entry: r.entry_number,
        description: text(r.description),
        memo: text(r.memo),
        source: r.source_type || null,
        debit: dollars(r.debit_cents),
        credit: dollars(r.credit_cents),
      })),
    };
  },
};

const listJournalEntries = {
  name: 'list_journal_entries',
  title: { en: 'Journal entries', fr: 'Écritures de journal' },
  description: 'Journal entries, newest first: id, date, number, description, source (invoice, bill, manual and so on) and status (draft, posted, reversed). Use it to browse the ledger; use get_journal_entry with an id to see the lines of one entry.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      from: dateArg('First entry date to include'),
      to: dateArg('Last entry date to include'),
      source: { type: 'string', description: 'Only entries from this source type, for example invoice or manual' },
      status: { type: 'string', enum: ENTRY_STATUSES, description: 'Only entries with this status' },
      limit: limitArg(200, 50),
    },
  },
  run(args, ctx) {
    if (args.from && args.to && args.from > args.to) throw new ToolError('The period ends before it starts.');
    const limit = clampLimit(args.limit, 200, 50);
    const r = ctx.data.glListEntries({ dateFrom: args.from || null, dateTo: args.to || null, sourceType: text(args.source), status: args.status || null, limit, offset: 0 }) || {};
    const { rows, truncated } = capped(r.entries || [], limit);
    const count = Math.max(Number(r.total) || 0, rows.length);
    return {
      count,
      truncated: truncated || count > rows.length,
      entries: rows.map((e) => ({ id: e.id, date: e.entry_date, number: e.entry_number, description: text(e.description), source: e.source_type || null, status: e.status })),
    };
  },
};

const getJournalEntry = {
  name: 'get_journal_entry',
  title: { en: 'One journal entry', fr: 'Une écriture de journal' },
  description: 'One journal entry with all its lines: account number and name, debit, credit and memo. Use it after list_journal_entries or account_activity to see exactly how a transaction was recorded. Needs the entry id.',
  inputSchema: { type: 'object', additionalProperties: false, required: ['id'], properties: { id: { type: 'integer', description: 'The journal entry id, as given by list_journal_entries' } } },
  run(args, ctx) {
    const e = ctx.data.glGetEntry(args.id);
    if (!e) throw new ToolError(`No journal entry has the id ${args.id}.`);
    const lines = e.lines || [];
    return {
      id: e.id,
      date: e.entry_date,
      number: e.entry_number,
      description: text(e.description),
      source: e.source_type || null,
      status: e.status,
      reversal_reason: text(e.reversal_reason),
      total_debit: dollars(lines.reduce((s, l) => s + (Number(l.debit_cents) || 0), 0)),
      total_credit: dollars(lines.reduce((s, l) => s + (Number(l.credit_cents) || 0), 0)),
      lines: lines.map((l) => ({
        account: String(l.account_number),
        name: nameIn(ctx, l.name_fr, l.name_en),
        debit: dollars(l.debit_cents),
        credit: dollars(l.credit_cents),
        memo: text(l.memo),
      })),
    };
  },
};

const accountingPeriods = {
  name: 'accounting_periods',
  title: { en: 'Accounting periods', fr: 'Périodes comptables' },
  description: 'The accounting periods (usually months) with their dates and whether each is open or closed, and the fiscal years with their end date, whether they are closed and their profit. Use it to know what can still be changed in the books.',
  inputSchema: NO_ARGS,
  run(_args, ctx) {
    const all = ctx.data.periodList() || [];
    const { rows, truncated } = capped(all, MAX_PERIODS);
    const fye = ctx.data.fiscalYearEndGet(ctx.db) || {};
    const years = ctx.data.fiscalYearList(ctx.db, ctx.today)?.years || [];
    return {
      fiscal_year_ends_on: fye.month && fye.day ? `${String(fye.month).padStart(2, '0')}-${String(fye.day).padStart(2, '0')}` : null,
      count: all.length,
      truncated,
      periods: rows.map((p) => ({ fiscal_year: p.fiscal_year, type: p.period_type, start: p.start_date, end: p.end_date, closed: p.status === 'closed' })),
      fiscal_years: years.map((y) => ({
        start: y.start,
        end: y.end,
        ended: !!y.ended,
        closed: y.status === 'closed',
        net_income: dollars(y.netIncomeCents),
        open_issues: (y.blockers || []).map((b) => b.code),
      })),
    };
  },
};

const fixedAssets = {
  name: 'fixed_assets',
  title: { en: 'Fixed assets', fr: 'Immobilisations' },
  description: 'Fixed assets (equipment, vehicles) with class, cost and date acquired, and the capital cost allowance (tax depreciation) schedule for a year: opening and closing undepreciated balance and the amount claimed. Archived assets are left out.',
  inputSchema: { type: 'object', additionalProperties: false, properties: { year: { type: 'integer', description: 'Year of the allowance schedule; default the current year' } } },
  run(args, ctx) {
    const year = Number.isInteger(args.year) ? args.year : Number(String(ctx.today).slice(0, 4));
    const all = ctx.data.assetList({ includeArchived: false }, ctx.db) || [];
    const { rows, truncated } = capped(all, MAX_ASSETS);
    const nameById = new Map(all.map((a) => [a.id, a.name || '']));
    return {
      year,
      count: all.length,
      truncated,
      assets: rows.map((a) => ({
        name: a.name || '',
        cca_class: String(a.cca_class),
        cost: round2(a.acquisition_cost),
        date_acquired: a.acquisition_date || null,
        disposal_date: a.disposal_date || null,
        business_use_pct: round2(100 - (Number(a.personal_use_pct) || 0)),
        ledger_account: a.account_number ? String(a.account_number) : null,
      })),
      allowance_schedule: (ctx.data.ccaScheduleForYear(year) || []).map((c) => ({
        asset: nameById.get(c.asset_id) || '',
        opening_balance: round2(c.ucc_opening),
        additions: round2(c.additions),
        disposals: round2(c.disposals),
        allowance_claimed: round2(c.cca_claimed),
        closing_balance: round2(c.ucc_closing),
      })),
    };
  },
};

const taxPosition = {
  name: 'tax_position',
  title: { en: 'Sales tax position', fr: 'Position de taxes de vente' },
  description: 'What the ledger says about GST and QST at a date: tax collected and owing (payable accounts), tax paid on purchases and claimable (receivable accounts), and the net to remit or recover. It is the ledger balance, not a filed return; see tax_filings for those.',
  inputSchema: { type: 'object', additionalProperties: false, properties: { as_of: dateArg('Position at the end of this date; default today') } },
  run(args, ctx) {
    const asOf = asOfOf(args, ctx);
    const rows = ctx.data.trialBalance(asOf) || [];
    const balanceOf = (number) => rows.filter((r) => String(r.account_number) === number).reduce((s, r) => s + (Number(r.balance_cents) || 0), 0);
    // Payable accounts hold credits (negative balance), receivable accounts debits.
    const gstPayable = -balanceOf(GST_PAYABLE);
    const qstPayable = -balanceOf(QST_PAYABLE);
    const gstReceivable = balanceOf(GST_RECEIVABLE);
    const qstReceivable = balanceOf(QST_RECEIVABLE);
    return {
      as_of: asOf,
      gst: { collected_payable: dollars(gstPayable), paid_receivable: dollars(gstReceivable), net_owed: dollars(gstPayable - gstReceivable) },
      qst: { collected_payable: dollars(qstPayable), paid_receivable: dollars(qstReceivable), net_owed: dollars(qstPayable - qstReceivable) },
      net_owed_total: dollars(gstPayable - gstReceivable + qstPayable - qstReceivable),
      accounts: { gst_payable: GST_PAYABLE, qst_payable: QST_PAYABLE, gst_receivable: GST_RECEIVABLE, qst_receivable: QST_RECEIVABLE },
    };
  },
};

const taxFilings = {
  name: 'tax_filings',
  title: { en: 'Tax filings', fr: 'Déclarations de taxes' },
  description: 'The saved GST/QST filing periods, newest first: dates, status, tax collected, input credits and net owed as saved, and when filed or paid. Also the filing frequency and whether the company is registered. No tax registration numbers are returned.',
  inputSchema: NO_ARGS,
  run(_args, ctx) {
    const all = ctx.data.taxPeriodList() || [];
    const { rows, truncated } = capped(all, MAX_FILINGS);
    const reg = ctx.data.taxRegistrationGet(null);
    return {
      registered: !!(reg && (reg.business_number || reg.tps_registered_at || reg.tvq_registered_at)),
      filing_frequency: reg?.filing_frequency || null,
      count: all.length,
      truncated,
      periods: rows.map((p) => ({
        start: p.period_start,
        end: p.period_end,
        type: p.period_type,
        status: p.status || 'open',
        gst_collected: round2(p.tps_collected),
        qst_collected: round2(p.tvq_collected),
        gst_input_credits: round2(p.tps_cti),
        qst_input_refunds: round2(p.tvq_rti),
        gst_net_owed: round2(p.net_tps_owed),
        qst_net_owed: round2(p.net_tvq_owed),
        filed_on: p.filed_at ? String(p.filed_at).slice(0, 10) : null,
        paid_on: p.paid_at ? String(p.paid_at).slice(0, 10) : null,
      })),
    };
  },
};

const auditTrail = {
  name: 'audit_trail',
  title: { en: 'Audit trail', fr: 'Piste de vérification' },
  description: 'The record of changes made in BalanceIQ, newest first: when, who, which module, what action, which kind of record and its id, and a short note. Use it to find out who changed something and when. It shows no before/after values.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      from: dateArg('First day to include'),
      to: dateArg('Last day to include'),
      module: { type: 'string', description: 'Only this module, for example GL or tax' },
      limit: limitArg(200, 50),
    },
  },
  run(args, ctx) {
    if (args.from && args.to && args.from > args.to) throw new ToolError('The period ends before it starts.');
    const limit = clampLimit(args.limit, 200, 50);
    // Timestamps carry a time of day, so the last day runs to its end.
    const all = ctx.data.auditQuery({ module: text(args.module) || undefined, dateFrom: args.from || undefined, dateTo: args.to ? `${args.to} 23:59:59` : undefined, limit: AUDIT_FETCH }) || [];
    const { rows, truncated } = capped(all, limit);
    return {
      count: all.length,
      count_is_at_least: all.length >= AUDIT_FETCH,
      truncated,
      events: rows.map((r) => ({
        when: String(r.timestamp || '').slice(0, 16),
        who: r.user_name || null,
        module: r.module,
        action: r.action,
        record_type: r.record_type,
        record_id: String(r.record_id),
        summary: String(r.reason || r.field_name || '').slice(0, SUMMARY_LENGTH) || null,
      })),
    };
  },
};

export const ledgerTools = [chartOfAccounts, trialBalance, balanceSheet, accountActivity, listJournalEntries, getJournalEntry, accountingPeriods, fixedAssets, taxPosition, taxFilings, auditTrail];
