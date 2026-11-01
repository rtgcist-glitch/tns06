/**
 * Supabase Client Setup & Connection Test
 * Single shared Supabase client instance for all server operations
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { ENV } from "./env";

export const supabase: SupabaseClient = createClient(
  ENV.SUPABASE_URL || "https://placeholder.supabase.co",
  ENV.SUPABASE_SERVICE_KEY || "placeholder-key",
  {
    auth: { autoRefreshToken: false, persistSession: false },
  }
);

export let dbConnected = false;
export let dbSyncError = "";

export async function testSupabaseConnection(retries = 3): Promise<boolean> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const { data, error } = await supabase.from("users").select("id").limit(1);
      if (error) throw error;
      dbConnected = true;
      dbSyncError = "";
      console.log("[Supabase] ✅ Connected successfully!");
      return true;
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      dbSyncError = errMsg || "Failed to connect to Supabase";
      if (attempt < retries) {
        console.warn(`[Supabase] ⚠️ Connection attempt ${attempt}/${retries} failed: ${dbSyncError}. Retrying in 2s...`);
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } else {
        dbConnected = false;
        console.error(`[Supabase] ❌ Connection failed after ${retries} attempts: ${dbSyncError}`);
      }
    }
  }
  return false;
}
