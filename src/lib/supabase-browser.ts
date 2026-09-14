import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

let client: SupabaseClient<Database> | null = null;

function readPublicConfig(): { url: string; anonKey: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || "";
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

/**
 * True when browser Supabase public env is configured.
 * Useful for build/prerender where Preview env may be incomplete.
 */
export function hasSupabaseBrowserConfig(): boolean {
  return readPublicConfig() !== null;
}

/**
 * Singleton Supabase browser client.
 * Uses anon key — safe for client bundles.
 * RLS enforces warehouse isolation automatically.
 */
export function getSupabase(): SupabaseClient<Database> {
  if (client) return client;

  const config = readPublicConfig();
  if (!config) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }

  client = createClient<Database>(config.url, config.anonKey);
  return client;
}
