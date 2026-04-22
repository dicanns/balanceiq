/**
 * TAX-001 — TPS/TVQ Collected on Invoice (Journal Entry Assertions)
 *
 * Scenario: finalize a taxable invoice for $100 subtotal.
 * Assert: journal entry credits 2100 TPS a payer $5.00 (500 cents).
 * Assert: journal entry credits 2110 TVQ a payer $9.975 rounded (998 cents).
 * Assert: tax_calc_log has entry with matching formula version.
 *
 * TODO Sprint 9 (Phase 3 Invoicing Integration): implement once invoice-to-GL
 * retrofit is built. The Facturation module does not currently auto-post journal
 * entries when an invoice is finalized. This requires the invoice journal entry
 * builder from Sprint 9 to exist before these assertions can be written.
 *
 * When Sprint 9 ships, verify:
 *   - Debit 1100 (AR) = total_ttc_cents (subtotal + TPS + TVQ)
 *   - Credit 4000 (Revenue) = subtotal_cents (10000)
 *   - Credit 2100 (TPS a payer) = 500 cents
 *   - Credit 2110 (TVQ a payer) = 998 cents (Math.round(9.975 * 100))
 *   - tax_calc_log row: formula_version = 'v1.0-2026', result = 5.00
 */
import { describe, it } from 'vitest';

describe.skip('TAX-001 TPS/TVQ collected on invoice (Sprint 9)', () => {
  it('journal entry credits TPS a payer 500 cents on $100 invoice', () => {
    // TODO Sprint 9
  });

  it('journal entry credits TVQ a payer 998 cents ($9.975 rounded) on $100 invoice', () => {
    // TODO Sprint 9
  });

  it('tax_calc_log records formula version v1.0-2026 for the posting', () => {
    // TODO Sprint 9
  });
});
