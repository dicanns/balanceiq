import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://etiwnesxjypdwhxqnqqq.supabase.co';
const SUPABASE_ANON_KEY = 'SUPABASE_ANON_KEY_REMOVED';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // Use localStorage for session persistence in Electron renderer
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  },
});
