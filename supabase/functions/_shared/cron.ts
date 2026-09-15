/**
 * Gate for functions called by pg_cron. The job sends the shared secret kept in
 * Vault as x-cron-secret; the database compares it (verify_cron_secret, callable
 * only by the service role), so the secret never has to live in function settings.
 *
 * Returns null when the caller is the scheduler, or a 401 Response to return.
 */
// deno-lint-ignore no-explicit-any
export async function requireCronSecret(req: Request, supabaseAdmin: any): Promise<Response | null> {
  const secret = req.headers.get('x-cron-secret') || '';
  if (secret) {
    const { data, error } = await supabaseAdmin.rpc('verify_cron_secret', { p_secret: secret });
    if (!error && data === true) return null;
    if (error) console.error('verify_cron_secret failed:', error.message);
  }
  return new Response(JSON.stringify({ error: 'unauthorized' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
}
