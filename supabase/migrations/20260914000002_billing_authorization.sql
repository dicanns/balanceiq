-- Billing authorization: PAD charge records, one billing record per franchise
-- location, one pending invitation per location, and revocation that actually
-- removes access. Every function here is callable only by the service role.

-- ── PAD charges ─────────────────────────────────────────────────────────────
-- One row per charge attempt, written only by charge-pad-mandate. The partial
-- unique index allows one live charge per invoice, so a double click or a
-- retried request cannot debit a customer twice. A failed charge does not block
-- a retry. Statuses mirror LIVE_CHARGE_STATUSES in _shared/billingRules.ts.
CREATE TABLE IF NOT EXISTS public.pad_charges (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                    TEXT NOT NULL,
  mandate_id                TEXT NOT NULL,
  invoice_id                TEXT NOT NULL,
  amount_cents              INTEGER NOT NULL CHECK (amount_cents > 0),
  currency                  TEXT NOT NULL DEFAULT 'cad',
  status                    TEXT NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'submitted', 'succeeded', 'failed')),
  stripe_payment_intent_id  TEXT,
  failure_reason            TEXT,
  requested_by              UUID NOT NULL,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS pad_charges_one_live_per_invoice
  ON public.pad_charges (org_id, invoice_id)
  WHERE status IN ('pending', 'submitted', 'succeeded');

CREATE INDEX IF NOT EXISTS pad_charges_payment_intent
  ON public.pad_charges (stripe_payment_intent_id);

ALTER TABLE public.pad_charges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pad_charges FROM anon, authenticated;
GRANT SELECT ON public.pad_charges TO authenticated;

DROP POLICY IF EXISTS pad_charges_org_read ON public.pad_charges;
CREATE POLICY pad_charges_org_read ON public.pad_charges
  FOR SELECT TO authenticated
  USING (org_id IN (SELECT org_id::text FROM public.users WHERE id = auth.uid()));

-- ── Franchise location billing ──────────────────────────────────────────────
-- Whether a location is billed used to be inferred from the latest invitation
-- row carrying a stripe_item_id. Two quick invitations could each add a $9 item,
-- and re-inviting a revoked location reused the deleted item, so it went unbilled.
-- One row per location now holds the billing state:
--   claimed  a request is creating the Stripe item (claim_id is its idempotency key)
--   active   stripe_item_id is live on the subscription
--   removed  the item was deleted; a new invitation bills again
CREATE TABLE IF NOT EXISTS public.franchise_location_billing (
  franchisor_org_id  UUID NOT NULL,
  location_id        TEXT NOT NULL,
  status             TEXT NOT NULL CHECK (status IN ('claimed', 'active', 'removed')),
  stripe_item_id     TEXT,
  claim_id           UUID,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (franchisor_org_id, location_id)
);

ALTER TABLE public.franchise_location_billing ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.franchise_location_billing FROM anon, authenticated;

-- Backfill from the latest item-bearing invitation per location. The old revoke
-- deleted the Stripe item before expiring the rows, so an expired latest row
-- means the item is gone; a pending or accepted one means it is live.
INSERT INTO public.franchise_location_billing (franchisor_org_id, location_id, status, stripe_item_id)
SELECT DISTINCT ON (franchisor_org_id, location_id)
       franchisor_org_id, location_id,
       CASE WHEN status IN ('pending', 'accepted') THEN 'active' ELSE 'removed' END,
       stripe_item_id
  FROM public.franchise_invitations
 WHERE stripe_item_id IS NOT NULL
 ORDER BY franchisor_org_id, location_id, created_at DESC
ON CONFLICT (franchisor_org_id, location_id) DO NOTHING;

-- Atomically decide whether this request should create the Stripe item.
-- Returns {state: 'active', stripe_item_id} to reuse a live item,
--         {state: 'claimed', claim_id} when the caller must create one, or
--         {state: 'in_progress'} while another request holds a fresh claim.
-- A claim older than p_stale_after is taken over; the original request then
-- fails its conditional finish and deletes the item it created.
CREATE OR REPLACE FUNCTION public.claim_location_billing(
  p_franchisor_org_id UUID,
  p_location_id TEXT,
  p_stale_after INTERVAL DEFAULT INTERVAL '2 minutes'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.franchise_location_billing%ROWTYPE;
  v_claim UUID := gen_random_uuid();
BEGIN
  INSERT INTO public.franchise_location_billing (franchisor_org_id, location_id, status, claim_id)
  VALUES (p_franchisor_org_id, p_location_id, 'claimed', v_claim)
  ON CONFLICT (franchisor_org_id, location_id) DO NOTHING;
  IF FOUND THEN
    RETURN jsonb_build_object('state', 'claimed', 'claim_id', v_claim);
  END IF;

  SELECT * INTO v_row
    FROM public.franchise_location_billing
   WHERE franchisor_org_id = p_franchisor_org_id AND location_id = p_location_id
     FOR UPDATE;

  IF v_row.status = 'active' THEN
    RETURN jsonb_build_object('state', 'active', 'stripe_item_id', v_row.stripe_item_id);
  END IF;
  IF v_row.status = 'claimed' AND v_row.updated_at > now() - p_stale_after THEN
    RETURN jsonb_build_object('state', 'in_progress');
  END IF;

  UPDATE public.franchise_location_billing
     SET status = 'claimed', claim_id = v_claim, stripe_item_id = NULL, updated_at = now()
   WHERE franchisor_org_id = p_franchisor_org_id AND location_id = p_location_id;
  RETURN jsonb_build_object('state', 'claimed', 'claim_id', v_claim);
END;
$$;

-- ── One pending invitation per location ─────────────────────────────────────
UPDATE public.franchise_invitations fi
   SET status = 'expired'
 WHERE fi.status = 'pending'
   AND EXISTS (
     SELECT 1 FROM public.franchise_invitations newer
      WHERE newer.franchisor_org_id = fi.franchisor_org_id
        AND newer.location_id = fi.location_id
        AND newer.status = 'pending'
        AND newer.created_at > fi.created_at);

CREATE UNIQUE INDEX IF NOT EXISTS franchise_invitations_one_pending_per_location
  ON public.franchise_invitations (franchisor_org_id, location_id)
  WHERE status = 'pending';

-- ── Revocation ──────────────────────────────────────────────────────────────
-- Access comes from organizations.parent_org_id / linked_location_id and from
-- user_linked_locations, not from invitation status. Revoking used to stop
-- billing and expire invitations while leaving both in place. This removes access
-- and expires invitations in one transaction, and returns the live Stripe item
-- for the caller to delete afterwards. Billing stays 'active' until that delete
-- succeeds, so a failed delete can be retried by revoking again.
CREATE OR REPLACE FUNCTION public.revoke_franchise_location(
  p_franchisor_org_id UUID,
  p_location_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_orgs_unlinked INTEGER;
  v_user_links_removed INTEGER;
  v_invitations_expired INTEGER;
  v_item TEXT;
BEGIN
  UPDATE public.organizations
     SET parent_org_id = NULL,
         linked_location_id = NULL
   WHERE parent_org_id = p_franchisor_org_id
     AND linked_location_id = p_location_id;
  GET DIAGNOSTICS v_orgs_unlinked = ROW_COUNT;

  DELETE FROM public.user_linked_locations
   WHERE franchisor_org_id = p_franchisor_org_id
     AND location_id = p_location_id;
  GET DIAGNOSTICS v_user_links_removed = ROW_COUNT;

  UPDATE public.franchise_invitations
     SET status = 'expired'
   WHERE franchisor_org_id = p_franchisor_org_id
     AND location_id = p_location_id
     AND status IN ('pending', 'accepted');
  GET DIAGNOSTICS v_invitations_expired = ROW_COUNT;

  SELECT stripe_item_id INTO v_item
    FROM public.franchise_location_billing
   WHERE franchisor_org_id = p_franchisor_org_id
     AND location_id = p_location_id
     AND status = 'active';

  RETURN jsonb_build_object(
    'orgs_unlinked', v_orgs_unlinked,
    'user_links_removed', v_user_links_removed,
    'invitations_expired', v_invitations_expired,
    'stripe_item_id', v_item);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_location_billing(UUID, TEXT, INTERVAL) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_location_billing(UUID, TEXT, INTERVAL) TO service_role;
REVOKE ALL ON FUNCTION public.revoke_franchise_location(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_franchise_location(UUID, TEXT) TO service_role;
