/**
 * Test Setup — Vitest global setup.
 *
 * Loads environment variables from .env for test runners.
 */
import { config } from "dotenv";
import path from "path";
import { beforeAll } from "vitest";

// Load .env from project root
config({ path: path.resolve(__dirname, "../.env") });

// Also load test-specific env if it exists
config({ path: path.resolve(__dirname, "../.env.test"), override: true });

beforeAll(() => {
  const required = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"];
  for (const key of required) {
    if (!process.env[key]) {
      console.warn(`Missing env var: ${key} — some tests may be skipped`);
    }
  }
});
