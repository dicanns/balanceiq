import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = 'https://etiwnesxjypdwhxqnqqq.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV0aXduZXN4anlwZHdoeHFucXFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwODIxMDMsImV4cCI6MjA4ODY1ODEwM30.5hDZrbWSDaEk0ixUnOi-5WPg3loQ4CzVVd2_KqFkX8Q';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // Use localStorage for session persistence in Electron renderer
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  },
});
