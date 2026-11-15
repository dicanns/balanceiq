// Bank and card accounts, their statement lines, reconciliation, statements and cheques.
// All read-only. bankAccountsList, bankTransactionsList and bankStatementsList-style
// lookups that take no `_db` read the company's open books, so tests stub them.

import { ToolError, round2, dollars, dateArg, limitArg, clampLimit, capped, nameMatches, NO_ARGS } from './shared.mjs';

// A statement line is "matched" once it is tied to a bill, cheque or account.
const MATCHED_STATUSES = ['matched', 'manual'];
// bankTransactionsList only filters on one status and defaults to 500 rows: ask for all, filter here.
const ALL_LINES = 20000;

const day = (v) => (v ? String(v).slice(0, 10) : null);
const accountName = (row, lang, fr, en) => (lang === 'fr' ? row[fr] || row[en] : row[en] || row[fr]) || null;

// What a person calls the state of a statement line.
function lineStatus(tx) {
  if (MATCHED_STATUSES.includes(tx.match_status)) return 'matched';
  if (tx.is_transfer) return 'transfer';
  return 'to_review';
}

function activeAccounts(ctx) {
  return ctx.data.bankAccountsList() || [];
}

const bankAccounts = {
  name: 'bank_accounts',
  title: { en: 'Bank accounts', fr: 'Comptes bancaires' },
  description: 'The bank, credit card and credit line accounts the company tracks: name, kind, the ledger account number each one posts to, and whether it is active. Use it to see which accounts exist before asking about their lines. No bank account numbers are stored or shown.',
  inputSchema: NO_ARGS,
  run(_args, ctx) {
    const accounts = activeAccounts(ctx).map((a) => ({
      name: a.name || '',
      kind: a.account_type || 'bank',
      ledger_account: a.account_number || null,
      ledger_account_name: accountName(a, ctx.lang, 'coa_name_fr', 'coa_name_en'),
      active: !a.is_archived,
    }));
    return { count: accounts.length, accounts };
  },
};

const bankTransactions = {
  name: 'bank_transactions',
  title: { en: 'Bank statement lines', fr: 'Lignes de relevé bancaire' },
  description: 'The imported statement lines of one bank or card account, newest first: date, description, signed amount (money in is positive), the ledger account it was filed under and its status. Use it for "what went through the chequing account" or to find a payment by its description.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['account'],
    properties: {
      account: { type: 'string', description: 'Part of the bank account name, for example "chequing"' },
      from: dateArg('First day to include'),
      to: dateArg('Last day to include'),
      status: { type: 'string', enum: ['to_review', 'matched', 'all'], description: 'to_review: not yet categorized; matched: categorized or tied to a bill or cheque; default all' },
      search: { type: 'string', description: 'Text to find in the line description' },
      limit: limitArg(500, 100),
    },
  },
  run(args, ctx) {
    if (args.from && args.to && args.from > args.to) throw new ToolError('The period ends before it starts.');
    const accounts = activeAccounts(ctx);
    const wanted = String(args.account || '').trim().toLowerCase();
    const exact = accounts.filter((a) => String(a.name || '').trim().toLowerCase() === wanted);
    const found = exact.length === 1 ? exact : accounts.filter((a) => nameMatches(a.name, args.account));
    if (found.length !== 1) {
      const names = accounts.map((a) => a.name).join(', ') || 'none';
      throw new ToolError(`${found.length ? 'Several' : 'No'} bank accounts match "${args.account}". The accounts are: ${names}.`);
    }
    const acct = found[0];
    const status = args.status || 'all';
    const search = String(args.search || '').trim().toLowerCase();
    const all = (ctx.data.bankTransactionsList(acct.id, { dateFrom: args.from, dateTo: args.to, statusFilter: 'all', limit: ALL_LINES }) || [])
      .map((t) => ({
        date: day(t.transaction_date),
        description: t.description || '',
        amount: round2(t.amount),
        ledger_account: t.account_number || null,
        ledger_account_name: accountName(t, ctx.lang, 'coa_name_fr', 'coa_name_en'),
        status: lineStatus(t),
      }))
      .filter((t) => status === 'all' || t.status === status)
      .filter((t) => !search || t.description.toLowerCase().includes(search));
    const { rows, truncated } = capped(all, clampLimit(args.limit, 500, 100));
    return {
      account: acct.name,
      count: all.length,
      money_in: round2(all.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0)),
      money_out: round2(all.filter((t) => t.amount < 0).reduce((s, t) => s + t.amount, 0)),
      truncated,
      transactions: rows,
    };
  },
};

const bankReconciliationStatusTool = {
  name: 'bank_reconciliation_status',
  title: { en: 'Reconciliation status', fr: 'État du rapprochement' },
  description: 'Where each bank and card account stands on reconciliation: the last statement end date that was reconciled, how many statements are still open, how many lines are not yet categorized, and the overall count of lines to review. Use it for "is the bank reconciled" or "what is left to do".',
  inputSchema: NO_ARGS,
  run(_args, ctx) {
    const accounts = (ctx.data.bankReconciliationStatus(ctx.db, ctx.today) || []).map((a) => ({
      account: a.name || '',
      kind: a.accountType || 'bank',
      state: a.state || null,
      last_reconciled_date: day(a.lastReconciledEnd),
      last_statement_end: day(a.lastStatementEnd),
      open_statements: Number(a.openCount) || 0,
      lines_not_counted: Number(a.notCounted) || 0,
      lines_to_categorize: Number(a.uncategorized) || 0,
      can_close: !!a.canClose,
    }));
    return {
      as_of: ctx.today,
      statement_lines_to_review: Number(ctx.data.bankNeedsCategorizingCount(ctx.db)) || 0,
      accounts,
    };
  },
};

const STATEMENT_CAP = 200;

const bankStatements = {
  name: 'bank_statements',
  title: { en: 'Imported statements', fr: 'Relevés importés' },
  description: 'The bank and card statements imported so far, per account, newest first: period, import date, number of lines, opening balance when the file gave one, closing balance and whether it is reconciled. Use it to see which months are in the books and which are missing.',
  inputSchema: { type: 'object', additionalProperties: false, properties: { account: { type: 'string', description: 'Part of the bank account name; default all accounts' } } },
  run(args, ctx) {
    const accounts = activeAccounts(ctx).filter((a) => nameMatches(a.name, args.account));
    if (args.account && String(args.account).trim() && !accounts.length) {
      throw new ToolError(`No bank account matches "${args.account}". The accounts are: ${activeAccounts(ctx).map((a) => a.name).join(', ') || 'none'}.`);
    }
    const all = [];
    for (const a of accounts) {
      for (const s of ctx.data.bankStatementsList(a.id, ctx.db) || []) {
        all.push({
          account: a.name || '',
          period_start: day(s.period_start),
          period_end: day(s.period_end),
          imported_on: day(s.imported_at),
          line_count: Number(s.line_count) || 0,
          opening_balance: s.file_opening_cents == null ? null : dollars(s.file_opening_cents),
          closing_balance: s.ending_balance == null ? null : round2(s.ending_balance),
          reconciled: !!s.reconciled,
        });
      }
    }
    const { rows, truncated } = capped(all, STATEMENT_CAP);
    return { count: all.length, truncated, statements: rows };
  },
};

const cheques = {
  name: 'cheques',
  title: { en: 'Cheques', fr: 'Chèques' },
  description: 'Cheques the company wrote (issued) or received, newest first: number, date, payee or payer, amount, status (outstanding, cleared or void) and bank account, plus the total of cheques still outstanding. Use it for "which cheques have not cleared".',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      direction: { type: 'string', enum: ['issued', 'received'], description: 'issued: written by the company; received: paid to the company; default both' },
      status: { type: 'string', enum: ['outstanding', 'cleared', 'void'], description: 'Only cheques in this state; default all' },
      limit: limitArg(200, 100),
    },
  },
  run(args, ctx) {
    const all = (ctx.data.chequeList({ direction: args.direction || null, status: args.status || null }, ctx.db) || []).map((c) => ({
      number: c.cheque_number || null,
      date: day(c.cheque_date),
      direction: c.direction,
      party: c.party_name || null,
      amount: dollars(c.amount_cents),
      status: c.status,
      account: c.bank_account_name || null,
      cleared_on: day(c.cleared_date),
    }));
    const { rows, truncated } = capped(all, clampLimit(args.limit, 200, 100));
    const money = (x) => ({ count: Number(x?.count) || 0, total: dollars(x?.cents) });
    // Cheques dated after today are not counted as outstanding yet.
    const overall = ctx.data.chequeOutstandingSummary(null, ctx.today, ctx.db) || {};
    const byAccount = [];
    for (const a of activeAccounts(ctx)) {
      const s = ctx.data.chequeOutstandingSummary(a.id, ctx.today, ctx.db) || {};
      const issued = money(s.issued);
      const received = money(s.received);
      if (issued.count || received.count) byAccount.push({ account: a.name || '', issued, received });
    }
    return {
      count: all.length,
      truncated,
      outstanding: { as_of: ctx.today, issued: money(overall.issued), received: money(overall.received), by_account: byAccount },
      cheques: rows,
    };
  },
};

export const bankTools = [bankAccounts, bankTransactions, bankReconciliationStatusTool, bankStatements, cheques];
