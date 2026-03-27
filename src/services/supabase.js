import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Electron-safe fetch: Electron 31 on Windows throws "Invalid value" when
// referrerPolicy is an empty string (which Supabase JS passes internally).
// Stripping falsy referrerPolicy fixes fetch from file:// origin on Windows.
const safeFetch = (url, init = {}) => {
  const opts = { ...init };
  if ('referrerPolicy' in opts && !opts.referrerPolicy) delete opts.referrerPolicy;
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
