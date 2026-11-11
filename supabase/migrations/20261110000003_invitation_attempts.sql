-- Attempt log for accepting a franchise invitation code (review 2026-11-09, B18).
-- The accept-invitation function counts recent attempts per user and per address
-- and refuses past a limit. Only the service role reads or writes it.
CREATE TABLE IF NOT EXISTS public.invitation_attempts (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    UUID        NOT NULL,
  ip         TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS invitation_attempts_user_time ON public.invitation_attempts (user_id, created_at);
CREATE INDEX IF NOT EXISTS invitation_attempts_ip_time   ON public.invitation_attempts (ip, created_at);

ALTER TABLE public.invitation_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.invitation_attempts FROM anon, authenticated;
