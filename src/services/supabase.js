import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Electron-safe fetch: Electron 31 throws "Invalid value" when fetch init
// options contain empty strings for enum fields (referrerPolicy, referrer,
// mode, cache, credentials, redirect). Strip any falsy string values for
// these fields before passing to window.fetch.
const FETCH_ENUM_KEYS = ['referrerPolicy','referrer','mode','cache','credentials','redirect'];
const safeFetch = (url, init = {}) => {
  const opts = { ...init };
  for (const k of FETCH_ENUM_KEYS) {
    if (k in opts && !opts[k]) delete opts[k];
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
