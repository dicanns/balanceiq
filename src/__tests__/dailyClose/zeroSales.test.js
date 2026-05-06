/**
 * ZERO-SALES-001  hasPOS=true when posVentes=0 (register connected, zero-sales day)
 * ZERO-SALES-002  hasPOS=false when posVentes=null (no POS connection)
 * ZERO-SALES-003  ecart computed correctly when posVentes=0
 * ZERO-SALES-004  zero-sales register is included in cashSummary (not filtered out)
 * ZERO-SALES-005  closedCnt incremented for zero-sales register when fully closed
 */
import { describe, it, expect } from 'vitest';

// Extracted logic mirrors the fixed App.jsx implementations.

function hasPOSFromCashes(cashes) {
  return cashes.some(c => c.posVentes != null);
}

function buildCashSummary(cashes) {
  return (cashes || []).map((c, i) => {
    const mc = c.interac != null && c.finalCash != null;
    const manT = mc ? (c.interac || 0) + (c.finalCash || 0) + (c.deposits || 0) : null;
    const posT = (c.posVentes || 0) + (c.posTPS || 0) + (c.posTVQ || 0);
    const expected = posT - (c.posLivraisons || 0);
    const ecart = mc && c.posVentes != null && Number.isFinite(c.posVentes) ? manT - expected : null;
    const bal = ecart != null && Math.abs(ecart) <= 1;
    const name = c.cashierId || `#${i + 1}`;
    if (c.posVentes == null && !c.interac && !c.finalCash) return null;
    return { name, bal, ecart };
  }).filter(Boolean);
}

function buildClosedCount(cashes) {
  let cnt = 0;
  cashes.forEach(c => {
    const mc = c.interac != null && c.finalCash != null;
    if (mc && c.posVentes != null) cnt++;
  });
  return cnt;
}

// ── ZERO-SALES-001 ────────────────────────────────────────────────────────────

describe('ZERO-SALES-001: hasPOS=true when posVentes=0', () => {
  it('register with posVentes=0 signals POS is connected', () => {
    const cashes = [{ posVentes: 0, posTPS: 0, posTVQ: 0 }];
    expect(hasPOSFromCashes(cashes)).toBe(true);
  });

  it('multiple registers — one is zero-sales, one has sales — still hasPOS=true', () => {
    const cashes = [{ posVentes: 250 }, { posVentes: 0 }];
    expect(hasPOSFromCashes(cashes)).toBe(true);
  });
});

// ── ZERO-SALES-002 ────────────────────────────────────────────────────────────

describe('ZERO-SALES-002: hasPOS=false when posVentes=null', () => {
  it('register with posVentes=null means no POS connection', () => {
    const cashes = [{ posVentes: null, interac: 100, finalCash: 50 }];
    expect(hasPOSFromCashes(cashes)).toBe(false);
  });

  it('register with posVentes=undefined also means no POS connection', () => {
    const cashes = [{ interac: 100, finalCash: 50 }];
    expect(hasPOSFromCashes(cashes)).toBe(false);
  });

  it('empty cashes array returns false', () => {
    expect(hasPOSFromCashes([])).toBe(false);
  });
});

// ── ZERO-SALES-003 ────────────────────────────────────────────────────────────

describe('ZERO-SALES-003: ecart computed when posVentes=0', () => {
  it('ecart is 0 when manual total matches expected (zero-sales register)', () => {
    const summary = buildCashSummary([{
      posVentes: 0, posTPS: 0, posTVQ: 0, posLivraisons: 0,
      interac: 0, finalCash: 0, deposits: 0,
    }]);
    expect(summary).toHaveLength(1);
    expect(summary[0].ecart).toBe(0);
    expect(summary[0].bal).toBe(true);
  });

  it('ecart is non-null even when posVentes=0 and mc=true', () => {
    const summary = buildCashSummary([{
      posVentes: 0, posTPS: 0, posTVQ: 0,
      interac: 5, finalCash: 0, deposits: 0,
    }]);
    expect(summary[0].ecart).not.toBeNull();
    expect(summary[0].ecart).toBe(5);
  });
});

// ── ZERO-SALES-004 ────────────────────────────────────────────────────────────

describe('ZERO-SALES-004: zero-sales register included in cashSummary', () => {
  it('register with posVentes=0 and manual entry is not filtered out', () => {
    const summary = buildCashSummary([{
      posVentes: 0, interac: 0, finalCash: 0,
    }]);
    expect(summary).toHaveLength(1);
  });

  it('register with posVentes=null and no manual entry is filtered out', () => {
    const summary = buildCashSummary([{
      posVentes: null, interac: null, finalCash: null,
    }]);
    expect(summary).toHaveLength(0);
  });
});

// ── ZERO-SALES-005 ────────────────────────────────────────────────────────────

describe('ZERO-SALES-005: closedCnt incremented for zero-sales register', () => {
  it('register with posVentes=0 and mc=true counts as closed', () => {
    const cashes = [{ posVentes: 0, interac: 0, finalCash: 0 }];
    expect(buildClosedCount(cashes)).toBe(1);
  });

  it('register with posVentes=null and mc=true does NOT count as closed', () => {
    const cashes = [{ posVentes: null, interac: 100, finalCash: 50 }];
    expect(buildClosedCount(cashes)).toBe(0);
  });

  it('two registers — one zero-sales closed, one regular closed', () => {
    const cashes = [
      { posVentes: 0, interac: 0, finalCash: 0 },
      { posVentes: 320, interac: 200, finalCash: 120 },
    ];
    expect(buildClosedCount(cashes)).toBe(2);
  });
});
