/**
 * CONN-090  daily_register, cash_on_hand, close_sessions
 *
 * The stored lists and the data functions are stubbed with data shaped like the
 * real ones. What is tested is what a tool reads and what it hands to the AI.
 */
import { describe, it, expect } from 'vitest';
import { dailyTools } from '../../connector/tools/daily.mjs';
import { checkArguments } from '../../connector/protocol.mjs';
import { expectWellFormed, expectPlainAnswer } from './_conformance.js';

const blank = { cashierId: '', posVentes: null, posTPS: null, posTVQ: null, posLivraisons: null, float: null, interac: null, livraisons: null, deposits: null, finalCash: null, pmtTips: null };
const live = {
  '2026-06-10': {
    cashes: [
      { ...blank, cashierId: 'e1', posVentes: 1000, posTPS: 50, posTVQ: 99.75, posLivraisons: 100, float: 200, interac: 600, pmtTips: 20, deposits: 40, finalCash: 600, secret_internal: 'x' },
      { ...blank, posVentes: 50 },
      { ...blank },
    ],
    employees: [{ name: 'Sam', hours: 8, wage: 99 }],
    notes: 'private note',
  },
  '2026-06-11': { cashes: [{ ...blank }], employees: [] },
  '2026-08-20': { cashes: [{ ...blank, posVentes: 10 }] },
};
const roster = [{ id: 'e1', name: 'Alex', pin: '1234', wage: 50, phone: '555-0100' }];
const encaisse = {
  '2026-06-09': { openingOverride: 100, autreEntrees: [{ montant: 10 }], deposits: [{ montant: 30 }], sorties: [{ montant: 5 }], physicalCount: { tills: 75 }, carryForwardMode: 'calculated' },
};
const kvData = { 'dicann-v7': live, 'dicann-roster': roster, 'dicann-encaisse': encaisse, 'dicann-encaisse-config': { cashLocations: [{ id: 'tills', name: 'Tills' }] } };
const sessions = [
  { id: 3, date_key: '2026-06-10', shift_key: null, status: 'finalized', prepared_by: 'Alex', approved_by: 'Jo', blind_close_mode: 'off', secret_internal: 'x' },
  { id: 2, date_key: '2026-06-09', shift_key: 'evening', status: 'submitted', prepared_by: null, approved_by: null },
  { id: 1, date_key: '2026-06-08', shift_key: null, status: 'draft', prepared_by: 'Alex', approved_by: null },
];
const closures = { 3: [{ variance_cents: -975 }, { variance_cents: 100 }], 2: [], 1: [{ variance_cents: 0 }] };
const seen = {};
const data = {
  closeSessionList: (opts) => { seen.list = opts; return sessions.filter((s) => (!opts.dateFrom || s.date_key >= opts.dateFrom) && (!opts.dateTo || s.date_key <= opts.dateTo)); },
  closeSessionGet: (id) => ({ ...sessions.find((s) => s.id === id), register_closures: closures[id] }),
};
const baseCtx = { company: { id: 'co1', name: 'Demo Inc.' }, today: '2026-06-15', lang: 'en', level: 'read', db: { marker: 'db' }, data, kv: (k) => kvData[k] ?? null };
const tool = (name) => dailyTools.find((t) => t.name === name);
const run = (name, args = {}, ctx = baseCtx) => { expect(checkArguments(tool(name).inputSchema, args)).toBeNull(); const r = tool(name).run(args, ctx); expectPlainAnswer(r); return r; };

describe('CONN-090 daily tools', () => {
  it('are well formed', () => {
    expectWellFormed(dailyTools);
    expect(dailyTools.map((t) => t.name)).toEqual(['daily_register', 'cash_on_hand', 'close_sessions']);
  });

  it('daily_register gives each register as recorded, with the Daily tab figures', () => {
    const r = run('daily_register', { from: '2026-06-01', to: '2026-06-30' });
    expect(r).toEqual({
      from: '2026-06-01', to: '2026-06-30', count: 1,
      days: [{
        date: '2026-06-10', by_shift: false,
        registers: [
          { shift: null, register: 1, cashier: 'Alex', pos_sales: 1000, pos_gst: 50, pos_qst: 99.75, pos_deliveries: 100, deliveries_entered: null, cards_and_interac: 600, card_tips: 20, deposits: 40, float: 200, cash_counted: 600, card_sales: 580, cash_sales: 469.75, expected_cash: 649.75, cash_variance: -9.75 },
          // only the POS total is typed: nothing is derived from it
          { shift: null, register: 2, cashier: null, pos_sales: 50, pos_gst: null, pos_qst: null, pos_deliveries: null, deliveries_entered: null, cards_and_interac: null, card_tips: 0, deposits: null, float: null, cash_counted: null, card_sales: null, cash_sales: null, expected_cash: null, cash_variance: null },
        ],
      }],
    });
  });

  it('daily_register leaves expected cash and variance out on a day closed by shifts', () => {
    const shiftDay = { '2026-07-02': { cashes: [{ ...blank, posVentes: 999 }], shiftCashes: { am: [{ ...blank, cashierId: 'e1', posVentes: 300, interac: 100, float: 200, finalCash: 400 }], pm: [{ ...blank }] } } };
    const r = tool('daily_register').run({ from: '2026-07-01', to: '2026-07-03' }, { ...baseCtx, kv: (k) => (k === 'dicann-v7' ? shiftDay : kvData[k] ?? null) });
    expect(r.count).toBe(1);
    expect(r.days[0]).toMatchObject({ date: '2026-07-02', by_shift: true });
    // The shift's figures as recorded; the day-level drawers are not mixed in.
    expect(r.days[0].registers).toHaveLength(1);
    expect(r.days[0].registers[0]).toMatchObject({ shift: 'am', register: 1, cashier: 'Alex', pos_sales: 300, cards_and_interac: 100, float: 200, cash_counted: 400, card_sales: null, cash_sales: null, expected_cash: null, cash_variance: null });
    expectPlainAnswer(r);
  });

  it('daily_register never leaks other stored fields or staff details', () => {
    const text = JSON.stringify(run('daily_register', { from: '2026-06-01', to: '2026-06-30' }));
    for (const hidden of ['secret_internal', '1234', '555-0100', 'private note', 'Sam', 'wage', 'pin']) expect(text).not.toContain(hidden);
  });

  it('daily_register checks its arguments and the length of the period', () => {
    expect(checkArguments(tool('daily_register').inputSchema, { from: '2026-06-01' })).not.toBeNull();
    expect(checkArguments(tool('daily_register').inputSchema, { from: '06/01', to: '2026-06-30' })).not.toBeNull();
    expect(() => run('daily_register', { from: '2026-06-30', to: '2026-06-01' })).toThrow(/ends before it starts/);
    expect(() => run('daily_register', { from: '2026-06-01', to: '2026-08-03' })).toThrow(/at most 62 days/);
    expect(run('daily_register', { from: '2026-06-01', to: '2026-08-02' }).count).toBe(1);
    expect(run('daily_register', { from: '2026-06-11', to: '2026-06-11' })).toEqual({ from: '2026-06-11', to: '2026-06-11', count: 0, days: [] });
  });

  it('cash_on_hand gives the latest day of the Encaisse walk', () => {
    expect(run('cash_on_hand', { as_of: '2026-06-12' })).toEqual({
      as_of: '2026-06-12', day: '2026-06-10', opening: 75, register_cash_sales: 400, register_card_total: 600,
      other_receipts: 0, bank_deposits: 0, payouts: 0, calculated_closing: 475, counted: null, difference: null, balanced: null, closing: 475,
    });
  });

  it('cash_on_hand carries the closing forward and shows a count when one was entered', () => {
    expect(run('cash_on_hand', { as_of: '2026-06-09' })).toEqual({
      as_of: '2026-06-09', day: '2026-06-09', opening: 100, register_cash_sales: 0, register_card_total: 0,
      other_receipts: 10, bank_deposits: 30, payouts: 5, calculated_closing: 75, counted: 75, difference: 0, balanced: true, closing: 75,
    });
  });

  it('cash_on_hand says so when nothing is recorded, and checks its argument', () => {
    const empty = run('cash_on_hand', {}, { ...baseCtx, kv: () => null });
    expect(empty).toEqual({ as_of: '2026-06-15', day: null, note: 'No cash position has been recorded up to this date.' });
    expect(checkArguments(tool('cash_on_hand').inputSchema, { as_of: 'today' })).not.toBeNull();
  });

  it('close_sessions lists status, who closed and the variance in dollars', () => {
    const r = run('close_sessions');
    expect(seen.list.dateFrom).toBeUndefined();
    expect(r).toEqual({
      count: 3, truncated: false,
      sessions: [
        { date: '2026-06-10', shift: null, status: 'finalized', prepared_by: 'Alex', approved_by: 'Jo', variance: -8.75 },
        { date: '2026-06-09', shift: 'evening', status: 'submitted', prepared_by: null, approved_by: null, variance: 0 },
        { date: '2026-06-08', shift: null, status: 'draft', prepared_by: 'Alex', approved_by: null, variance: 0 },
      ],
    });
    expect(JSON.stringify(r)).not.toContain('secret_internal');
  });

  it('close_sessions filters by date, cuts the list and checks its arguments', () => {
    expect(run('close_sessions', { from: '2026-06-09', to: '2026-06-09' }).sessions.map((s) => s.date)).toEqual(['2026-06-09']);
    expect(seen.list).toMatchObject({ dateFrom: '2026-06-09', dateTo: '2026-06-09' });
    const cut = run('close_sessions', { limit: 1 });
    expect([cut.count, cut.sessions.length, cut.truncated]).toEqual([3, 1, true]);
    expect(checkArguments(tool('close_sessions').inputSchema, { limit: 'all' })).not.toBeNull();
  });
});
