/**
 * TIPS-001  card tips paid out in cash explain the drawer without changing its total
 * TIPS-002  a day entered before the tips line reads exactly as it did
 * TIPS-003  a shortage that is really tips left out of the terminal total is named
 * TIPS-004  the daily tab uses this breakdown and carries both languages
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { registerCashBreakdown, cardTipsOf } from '../../utils/registerCash.mjs';

// A register: 1,000.00 of sales tax in, 700.00 of it on cards, 40.00 of card
// tips handed out in cash, 150.00 float.
const day = (over = {}) => ({
  posVentes: 869.75, posTPS: 43.49, posTVQ: 86.76, posLivraisons: 0,
  float: 150, interac: 740, pmtTips: 40, finalCash: 410, deposits: 0, ...over,
});

describe('TIPS-001 the breakdown', () => {
  it('splits the terminal total and takes the tips out of the drawer', () => {
    const b = registerCashBreakdown(day(), 150);
    expect(b.cardSales).toBe(700);
    expect(b.cashSales).toBe(300);
    expect(b.cardTips).toBe(40);
    expect(b.expectedCash).toBe(410);          // 150 + 300 - 40
    expect(b.cashVariance).toBe(0);
    expect(b.shortageLooksLikeTips).toBe(false);
  });

  it('gives the same expected cash as float + POS total - deliveries - terminal', () => {
    for (const tips of [0, 12.34, 40, 99.99]) {
      const c = day({ interac: 700 + tips, pmtTips: tips, posLivraisons: 55.5 });
      const b = registerCashBreakdown(c, 150);
      const old = Math.round((150 + 869.75 + 43.49 + 86.76 - 55.5 - (700 + tips)) * 100) / 100;
      expect(b.expectedCash).toBe(old);
    }
  });

  it('counts cash moved to the safe as cash on hand', () => {
    expect(registerCashBreakdown(day({ finalCash: 210, deposits: 200 }), 150).cashVariance).toBe(0);
  });

  it('flags tips larger than the terminal total', () => {
    expect(registerCashBreakdown(day({ interac: 30 }), 150).tipsOverTerminal).toBe(true);
    expect(registerCashBreakdown(day(), 150).tipsOverTerminal).toBe(false);
  });
});

describe('TIPS-002 days without the tips line', () => {
  it('reads as before: no tips, same expected cash and variance', () => {
    const b = registerCashBreakdown(day({ pmtTips: null }), 150);
    expect(b.tipsEntered).toBe(false);
    expect(b.cardTips).toBe(0);
    expect(b.cardSales).toBe(740);
    expect(b.expectedCash).toBe(410);
    expect(b.cashVariance).toBe(0);
  });

  it('stays empty until the POS total and the terminal total are in', () => {
    expect(registerCashBreakdown({ interac: 100 }, 0).expectedCash).toBeNull();
    expect(registerCashBreakdown({ posVentes: 100 }, 0).expectedCash).toBeNull();
    expect(registerCashBreakdown(null, 0).expectedCash).toBeNull();
    expect(registerCashBreakdown(day({ finalCash: null }), 150).cashVariance).toBeNull();
  });
});

describe('TIPS-003 the terminal total entered without its tips', () => {
  it('is named when the shortage is about the tips', () => {
    // Card sales typed instead of the amount collected: short by the tips and 1.99 more.
    const b = registerCashBreakdown(day({ interac: 700, finalCash: 408.01 }), 150);
    expect(b.cashVariance).toBe(-41.99);
    expect(b.shortageLooksLikeTips).toBe(true);
  });

  it('uses the tips the POS reported when none were typed', () => {
    const c = day({ interac: 700, pmtTips: null, posTips: 40 });
    expect(cardTipsOf(c)).toBe(40);
    expect(registerCashBreakdown(c, 150).shortageLooksLikeTips).toBe(true);
  });

  it('says nothing for a balanced drawer, an overage, a small tip total or an unrelated shortage', () => {
    expect(registerCashBreakdown(day(), 150).shortageLooksLikeTips).toBe(false);
    expect(registerCashBreakdown(day({ finalCash: 450 }), 150).shortageLooksLikeTips).toBe(false);
    expect(registerCashBreakdown(day({ interac: 705, pmtTips: 5, finalCash: 405 }), 150).shortageLooksLikeTips).toBe(false);
    expect(registerCashBreakdown(day({ finalCash: 300 }), 150).shortageLooksLikeTips).toBe(false);
  });
});

describe('TIPS-004 the daily tab', () => {
  const app = readFileSync(resolve(__dirname, '../../App.jsx'), 'utf8');
  const tr = readFileSync(resolve(__dirname, '../../i18n/translations.js'), 'utf8');

  it('reads the drawer from registerCashBreakdown and edits pmtTips', () => {
    expect(app).toMatch(/registerCashBreakdown\(cash,effectiveFloat\)/);
    expect(app).toMatch(/onChange\(\{\.\.\.cash,pmtTips:v\}\)/);
  });

  it('has every new string in French and in English', () => {
    for (const key of ['dailyCardTips', 'dailyCardTipsNote', 'dailyTerminalNote', 'dailyCardSalesNoTips', 'dailyCashSalesLine', 'dailyTipsHint', 'warnTipsOverTerminal']) {
      const hits = tr.match(new RegExp(`^\\s*${key}\\s*:`, 'gm')) || [];
      expect(hits.length, key).toBe(2);
    }
  });
});
