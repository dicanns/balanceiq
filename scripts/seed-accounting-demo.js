#!/usr/bin/env node
/**
 * Accounting Demo Data Seeder — Sprint 8 Canary Substitute
 *
 * Populates a live BalanceIQ SQLite database with 3 months of realistic
 * restaurant accounting data (Jan–Mar 2026), then:
 *   - Closes Jan + Feb periods
 *   - Produces a final POSTED balance sheet as of 2026-03-31
 *   - Saves a completed Q1 TPS/TVQ tax period
 *
 * Usage:
 *   node scripts/seed-accounting-demo.js [--db /path/to/balanceiq.db]
 *
 * Default DB path: ~/Library/Application Support/BalanceIQ/balanceiq.db
 */

'use strict';

const path = require('path');
const os   = require('os');
const fs   = require('fs');
const Database = require('better-sqlite3');

// ── Resolve DB path ───────────────────────────────────────────────────────────

function resolveDbPath() {
  const argIdx = process.argv.indexOf('--db');
  if (argIdx >= 0 && process.argv[argIdx + 1]) return process.argv[argIdx + 1];
  return path.join(os.homedir(), 'Library', 'Application Support', 'BalanceIQ', 'balanceiq.db');
}

const DB_PATH = resolveDbPath();

if (!fs.existsSync(DB_PATH)) {
  console.error(`\n❌  Database not found at: ${DB_PATH}`);
  console.error('    Start BalanceIQ at least once so the DB is created, then re-run this script.\n');
  process.exit(1);
}

console.log(`\n📊  BalanceIQ Accounting Demo Seeder`);
console.log(`    DB: ${DB_PATH}\n`);

const db = new Database(DB_PATH);
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

// ── Helpers ───────────────────────────────────────────────────────────────────

function coaByNumber(num) {
  const row = db.prepare(`SELECT id FROM chart_of_accounts WHERE account_number = ?`).get(String(num));
  if (!row) throw new Error(`COA account ${num} not found`);
  return row.id;
}

function toISO(d) { return d instanceof Date ? d.toISOString().slice(0,10) : d; }

function ensurePeriod(startDate, endDate) {
  const year = new Date(startDate).getUTCFullYear();
  let row = db.prepare(
    `SELECT id FROM accounting_periods WHERE period_type='month' AND start_date=? AND end_date=?`
  ).get(startDate, endDate);
  if (row) return row.id;
  const info = db.prepare(
    `INSERT INTO accounting_periods (period_type, fiscal_year, start_date, end_date, status)
     VALUES ('month', ?, ?, ?, 'open')`
  ).run(year, startDate, endDate);
  return info.lastInsertRowid;
}

let _entrySeq = db.prepare(`SELECT COALESCE(MAX(id),0) AS m FROM journal_entries`).get().m;
function nextSeq() { return ++_entrySeq; }

function postEntry({ entry_date, description, source_type = 'manual', lines }) {
  const year = parseInt(entry_date.slice(0, 4), 10);
  const month = entry_date.slice(0, 7); // YYYY-MM
  const startDate = `${month}-01`;
  const [y, m] = month.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate(); // new Date(2026, 2, 0) = Feb 28 2026
  const endDate = `${month}-${String(lastDay).padStart(2, '0')}`;
  const periodId  = ensurePeriod(startDate, endDate);
  const entryNum  = nextSeq();

  const totalDebit  = lines.reduce((s, l) => s + (l.debit_cents  || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (l.credit_cents || 0), 0);
  if (totalDebit !== totalCredit) {
    throw new Error(`Entry not balanced on ${entry_date}: D=${totalDebit} C=${totalCredit} — ${description}`);
  }

  return db.transaction(() => {
    // Insert as 'draft' so the balance trigger doesn't fire on each line insert
    const { lastInsertRowid: entryId } = db.prepare(
      `INSERT INTO journal_entries (entry_number, entry_date, period_id, description, source_type, status, device_uuid)
       VALUES (?, ?, ?, ?, ?, 'draft', 'seed-demo')`
    ).run(entryNum, entry_date, periodId, description, source_type);

    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      db.prepare(
        `INSERT INTO journal_lines (entry_id, line_number, account_id, debit_cents, credit_cents, memo, tax_code)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(entryId, i + 1, l.account_id, l.debit_cents || 0, l.credit_cents || 0, l.memo || null, l.tax_code || null);
    }
    // Flip to posted now that all lines are in (trigger won't re-fire on UPDATE)
    db.prepare(`UPDATE journal_entries SET status='posted' WHERE id=?`).run(entryId);
    return entryId;
  })();
}

function closePeriod(startDate, endDate) {
  const period = db.prepare(
    `SELECT id, status FROM accounting_periods WHERE period_type='month' AND start_date=? AND end_date=?`
  ).get(startDate, endDate);
  if (!period) { console.log(`  ⚠️  Period ${startDate}→${endDate} not found, skipping close`); return; }
  if (period.status === 'closed') { console.log(`  ℹ️  Period ${startDate} already closed`); return; }
  db.prepare(`UPDATE accounting_periods SET status='closed', closed_at=? WHERE id=?`).run(new Date().toISOString(), period.id);
  console.log(`  ✅ Closed period ${startDate}`);
}

// ── Guard against double-seeding ──────────────────────────────────────────────

const existingDemo = db.prepare(
  `SELECT COUNT(*) AS n FROM journal_entries WHERE source_type='demo'`
).get().n;
if (existingDemo > 0) {
  console.log(`⚠️  Found ${existingDemo} existing demo entries. Re-run will add duplicates.`);
  console.log('    Delete demo entries first or use a fresh DB. Proceeding anyway...\n');
}

// ── Chart of Accounts — resolve IDs ──────────────────────────────────────────

const A = {
  cash_ops:      coaByNumber('1010'), // Encaisse (banque opération)
  ar:            coaByNumber('1100'), // Comptes clients
  inventory:     coaByNumber('1200'), // Stock de marchandises
  prepaid:       coaByNumber('1300'), // Frais payés d'avance
  tps_recv:      coaByNumber('1400'), // TPS à recevoir (CTI)
  tvq_recv:      coaByNumber('1410'), // TVQ à recevoir (RTI)
  equip:         coaByNumber('1500'), // Équipement de cuisine
  ap:            coaByNumber('2010'), // Comptes fournisseurs
  tps_pay:       coaByNumber('2100'), // TPS à payer
  tvq_pay:       coaByNumber('2110'), // TVQ à payer
  payroll_with:  coaByNumber('2120'), // Retenues à la source
  equity_cap:    coaByNumber('3000'), // Capital-actions
  retained:      coaByNumber('3100'), // Bénéfices non répartis
  sales_meals:   coaByNumber('4000'), // Ventes - repas
  sales_bev:     coaByNumber('4010'), // Ventes - boissons
  sales_deliv:   coaByNumber('4020'), // Ventes - livraisons (brut)
  cogs_food:     coaByNumber('5000'), // Achats - nourriture
  cogs_bev:      coaByNumber('5010'), // Achats - boissons
  cogs_pkg:      coaByNumber('5030'), // Emballages et fournitures
  cogs_deliv:    coaByNumber('5040'), // Commissions - livraisons
  wages_prod:    coaByNumber('6000'), // Salaires et avantages (production)
  wages_admin:   coaByNumber('6010'), // Salaires et avantages (administration)
  rent:          coaByNumber('6100'), // Loyer
  hydro:         coaByNumber('6110'), // Hydro-Québec
  telecom:       coaByNumber('6130'), // Télécommunications
  internet:      coaByNumber('6140'), // Internet
  maint:         coaByNumber('6200'), // Entretien et réparations - équipement
  marketing:     coaByNumber('6300'), // Publicité et marketing
  bank_chg:      coaByNumber('6400'), // Frais bancaires
  cc_fees:       coaByNumber('6410'), // Frais de cartes de crédit (merchant)
  insurance:     coaByNumber('6500'), // Assurances
  permits:       coaByNumber('6510'), // Permis et licences
  pro_fees:      coaByNumber('6520'), // Honoraires professionnels
  it_sw:         coaByNumber('6530'), // Frais informatiques et logiciels
  supplies:      coaByNumber('6610'), // Fournitures d'exploitation
  depreciation:  coaByNumber('6700'), // Amortissement
  misc:          coaByNumber('6900'), // Divers
};

console.log('✅ COA accounts resolved\n');

// ── Opening Balance (Dec 31 2025) ─────────────────────────────────────────────

console.log('📌 Posting opening balances (Dec 31 2025)...');

postEntry({
  entry_date: '2025-12-31',
  description: 'Soldes d\'ouverture — 1er janvier 2026',
  source_type: 'opening_balance',
  lines: [
    { account_id: A.cash_ops,   debit_cents: 4250000 },  // $42,500 bank
    { account_id: A.ar,         debit_cents:  380000 },  // $3,800 AR
    { account_id: A.inventory,  debit_cents:  650000 },  // $6,500 inventory
    { account_id: A.prepaid,    debit_cents:  180000 },  // $1,800 prepaid insurance
    { account_id: A.equip,      debit_cents: 8500000 },  // $85,000 equipment
    { account_id: A.ap,         credit_cents: 920000 },  // $9,200 AP
    { account_id: A.tps_pay,    credit_cents: 140000 },  // $1,400 TPS payable
    { account_id: A.tvq_pay,    credit_cents: 278850 },  // $2,788.50 TVQ payable
    { account_id: A.equity_cap, credit_cents: 5000000 }, // $50,000 share capital
    { account_id: A.retained,   credit_cents: 7621150 }, // $76,211.50 retained
  ],
});

// ── January 2026 ─────────────────────────────────────────────────────────────

console.log('📅 January 2026...');

// Revenue — 3 weeks posted (sales posted weekly, collect TPS/TVQ)
const janRevWeeks = [
  { d: '2026-01-07', meals: 1842000, bev: 289000, deliv: 312000 },
  { d: '2026-01-14', meals: 1956000, bev: 301000, deliv: 287000 },
  { d: '2026-01-21', meals: 1788000, bev: 275000, deliv: 295000 },
  { d: '2026-01-28', meals: 1920000, bev: 310000, deliv: 308000 },
];
for (const w of janRevWeeks) {
  const totalRev = w.meals + w.bev + w.deliv;
  const tps = Math.round(totalRev * 0.05);
  const tvq = Math.round(totalRev * 0.09975);
  postEntry({
    entry_date: w.d, description: `Ventes semaine du ${w.d}`, source_type: 'demo',
    lines: [
      { account_id: A.cash_ops,   debit_cents: totalRev + tps + tvq },
      { account_id: A.sales_meals, credit_cents: w.meals },
      { account_id: A.sales_bev,  credit_cents: w.bev },
      { account_id: A.sales_deliv, credit_cents: w.deliv },
      { account_id: A.tps_pay,    credit_cents: tps },
      { account_id: A.tvq_pay,    credit_cents: tvq },
    ],
  });
}

// COGS — food purchases mid-month
postEntry({
  entry_date: '2026-01-15', description: 'Achats nourriture — janvier (fournisseur Metro)', source_type: 'demo',
  lines: [
    { account_id: A.cogs_food, debit_cents: 2280000, tax_code: 'both' },
    { account_id: A.tps_recv,  debit_cents: Math.round(2280000 * 0.05), tax_code: 'tps' },
    { account_id: A.tvq_recv,  debit_cents: Math.round(2280000 * 0.09975), tax_code: 'tvq' },
    { account_id: A.ap,        credit_cents: 2280000 + Math.round(2280000 * 0.05) + Math.round(2280000 * 0.09975) },
  ],
});
postEntry({
  entry_date: '2026-01-15', description: 'Achats boissons — janvier (fournisseur Sysco)', source_type: 'demo',
  lines: [
    { account_id: A.cogs_bev,  debit_cents: 480000, tax_code: 'both' },
    { account_id: A.tps_recv,  debit_cents: Math.round(480000 * 0.05), tax_code: 'tps' },
    { account_id: A.tvq_recv,  debit_cents: Math.round(480000 * 0.09975), tax_code: 'tvq' },
    { account_id: A.ap,        credit_cents: 480000 + Math.round(480000 * 0.05) + Math.round(480000 * 0.09975) },
  ],
});
// Packaging
postEntry({
  entry_date: '2026-01-20', description: 'Emballages — janvier', source_type: 'demo',
  lines: [
    { account_id: A.cogs_pkg,  debit_cents: 185000, tax_code: 'both' },
    { account_id: A.tps_recv,  debit_cents: Math.round(185000 * 0.05) },
    { account_id: A.tvq_recv,  debit_cents: Math.round(185000 * 0.09975) },
    { account_id: A.ap,        credit_cents: 185000 + Math.round(185000 * 0.05) + Math.round(185000 * 0.09975) },
  ],
});
// Delivery commissions (Uber/DoorDash — no TPS/TVQ on commission)
postEntry({
  entry_date: '2026-01-31', description: 'Commissions livraisons — janvier (DoorDash + Uber Eats)', source_type: 'demo',
  lines: [
    { account_id: A.cogs_deliv, debit_cents: 278000 },
    { account_id: A.cash_ops,   credit_cents: 278000 },
  ],
});

// Payroll — twice monthly
for (const d of ['2026-01-15', '2026-01-31']) {
  postEntry({
    entry_date: d, description: `Paie — ${d}`, source_type: 'demo',
    lines: [
      { account_id: A.wages_prod,  debit_cents: 1840000 },
      { account_id: A.wages_admin, debit_cents:  580000 },
      { account_id: A.payroll_with, credit_cents: 612000 }, // DAS
      { account_id: A.cash_ops,    credit_cents: 1808000 }, // net
    ],
  });
}

// Expenses
postEntry({
  entry_date: '2026-01-01', description: 'Loyer — janvier 2026', source_type: 'demo',
  lines: [
    { account_id: A.rent,     debit_cents: 450000 },
    { account_id: A.tps_recv, debit_cents: Math.round(450000 * 0.05) },
    { account_id: A.tvq_recv, debit_cents: Math.round(450000 * 0.09975) },
    { account_id: A.ap,       credit_cents: 450000 + Math.round(450000 * 0.05) + Math.round(450000 * 0.09975) },
  ],
});
postEntry({
  entry_date: '2026-01-10', description: 'Hydro-Québec — janvier', source_type: 'demo',
  lines: [
    { account_id: A.hydro,    debit_cents: 68000 },
    { account_id: A.tps_recv, debit_cents: Math.round(68000 * 0.05) },
    { account_id: A.tvq_recv, debit_cents: Math.round(68000 * 0.09975) },
    { account_id: A.cash_ops, credit_cents: 68000 + Math.round(68000 * 0.05) + Math.round(68000 * 0.09975) },
  ],
});
postEntry({
  entry_date: '2026-01-10', description: 'Télécommunications — janvier', source_type: 'demo',
  lines: [
    { account_id: A.telecom,  debit_cents: 18500 },
    { account_id: A.tps_recv, debit_cents: Math.round(18500 * 0.05) },
    { account_id: A.tvq_recv, debit_cents: Math.round(18500 * 0.09975) },
    { account_id: A.cash_ops, credit_cents: 18500 + Math.round(18500 * 0.05) + Math.round(18500 * 0.09975) },
  ],
});
postEntry({
  entry_date: '2026-01-31', description: 'Frais bancaires + merchant fees — janvier', source_type: 'demo',
  lines: [
    { account_id: A.bank_chg, debit_cents: 3200 },
    { account_id: A.cc_fees,  debit_cents: 48000 },
    { account_id: A.cash_ops, credit_cents: 51200 },
  ],
});
postEntry({
  entry_date: '2026-01-31', description: 'Assurances (portion mensuelle) — janvier', source_type: 'demo',
  lines: [
    { account_id: A.insurance, debit_cents: 28000 },
    { account_id: A.prepaid,   credit_cents: 28000 },
  ],
});
// Pay AP from January purchases
postEntry({
  entry_date: '2026-01-25', description: 'Paiement fournisseurs — janvier', source_type: 'demo',
  lines: [
    { account_id: A.ap,       debit_cents: 3100000 },
    { account_id: A.cash_ops, credit_cents: 3100000 },
  ],
});
// Depreciation on equipment (straight-line $85,000 / 10yr / 12mo)
postEntry({
  entry_date: '2026-01-31', description: 'Amortissement équipement — janvier', source_type: 'demo',
  lines: [
    { account_id: A.depreciation, debit_cents: 70833 },
    { account_id: A.equip,        credit_cents: 70833 },
  ],
});

closePeriod('2025-12-01', '2025-12-31');
closePeriod('2026-01-01', '2026-01-31');

// ── February 2026 ─────────────────────────────────────────────────────────────

console.log('📅 February 2026...');

const febRevWeeks = [
  { d: '2026-02-04', meals: 1780000, bev: 268000, deliv: 298000 },
  { d: '2026-02-11', meals: 1850000, bev: 282000, deliv: 315000 },
  { d: '2026-02-18', meals: 2150000, bev: 340000, deliv: 380000 }, // Valentine's week
  { d: '2026-02-25', meals: 1920000, bev: 295000, deliv: 302000 },
];
for (const w of febRevWeeks) {
  const totalRev = w.meals + w.bev + w.deliv;
  const tps = Math.round(totalRev * 0.05);
  const tvq = Math.round(totalRev * 0.09975);
  postEntry({
    entry_date: w.d, description: `Ventes semaine du ${w.d}`, source_type: 'demo',
    lines: [
      { account_id: A.cash_ops,    debit_cents: totalRev + tps + tvq },
      { account_id: A.sales_meals, credit_cents: w.meals },
      { account_id: A.sales_bev,   credit_cents: w.bev },
      { account_id: A.sales_deliv, credit_cents: w.deliv },
      { account_id: A.tps_pay,     credit_cents: tps },
      { account_id: A.tvq_pay,     credit_cents: tvq },
    ],
  });
}
postEntry({
  entry_date: '2026-02-14', description: 'Achats nourriture — février (Metro + Sysco)', source_type: 'demo',
  lines: [
    { account_id: A.cogs_food, debit_cents: 2420000, tax_code: 'both' },
    { account_id: A.tps_recv,  debit_cents: Math.round(2420000 * 0.05) },
    { account_id: A.tvq_recv,  debit_cents: Math.round(2420000 * 0.09975) },
    { account_id: A.ap,        credit_cents: 2420000 + Math.round(2420000 * 0.05) + Math.round(2420000 * 0.09975) },
  ],
});
postEntry({
  entry_date: '2026-02-28', description: 'Commissions livraisons — février', source_type: 'demo',
  lines: [
    { account_id: A.cogs_deliv, debit_cents: 294000 },
    { account_id: A.cash_ops,   credit_cents: 294000 },
  ],
});
for (const d of ['2026-02-15', '2026-02-28']) {
  postEntry({
    entry_date: d, description: `Paie — ${d}`, source_type: 'demo',
    lines: [
      { account_id: A.wages_prod,   debit_cents: 1840000 },
      { account_id: A.wages_admin,  debit_cents:  580000 },
      { account_id: A.payroll_with, credit_cents: 612000 },
      { account_id: A.cash_ops,     credit_cents: 1808000 },
    ],
  });
}
postEntry({
  entry_date: '2026-02-01', description: 'Loyer — février 2026', source_type: 'demo',
  lines: [
    { account_id: A.rent,     debit_cents: 450000 },
    { account_id: A.tps_recv, debit_cents: Math.round(450000 * 0.05) },
    { account_id: A.tvq_recv, debit_cents: Math.round(450000 * 0.09975) },
    { account_id: A.ap,       credit_cents: 450000 + Math.round(450000 * 0.05) + Math.round(450000 * 0.09975) },
  ],
});
postEntry({
  entry_date: '2026-02-10', description: 'Hydro-Québec — février', source_type: 'demo',
  lines: [
    { account_id: A.hydro,    debit_cents: 72000 },
    { account_id: A.tps_recv, debit_cents: Math.round(72000 * 0.05) },
    { account_id: A.tvq_recv, debit_cents: Math.round(72000 * 0.09975) },
    { account_id: A.cash_ops, credit_cents: 72000 + Math.round(72000 * 0.05) + Math.round(72000 * 0.09975) },
  ],
});
postEntry({
  entry_date: '2026-02-14', description: 'Marketing Saint-Valentin', source_type: 'demo',
  lines: [
    { account_id: A.marketing, debit_cents: 48000 },
    { account_id: A.tps_recv,  debit_cents: Math.round(48000 * 0.05) },
    { account_id: A.tvq_recv,  debit_cents: Math.round(48000 * 0.09975) },
    { account_id: A.cash_ops,  credit_cents: 48000 + Math.round(48000 * 0.05) + Math.round(48000 * 0.09975) },
  ],
});
postEntry({
  entry_date: '2026-02-28', description: 'Frais bancaires + merchant fees — février', source_type: 'demo',
  lines: [
    { account_id: A.bank_chg, debit_cents: 3200 },
    { account_id: A.cc_fees,  debit_cents: 51000 },
    { account_id: A.cash_ops, credit_cents: 54200 },
  ],
});
postEntry({
  entry_date: '2026-02-28', description: 'Assurances (portion mensuelle) — février', source_type: 'demo',
  lines: [
    { account_id: A.insurance, debit_cents: 28000 },
    { account_id: A.prepaid,   credit_cents: 28000 },
  ],
});
postEntry({
  entry_date: '2026-02-28', description: 'Amortissement équipement — février', source_type: 'demo',
  lines: [
    { account_id: A.depreciation, debit_cents: 70833 },
    { account_id: A.equip,        credit_cents: 70833 },
  ],
});
postEntry({
  entry_date: '2026-02-25', description: 'Paiement fournisseurs — février', source_type: 'demo',
  lines: [
    { account_id: A.ap,       debit_cents: 3200000 },
    { account_id: A.cash_ops, credit_cents: 3200000 },
  ],
});
// Equipment repair
postEntry({
  entry_date: '2026-02-20', description: 'Réparation four à convection — facture TechCuisine', source_type: 'demo',
  lines: [
    { account_id: A.maint,    debit_cents: 148000 },
    { account_id: A.tps_recv, debit_cents: Math.round(148000 * 0.05) },
    { account_id: A.tvq_recv, debit_cents: Math.round(148000 * 0.09975) },
    { account_id: A.cash_ops, credit_cents: 148000 + Math.round(148000 * 0.05) + Math.round(148000 * 0.09975) },
  ],
});

closePeriod('2026-02-01', '2026-02-28');

// ── March 2026 ───────────────────────────────────────────────────────────────

console.log('📅 March 2026...');

const marRevWeeks = [
  { d: '2026-03-04', meals: 1910000, bev: 293000, deliv: 308000 },
  { d: '2026-03-11', meals: 1875000, bev: 278000, deliv: 295000 },
  { d: '2026-03-18', meals: 1980000, bev: 302000, deliv: 318000 },
  { d: '2026-03-25', meals: 2050000, bev: 325000, deliv: 335000 },
  { d: '2026-03-31', meals:  820000, bev: 130000, deliv: 125000 }, // partial last week
];
for (const w of marRevWeeks) {
  const totalRev = w.meals + w.bev + w.deliv;
  const tps = Math.round(totalRev * 0.05);
  const tvq = Math.round(totalRev * 0.09975);
  postEntry({
    entry_date: w.d, description: `Ventes semaine du ${w.d}`, source_type: 'demo',
    lines: [
      { account_id: A.cash_ops,    debit_cents: totalRev + tps + tvq },
      { account_id: A.sales_meals, credit_cents: w.meals },
      { account_id: A.sales_bev,   credit_cents: w.bev },
      { account_id: A.sales_deliv, credit_cents: w.deliv },
      { account_id: A.tps_pay,     credit_cents: tps },
      { account_id: A.tvq_pay,     credit_cents: tvq },
    ],
  });
}
postEntry({
  entry_date: '2026-03-15', description: 'Achats nourriture — mars (Metro + Sysco)', source_type: 'demo',
  lines: [
    { account_id: A.cogs_food, debit_cents: 2510000, tax_code: 'both' },
    { account_id: A.tps_recv,  debit_cents: Math.round(2510000 * 0.05) },
    { account_id: A.tvq_recv,  debit_cents: Math.round(2510000 * 0.09975) },
    { account_id: A.ap,        credit_cents: 2510000 + Math.round(2510000 * 0.05) + Math.round(2510000 * 0.09975) },
  ],
});
postEntry({
  entry_date: '2026-03-15', description: 'Achats boissons — mars', source_type: 'demo',
  lines: [
    { account_id: A.cogs_bev,  debit_cents: 520000, tax_code: 'both' },
    { account_id: A.tps_recv,  debit_cents: Math.round(520000 * 0.05) },
    { account_id: A.tvq_recv,  debit_cents: Math.round(520000 * 0.09975) },
    { account_id: A.ap,        credit_cents: 520000 + Math.round(520000 * 0.05) + Math.round(520000 * 0.09975) },
  ],
});
postEntry({
  entry_date: '2026-03-31', description: 'Commissions livraisons — mars', source_type: 'demo',
  lines: [
    { account_id: A.cogs_deliv, debit_cents: 305000 },
    { account_id: A.cash_ops,   credit_cents: 305000 },
  ],
});
for (const d of ['2026-03-15', '2026-03-31']) {
  postEntry({
    entry_date: d, description: `Paie — ${d}`, source_type: 'demo',
    lines: [
      { account_id: A.wages_prod,   debit_cents: 1840000 },
      { account_id: A.wages_admin,  debit_cents:  580000 },
      { account_id: A.payroll_with, credit_cents: 612000 },
      { account_id: A.cash_ops,     credit_cents: 1808000 },
    ],
  });
}
postEntry({
  entry_date: '2026-03-01', description: 'Loyer — mars 2026', source_type: 'demo',
  lines: [
    { account_id: A.rent,     debit_cents: 450000 },
    { account_id: A.tps_recv, debit_cents: Math.round(450000 * 0.05) },
    { account_id: A.tvq_recv, debit_cents: Math.round(450000 * 0.09975) },
    { account_id: A.ap,       credit_cents: 450000 + Math.round(450000 * 0.05) + Math.round(450000 * 0.09975) },
  ],
});
postEntry({
  entry_date: '2026-03-10', description: 'Hydro-Québec — mars', source_type: 'demo',
  lines: [
    { account_id: A.hydro,    debit_cents: 65000 },
    { account_id: A.tps_recv, debit_cents: Math.round(65000 * 0.05) },
    { account_id: A.tvq_recv, debit_cents: Math.round(65000 * 0.09975) },
    { account_id: A.cash_ops, credit_cents: 65000 + Math.round(65000 * 0.05) + Math.round(65000 * 0.09975) },
  ],
});
postEntry({
  entry_date: '2026-03-10', description: 'Télécommunications — mars', source_type: 'demo',
  lines: [
    { account_id: A.telecom,  debit_cents: 18500 },
    { account_id: A.tps_recv, debit_cents: Math.round(18500 * 0.05) },
    { account_id: A.tvq_recv, debit_cents: Math.round(18500 * 0.09975) },
    { account_id: A.cash_ops, credit_cents: 18500 + Math.round(18500 * 0.05) + Math.round(18500 * 0.09975) },
  ],
});
postEntry({
  entry_date: '2026-03-31', description: 'Frais bancaires + merchant fees — mars', source_type: 'demo',
  lines: [
    { account_id: A.bank_chg, debit_cents: 3200 },
    { account_id: A.cc_fees,  debit_cents: 53000 },
    { account_id: A.cash_ops, credit_cents: 56200 },
  ],
});
postEntry({
  entry_date: '2026-03-31', description: 'Assurances (portion mensuelle) — mars', source_type: 'demo',
  lines: [
    { account_id: A.insurance, debit_cents: 28000 },
    { account_id: A.prepaid,   credit_cents: 28000 },
  ],
});
postEntry({
  entry_date: '2026-03-31', description: 'Amortissement équipement — mars', source_type: 'demo',
  lines: [
    { account_id: A.depreciation, debit_cents: 70833 },
    { account_id: A.equip,        credit_cents: 70833 },
  ],
});
// Pro fees (accountant — quarterly)
postEntry({
  entry_date: '2026-03-31', description: 'Honoraires comptable — Q1 2026', source_type: 'demo',
  lines: [
    { account_id: A.pro_fees,  debit_cents: 120000 },
    { account_id: A.tps_recv,  debit_cents: Math.round(120000 * 0.05) },
    { account_id: A.tvq_recv,  debit_cents: Math.round(120000 * 0.09975) },
    { account_id: A.cash_ops,  credit_cents: 120000 + Math.round(120000 * 0.05) + Math.round(120000 * 0.09975) },
  ],
});
// BalanceIQ licence
postEntry({
  entry_date: '2026-03-31', description: 'Logiciel BalanceIQ — abonnement Q1', source_type: 'demo',
  lines: [
    { account_id: A.it_sw,    debit_cents: 4200 },
    { account_id: A.tps_recv, debit_cents: Math.round(4200 * 0.05) },
    { account_id: A.tvq_recv, debit_cents: Math.round(4200 * 0.09975) },
    { account_id: A.cash_ops, credit_cents: 4200 + Math.round(4200 * 0.05) + Math.round(4200 * 0.09975) },
  ],
});
postEntry({
  entry_date: '2026-03-28', description: 'Paiement fournisseurs — mars', source_type: 'demo',
  lines: [
    { account_id: A.ap,       debit_cents: 3400000 },
    { account_id: A.cash_ops, credit_cents: 3400000 },
  ],
});
// Inventory count adjustment
postEntry({
  entry_date: '2026-03-31', description: 'Ajustement inventaire physique — fin mars', source_type: 'demo',
  lines: [
    { account_id: A.cogs_food, debit_cents: 42000 },
    { account_id: A.inventory, credit_cents: 42000 },
  ],
});

// March period stays open (current period)
console.log('  ℹ️  March period left open (current period)');

// ── Supplier Bills (AP tracking demo) ────────────────────────────────────────

console.log('\n🧾 Creating supplier bills...');

const bills = [
  { month_key:'2026-01', supplier_name:'Metro Richelieu inc.', category:'food', amount:241356, bill_date:'2026-01-15', amount_before_tax:228000, tps_paid:11400, tvq_paid:22743, invoice_number:'MR-2026-0115', due_date:'2026-02-14' },
  { month_key:'2026-01', supplier_name:'Sysco Montréal', category:'beverages', amount:50776, bill_date:'2026-01-15', amount_before_tax:48000, tps_paid:2400, tvq_paid:4788, invoice_number:'SYS-011501', due_date:'2026-02-14' },
  { month_key:'2026-01', supplier_name:'Emballages Premier', category:'supplies', amount:19570, bill_date:'2026-01-20', amount_before_tax:18500, tps_paid:925, tvq_paid:1846, invoice_number:'EP-0120', due_date:'2026-02-19' },
  { month_key:'2026-02', supplier_name:'Metro Richelieu inc.', category:'food', amount:256184, bill_date:'2026-02-14', amount_before_tax:242000, tps_paid:12100, tvq_paid:24139, invoice_number:'MR-2026-0214', due_date:'2026-03-15' },
  { month_key:'2026-02', supplier_name:'TechCuisine Services', category:'repairs', amount:156561, bill_date:'2026-02-20', amount_before_tax:148000, tps_paid:7400, tvq_paid:14762, invoice_number:'TC-2026-005', due_date:'2026-03-20' },
  { month_key:'2026-03', supplier_name:'Metro Richelieu inc.', category:'food', amount:265559, bill_date:'2026-03-15', amount_before_tax:251000, tps_paid:12550, tvq_paid:25037, invoice_number:'MR-2026-0315', due_date:'2026-04-14' },
  { month_key:'2026-03', supplier_name:'Sysco Montréal', category:'beverages', amount:55016, bill_date:'2026-03-15', amount_before_tax:52000, tps_paid:2600, tvq_paid:5187, invoice_number:'SYS-031501', due_date:'2026-04-14' },
  { month_key:'2026-03', supplier_name:'Fiducie Comptable Côté', category:'professional', amount:126966, bill_date:'2026-03-31', amount_before_tax:120000, tps_paid:6000, tvq_paid:11970, invoice_number:'FCC-Q1-2026', due_date:'2026-04-30' },
];

for (const b of bills) {
  const coaId = b.category === 'food' ? A.cogs_food
              : b.category === 'beverages' ? A.cogs_bev
              : b.category === 'repairs' ? A.maint
              : b.category === 'professional' ? A.pro_fees
              : A.supplies;
  db.prepare(
    `INSERT INTO supplier_bills (month_key, supplier_name, category, amount, bill_date, note, amount_before_tax, tps_paid, tvq_paid, coa_account_id, business_use_pct, invoice_number, due_date, paid)
     VALUES (?, ?, ?, ?, ?, '', ?, ?, ?, ?, 100, ?, ?, ?)`
  ).run(b.month_key, b.supplier_name, b.category, b.amount, b.bill_date, b.amount_before_tax, b.tps_paid, b.tvq_paid, coaId, b.invoice_number, b.due_date, b.due_date <= '2026-03-31' ? 1 : 0);
}

console.log(`  ✅ ${bills.length} supplier bills created`);

// ── Bank Account + Transactions ───────────────────────────────────────────────

console.log('\n🏦 Setting up bank account...');

let bankAccountId;
const existingBank = db.prepare(`SELECT id FROM bank_accounts WHERE name='Démonstration - BMO Exploitation' LIMIT 1`).get();
if (existingBank) {
  bankAccountId = existingBank.id;
  console.log('  ℹ️  Bank account already exists, reusing it');
} else {
  const ba = db.prepare(
    `INSERT INTO bank_accounts (name, account_type, coa_account_id, opening_balance, opening_date, currency)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run('Démonstration - BMO Exploitation', 'bank', A.cash_ops, 42500, '2025-12-31', 'CAD');
  bankAccountId = ba.lastInsertRowid;
  console.log('  ✅ Bank account created');
}

// Build a mini CSV statement for Q1 (machine-readable)
const bankRows = [
  // January
  { d:'2026-01-07', desc:'DEPOT VENTES SEMAINE',         amt: 27895.48 },
  { d:'2026-01-14', desc:'DEPOT VENTES SEMAINE',         amt: 29621.45 },
  { d:'2026-01-15', desc:'PAIE PROD 01-15',              amt:-18080.00 },
  { d:'2026-01-15', desc:'METRO RICHELIEU FACT 0115',    amt:-24135.60 },
  { d:'2026-01-15', desc:'SYSCO MONTREAL FACT 011501',   amt:-5077.60 },
  { d:'2026-01-20', desc:'EMBALLAGES PREMIER EP-0120',   amt:-1957.00 },
  { d:'2026-01-21', desc:'DEPOT VENTES SEMAINE',         amt: 27055.70 },
  { d:'2026-01-25', desc:'VIREMENT FOURNISSEURS',        amt:-31000.00 },
  { d:'2026-01-28', desc:'DEPOT VENTES SEMAINE',         amt: 29078.00 },
  { d:'2026-01-31', desc:'PAIE PROD 01-31',              amt:-18080.00 },
  { d:'2026-01-31', desc:'DOORDASH COMMISSIONS',         amt:-2780.00 },
  { d:'2026-01-31', desc:'FRAIS BANCAIRES + MERCHANT',   amt: -512.00 },
  { d:'2026-01-10', desc:'HYDRO QUEBEC JANVIER',         amt:-751.57 },
  // February
  { d:'2026-02-04', desc:'DEPOT VENTES SEMAINE',         amt: 27065.01 },
  { d:'2026-02-11', desc:'DEPOT VENTES SEMAINE',         amt: 28196.75 },
  { d:'2026-02-14', desc:'METRO RICHELIEU FACT 0214',    amt:-25618.40 },
  { d:'2026-02-14', desc:'MARKETING ST-VALENTIN',        amt:-538.14 },
  { d:'2026-02-15', desc:'PAIE PROD 02-15',              amt:-18080.00 },
  { d:'2026-02-18', desc:'DEPOT VENTES SEMAINE',         amt: 32856.25 },
  { d:'2026-02-20', desc:'TECHCUISINE REPARATION TC-005',amt:-15656.10 },
  { d:'2026-02-25', desc:'VIREMENT FOURNISSEURS',        amt:-32000.00 },
  { d:'2026-02-25', desc:'DEPOT VENTES SEMAINE',         amt: 29302.68 },
  { d:'2026-02-28', desc:'PAIE PROD 02-28',              amt:-18080.00 },
  { d:'2026-02-28', desc:'UBER EATS COMMISSIONS',        amt:-2940.00 },
  { d:'2026-02-28', desc:'FRAIS BANCAIRES + MERCHANT',   amt:-542.00 },
  { d:'2026-02-10', desc:'HYDRO QUEBEC FEVRIER',         amt:-793.86 },
  // March
  { d:'2026-03-04', desc:'DEPOT VENTES SEMAINE',         amt: 29210.56 },
  { d:'2026-03-11', desc:'DEPOT VENTES SEMAINE',         amt: 28606.57 },
  { d:'2026-03-15', desc:'METRO RICHELIEU FACT 0315',    amt:-26555.90 },
  { d:'2026-03-15', desc:'SYSCO MONTREAL FACT 031501',   amt:-5501.60 },
  { d:'2026-03-15', desc:'PAIE PROD 03-15',              amt:-18080.00 },
  { d:'2026-03-18', desc:'DEPOT VENTES SEMAINE',         amt: 30260.68 },
  { d:'2026-03-25', desc:'DEPOT VENTES SEMAINE',         amt: 31436.28 },
  { d:'2026-03-28', desc:'VIREMENT FOURNISSEURS',        amt:-34000.00 },
  { d:'2026-03-31', desc:'DEPOT VENTES SEMAINE',         amt: 12626.12 },
  { d:'2026-03-31', desc:'PAIE PROD 03-31',              amt:-18080.00 },
  { d:'2026-03-31', desc:'DOORDASH COMMISSIONS',         amt:-3050.00 },
  { d:'2026-03-31', desc:'FRAIS BANCAIRES + MERCHANT',   amt:-560.00 },
  { d:'2026-03-10', desc:'HYDRO QUEBEC MARS',            amt:-716.52 },
  { d:'2026-03-31', desc:'FIDUCIE COMPTABLE CCC Q1',     amt:-12696.60 },
  { d:'2026-03-31', desc:'BALANCEIQ ABONNEMENT Q1',      amt:-47.01 },
];

// Build CSV text
const csvHeader = 'Date,Description,Montant\n';
const csvBody = bankRows.map(r => `${r.d},"${r.desc}",${r.amt}`).join('\n');
const csvText = csvHeader + csvBody;

const stmtHash = require('crypto').createHash('sha256').update(csvText).digest('hex');
const existingStmt = db.prepare(`SELECT id FROM bank_statements WHERE source_file_hash=?`).get(stmtHash);

if (!existingStmt) {
  const { lastInsertRowid: stmtId } = db.prepare(
    `INSERT INTO bank_statements (bank_account_id, period_start, period_end, ending_balance, source_file_hash)
     VALUES (?, ?, ?, ?, ?)`
  ).run(bankAccountId, '2026-01-01', '2026-03-31', 0, stmtHash);

  for (const r of bankRows) {
    db.prepare(
      `INSERT INTO bank_transactions (bank_account_id, bank_statement_id, transaction_date, description, amount)
       VALUES (?, ?, ?, ?, ?)`
    ).run(bankAccountId, stmtId, r.d, r.desc, r.amt);
  }
  console.log(`  ✅ ${bankRows.length} bank transactions imported`);
} else {
  console.log('  ℹ️  Bank statement already imported, skipping');
}

// ── Q1 Tax Period ─────────────────────────────────────────────────────────────

console.log('\n🧮 Saving Q1 TPS/TVQ period...');

// Compute from posted entries
const tpsCollectedRow = db.prepare(
  `SELECT SUM(jl.credit_cents) AS tot FROM journal_lines jl
   JOIN journal_entries je ON je.id=jl.entry_id AND je.status='posted'
   WHERE jl.account_id=? AND je.entry_date BETWEEN '2026-01-01' AND '2026-03-31'`
).get(A.tps_pay);
const tvqCollectedRow = db.prepare(
  `SELECT SUM(jl.credit_cents) AS tot FROM journal_lines jl
   JOIN journal_entries je ON je.id=jl.entry_id AND je.status='posted'
   WHERE jl.account_id=? AND je.entry_date BETWEEN '2026-01-01' AND '2026-03-31'`
).get(A.tvq_pay);
const tpsCtiRow = db.prepare(
  `SELECT SUM(jl.debit_cents) AS tot FROM journal_lines jl
   JOIN journal_entries je ON je.id=jl.entry_id AND je.status='posted'
   WHERE jl.account_id=? AND je.entry_date BETWEEN '2026-01-01' AND '2026-03-31'`
).get(A.tps_recv);
const tvqRtiRow = db.prepare(
  `SELECT SUM(jl.debit_cents) AS tot FROM journal_lines jl
   JOIN journal_entries je ON je.id=jl.entry_id AND je.status='posted'
   WHERE jl.account_id=? AND je.entry_date BETWEEN '2026-01-01' AND '2026-03-31'`
).get(A.tvq_recv);

const tpsCollected = (tpsCollectedRow.tot || 0) / 100;
const tvqCollected = (tvqCollectedRow.tot || 0) / 100;
const tpsCti       = (tpsCtiRow.tot || 0) / 100;
const tvqRti       = (tvqRtiRow.tot || 0) / 100;
const netTps = tpsCollected - tpsCti;
const netTvq = tvqCollected - tvqRti;

console.log(`  TPS collectée: $${tpsCollected.toFixed(2)}  CTI: $${tpsCti.toFixed(2)}  → Net TPS: $${netTps.toFixed(2)}`);
console.log(`  TVQ collectée: $${tvqCollected.toFixed(2)}  RTI: $${tvqRti.toFixed(2)}  → Net TVQ: $${netTvq.toFixed(2)}`);

const existingTax = db.prepare(
  `SELECT id FROM tax_periods WHERE period_start='2026-01-01' AND period_end='2026-03-31'`
).get();
if (!existingTax) {
  db.prepare(
    `INSERT INTO tax_periods (period_type, period_start, period_end, tps_collected, tvq_collected, tps_cti, tvq_rti, net_tps_owed, net_tvq_owed, status, notes, filed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'filed', ?, ?)`
  ).run('quarterly','2026-01-01','2026-03-31', tpsCollected, tvqCollected, tpsCti, tvqRti, netTps, netTvq,
    'Période démo Q1 2026 — générée par le semeur de données', '2026-04-20T10:00:00.000Z');
  console.log('  ✅ Q1 TPS/TVQ period saved and marked FILED');
} else {
  console.log('  ℹ️  Q1 tax period already exists');
}

// ── Balance Sheet Snapshot ────────────────────────────────────────────────────

console.log('\n📋 Generating balance sheet snapshot as of 2026-03-31...');

// Pull posted balances by account type
const balRows = db.prepare(
  `SELECT coa.account_number, coa.name_fr, coa.type, coa.is_contra,
          SUM(jl.debit_cents) AS dr, SUM(jl.credit_cents) AS cr
   FROM journal_lines jl
   JOIN journal_entries je ON je.id=jl.entry_id AND je.status='posted' AND je.entry_date <= '2026-03-31'
   JOIN chart_of_accounts coa ON coa.id=jl.account_id
   GROUP BY jl.account_id
   ORDER BY coa.account_number`
).all();

let totalAssets = 0, totalLiab = 0, totalEquity = 0, netIncome = 0;
for (const r of balRows) {
  const bal = (r.dr - r.cr) / 100;
  if (r.type === 'asset')     totalAssets  += r.is_contra ? -bal : bal;
  if (r.type === 'liability') totalLiab    += r.is_contra ?  bal : -bal;
  if (r.type === 'equity')    totalEquity  += r.is_contra ?  bal : -bal;
  if (r.type === 'revenue')   netIncome    -= bal;  // revenue credit-normal → bal < 0, -=bal adds revenue
  if (r.type === 'expense' || r.type === 'cogs') netIncome -= bal; // expense debit-normal → bal > 0, -=bal subtracts expenses
}

console.log(`\n  ┌─ BALANCE SHEET AS OF 2026-03-31 (DEMO) ─────────────────┐`);
console.log(`  │  Total Actif:              $${totalAssets.toFixed(2).padStart(12)}            │`);
console.log(`  │  Total Passif:             $${totalLiab.toFixed(2).padStart(12)}            │`);
console.log(`  │  Total Capitaux propres:   $${totalEquity.toFixed(2).padStart(12)}            │`);
console.log(`  │  Résultat net Q1:          $${netIncome.toFixed(2).padStart(12)}            │`);
console.log(`  │  Passif + CP + RN:         $${(totalLiab + totalEquity + netIncome).toFixed(2).padStart(12)}            │`);
const balanced = Math.abs(totalAssets - (totalLiab + totalEquity + netIncome)) < 0.05;
console.log(`  │  ${balanced ? '✅ ÉQUILIBRÉ' : '❌ DÉSÉQUILIBRÉ — vérifiez les écritures'}`);
console.log(`  └──────────────────────────────────────────────────────────┘\n`);

// Save snapshot
const snapshotExists = db.prepare(
  `SELECT id FROM balance_sheet_snapshots WHERE snapshot_date='2026-03-31'`
).get();
if (!snapshotExists) {
  db.prepare(
    `INSERT INTO balance_sheet_snapshots (snapshot_date, fiscal_year, status, data, total_assets_cents, total_liabilities_cents, total_equity_cents)
     VALUES (?, ?, 'final', ?, ?, ?, ?)`
  ).run('2026-03-31', 2026,
    JSON.stringify({ generated: new Date().toISOString(), type: 'demo', rows: balRows.length, net_income_cents: Math.round(netIncome * 100) }),
    Math.round(totalAssets * 100), Math.round(totalLiab * 100), Math.round((totalEquity + netIncome) * 100));
  console.log('  ✅ Balance sheet snapshot saved');
}

// ── Summary ───────────────────────────────────────────────────────────────────

const entryCount  = db.prepare(`SELECT COUNT(*) AS n FROM journal_entries WHERE source_type='demo'`).get().n;
const lineCount   = db.prepare(
  `SELECT COUNT(*) AS n FROM journal_lines jl JOIN journal_entries je ON je.id=jl.entry_id WHERE je.source_type='demo'`
).get().n;

console.log('────────────────────────────────────────────────────────────');
console.log(`✅  Demo data seeding complete!`);
console.log(`    Journal entries:  ${entryCount}`);
console.log(`    Journal lines:    ${lineCount}`);
console.log(`    Supplier bills:   ${bills.length}`);
console.log(`    Bank txns:        ${bankRows.length}`);
console.log(`    Periods closed:   Jan 2026, Feb 2026`);
console.log(`    Period open:      Mar 2026`);
console.log(`    Tax period:       Q1 2026 (TPS/TVQ) — FILED`);
console.log(`    Balance sheet:    2026-03-31 snapshot saved`);
console.log('────────────────────────────────────────────────────────────\n');
console.log('    Open BalanceIQ → Grand Livre → Bilan to verify.');
console.log('    Navigate to Rapports → TPS/TVQ to see the Q1 period.\n');

db.close();
