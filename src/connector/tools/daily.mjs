// The daily register figures, the office cash position and the closing sessions.
//
// The register figures are not in SQL tables: they are the stored list
// 'dicann-v7' (days keyed YYYY-MM-DD, each with `cashes`). Every derived figure
// comes from the same pure helpers the Daily tab uses, never from a copy here.

import { registerCashBreakdown, cardTipsOf } from '../../utils/registerCash.mjs';
import { walkCashDays } from '../../utils/cashCarry.mjs';
import { ToolError, round2, dollars, dateArg, limitArg, clampLimit, capped, DATE_PATTERN } from './shared.mjs';

const MAX_SPAN_DAYS = 62;
const DAY = new RegExp(DATE_PATTERN);
const money = (v) => (v == null || !Number.isFinite(Number(v)) ? null : round2(v));
const num = (v) => (v == null || !Number.isFinite(Number(v)) ? null : Number(v));

const dayNumber = (key) => { const [y, m, d] = key.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / 86400000); };

// Cash locations as the Encaisse tab defaults them when none are configured (ids only matter).
// Mirrors DEFAULT_CASH_LOCATIONS in src/App.jsx, which cannot be imported here.
const DEFAULT_LOCATIONS = [{ id: 'tills' }, { id: 'petty' }, { id: 'office' }];

// A register that has any figure typed is worth reporting.
const hasFigures = (c) => !!c && [c.posVentes, c.interac, c.finalCash, c.float, c.deposits].some((v) => v != null);

// On a day closed by shifts the Daily tab may count from a float carried over from the
// shift before, which is not stored with the day. Expected cash and the variance are then
// left out here (null) so this never shows a figure the screen does not: the variance the
// app itself recorded for each shift is in close_sessions.
function registerRow(cash, index, roster, shift = null) {
  const drawer = shift == null ? registerCashBreakdown(cash, cash.float ?? 0) : { cardSales: null, cashSales: null, expectedCash: null, cashVariance: null };
  const cashier = (roster || []).find((r) => r && r.id === cash.cashierId);
  return {
    shift,
    register: index + 1,
    cashier: cashier && cashier.name ? String(cashier.name) : null,
    pos_sales: money(cash.posVentes),
    pos_gst: money(cash.posTPS),
    pos_qst: money(cash.posTVQ),
    pos_deliveries: money(cash.posLivraisons),
    deliveries_entered: money(cash.livraisons),
    cards_and_interac: money(cash.interac),
    card_tips: round2(cardTipsOf(cash)),
    deposits: money(cash.deposits),
    float: money(cash.float),
    cash_counted: money(cash.finalCash),
    card_sales: money(drawer.cardSales),
    cash_sales: money(drawer.cashSales),
    expected_cash: money(drawer.expectedCash),
    cash_variance: money(drawer.cashVariance),
  };
}

const dailyRegister = {
  name: 'daily_register',
  title: { en: 'Daily register figures', fr: 'Chiffres de caisse quotidiens' },
  description: 'What was typed in the daily close for each day and each register (cash drawer): POS sales and taxes, cards and Interac, deliveries, deposits, float, cash counted, plus expected cash and variance. On a day closed by shifts the rows are per shift and expected cash and variance are null: use close_sessions for the variance of each shift. Use for "how did last week close". At most 62 days at a time.',
  inputSchema: { type: 'object', additionalProperties: false, required: ['from', 'to'], properties: { from: dateArg('First day'), to: dateArg('Last day, at most 62 days after the first') } },
  run(args, ctx) {
    if (args.from > args.to) throw new ToolError('The period ends before it starts.');
    if (dayNumber(args.to) - dayNumber(args.from) > MAX_SPAN_DAYS) throw new ToolError(`Ask for at most ${MAX_SPAN_DAYS} days at a time.`);
    const live = ctx.kv('dicann-v7') || {};
    const roster = ctx.kv('dicann-roster') || [];
    const days = Object.keys(live)
      .filter((d) => DAY.test(d) && d >= args.from && d <= args.to)
      .sort()
      .map((date) => {
        const rows = (cashes, shift) => (Array.isArray(cashes) ? cashes : []).map((c, i) => (hasFigures(c) ? registerRow(c, i, roster, shift) : null)).filter(Boolean);
        const shifts = live[date]?.shiftCashes && typeof live[date].shiftCashes === 'object' ? Object.entries(live[date].shiftCashes) : [];
        const byShift = shifts.flatMap(([key, cashes]) => rows(cashes, String(key)));
        return byShift.length ? { date, by_shift: true, registers: byShift } : { date, by_shift: false, registers: rows(live[date]?.cashes, null) };
      })
      .filter((d) => d.registers.length);
    return { from: args.from, to: args.to, count: days.length, days };
  },
};

const cashOnHand = {
  name: 'cash_on_hand',
  title: { en: 'Office cash position', fr: 'Position de caisse du bureau' },
  description: 'The cash position (Encaisse) on the latest day with activity up to a date: opening cash, register cash sales, other receipts, bank deposits, payouts, the calculated closing, and the counted amount and difference when a count was entered.',
  inputSchema: { type: 'object', additionalProperties: false, properties: { as_of: dateArg('Position at the end of this date; default today') } },
  run(args, ctx) {
    const asOf = args.as_of || ctx.today;
    const config = ctx.kv('dicann-encaisse-config') || {};
    const locations = Array.isArray(config.cashLocations) ? config.cashLocations : DEFAULT_LOCATIONS;
    const walk = walkCashDays(ctx.kv('dicann-encaisse') || {}, ctx.kv('dicann-v7') || {}, { locations, upTo: asOf });
    const dates = Object.keys(walk).sort();
    if (!dates.length) return { as_of: asOf, day: null, note: 'No cash position has been recorded up to this date.' };
    const day = dates[dates.length - 1];
    const w = walk[day];
    return {
      as_of: asOf,
      day,
      opening: money(w.opening),
      register_cash_sales: money(w.cashVentes),
      register_card_total: money(w.totalInterac),
      other_receipts: money(w.autreEntreesTotal),
      bank_deposits: money(w.depositsTotal),
      payouts: money(w.sortiesTotal),
      calculated_closing: money(w.calculated),
      counted: w.physEntered ? money(w.physTotal) : null,
      difference: w.physEntered ? money(w.ecart) : null,
      balanced: w.physEntered ? !!w.balanced : null,
      closing: money(w.closing),
    };
  },
};

const closeSessions = {
  name: 'close_sessions',
  title: { en: 'Daily close sessions', fr: 'Fermetures de caisse' },
  description: 'The daily close sessions, newest first: date, status, who prepared and approved them, and the cash variance of their registers in dollars (negative is a shortage). Use it to see which days are closed and where the drawers did not balance.',
  inputSchema: { type: 'object', additionalProperties: false, properties: { from: dateArg('Sessions on or after this date'), to: dateArg('Sessions on or before this date'), limit: limitArg(100, 30) } },
  run(args, ctx) {
    const limit = clampLimit(args.limit, 100, 30);
    const found = ctx.data.closeSessionList({ dateFrom: args.from, dateTo: args.to, limit: 500 }, ctx.db) || [];
    const { rows, truncated } = capped(found, limit);
    const sessions = rows.map((s) => {
      const full = ctx.data.closeSessionGet(s.id, ctx.db);
      const cents = ((full && full.register_closures) || []).reduce((sum, c) => sum + (Number(c.variance_cents) || 0), 0);
      return {
        date: s.date_key,
        shift: s.shift_key || null,
        status: s.status,
        prepared_by: s.prepared_by || null,
        approved_by: s.approved_by || null,
        variance: dollars(cents),
      };
    });
    return { count: found.length, truncated, sessions };
  },
};

export const dailyTools = [dailyRegister, cashOnHand, closeSessions];
