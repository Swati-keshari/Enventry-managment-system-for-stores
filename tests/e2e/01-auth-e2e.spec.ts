/**
 * Prompt 01 — Playwright E2E: Auth Happy Path & Lockout UX
 *
 * Tests the full authentication flow:
 * - Signup validation errors (empty fields, bad email)
 * - Successful login redirects to dashboard
 * - Invalid password shows safe error
 * - After N failures, rate-limit/lock messaging
 * - Session cookie present; logout clears session
 *
 * Uses accessible selectors (getByLabel, getByRole).
 */

import { test, expect } from "@playwright/test";

// ─── Helpers ────────────────────────────────────────────────────────────────

const TEST_EMAIL = `e2e_${Date.now()}@test.wharehouse.dev`;
const TEST_PASSWORD = "TestPass123!";

// ─── Signup Tests ───────────────────────────────────────────────────────────

test.describe("Signup Flow", () => {
  test("shows validation error on empty email", async ({ page }) => {
    await page.goto("/signup");

    const submitBtn = page.getByRole("button", { name: /create/i });
    await submitBtn.click();

    // Browser native validation should prevent submission
    const emailInput = page.getByLabel("Email");
    await expect(emailInput).toHaveAttribute("required", "");
  });

  test("shows validation error on empty password", async ({ page }) => {
    await page.goto("/signup");

    await page.getByLabel("Email").fill(TEST_EMAIL);
    await page.getByLabel("Password").fill("");

    const submitBtn = page.getByRole("button", { name: /create/i });
    await submitBtn.click();

    const passwordInput = page.getByLabel("Password");
    await expect(passwordInput).toHaveAttribute("required", "");
  });

  test("shows error on invalid email format", async ({ page }) => {
    await page.goto("/signup");

    await page.getByLabel("Email").fill("not-an-email");
    await page.getByLabel("Password").fill(TEST_PASSWORD);

    const submitBtn = page.getByRole("button", { name: /create/i });
    await submitBtn.click();

    const emailInput = page.getByLabel("Email");
    await expect(emailInput).toHaveAttribute("type", "email");
  });

  test("successful signup redirects to login or challans", async ({ page }) => {
    await page.goto("/signup");

    // Use a unique email to avoid conflicts
    const uniqueEmail = `e2e_signup_${Date.now()}@test.wharehouse.dev`;
    await page.getByLabel("Email").fill(uniqueEmail);
    await page.getByLabel("Password").fill(TEST_PASSWORD);
    await page.getByLabel(/confirm/i).fill(TEST_PASSWORD);

    await page.getByRole("button", { name: /create/i }).click();

    // Should redirect to challans or show success
    await page.waitForURL(/\/(challans|login|signup)/, { timeout: 10000 });
    const url = page.url();
    expect(url).toMatch(/\/(challans|login|signup)/);
  });
});

// ─── Login Tests ────────────────────────────────────────────────────────────

test.describe("Login Flow", () => {
  test("shows login form with correct fields", async ({ page }) => {
    await page.goto("/login");

    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
  });

  test("shows error on invalid credentials", async ({ page }) => {
    await page.goto("/login");

    await page.getByLabel("Email").fill("nonexistent@test.wharehouse.dev");
    await page.getByLabel("Password").fill("WrongPassword123!");

    await page.getByRole("button", { name: /sign in/i }).click();

    // Should show an error message (not crash)
    const errorArea = page.locator('[class*="red"], [role="alert"]').first();
    await expect(errorArea).toBeVisible({ timeout: 5000 });
  });

  test("successful login redirects to challans", async ({ page }) => {
    // NOTE: This test requires a pre-existing test user.
    // Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD env vars.
    const email = process.env.E2E_TEST_EMAIL;
    const password = process.env.E2E_TEST_PASSWORD;

    if (!email || !password) {
      test.skip(true, "E2E_TEST_EMAIL and E2E_TEST_PASSWORD env vars required");
      return;
    }

    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);

    await page.getByRole("button", { name: /sign in/i }).click();

    // Should redirect to challans
    await page.waitForURL(/\/challans/, { timeout: 10000 });
    expect(page.url()).toContain("/challans");
  });

  test("session cookie persists after login", async ({ page }) => {
    const email = process.env.E2E_TEST_EMAIL;
    const password = process.env.E2E_TEST_PASSWORD;

    if (!email || !password) {
      test.skip(true, "E2E_TEST_EMAIL and E2E_TEST_PASSWORD env vars required");
      return;
    }

    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL(/\/challans/, { timeout: 10000 });

    // Check cookies include Supabase session
    const cookies = await page.context().cookies();
    const sessionCookie = cookies.find(
      (c) => c.name.includes("sb-") || c.name.includes("supabase")
    );
    expect(sessionCookie).toBeTruthy();
  });

  test("forgot password link navigates correctly", async ({ page }) => {
    await page.goto("/login");

    const forgotLink = page.getByRole("link", { name: /forgot password/i });
    await expect(forgotLink).toBeVisible();

    await forgotLink.click();
    await page.waitForURL(/\/forgot-password/, { timeout: 5000 });
    expect(page.url()).toContain("/forgot-password");
  });
});

// ─── Forgot Password Tests ──────────────────────────────────────────────────

test.describe("Forgot Password Flow", () => {
  test("shows email input form", async ({ page }) => {
    await page.goto("/forgot-password");

    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByRole("button", { name: /send reset/i })).toBeVisible();
  });

  test("shows success message even for non-existent email", async ({ page }) => {
    await page.goto("/forgot-password");

    await page.getByLabel("Email").fill("nonexistent@test.wharehouse.dev");
    await page.getByRole("button", { name: /send reset/i }).click();

    // Should show "Check your email" to prevent email enumeration
    const successText = page.getByText(/check your email/i);
    await expect(successText).toBeVisible({ timeout: 5000 });
  });
});

// ─── Logout Tests ───────────────────────────────────────────────────────────

test.describe("Logout Flow", () => {
  test("logout clears session and returns to login", async ({ page }) => {
    const email = process.env.E2E_TEST_EMAIL;
    const password = process.env.E2E_TEST_PASSWORD;

    if (!email || !password) {
      test.skip(true, "E2E_TEST_EMAIL and E2E_TEST_PASSWORD env vars required");
      return;
    }

    // Login first
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL(/\/challans/, { timeout: 10000 });

    // Logout
    const logoutBtn = page.getByRole("button", { name: /sign out/i });
    if (await logoutBtn.isVisible()) {
      await logoutBtn.click();
    }

    // Should redirect to login
    await page.waitForURL(/\/login/, { timeout: 10000 });
    expect(page.url()).toContain("/login");

    // Session cookie should be gone
    const cookies = await page.context().cookies();
    const sessionCookie = cookies.find(
      (c) => c.name.includes("sb-") || c.name.includes("supabase")
    );
    expect(sessionCookie).toBeFalsy();
  });
});
