import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

const supabaseUrl =
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "";

const supabaseAnonKey =
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "";

const supabaseServiceKey =
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  "";

function requireEnv(value: string, name: string): string {
  if (!value) {
    throw new Error(`Missing required env var for Supabase: ${name}`);
  }
  return value;
}

/**
 * Browser/client Supabase client.
 * Uses anon (publishable) key — safe for client bundles.
 * RLS policies enforce warehouse isolation automatically.
 */
export function createBrowserClient() {
  return createClient<Database>(
    requireEnv(supabaseUrl, "SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv(supabaseAnonKey, "SUPABASE_PUBLISHABLE_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  );
}

/**
 * Extract Bearer token from Authorization header (preferred)
 * or from Supabase auth cookies as a fallback.
 */
function extractAccessToken(request: Request): string | null {
  const authHeader = request.headers.get("authorization");
  if (authHeader?.toLowerCase().startsWith("bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token) return token;
  }

  // Fallback: parse sb-*-auth-token cookie if present
  const cookieHeader = request.headers.get("cookie") ?? "";
  const match = cookieHeader.match(/sb-[^=]+-auth-token=([^;]+)/);
  if (match?.[1]) {
    try {
      const raw = decodeURIComponent(match[1]);
      const parsed = JSON.parse(raw) as { access_token?: string } | string;
      if (typeof parsed === "string") return parsed;
      if (parsed?.access_token) return parsed.access_token;
    } catch {
      // ignore malformed cookies
    }
  }

  return null;
}

/**
 * Server-side Supabase client with user session (for Route Handlers).
 * Attaches the JWT from Authorization: Bearer so auth.uid() + RLS work.
 */
export function createServerClient(request: Request) {
  const token = extractAccessToken(request);

  return createClient<Database>(
    requireEnv(supabaseUrl, "SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv(supabaseAnonKey, "SUPABASE_PUBLISHABLE_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      global: {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      },
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}

/**
 * Server-side Supabase client with SERVICE ROLE key.
 * Bypasses RLS — use ONLY for admin operations that require it
 * (e.g., inserting app_users on invite, managing auth users).
 * NEVER expose this to the browser.
 */
export function createServiceClient() {
  return createClient<Database>(
    requireEnv(supabaseUrl, "SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv(supabaseServiceKey, "SUPABASE_SECRET_KEY / SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
