import { describe, expect, it } from "vitest";
import {
  isSuperAdminEmail,
  normalizeEmail,
  SUPER_ADMIN_EMAILS,
} from "../../src/lib/super-admin";

describe("super-admin allowlist", () => {
  it("includes Swati's approved emails", () => {
    expect(SUPER_ADMIN_EMAILS).toHaveLength(2);
    expect(SUPER_ADMIN_EMAILS).toEqual([
      "keshariswati511@gmail.com",
      "swatikeshari511@gmail.com",
    ]);
  });

  it("normalizes email casing and whitespace", () => {
    expect(normalizeEmail("  Keshariswati511@Gmail.COM ")).toBe(
      "keshariswati511@gmail.com",
    );
  });

  it("allows only allowlisted emails", () => {
    expect(isSuperAdminEmail("keshariswati511@gmail.com")).toBe(true);
    expect(isSuperAdminEmail("swatikeshari511@gmail.com")).toBe(true);
    expect(isSuperAdminEmail("SWATIKESHARI511@GMAIL.COM")).toBe(true);
    expect(isSuperAdminEmail("outsider@example.com")).toBe(false);
    expect(isSuperAdminEmail("")).toBe(false);
    expect(isSuperAdminEmail(null)).toBe(false);
    expect(isSuperAdminEmail(undefined)).toBe(false);
  });

  it("rejects close lookalikes", () => {
    expect(isSuperAdminEmail("keshariswati511@gmiail.com")).toBe(false);
    expect(isSuperAdminEmail("swatikeshari511@gmiail.com")).toBe(false);
  });
});
