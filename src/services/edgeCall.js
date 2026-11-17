// A signed-in request to one of our own edge functions, with the BalanceIQ
// sign-in. Same shape as aiRelayCall: it never throws for an HTTP error.
import { supabase, SUPABASE_URL } from './supabase.js';

/** signedEdgeCall('inbox', 'pull', {}) -> { ok, status, data } */
export async function signedEdgeCall(fn, path, body) {
  if (!supabase || !SUPABASE_URL) return { ok: false, status: 0, data: null };
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) return { ok: false, status: 401, data: null };
  const res = await window.api.supabaseFetch({
    url: `${SUPABASE_URL}/functions/v1/${fn}/${path}`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body || {}),
  });
  let parsed = null;
  try { parsed = res.body ? JSON.parse(res.body) : null; } catch (_) { parsed = null; }
  return { ok: !!res.ok, status: res.status, data: parsed };
}
