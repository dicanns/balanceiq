/**
 * MONEY-001  the set of REAL columns in the schema is the known one; new money is INTEGER cents
 *
 * Thirty-two columns hold money as integer cents; a set of older tables hold
 * it as REAL, and every boundary between the two has to remember which world it
 * is in (the v1.70.1 tax-account bug was that class of mistake). No new REAL
 * column may appear without being added here on purpose.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../../..');
const SRC = fs.readFileSync(path.join(ROOT, 'src/db/database.js'), 'utf8')
  + '\n' + fs.readFileSync(path.join(ROOT, 'src/db/migrations.js'), 'utf8');

function realColumns(src) {
  const out = new Set();
  // Each table body ends at the first line that starts with a closing paren;
  // several CREATEs can share one exec() block, so the .run() is no boundary.
  for (const m of src.matchAll(/CREATE TABLE IF NOT EXISTS (\w+) \(([\s\S]*?)\n\s*\)/g)) {
    for (const line of m[2].split('\n')) {
      const c = line.trim().match(/^(\w+) REAL\b/);
      if (c) out.add(`${m[1]}.${c[1]}`);
    }
  }
  for (const m of src.matchAll(/ALTER TABLE (\w+) ADD COLUMN (\w+) REAL\b/g)) out.add(`${m[1]}.${m[2]}`);
  return [...out].sort();
}

const KNOWN = new Set([
  'asset_depreciation_log.additions','asset_depreciation_log.cca_claimed','asset_depreciation_log.disposals','asset_depreciation_log.ucc_closing','asset_depreciation_log.ucc_opening',
  'assets.acquisition_cost','assets.disposal_proceeds','assets.personal_use_pct',
  'bank_accounts.opening_balance','bank_statements.ending_balance','bank_transactions.amount','bank_transactions.running_balance','bank_transactions.tps_paid','bank_transactions.tvq_paid',
  'cca_class_rates.rate','deposit_schedules.fixed_amount','deposit_schedules.percentage',
  'eco_config.dine_in_percentage','eco_config.takeout_percentage','eco_rates.malus_percentage','eco_rates.rate_per_tonne','eco_rates.recycled_credit_percentage','eco_usage.annual_units',
  'forecast_products.sell_price','forecast_products.unit_cost','forecast_weather.precipitation','forecast_weather.temp_max','forecast_weather.temp_min',
  'franchise_location_onboarding.ad_rate','franchise_location_onboarding.royalty_rate',
  'ingredients.current_unit_price','invoice_inventory_deductions.quantity','invoice_inventory_deductions.revenue',
  'invoice_line_items.extended_price','invoice_line_items.quantity','invoice_line_items.unit_price',
  'learned_patterns.confidence','learning_insights.financial_impact',
  'network_compliance_score.close_on_time','network_compliance_score.deposit_reconciled','network_compliance_score.documents_complete','network_compliance_score.month_end_ready','network_compliance_score.no_anomalies','network_compliance_score.royalty_data_complete','network_compliance_score.total_score',
  'packaging_items.unit_weight_grams','pl_invoice_history.amount','prediction_accuracy.error_pct',
  'province_tax_profiles.gst_rate','province_tax_profiles.hst_rate','province_tax_profiles.pst_rate','province_tax_profiles.qst_rate',
  'recipe_ingredients.quantity','recipes.yield_qty','royalty_exceptions.amount_at_risk',
  'supplier_bills.amount','supplier_bills.amount_before_tax','supplier_bills.business_use_pct','supplier_bills.quantity','supplier_bills.tps_paid','supplier_bills.tvq_paid','supplier_bills.unit_cost',
  'supplier_payments.amount','supplier_price_history.quantity','supplier_price_history.unit_price','supplier_tax_profiles.tps_rate','supplier_tax_profiles.tvq_rate',
  'tax_calc_log.result','tax_periods.net_tps_owed','tax_periods.net_tvq_owed','tax_periods.supplies','tax_periods.tps_collected','tax_periods.tps_cti','tax_periods.tvq_collected','tax_periods.tvq_rti',
  'tip_pool_sessions.total_tips','waste_entries.dollar_value','waste_entries.quantity','waste_entries.unit_cost',
]);

describe('MONEY-001 REAL columns are the known set', () => {
  it('no new REAL column without a deliberate change here', () => {
    const found = realColumns(SRC);
    const unexpected = found.filter(c => !KNOWN.has(c));
    expect(unexpected, 'new REAL column(s): store money as INTEGER cents, or add here on purpose').toEqual([]);
    expect(found.length).toBeGreaterThan(50);
  });
});
