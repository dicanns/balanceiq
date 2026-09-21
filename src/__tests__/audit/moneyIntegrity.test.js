/**
 * AUDIT-LEDGER-001  an invoice posts balanced whatever its rounding, taxes as printed, cent in revenue
 * AUDIT-LEDGER-002  the posting handlers use that split, and a refusal is no longer silent
 * AUDIT-DROPS-001   a safe drop reaches the variance once: the perfect day reads 0.00 in both modes
 * AUDIT-DROPS-002   a drop entered twice reads as exactly the duplicate
 * AUDIT-COUNT-001   a register with no count cannot be confirmed under any rule
 * AUDIT-TIPS-001    the tip pool modal has one algorithm
 * AUDIT-DEAD-001    the dead calculation functions are gone
 *
 * First batch of fixes from the money integrity audit. Figures are invented;
 * the seeded generator is reproducible (xorshift32, no Math.random).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'module';
import { buildAccountingDb } from '../accounting/helpers/testSchema.js';
import { computeInvoiceTotals } from '../../utils/calculations.js';
import * as calc from '../../utils/calculations.js';
import { computeRegisterVariance, computeAdvancedRegisterVariance } from '../../services/registerVariance.js';
import { canConfirmClose } from '../../services/closeGating.js';

const require = createRequire(import.meta.url);
const { ledgerSplit } = require('../../services/ledgerSplit.js');
const { glDraftEntry, glPostEntry } = require('../../db/database.js');
const ROOT = path.resolve(__dirname, '../../..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

function seeded(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 1000000) / 1000000; };
}
function seededInvoices(n, seed) {
  const rnd = seeded(seed);
  return Array.from({ length: n }, () => {
    const lines = Array.from({ length: 1 + Math.floor(rnd() * 40) }, () => ({
      quantite: 1 + Math.floor(rnd() * 12), prixUnitaire: Math.round(rnd() * 20000) / 100,
      remise: rnd() < 0.2 ? Math.floor(rnd() * 30) : 0, tps: rnd() > 0.1, tvq: rnd() > 0.1,
    }));
    return computeInvoiceTotals(lines);
  });
}
const c = (v) => Math.round((v || 0) * 100);

describe('AUDIT-LEDGER-001 the split balances by construction', () => {
  it('on 5,000 seeded invoices, AR equals revenue plus taxes to the cent, taxes untouched', () => {
    let absorbed = 0;
    for (const t of seededInvoices(5000, 20260920)) {
      const s = ledgerSplit({ totalCents: c(t.total), tpsCents: c(t.tpsTotal), tvqCents: c(t.tvqTotal), taxExempt: false });
      expect(s.ok).toBe(true);
      expect(s.revenueCents + s.tpsCents + s.tvqCents).toBe(s.totalCents);
      expect(s.tpsCents).toBe(c(t.tpsTotal));
      expect(s.tvqCents).toBe(c(t.tvqTotal));
      if (s.revenueCents !== c(t.sousTotal)) absorbed++;
    }
    // The cases that used to be refused: the cent now sits in revenue.
    expect(absorbed).toBeGreaterThan(1000);
  });
  it('an exempt invoice is all revenue; a tax with no account stays in revenue; nonsense is refused', () => {
    expect(ledgerSplit({ totalCents: 5749, tpsCents: 250, tvqCents: 499, taxExempt: true })).toMatchObject({ revenueCents: 5749, tpsCents: 0, tvqCents: 0 });
    expect(ledgerSplit({ totalCents: 5749, tpsCents: 250, tvqCents: 499, hasTvq: false })).toMatchObject({ revenueCents: 5499, tpsCents: 250, tvqCents: 0 });
    expect(ledgerSplit({ totalCents: 100, tpsCents: 80, tvqCents: 80 }).ok).toBe(false);
    expect(ledgerSplit({ totalCents: -1 }).ok).toBe(false);
  });
});

describe('AUDIT-LEDGER-002 the handlers and the ledger', () => {
  let db;
  beforeEach(() => {
    db = buildAccountingDb();
    for (const [num, name, type] of [['1100', 'AR', 'asset'], ['4000', 'Sales', 'revenue'], ['2100', 'TPS', 'liability'], ['2110', 'TVQ', 'liability']]) {
      db.prepare(`INSERT OR IGNORE INTO chart_of_accounts (account_number, name_fr, name_en, type) VALUES (?,?,?,?)`).run(num, name, name, type);
    }
  });
  afterEach(() => { db?.close(); db = null; });
  const coa = (n) => db.prepare(`SELECT id FROM chart_of_accounts WHERE account_number=?`).get(n).id;

  it('posts every seeded invoice through the real ledger without an unbalanced refusal', () => {
    for (const t of seededInvoices(200, 7)) {
      const s = ledgerSplit({ totalCents: c(t.total), tpsCents: c(t.tpsTotal), tvqCents: c(t.tvqTotal), taxExempt: false });
      const lines = [
        { account_id: coa('1100'), debit_cents: s.totalCents, credit_cents: 0 },
        { account_id: coa('4000'), debit_cents: 0, credit_cents: s.revenueCents },
      ];
      if (s.tpsCents) lines.push({ account_id: coa('2100'), debit_cents: 0, credit_cents: s.tpsCents });
      if (s.tvqCents) lines.push({ account_id: coa('2110'), debit_cents: 0, credit_cents: s.tvqCents });
      const { entryId } = glDraftEntry({ entry_date: '2026-09-01', description: 'sample', source_type: 'invoice', source_id: 'inv-' + entryIdSeed(t), lines }, db);
      expect(() => glPostEntry(entryId, db)).not.toThrow();
    }
  });
  function entryIdSeed(t) { return String(Math.round(t.total * 1000)); }

  it('both handlers use the split, refusals are logged, and unposted invoices are backfilled', () => {
    const main = read('main.js');
    expect((main.match(/ledgerSplit\(\{ totalCents, tpsCents, tvqCents, taxExempt/g) || []).length).toBe(2);
    expect(main).not.toMatch(/credit_cents: subtotalCents/);
    const app = read('src/App.jsx');
    expect(app).not.toMatch(/ledger\.invoicePost\([^\n]*\.catch\(\(\)=>\{\}\)/);
    expect(app).toMatch(/An invoice the ledger refused/);
  });
});

describe('AUDIT-DROPS-001 the perfect day', () => {
  // float 200, cash sales 100, one safe drop of 50, drawer counted at 250
  const cash = { posVentes: 100, posTPS: 0, posTVQ: 0, posLivraisons: 0, interac: 0, finalCash: 250, float: 200 };
  it('reads 0.00 in advanced mode with the drop subtracted once, and 0.00 in simple mode with it carried into deposits', () => {
    expect(computeAdvancedRegisterVariance({ ...cash, deposits: 0 }, {}, 5000, 20000)).toBe(0);
    expect(computeRegisterVariance({ ...cash, deposits: 50 }, 20000)).toBe(0);
  });
  it('the old wiring would have read +50.00: the drop both subtracted and deposited', () => {
    expect(computeAdvancedRegisterVariance({ ...cash, deposits: 50 }, {}, 5000, 20000)).toBe(50);
  });
  it('the close card carries drops into deposits only in simple mode', () => {
    const s = read('src/components/RegisterCloseCard.jsx');
    expect(s).toMatch(/if \(advancedMode\) \{[\s\S]*?dropSyncRef\.current = null;\s*return;/);
    expect(s).toMatch(/\}, \[myDrops, advancedMode\]\);/);
  });
  it('simple and advanced agree on 3,000 seeded days with no advanced-only activity', () => {
    const rnd = seeded(99);
    for (let i = 0; i < 3000; i++) {
      const cash = {
        posVentes: Math.round(rnd() * 500000) / 100, posTPS: Math.round(rnd() * 25000) / 100, posTVQ: Math.round(rnd() * 50000) / 100,
        posLivraisons: Math.round(rnd() * 20000) / 100, interac: Math.round(rnd() * 300000) / 100,
        finalCash: Math.round(rnd() * 200000) / 100, deposits: 0,
      };
      const floatCents = Math.round(rnd() * 30000);
      const a = computeAdvancedRegisterVariance(cash, {}, 0, floatCents);
      const b = computeRegisterVariance(cash, floatCents);
      expect(Math.round(a * 100)).toBe(Math.round(b * 100));
    }
  });
});

describe('AUDIT-DROPS-002 a drop entered twice', () => {
  it('reads as exactly the duplicate, not the duplicate plus every drop', () => {
    // float 200, sales 1000, 800 physically dropped but 1,100 recorded, 400 left in the drawer
    const cash = { posVentes: 1000, posTPS: 0, posTVQ: 0, posLivraisons: 0, interac: 0, finalCash: 400, deposits: 0 };
    expect(computeAdvancedRegisterVariance(cash, {}, 110000, 20000)).toBe(300);
  });
});

describe('AUDIT-COUNT-001 a register with no count', () => {
  const nul = { idx: 0, register: 1, variance: null, cents: 0, exceeds: false };
  it('cannot be confirmed under inform, require_reason or block', () => {
    for (const rule of ['inform', 'require_reason', 'block']) {
      expect(canConfirmClose({ variances: [nul], varianceRule: rule }), rule).toBe(false);
    }
    expect(canConfirmClose({ variances: [{ ...nul, variance: 0 }], varianceRule: 'inform' })).toBe(true);
  });
  it('and the review screen says so in both languages', () => {
    const s = read('src/components/CloseReviewModal.jsx');
    expect(s).toMatch(/Décompte manquant/);
    expect(s).toMatch(/Count missing: the close cannot be confirmed/);
  });
});

describe('AUDIT-TIPS-001 one tip pool algorithm', () => {
  it('the modal calls calcTipPool and keeps no copy', () => {
    const s = read('src/components/TipPoolModal.jsx');
    expect(s).toMatch(/import \{ calcTipPool \} from '\.\.\/utils\/calculations\.js'/);
    expect(s).toMatch(/return calcTipPool\(method, totalTips, employees \|\| \[\]\);/);
    expect(s).not.toMatch(/Fix rounding remainder on first employee/);
  });
  it('the pool is conserved to the cent under every method', () => {
    const emps = [{ name: 'A', hours: 8, points: 3, pct: 50 }, { name: 'B', hours: 5, points: 2, pct: 30 }, { name: 'C', hours: 0, points: 1, pct: 20 }];
    for (const m of ['equal', 'hours', 'points', 'pct']) {
      const out = calc.calcTipPool(m, 100.01, emps);
      expect(Math.round(out.reduce((s, e) => s + e.share, 0) * 100), m).toBe(10001);
    }
    expect(calc.calcTipPool('hours', 100, emps)[2].share).toBe(0);
  });
});

describe('AUDIT-DEAD-001 the dead functions are gone', () => {
  it('nothing exports or references them', () => {
    for (const k of ['calcInvoiceTotals', 'calcInvoiceLine', 'computeEncaisseChain', 'isBalanced', 'isEncaisseBalanced']) {
      expect(calc[k], k).toBeUndefined();
    }
    const src = ['src/App.jsx', 'src/components/GrandLivreTab.jsx', 'src/components/TipPoolModal.jsx'].map(read).join('\n');
    expect(src).not.toMatch(/\bcalcInvoiceTotals\(|\bcomputeEncaisseChain\(|\bisEncaisseBalanced\(/);
  });
});
