// Questions that take several parts of the books at once: what needs the
// owner's attention today, and the sales tax for a period.
//
// Both use the very function the matching screen uses (the Today list and the
// Taxes tab), so an assistant and the screen can never disagree.

import { composeWorklist } from '../../services/todayWorklist.js';
import { emailWorklistItems } from '../../services/emailTracking.js';
import { ToolError, round2, dateArg, NO_ARGS } from './shared.mjs';

const URGENCY = { alert: 'overdue', warn: 'to_do', info: 'set_up' };
const list = (v) => (Array.isArray(v) ? v.filter(Boolean) : []);
// A part of the list that cannot be read is left out, as on the screen.
const safe = (fn, fallback) => { try { const v = fn(); return v == null ? fallback : v; } catch (_) { return fallback; } };

const needsAttention = {
  name: 'needs_attention',
  title: { en: 'What needs attention', fr: 'Ce qui demande votre attention' },
  description: 'The same list as the Today screen: overdue invoices, bank lines to categorize, statements to reconcile, the next sales tax filing, overdue supplier bills and other things waiting on the owner, most urgent first. Use it for "what should I deal with today" or as a start for a month-end check.',
  inputSchema: NO_ARGS,
  run(_args, ctx) {
    const d = ctx.data;
    const today = ctx.today;
    const factures = list(safe(() => d.documentsList('facture', ctx.db), []));
    const { items, counts } = composeWorklist({
      needsCategorizing: Number(safe(() => d.bankNeedsCategorizingCount(ctx.db), 0)) || 0,
      reconcileStatus: safe(() => d.bankReconciliationStatus(ctx.db, today), []),
      blockers: safe(() => d.getBalanceSheetBlockers(today, ctx.db), []),
      registration: safe(() => d.taxRegistrationGet(null), null),
      taxPeriods: safe(() => d.taxPeriodList(), []),
      trialRows: safe(() => d.trialBalance(today), []),
      subledgerRows: safe(() => d.bankSubledgerBalances(today, ctx.db), []),
      factures,
      clients: list(ctx.kv('dicann-fac-clients')),
      today,
      lang: ctx.lang,
      emailItems: emailWorklistItems(factures, { now: Date.parse(`${today}T12:00:00`), lang: ctx.lang }),
    });
    return {
      as_of: today,
      count: items.length,
      waiting_on_the_owner: counts.today,
      overdue_invoices: counts.sales,
      bank_lines_to_categorize: counts.bank,
      items: items.map((it) => ({ urgency: URGENCY[it.tone] || 'to_do', what: String(it.title || ''), detail: it.detail ? String(it.detail) : null })),
    };
  },
};

const salesTaxForPeriod = {
  name: 'sales_tax_for_period',
  title: { en: 'Sales tax for a period', fr: 'Taxes de vente d\'une période' },
  description: 'GST and QST for any period, worked out the way the Taxes tab does: tax collected (register, invoices, bank), input tax credits and refunds (bills, bank), and the net owed or refundable. Use it for "what do I owe in taxes this quarter". It is an estimate from what is entered so far, in early access: the owner or their accountant reviews it before filing. tax_position gives the ledger balances instead.',
  inputSchema: { type: 'object', additionalProperties: false, required: ['from', 'to'], properties: { from: dateArg('First day of the period'), to: dateArg('Last day of the period') } },
  run(args, ctx) {
    if (args.from > args.to) throw new ToolError('The period ends before it starts.');
    // log: false, so a look from an assistant leaves no line in the calculation log.
    const r = ctx.data.taxPeriodCompute(args.from, args.to, ctx.db, { log: false });
    const side = (collected, credits, net, parts) => ({ collected: round2(collected), credits: round2(credits), net_owed: round2(net), ...parts });
    return {
      from: args.from,
      to: args.to,
      gst: side(r.tpsCollected, r.tpsCti, r.netTpsOwed, {
        collected_from_register: round2(r.tpsCollectedFromRegister), collected_from_invoices: round2(r.tpsCollectedFromInvoices), collected_from_bank: round2(r.tpsCollectedFromBank),
      }),
      qst: side(r.tvqCollected, r.tvqRti, r.netTvqOwed, {
        collected_from_register: round2(r.tvqCollectedFromRegister), collected_from_invoices: round2(r.tvqCollectedFromInvoices), collected_from_bank: round2(r.tvqCollectedFromBank),
      }),
      net_owed_total: round2((Number(r.netTpsOwed) || 0) + (Number(r.netTvqOwed) || 0)),
      taxable_sales: round2(r.supplies),
      bills_counted: Number(r.billCount) || 0,
      bank_lines_counted: Number(r.bankTxCount) || 0,
      bank_lines_still_to_review: Number(r.suspenseCount) || 0,
      ready_to_file: !(r.blockers && r.blockers.length),
      note: 'An estimate from what is entered so far. A negative net is a refund. Review before filing.',
    };
  },
};

export const jobTools = [needsAttention, salesTaxForPeriod];
