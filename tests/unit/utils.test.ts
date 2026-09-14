import { describe, it, expect } from "vitest";
import { formatWeight, formatDate, todayStr, last7DaysRange, directionLabel, createEmptyItem } from "../../src/lib/utils";

describe("formatWeight", () => {
  it("formats values under 1000 without suffix", () => {
    expect(formatWeight(50)).toBe("50");
    expect(formatWeight(0)).toBe("0");
    expect(formatWeight(999)).toBe("999");
  });
  it("formats tons for values >= 1000", () => {
    expect(formatWeight(1000)).toBe("1.0 t");
    expect(formatWeight(1500)).toBe("1.5 t");
    expect(formatWeight(2250)).toBe("2.3 t");
  });
});

describe("formatDate", () => {
  it("formats date in Indian locale", () => {
    const result = formatDate("2026-08-01");
    expect(result).toContain("01");
    expect(result).toContain("08");
    expect(result).toContain("2026");
  });
});

describe("todayStr", () => {
  it("returns YYYY-MM-DD format", () => {
    expect(todayStr()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("last7DaysRange", () => {
  it("returns 7-day range", () => {
    const range = last7DaysRange();
    expect(range.from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(range.to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const diff = new Date(range.to).getTime() - new Date(range.from).getTime();
    expect(diff).toBe(7 * 86400000);
  });
});

describe("directionLabel", () => {
  it("returns English labels", () => {
    expect(directionLabel("IN")).toBe("IN — Inward");
    expect(directionLabel("OUT")).toBe("OUT — Outward");
  });
});

describe("createEmptyItem", () => {
  it("returns item with required fields", () => {
    const item = createEmptyItem();
    expect(item.id).toBeTruthy();
    expect(item.rstNo).toBe("");
    expect(item.itemName).toBe("");
    expect(item.noOfBags).toBe(0);
    expect(item.weight).toBe(0);
  });
  it("generates unique IDs", () => {
    expect(createEmptyItem().id).not.toBe(createEmptyItem().id);
  });
});
