// Runs the AI relay loop for the open company: on only when the owner switched
// it on in Settings > AI assistant, the plan includes it and a BalanceIQ account
// is signed in. See src/connector/relayClient.mjs.
import { supabase, SUPABASE_URL } from './supabase.js';
import { createRelayClient } from '../connector/relayClient.mjs';

const listeners = new Set();
let client = null;

/** A signed-in request to the relay. Never throws for an HTTP error. */
export async function aiRelayCall(path, body) {
  if (!supabase || !SUPABASE_URL) return { ok: false, status: 0, data: null };
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) return { ok: false, status: 401, data: null };
  const res = await window.api.supabaseFetch({
    url: `${SUPABASE_URL}/functions/v1/ai-relay/${path}`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body || {}),
  });
  let parsed = null;
  try { parsed = res.body ? JSON.parse(res.body) : null; } catch (_) { parsed = null; }
  return { ok: !!res.ok, status: res.status, data: parsed };
}

function relayClient() {
  if (!client) {
    client = createRelayClient({
      call: aiRelayCall,
      handle: (message, headers) => window.api.connector.relayHandle(message, headers),
      onState: (s) => listeners.forEach((fn) => { try { fn(s); } catch (_) { /* ignore */ } }),
    });
  }
  return client;
}

export const aiRelayState = () => (client ? client.state() : 'off');
export function onAiRelayState(fn) { listeners.add(fn); return () => listeners.delete(fn); }

/** Start or stop the loop to match the switch and the plan. Signed out, the loop says so and waits. */
export async function syncAiRelay() {
  let status = null;
  try { status = await window.api?.connector?.status?.(); } catch (_) { status = null; }
  if (status && status.relay && status.allowed) relayClient().start();
  else if (client) client.stop();
  return aiRelayState();
}

// One object for the Settings page, the same on every render.
export const aiRelayApi = { state: aiRelayState, onState: onAiRelayState, sync: syncAiRelay, call: aiRelayCall };
