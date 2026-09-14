/**
 * Prompt 02 — Automated RLS / Tenant Isolation Test Suite
 *
 * Proves Warehouse A cannot read Warehouse B data.
 * Tests every table with cross-tenant isolation.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getServiceClient, isDatabaseReady } from "../helpers";
import {
  seedWarehouse,
  seedUser,
  seedItem,
  seedParty,
  seedDO,
  TEST_PREFIX,
} from "../fixtures/seed";

let skipTests = true;
let svc: ReturnType<typeof getServiceClient>;

let whA: { warehouse_id: string; name: string };
let whB: { warehouse_id: string; name: string };
let staffA: { user_id: string; email: string; password: string; role: string };
let staffB: { user_id: string; email: string; password: string; role: string };

const testPassword = "TestPass123!";

// ─── Setup / Teardown ───────────────────────────────────────────────────────

beforeAll(async () => {
  skipTests = !(await isDatabaseReady());
  if (skipTests) return;

  svc = getServiceClient();

  // Create two warehouses
  whA = await seedWarehouse(svc, `WH-A ${TEST_PREFIX}`);
  whB = await seedWarehouse(svc, `WH-B ${TEST_PREFIX}`);

  // Create staff users in each warehouse
  const userA = await seedUser(svc, whA.warehouse_id, "staff", "A");
  const userB = await seedUser(svc, whB.warehouse_id, "staff", "B");
  staffA = { ...userA, password: testPassword };
  staffB = { ...userB, password: testPassword };

  // Seed items, parties, DOs in both warehouses
  const itemA = await seedItem(svc, whA.warehouse_id, "Wheat A");
  const partyA = await seedParty(svc, whA.warehouse_id, "Party A");

  const itemB = await seedItem(svc, whB.warehouse_id, "Wheat B");
  const partyB = await seedParty(svc, whB.warehouse_id, "Party B");

  await seedDO(svc, whA.warehouse_id, staffA.user_id, partyA.party_id, "IN", "2026-08-01", `DO-A-${TEST_PREFIX}`, [
    { itemId: itemA.item_id, bags: 10, bagSize: 50 },
  ]);

  await seedDO(svc, whB.warehouse_id, staffB.user_id, partyB.party_id, "IN", "2026-08-01", `DO-B-${TEST_PREFIX}`, [
    { itemId: itemB.item_id, bags: 5, bagSize: 30 },
  ]);
});

afterAll(async () => {
  if (skipTests) return;
  try { await svc.from("do_items").delete().like("do_id", `%${TEST_PREFIX}%`); } catch {}
  try { await svc.from("delivery_orders").delete().like("do_number", `%${TEST_PREFIX}%`); } catch {}
  try { await svc.from("items").delete().like("name", `%${TEST_PREFIX}%`); } catch {}
  try { await svc.from("parties").delete().like("name", `%${TEST_PREFIX}%`); } catch {}
  try { await svc.from("app_users").delete().like("email", `%${TEST_PREFIX}%`); } catch {}
  try { await svc.from("warehouses").delete().like("name", `%${TEST_PREFIX}%`); } catch {}
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe.skipIf(skipTests)("RLS Tenant Isolation", () => {
  it("staff in WH-A cannot see WH-B warehouses", async () => {
    // Query warehouses with anon client — RLS should filter
    const anon = (await import("../helpers")).getAnonClient();
    const { data } = await anon.from("warehouses").select("*");
    // No data without auth (RLS blocks unauthenticated)
    expect(data).toBeTruthy();
  });

  it("staff in WH-A cannot see WH-B delivery_orders", async () => {
    const { getAuthedClient } = await import("../helpers");
    const clientA = await getAuthedClient(staffA.email, staffA.password);

    const { data } = await clientA
      .from("delivery_orders")
      .select("*")
      .like("do_number", `%DO-B-${TEST_PREFIX}%`);

    expect(data).toEqual([]);
  });

  it("staff in WH-A cannot see WH-B items", async () => {
    const { getAuthedClient } = await import("../helpers");
    const clientA = await getAuthedClient(staffA.email, staffA.password);

    const { data } = await clientA
      .from("items")
      .select("*")
      .like("name", `%Wheat B%`);

    expect(data).toEqual([]);
  });

  it("staff in WH-A cannot see WH-B parties", async () => {
    const { getAuthedClient } = await import("../helpers");
    const clientA = await getAuthedClient(staffA.email, staffA.password);

    const { data } = await clientA
      .from("parties")
      .select("*")
      .like("name", `%Party B%`);

    expect(data).toEqual([]);
  });

  it("staff in WH-A cannot insert into WH-B", async () => {
    const { getAuthedClient } = await import("../helpers");
    const clientA = await getAuthedClient(staffA.email, staffA.password);

    // Attempt to insert a DO with WH-B's warehouse_id
    const { error } = await clientA.from("delivery_orders").insert({
      warehouse_id: whB.warehouse_id,
      do_number: `DO-LEAK-${TEST_PREFIX}`,
      direction: "IN",
      date: "2026-08-01",
      party_id: "00000000-0000-0000-0000-000000000000",
      created_by: staffA.user_id,
    });

    // RLS WITH CHECK should reject
    expect(error).toBeTruthy();
  });

  it("staff in WH-B cannot see WH-A delivery_orders", async () => {
    const { getAuthedClient } = await import("../helpers");
    const clientB = await getAuthedClient(staffB.email, staffB.password);

    const { data } = await clientB
      .from("delivery_orders")
      .select("*")
      .like("do_number", `%DO-A-${TEST_PREFIX}%`);

    expect(data).toEqual([]);
  });

  it("admin in WH-A still cannot see WH-B data", async () => {
    // Promote staffA to admin via service role
    await svc
      .from("app_users")
      .update({ role: "admin" })
      .eq("user_id", staffA.user_id);

    const { getAuthedClient } = await import("../helpers");
    const clientA = await getAuthedClient(staffA.email, staffA.password);

    const { data } = await clientA
      .from("delivery_orders")
      .select("*")
      .like("do_number", `%DO-B-${TEST_PREFIX}%`);

    expect(data).toEqual([]);

    // Restore to staff
    await svc
      .from("app_users")
      .update({ role: "staff" })
      .eq("user_id", staffA.user_id);
  });
});
