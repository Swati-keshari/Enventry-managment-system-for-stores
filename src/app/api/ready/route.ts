import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const startTime = Date.now();

export async function GET() {
  const checks: Record<string, string> = {};

  // Check Supabase Postgres
  try {
    const supabaseUrl =
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey =
      process.env.SUPABASE_SECRET_KEY ||
      process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Supabase URL/key not configured");
    }
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error } = await supabase
      .from("warehouses")
      .select("warehouse_id")
      .limit(1);
    checks.db = error ? `error: ${error.message}` : "ok";
  } catch (err) {
    checks.db = `error: ${err instanceof Error ? err.message : "unknown"}`;
  }

  // OAuth is connected per warehouse; readiness verifies the server-side
  // client configuration without exposing any stored refresh token.
  checks.drive =
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    process.env.DRIVE_ROOT_FOLDER_ID
      ? "oauth_ready"
      : "not_configured";
  checks.google_client_id = process.env.GOOGLE_CLIENT_ID ?? "missing";
  checks.app_url = process.env.NEXT_PUBLIC_APP_URL ?? "missing";

  const allOk = Object.values(checks).every(
    (value) =>
      value === "ok" || value === "oauth_ready" || value === "not_configured",
  );

  return NextResponse.json(
    {
      status: allOk ? "ready" : "not_ready",
      ...checks,
      uptime: Math.floor((Date.now() - startTime) / 1000),
    },
    { status: allOk ? 200 : 503 },
  );
}
