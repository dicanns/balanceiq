import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Electron-safe fetch: Electron 31 throws "Invalid value" when fetch init
// options contain empty or unsupported values for enum fields.
// Strip ALL enum-type fields unconditionally — Supabase uses Bearer tokens
// (not credentials/cookies), CORS/mode is handled by Electron automatically,
// and cache/redirect/referrer are irrelevant for API calls.
const FETCH_STRIP_KEYS = ['referrerPolicy','referrer','mode','cache','credentials','redirect','priority','duplex'];
const safeFetch = (url, init = {}) => {
  const opts = { ...init };
  for (const k of FETCH_STRIP_KEYS) {
    delete opts[k];
  }
  return window.fetch(url, opts);
};

// Guard: createClient throws if URL is empty (env vars not set in dev)
export const supabase = SUPABASE_URL
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        storage: typeof window !== 'undefined' ? window.localStorage : undefined,
      },
      global: { fetch: safeFetch },
    })
  : null;
