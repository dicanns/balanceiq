-- Scheduled jobs authenticate to edge functions with a shared secret kept in
-- Vault. The secret is generated inside the database, the jobs read it when they
-- run, and functions check it with verify_cron_secret - so it is never copied
-- into function settings, the job definitions, or anyone's terminal.
--
-- Until now the weekly digest and the payment-failed alert sent no credentials
-- at all, and every run was refused before reaching the function.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'cron_secret') THEN
    PERFORM vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'cron_secret',
      'Shared secret scheduled jobs send to edge functions (x-cron-secret)');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.verify_cron_secret(p_secret TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(length(p_secret), 0) >= 32
     AND EXISTS (
       SELECT 1 FROM vault.decrypted_secrets
        WHERE name = 'cron_secret' AND decrypted_secret = p_secret);
$$;

REVOKE ALL ON FUNCTION public.verify_cron_secret(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_cron_secret(TEXT) TO service_role;

-- cron.schedule with an existing job name replaces that job's command.
SELECT cron.schedule('weekly-digest', '0 13 * * 1', $job$
  SELECT net.http_post(
    url := 'https://etiwnesxjypdwhxqnqqq.supabase.co/functions/v1/weekly-digest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret')),
    body := '{}'::jsonb)
$job$);

SELECT cron.schedule('payment-alert', '0 12 * * *', $job$
  SELECT net.http_post(
    url := 'https://etiwnesxjypdwhxqnqqq.supabase.co/functions/v1/payment-alert',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret')),
    body := '{}'::jsonb)
$job$);
