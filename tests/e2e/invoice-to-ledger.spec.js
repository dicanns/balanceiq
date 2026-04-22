/**
 * E2E — Invoice to General Ledger (Playwright)
 *
 * Covers the full chain: create invoice in UI -> finalize -> verify GL entry
 * with correct debit AR + credits Revenue/TPS/TVQ.
 *
 * TODO Sprint 9 (Phase 3 Invoicing Integration): implement this test once the
 * invoice-to-ledger retrofit is built. The Facturation module currently does NOT
 * auto-post journal entries when an invoice is finalized. This chain is planned
 * for Sprints 9-14 of the Accounting Suite spec.
 *
 * When Sprint 9 ships:
 *   1. Create customer via UI
 *   2. Create invoice: 1 line item, $100 subtotal, TPS + TVQ enabled
 *   3. Finalize (change status to 'sent' or 'paid')
 *   4. Navigate to Config -> Grand livre -> Balance de verification
 *   5. Assert: AR account (1100) has debit = invoice total in cents
 *   6. Assert: Revenue account (4000) has credit = $100.00 (10000 cents)
 *   7. Assert: TPS a payer (2100) has credit = $5.00 (500 cents)
 *   8. Assert: TVQ a payer (2110) has credit = $9.975 rounded (998 cents)
 *   9. Assert: integer cents match exactly (no float drift)
 */
import { test } from '@playwright/test';

test.describe.skip('Invoice to GL chain (Sprint 9)', () => {
  test('finalized invoice posts journal entry with correct AR + Revenue + TPS + TVQ splits', async () => {
    // TODO Sprint 9: implement full chain test
  });

  test('integer cents on invoice match journal line amounts exactly', async () => {
    // TODO Sprint 9: assert no float drift between invoice total and posted journal lines
  });
});
