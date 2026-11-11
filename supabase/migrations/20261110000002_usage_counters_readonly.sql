-- Usage counters (review 2026-11-09, B6 and B15).
-- Members must not be able to reset their own scan or AI counters, and the
-- quota function the edge functions call must exist and work.
-- Edge functions use the service role, which is not subject to these rules.

-- POS photo scans now have a monthly allowance like OCR and AI queries.
CREATE TABLE IF NOT EXISTS public.pos_scan_usage (
  org_id UUID    NOT NULL,
  month  TEXT    NOT NULL,   -- YYYY-MM
  count  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (org_id, month)
);

ALTER TABLE public.ocr_usage      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_scan_usage ENABLE ROW LEVEL SECURITY;

-- ai_usage had a FOR ALL rule: a member could write count = 0.
DROP POLICY IF EXISTS "ai_usage_org_own" ON public.ai_usage;
DROP POLICY IF EXISTS "ocr_usage_org_own" ON public.ocr_usage;
REVOKE ALL ON public.ocr_usage, public.ai_usage, public.pos_scan_usage FROM anon, authenticated;
GRANT SELECT ON public.ocr_usage, public.ai_usage, public.pos_scan_usage TO authenticated;

DROP POLICY IF EXISTS "ocr_usage_org_read" ON public.ocr_usage;
CREATE POLICY "ocr_usage_org_read" ON public.ocr_usage
  FOR SELECT TO authenticated
  USING (org_id = (SELECT users.org_id FROM public.users WHERE users.id = auth.uid()));
DROP POLICY IF EXISTS "ai_usage_org_read" ON public.ai_usage;
CREATE POLICY "ai_usage_org_read" ON public.ai_usage
  FOR SELECT TO authenticated
  USING (org_id = (SELECT users.org_id FROM public.users WHERE users.id = auth.uid()));
DROP POLICY IF EXISTS "pos_scan_usage_org_read" ON public.pos_scan_usage;
CREATE POLICY "pos_scan_usage_org_read" ON public.pos_scan_usage
  FOR SELECT TO authenticated
  USING (org_id = (SELECT users.org_id FROM public.users WHERE users.id = auth.uid()));

-- Atomic quota increment (replaces 20260505000003_quota_rpc.sql, which is not
-- recorded as applied on the live project). Returns the new count, or -1 when the
-- limit was already reached. The org id is cast to uuid because the usage tables
-- key on uuid and a text parameter would not insert. Only the service role may call it.
CREATE OR REPLACE FUNCTION public.increment_usage_if_under_limit(
  p_table  TEXT,
  p_org_id TEXT,
  p_month  TEXT,
  p_limit  INT
) RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new INT;
BEGIN
  IF p_table NOT IN ('ocr_usage', 'ai_usage', 'pos_scan_usage') THEN
    RAISE EXCEPTION 'forbidden table: %', p_table;
  END IF;

  EXECUTE format(
    'INSERT INTO public.%I (org_id, month, count)
     VALUES ($1::uuid, $2, 1)
     ON CONFLICT (org_id, month)
     DO UPDATE SET count = %I.count + 1
     WHERE %I.count < $3
     RETURNING count',
    p_table, p_table, p_table
  ) USING p_org_id, p_month, p_limit
  INTO v_new;

  RETURN COALESCE(v_new, -1);
END;
$$;

REVOKE ALL ON FUNCTION public.increment_usage_if_under_limit(TEXT, TEXT, TEXT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_usage_if_under_limit(TEXT, TEXT, TEXT, INT) TO service_role;

-- usage_events: telemetry insert was open to everyone with any org id. Require a
-- signed-in user and that the row names their own organization.
DROP POLICY IF EXISTS "usage_events_insert" ON public.usage_events;
CREATE POLICY "usage_events_insert" ON public.usage_events
  FOR INSERT TO authenticated
  WITH CHECK (org_id = (SELECT users.org_id::text FROM public.users WHERE users.id = auth.uid()));

-- The webhook's duplicate-event log (20260423000001) was never created in the
-- live project. Same definition; only the functions touch it.
CREATE TABLE IF NOT EXISTS public.pad_webhook_events (
  event_id     TEXT PRIMARY KEY,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pad_webhook_events_ts ON public.pad_webhook_events (processed_at);
ALTER TABLE public.pad_webhook_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pad_webhook_events FROM anon, authenticated;
