-- AI relay: lets an online AI assistant (ChatGPT and others) reach the BalanceIQ
-- app on the owner's computer through the ai-relay edge function.
--
-- No book data is kept here in the clear. A question and its answer are sealed
-- by the edge function before they are stored, and both are erased when the
-- call ends. Every table is closed to the app's own roles: only the edge
-- function (service role) reads or writes them.

-- Assistants that registered themselves (OAuth dynamic client registration).
CREATE TABLE IF NOT EXISTS public.ai_relay_clients (
  client_id     text PRIMARY KEY,
  client_name   text NOT NULL DEFAULT '',
  redirect_uris text[] NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- One row per "may this assistant read your books?" question put to an owner.
CREATE TABLE IF NOT EXISTS public.ai_relay_requests (
  id             text PRIMARY KEY,
  client_id      text NOT NULL REFERENCES public.ai_relay_clients(client_id) ON DELETE CASCADE,
  redirect_uri   text NOT NULL,
  state          text,
  code_challenge text NOT NULL,
  code_hash      text UNIQUE,
  org_id         uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id        uuid,
  created_at     timestamptz NOT NULL DEFAULT now(),
  approved_at    timestamptz,
  used_at        timestamptz
);

-- What an owner granted: a relay-only access key and its renewal key, as hashes.
CREATE TABLE IF NOT EXISTS public.ai_relay_grants (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id            uuid NOT NULL,
  client_id          text NOT NULL REFERENCES public.ai_relay_clients(client_id) ON DELETE CASCADE,
  access_hash        text NOT NULL UNIQUE,
  access_expires_at  timestamptz NOT NULL,
  refresh_hash       text NOT NULL UNIQUE,
  refresh_expires_at timestamptz NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  last_used_at       timestamptz
);
CREATE INDEX IF NOT EXISTS ai_relay_grants_org ON public.ai_relay_grants (org_id);

-- The queue between the assistant and the app. request and response are sealed.
CREATE TABLE IF NOT EXISTS public.ai_relay_calls (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  status     text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'claimed', 'done', 'failed')),
  method     text,
  request    text,
  response   text,
  created_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  done_at    timestamptz
);
CREATE INDEX IF NOT EXISTS ai_relay_calls_queue ON public.ai_relay_calls (org_id, status, created_at);

-- When the app last asked for work: tells the relay whether anyone is listening.
CREATE TABLE IF NOT EXISTS public.ai_relay_presence (
  org_id       uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  app_version  text
);

ALTER TABLE public.ai_relay_clients  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_relay_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_relay_grants   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_relay_calls    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_relay_presence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_relay_clients, public.ai_relay_requests, public.ai_relay_grants,
              public.ai_relay_calls, public.ai_relay_presence FROM anon, authenticated;

-- The app takes the oldest waiting call of its company; two computers can never
-- take the same one. Calls older than a minute are left alone: the assistant
-- stopped waiting for them.
CREATE OR REPLACE FUNCTION public.ai_relay_claim(p_org uuid)
RETURNS TABLE (id uuid, request text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.ai_relay_calls c
     SET status = 'claimed', claimed_at = now()
   WHERE c.id = (
     SELECT q.id FROM public.ai_relay_calls q
      WHERE q.org_id = p_org AND q.status = 'pending' AND q.created_at > now() - interval '60 seconds'
      ORDER BY q.created_at
      LIMIT 1
      FOR UPDATE SKIP LOCKED
   )
  RETURNING c.id, c.request;
$$;
REVOKE ALL ON FUNCTION public.ai_relay_claim(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_relay_claim(uuid) TO service_role;
