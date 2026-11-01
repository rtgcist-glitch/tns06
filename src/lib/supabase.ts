import { createClient, SupabaseClient } from "@supabase/supabase-js";

const metaEnv = (import.meta as unknown as { env?: Record<string, string> }).env || {};
const SUPABASE_URL = metaEnv.VITE_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = metaEnv.VITE_SUPABASE_ANON_KEY || "";

export const supabase: SupabaseClient | null =
  SUPABASE_URL && SUPABASE_ANON_KEY
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      })
    : null;

export { SUPABASE_URL, SUPABASE_ANON_KEY };
