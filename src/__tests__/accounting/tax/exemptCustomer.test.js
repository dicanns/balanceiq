/**
 * TAX-003 — Tax-Exempt Customer Invoice
 *
 * Scenario: invoice for a tax-exempt customer (e.g. First Nations status,
 * or a registered organization with a valid exemption certificate).
 * Assert: no TPS or TVQ lines on the journal entry.
 * Assert: revenue line posts full invoice amount.
 * Assert: if proof-doc is missing, warning banner flag is set but invoice still posts.
 *
 * TODO Sprint 9 (Phase 3 Invoicing Integration): implement once invoice-to-GL
 * retrofit is built. Tax exemption tracking on customer records is part of
 * Sprint 9 scope. The current Facturation module records tax-exempt status
 * in the client JSON but does not yet propagate it to journal entries.
 *
 * When Sprint 9 ships, also verify:
 *   - Client record has tax_exempt: true + exemption_number populated
 *   - Invoice total == subtotal (no TPS or TVQ added)
 *   - GL entry: single debit AR + single credit Revenue, no tax lines
 *   - warning_flag set on entry when exemption_doc_id is null
 */
import { describe, it } from 'vitest';

describe.skip('TAX-003 tax-exempt customer invoice (Sprint 9)', () => {
  it('journal entry has no TPS or TVQ lines for exempt customer', () => {
    // TODO Sprint 9
  });

  it('revenue line posts the full invoice amount (no tax deducted)', () => {
    // TODO Sprint 9
  });

  it('sets warning flag when exemption proof document is missing', () => {
    // TODO Sprint 9
  });
});
