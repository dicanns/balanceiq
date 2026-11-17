-- Bill inbox: lets the owner forward a supplier's invoice to a private address
-- (bills+<code>@in.balanceiq.ca) and find it in the BalanceIQ app next time it
-- is open. Served by the inbox edge function.
--
-- A message waits here only until the app pulls it down, then it is erased (and
-- anything the app never collected is erased after 14 days). What was written
-- in it is sealed by the edge function before it is stored: the sender, the
-- subject, the note and the attachments are never kept in the clear. Every table
-- is closed to the app's own roles: only the edge function (service role) reads
-- or writes them.

-- One private address per company, and who may send to it.
CREATE TABLE IF NOT EXISTS public.bill_inbox_addresses (
  org_id      uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  code        text NOT NULL UNIQUE,
  enabled     boolean NOT NULL DEFAULT true,
  senders     text[] NOT NULL DEFAULT '{}',
  count_day   date,
  count_today integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- A message that arrived and has not been collected yet. sealed holds
-- { from, subject, note, skipped }.
CREATE TABLE IF NOT EXISTS public.bill_inbox_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  sealed      text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bill_inbox_messages_org ON public.bill_inbox_messages (org_id, received_at);

-- The files of a message. meta is sealed { name, type, size }, body the sealed bytes.
CREATE TABLE IF NOT EXISTS public.bill_inbox_attachments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.bill_inbox_messages(id) ON DELETE CASCADE,
  position   integer NOT NULL,
  meta       text NOT NULL,
  body       text NOT NULL
);
CREATE INDEX IF NOT EXISTS bill_inbox_attachments_message ON public.bill_inbox_attachments (message_id, position);

ALTER TABLE public.bill_inbox_addresses   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bill_inbox_messages    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bill_inbox_attachments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bill_inbox_addresses, public.bill_inbox_messages, public.bill_inbox_attachments FROM anon, authenticated;
