-- Security fix: remove insecure RLS policy that exposed all pending invitations
-- to any authenticated user. Invitation lookup is handled exclusively by the
-- accept-invitation edge function using the service-role key. No direct client
-- reads of this table are needed or permitted.
DROP POLICY IF EXISTS "read_pending_by_code" ON franchise_invitations;
