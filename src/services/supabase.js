import { createClient } from '@supabase/supabase-js';

// Trim whitespace/newlines — env vars can have hidden line breaks if the key
// was copied with wrapping, which causes net.fetch header validation to fail.
export const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || '').trim();
export const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').replace(/\s/g, '');

// Route all Supabase HTTP calls through Electron's net module in the main
// process to bypass Electron 31 renderer window.fetch "Invalid value" errors.
const netFetch = async (url, init = {}) => {
  const headers = {};
  if (init.headers instanceof Headers) {
    init.headers.forEach((v, k) => { headers[k] = v; });
  } else if (init.headers && typeof init.headers === 'object') {
    Object.assign(headers, init.headers);
  }
  const method = init.method || 'GET';
  const body = (method !== 'GET' && method !== 'HEAD' && init.body != null) ? init.body : null;
  const result = await window.api.supabaseFetch({ url: url.toString(), method, headers, body });
  return new Response(result.body, {
    status: result.status,
    statusText: result.statusText,
    headers: result.headers,
  });
};

// Guard: createClient throws if URL is empty (env vars not set in dev)
export const supabase = SUPABASE_URL
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        storage: typeof window !== 'undefined' ? window.localStorage : undefined,
      },
      global: { fetch: netFetch },
    })
  : null;
