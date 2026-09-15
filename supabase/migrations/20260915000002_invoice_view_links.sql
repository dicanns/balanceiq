-- View invoice links. An emailed invoice carries a link to a page on balanceiq.ca
-- that shows a frozen copy of the invoice and records when the client first
-- opened it. Rows are read and written only by the invoice-view edge function.

CREATE TABLE IF NOT EXISTS public.invoice_view_links (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token            TEXT UNIQUE NOT NULL CHECK (length(token) >= 32),
  org_id           TEXT NOT NULL,
  invoice_id       TEXT NOT NULL,
  invoice_number   TEXT,
  invoice_html     TEXT NOT NULL,
  company_name     TEXT,
  lang             TEXT NOT NULL DEFAULT 'fr' CHECK (lang IN ('fr', 'en')),
  created_by       UUID NOT NULL,
  expires_at       TIMESTAMPTZ NOT NULL,
  revoked_at       TIMESTAMPTZ,
  first_viewed_at  TIMESTAMPTZ,
  last_viewed_at   TIMESTAMPTZ,
  view_count       INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invoice_view_links_org_invoice ON public.invoice_view_links (org_id, invoice_id);

ALTER TABLE public.invoice_view_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.invoice_view_links FROM anon, authenticated;

-- One view, counted atomically. Expired or revoked links count nothing.
CREATE OR REPLACE FUNCTION public.record_invoice_view(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_first TIMESTAMPTZ;
  v_count INTEGER;
BEGIN
  UPDATE public.invoice_view_links
     SET first_viewed_at = coalesce(first_viewed_at, now()),
         last_viewed_at = now(),
         view_count = view_count + 1
   WHERE token = p_token
     AND revoked_at IS NULL
     AND expires_at > now()
  RETURNING first_viewed_at, view_count INTO v_first, v_count;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false);
  END IF;
  RETURN jsonb_build_object('ok', true, 'first_viewed_at', v_first, 'view_count', v_count);
END;
$$;

REVOKE ALL ON FUNCTION public.record_invoice_view(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_invoice_view(TEXT) TO service_role;

-- Links last 180 days; the copy of the invoice is deleted 30 days after that.
SELECT cron.schedule('invoice-view-cleanup', '30 7 * * *', $job$
  DELETE FROM public.invoice_view_links WHERE expires_at < now() - interval '30 days'
$job$);
