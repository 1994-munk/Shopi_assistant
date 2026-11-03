import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Supabase is not configured for this app.');
}

// One shared client for the whole app. Shopi has no sign-in, so every request uses the anonymous role.
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
