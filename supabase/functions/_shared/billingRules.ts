// ── BILLING RULES ────────────────────────────────────────────────────────────
// Who may move money or change the company's bill, and what a PAD charge request
// must look like. Plain TypeScript with no remote imports, so the edge functions
// and the Vitest suite share one definition.

// Roles allowed to debit a customer, add or remove a billed franchise location,
// or revoke a location's access.
export const BILLING_ROLES = ['owner', 'admin'];

export function canManageBilling(role: string | null | undefined): boolean {
  return BILLING_ROLES.includes(String(role ?? '').trim().toLowerCase());
}

// Invoices live on the operator's computer, so the server cannot look up what an
// invoice is worth. A ceiling bounds the damage of a wrong or tampered amount;
// PAD_MAX_CHARGE_CENTS overrides it per deployment.
export const DEFAULT_MAX_CHARGE_CENTS = 5_000_000;

export function maxChargeCents(envValue?: string | null): number {
  const n = Number(envValue);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_MAX_CHARGE_CENTS;
}

// A charge in one of these states blocks another charge for the same invoice.
// A failed charge does not, so an NSF can be retried. Mirrored by the partial
// unique index pad_charges_one_live_per_invoice.
export const LIVE_CHARGE_STATUSES = ['pending', 'submitted', 'succeeded'];

export type ChargeCheck =
  | { ok: true }
  | { ok: false; error: string; status: number };

export function checkChargeRequest(
  body: Record<string, unknown> | null | undefined,
  maxCents: number,
): ChargeCheck {
  const { org_id, mandate_id, amount_cents, invoice_id } = body ?? {};
  if (!org_id || !mandate_id || !invoice_id || amount_cents === undefined || amount_cents === null) {
    return { ok: false, error: 'missing_params', status: 400 };
  }
  if (typeof amount_cents !== 'number' || !Number.isInteger(amount_cents) || amount_cents <= 0) {
    return { ok: false, error: 'invalid_amount', status: 400 };
  }
  if (amount_cents > maxCents) {
    return { ok: false, error: 'amount_over_limit', status: 422 };
  }
  return { ok: true };
}

// Stripe keys so a retried request replays the original result instead of
// creating a second debit or a second subscription item.
export const chargeIdempotencyKey = (chargeId: string) => `pad-charge:${chargeId}`;
export const locationItemIdempotencyKey = (invitationId: string) => `franchise-location-item:${invitationId}`;

// Postgres unique_violation, as surfaced by supabase-js.
export const isUniqueViolation = (err: { code?: string } | null | undefined) => err?.code === '23505';
