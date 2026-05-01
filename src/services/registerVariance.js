/**
 * Simple variance formula (current behavior).
 *
 * variance = physicalCash - expectedCash
 * physicalCash = finalCash + deposits
 * expectedCash = (posVentes + posTPS + posTVQ - posLivraisons) - interac
 *
 * Returns null when inputs are insufficient.
 */
function computeRegisterVariance(cash) {
  const posVentes = cash.posVentes ?? null;
  if (posVentes === null) return null;
  const posTPS = cash.posTPS ?? 0;
  const posTVQ = cash.posTVQ ?? 0;
  const posLivraisons = cash.posLivraisons ?? 0;
  const interac = cash.interac ?? null;
  if (interac === null) return null;
  const finalCash = cash.finalCash ?? null;
  if (finalCash === null) return null;

  const posT = posVentes + posTPS + posTVQ;
  const expectedCash = posT - posLivraisons - interac;
  const physCash = finalCash + (cash.deposits ?? 0);
  return physCash - expectedCash;
}

/**
 * Advanced variance formula (tender-aware, integer-cents arithmetic).
 *
 * expected_cash_in_drawer =
 *     openingFloatCents
 *   + expected_cash_sales  (posTotal - deliveries - card payments, in cents)
 *   + paid_ins_cents
 *   - paid_outs_cents
 *   - safeDropsTotalCents
 *   - cash_tips_paid_cents
 *   - till_transfers_out_cents
 *   + till_transfers_in_cents
 *
 * physCash = finalCash + deposits (same as simple mode)
 * variance = physCash - expected  (in dollars, matching computeRegisterVariance units)
 *
 * Returns null when base POS/cash inputs are missing.
 * With all advanced fields = 0 and deposits = 0, result equals computeRegisterVariance.
 *
 * Note: gift_card_redemptions_cents and house_account_sales_cents are informational
 * and do not affect the variance calculation.
 */
function computeAdvancedRegisterVariance(cash, advFields, safeDropsTotalCents, openingFloatCents) {
  advFields = advFields || {};
  safeDropsTotalCents = safeDropsTotalCents || 0;
  openingFloatCents = openingFloatCents || 0;

  const posVentes = cash.posVentes ?? null;
  if (posVentes === null) return null;
  const posTPS = cash.posTPS ?? 0;
  const posTVQ = cash.posTVQ ?? 0;
  const posLivraisons = cash.posLivraisons ?? 0;
  const interac = cash.interac ?? null;
  if (interac === null) return null;
  const finalCash = cash.finalCash ?? null;
  if (finalCash === null) return null;

  const physCashCents = Math.round(finalCash * 100) + Math.round((cash.deposits ?? 0) * 100);

  const posT_cents     = Math.round((posVentes + posTPS + posTVQ) * 100);
  const deliveryCents  = Math.round(posLivraisons * 100);
  const interacCents   = Math.round(interac * 100);
  const expectedCashSalesCents = posT_cents - deliveryCents - interacCents;

  const paidInsCents  = Math.round(advFields.paid_ins_cents ?? 0);
  const paidOutsCents = Math.round(advFields.paid_outs_cents ?? 0);
  const cashTipsCents = Math.round(advFields.cash_tips_paid_cents ?? 0);
  const tillInCents   = Math.round(advFields.till_transfers_in_cents ?? 0);
  const tillOutCents  = Math.round(advFields.till_transfers_out_cents ?? 0);

  const expectedCashInDrawerCents =
      openingFloatCents
    + expectedCashSalesCents
    + paidInsCents
    - paidOutsCents
    - safeDropsTotalCents
    - cashTipsCents
    - tillOutCents
    + tillInCents;

  return (physCashCents - expectedCashInDrawerCents) / 100;
}

export { computeRegisterVariance, computeAdvancedRegisterVariance };
