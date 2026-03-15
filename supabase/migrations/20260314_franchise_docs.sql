-- Franchise document sharing tables
-- Run via Supabase dashboard SQL editor on project etiwnesxjypdwhxqnqqq

-- Franchise documents metadata
CREATE TABLE IF NOT EXISTS franchise_documents (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  folder       TEXT NOT NULL DEFAULT 'general',
  filename     TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  size_bytes   INT,
  description  TEXT,
  uploaded_by  UUID REFERENCES auth.users(id),
  uploaded_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_franchise_documents_org_id ON franchise_documents(org_id);

ALTER TABLE franchise_documents ENABLE ROW LEVEL SECURITY;

-- Franchisor can read own docs; franchisees can read parent org's docs
CREATE POLICY "docs_read" ON franchise_documents FOR SELECT USING (
  org_id = (SELECT org_id FROM users WHERE id = auth.uid())
  OR
  org_id = (SELECT parent_org_id FROM organizations WHERE id = (SELECT org_id FROM users WHERE id = auth.uid()))
);

-- Only service role (edge function) can write docs
-- (no INSERT/DELETE/UPDATE policies = only service role via edge function)

-- Franchise announcements
CREATE TABLE IF NOT EXISTS franchise_announcements (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_franchise_announcements_org_id ON franchise_announcements(org_id);

ALTER TABLE franchise_announcements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ann_read" ON franchise_announcements FOR SELECT USING (
  org_id = (SELECT org_id FROM users WHERE id = auth.uid())
  OR
  org_id = (SELECT parent_org_id FROM organizations WHERE id = (SELECT org_id FROM users WHERE id = auth.uid()))
);

-- Announcement read receipts
CREATE TABLE IF NOT EXISTS announcement_reads (
  announcement_id UUID NOT NULL REFERENCES franchise_announcements(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  read_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (announcement_id, user_id)
);

ALTER TABLE announcement_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reads_select" ON announcement_reads FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "reads_insert" ON announcement_reads FOR INSERT WITH CHECK (user_id = auth.uid());

-- Storage bucket: run in Supabase dashboard Storage section
-- Bucket name: franchise-docs
-- Public: false (private, signed URLs only)
-- File size limit: 10 MB
-- Allowed MIME types: (leave open — PDFs, images, Word docs, etc.)

-- Storage RLS policy (run after bucket is created):
/*
CREATE POLICY "storage_read" ON storage.objects FOR SELECT USING (
  bucket_id = 'franchise-docs'
  AND (
    (storage.foldername(name))[1] = (SELECT org_id::text FROM users WHERE id = auth.uid())
    OR
    (storage.foldername(name))[1] = (
      SELECT parent_org_id::text FROM organizations
      WHERE id = (SELECT org_id FROM users WHERE id = auth.uid())
    )
  )
);
*/
