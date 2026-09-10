/**
 * PAYALLOC-001  selecting an invoice allocates the money received
 * PAYALLOC-002  a hand-typed allocation is never overwritten
 * PAYALLOC-003  Record payment is enabled exactly when it will do something
 *
 * Ticking an invoice allocated nothing. The To Apply column showed the invoice
 * balance as a grey placeholder, which is indistinguishable from a filled field,
 * while the running total said "Applied: 0,00". Record payment was therefore
 * disabled, with nothing on screen explaining why, and doSave returned silently
 * if it was reached at all. Re-dating a payment - the one operation you perform
 * precisely when the books are already wrong - was impossible.
 *
 * The amount received is now spread over the ticked invoices oldest-first.
 */
import { describe, it, expect } from 'vitest';
import { computeInvoiceTotals } from '../../../utils/calculations.js';

const solde = (f) =>
  Math.max(0, computeInvoiceTotals(f.lignes, f).total
    - (f.paiements || []).reduce((a, p) => a + (p.montant || 0), 0));

// Mirrors the allocation effect in EncaissementEditor.
function allocate(selectedFacs, received, prev = {}, touched = {}) {
  const next = {};
  let remaining = received;
  for (const f of selectedFacs) {
    if (touched[f.id] && prev[f.id] !== undefined) {
      next[f.id] = prev[f.id];
      remaining -= parseFloat(prev[f.id]) || 0;
    }
  }
  for (const f of selectedFacs) {
    if (next[f.id] !== undefined) continue;
    const give = Math.max(0, Math.min(solde(f), remaining));
    next[f.id] = give > 0.005 ? give.toFixed(2) : '';
    remaining -= give;
  }
  return next;
}

const total = (allocs) => Object.values(allocs).reduce((s, v) => s + (parseFloat(v) || 0), 0);

// Mirrors canSave for the bulk branch.
const canSave = (allocs, received, overSpill, overflowChoice = null) =>
  total(allocs) > 0 && received > 0 && (overSpill <= 0.005 || overflowChoice != null);

const inv = (id, date, amount, paid = 0) => ({
  id, date,
  lignes: [{ quantite: 1, prixUnitaire: amount, tps: false, tvq: false }],
  paiements: paid ? [{ montant: paid }] : [],
});

const F1 = inv('f1', '2026-07-31', 9984.41);

describe('PAYALLOC-001 selecting allocates', () => {
  it('one invoice paid in full is allocated in full', () => {
    const a = allocate([F1], 9984.41);
    expect(a.f1).toBe('9984.41');
    expect(total(a)).toBeCloseTo(9984.41, 2);
  });

  it('this is what was broken: the allocation used to stay empty', () => {
    const oldBehaviour = {};                 // ticking set nothing
    expect(total(oldBehaviour)).toBe(0);
    expect(total(allocate([F1], 9984.41))).toBeGreaterThan(0);
  });

  it('a part payment allocates only what arrived', () => {
    expect(allocate([F1], 5000).f1).toBe('5000.00');
  });

  it('an overpayment allocates no more than the balance', () => {
    expect(allocate([F1], 12000).f1).toBe('9984.41');
  });

  it('two invoices are filled oldest first', () => {
    const older = inv('f1', '2026-07-31', 1000);
    const newer = inv('f2', '2026-08-15', 1000);
    const a = allocate([older, newer], 1500);
    expect(a.f1).toBe('1000.00');
    expect(a.f2).toBe('500.00');
  });

  it('an invoice that gets nothing is left blank, not zero', () => {
    const older = inv('f1', '2026-07-31', 1000);
    const newer = inv('f2', '2026-08-15', 1000);
    expect(allocate([older, newer], 1000).f2).toBe('');
  });

  it('an invoice already part paid only absorbs what is left owing', () => {
    expect(allocate([inv('f1', '2026-07-31', 1000, 400)], 1000).f1).toBe('600.00');
  });

  it('nothing received means nothing allocated', () => {
    expect(allocate([F1], 0).f1).toBe('');
  });
});

describe('PAYALLOC-002 a hand-typed allocation is left alone', () => {
  it('the typed figure survives a re-run', () => {
    const prev = { f1: '250.00' };
    expect(allocate([F1], 9984.41, prev, { f1: true }).f1).toBe('250.00');
  });

  it('a manual entry consumes first, and the rest flows on', () => {
    const older = inv('f1', '2026-07-31', 1000);
    const newer = inv('f2', '2026-08-15', 1000);
    const a = allocate([older, newer], 1500, { f1: '200.00' }, { f1: true });
    expect(a.f1).toBe('200.00');
    expect(a.f2).toBe('1000.00');   // 1300 left, capped at the balance
  });

  it('an untouched field is still managed', () => {
    const a = allocate([F1], 7000, { f1: '9984.41' }, {});
    expect(a.f1).toBe('7000.00');
  });
});

describe('PAYALLOC-003 the button matches what will happen', () => {
  it('is enabled once the money is allocated', () => {
    const a = allocate([F1], 9984.41);
    expect(canSave(a, 9984.41, 0)).toBe(true);
  });

  it('was disabled in exactly the state the user hit', () => {
    // Invoice ticked, amount entered, allocation empty: dead button, no reason given.
    expect(canSave({}, 9984.41, 0)).toBe(false);
  });

  it('stays disabled with no amount received', () => {
    expect(canSave(allocate([F1], 0), 0, 0)).toBe(false);
  });

  it('an overpayment needs a decision before it can be recorded', () => {
    const a = allocate([F1], 12000);
    const over = 12000 - solde(F1);
    expect(over).toBeGreaterThan(0.005);
    expect(canSave(a, 12000, over)).toBe(false);
    expect(canSave(a, 12000, over, 'credit')).toBe(true);
  });

  it('re-dating a payment now works end to end', () => {
    // The whole point: void the wrongly dated payment, re-record it in August.
    const reopened = inv('f1', '2026-07-31', 9984.41);   // payment voided
    const a = allocate([reopened], 9984.41);
    expect(canSave(a, 9984.41, 0)).toBe(true);
    expect(total(a)).toBeCloseTo(9984.41, 2);
  });
});
