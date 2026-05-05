// Province-aware tax computation service.
// All amounts in integer cents. Never uses getDb() — callers must pass _db.

export const FORMULA_VERSION_PROVINCE = 'v2.0-province-2026';

// Resolve the province tax profile for a supplier.
// Falls back to the is_default=1 province (QC) if no province assigned.
function resolveProvinceProfile(supplierTaxProfileId, db) {
  let province = null;
  if (supplierTaxProfileId != null) {
    const supplier = db.prepare('SELECT * FROM supplier_tax_profiles WHERE id=?').get(supplierTaxProfileId);
    if (supplier?.province_tax_profile_id) {
      province = db.prepare('SELECT * FROM province_tax_profiles WHERE id=?').get(supplier.province_tax_profile_id);
    }
  }
  if (!province) {
    province = db.prepare('SELECT * FROM province_tax_profiles WHERE is_default=1 LIMIT 1').get();
  }
  // Hard fallback: QC rates if table is empty (should not happen after migration v28)
  if (!province) {
    province = { id: null, province_code: 'QC', gst_rate: 0.05, qst_rate: 0.09975, pst_rate: 0, hst_rate: 0 };
  }
  return province;
}

/**
 * Compute tax on amountCents for a given supplier tax profile.
 * Returns integer cents for each tax component + metadata for logging.
 *
 * @param {number} amountCents - pre-tax amount in integer cents
 * @param {number|null} supplierTaxProfileId - row id in supplier_tax_profiles, or null
 * @param {object} db - better-sqlite3 Database instance (required)
 * @returns {{ gstCents, qstCents, pstCents, hstCents, totalTaxCents, provinceCode, provinceProfileId, formulaVersion }}
 */
export function computeTax(amountCents, supplierTaxProfileId, db) {
  const province = resolveProvinceProfile(supplierTaxProfileId, db);
  const code = province.province_code;

  let gstCents = 0;
  let qstCents = 0;
  let pstCents = 0;
  let hstCents = 0;

  if (province.hst_rate > 0) {
    hstCents = Math.round(amountCents * province.hst_rate);
  } else {
    if (province.gst_rate > 0) gstCents = Math.round(amountCents * province.gst_rate);
    if (province.qst_rate > 0) qstCents = Math.round(amountCents * province.qst_rate);
    if (province.pst_rate > 0) pstCents = Math.round(amountCents * province.pst_rate);
  }

  return {
    gstCents,
    qstCents,
    pstCents,
    hstCents,
    totalTaxCents: gstCents + qstCents + pstCents + hstCents,
    provinceCode: code,
    provinceProfileId: province.id ?? null,
    formulaVersion: FORMULA_VERSION_PROVINCE,
  };
}

/**
 * Write a tax computation result to tax_calc_log with province reference.
 * Enables reproducibility: historical logs are immutable even if province rates change.
 *
 * @param {object} db
 * @param {{ taxPeriodId?, calculationType, amountCents, supplierTaxProfileId?, result }} opts
 */
export function logTaxComputation(db, { taxPeriodId = null, calculationType, amountCents, supplierTaxProfileId = null, result }) {
  db.prepare(
    `INSERT INTO tax_calc_log
       (tax_period_id, calculation_type, formula_version, input_snapshot, result, province_tax_profile_id, calculated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    taxPeriodId,
    calculationType,
    result.formulaVersion,
    JSON.stringify({ amountCents, supplierTaxProfileId }),
    result.totalTaxCents,
    result.provinceProfileId,
    new Date().toISOString(),
  );
}
