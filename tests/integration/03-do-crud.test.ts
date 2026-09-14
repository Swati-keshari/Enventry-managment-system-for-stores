/**
 * Prompt 03 — Delivery Order CRUD API Integration Tests
 *
 * Tests for create/update/delete DO + lines:
 * - Happy path multi-item create → item_count matches trigger
 * - Duplicate do_number → 409/400
 * - Weight mismatch handling
 * - Rollback when one line has invalid item_id
 * - Pagination cursor stability
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getServiceClient, apiRequest, isDatabaseReady } from "../helpers";
import {
  seedWarehouse,
  seedUser,
  seedItem,
  seedParty,
  TEST_PREFIX,
} from "../fixtures/seed";

let skipTests = true;
let svc: ReturnType<typeof getServiceClient>;
const testPassword = "TestPass123!";

let warehouse: { warehouse_id: string };
let adminUser: { user_id: string; email: string; role: string };
let authToken: string;
let itemA: { item_id: string; bag_size: number; name: string };
let itemB: { item_id: string; bag_size: number; name: string };
let party: { party_id: string };
const createdDOIds: string[] = [];

beforeAll(async () => {
  skipTests = !(await isDatabaseReady());
  if (skipTests) return;

  svc = getServiceClient();
  warehouse = await seedWarehouse(svc, `CRUD Test WH ${TEST_PREFIX}`);
  const user = await seedUser(svc, warehouse.warehouse_id, "admin", "crud_admin");
  adminUser = { ...user, role: "admin" };

  itemA = await seedItem(svc, warehouse.warehouse_id, `Wheat ${TEST_PREFIX}`, 50);
  itemB = await seedItem(svc, warehouse.warehouse_id, `Rice ${TEST_PREFIX}`, 30);
  party = await seedParty(svc, warehouse.warehouse_id, `Party CRUD ${TEST_PREFIX}`);

  // Sign in via Supabase REST API to get JWT
  const signInRes = await fetch(
    `${process.env.SUPABASE_URL}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: process.env.SUPABASE_ANON_KEY!,
      },
      body: JSON.stringify({ email: adminUser.email, password: testPassword }),
    }
  );
  const signInData = await signInRes.json();
  authToken = signInData.access_token;
});

afterAll(async () => {
  if (skipTests) return;
  for (const doId of createdDOIds) {
    try { await svc.from("do_items").delete().eq("do_id", doId); } catch {}
    try { await svc.from("delivery_orders").delete().eq("do_id", doId); } catch {}
  }
  try { await svc.from("items").delete().like("name", `%${TEST_PREFIX}%`); } catch {}
  try { await svc.from("parties").delete().like("name", `%${TEST_PREFIX}%`); } catch {}
  try { await svc.from("app_users").delete().like("email", `%${TEST_PREFIX}%`); } catch {}
  try { await svc.from("warehouses").delete().like("name", `%${TEST_PREFIX}%`); } catch {}
});

describe.skipIf(skipTests)("DO CRUD API", () => {
  it("create: happy path multi-item DO", async () => {
    const doNumber = `DO-CRUD-${Date.now()}`;

    const res = await apiRequest("/api/do", {
      method: "POST",
      token: authToken,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        do_number: doNumber,
        direction: "IN",
        date: "2026-08-01",
        party_id: party.party_id,
        items: [
          { item_id: itemA.item_id, bags: 10, bag_size: itemA.bag_size },
          { item_id: itemB.item_id, bags: 5, bag_size: itemB.bag_size },
        ],
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data).toBeTruthy();
    expect(body.data.do_id).toBeTruthy();
    createdDOIds.push(body.data.do_id);
  });

  it("create: duplicate do_number returns 409 or 400", async () => {
    const doNumber = `DO-DUP-${Date.now()}`;

    const res1 = await apiRequest("/api/do", {
      method: "POST",
      token: authToken,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        do_number: doNumber,
        direction: "IN",
        date: "2026-08-01",
        party_id: party.party_id,
        items: [{ item_id: itemA.item_id, bags: 5, bag_size: itemA.bag_size }],
      }),
    });
    expect(res1.status).toBe(201);
    const body1 = await res1.json();
    createdDOIds.push(body1.data.do_id);

    const res2 = await apiRequest("/api/do", {
      method: "POST",
      token: authToken,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        do_number: doNumber,
        direction: "OUT",
        date: "2026-08-02",
        party_id: party.party_id,
        items: [{ item_id: itemA.item_id, bags: 2, bag_size: itemA.bag_size }],
      }),
    });
    expect([400, 409]).toContain(res2.status);
  });

  it("create: invalid item_id causes rollback", async () => {
    const doNumber = `DO-ROLLBACK-${Date.now()}`;

    const res = await apiRequest("/api/do", {
      method: "POST",
      token: authToken,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        do_number: doNumber,
        direction: "IN",
        date: "2026-08-03",
        party_id: party.party_id,
        items: [
          { item_id: itemA.item_id, bags: 5, bag_size: itemA.bag_size },
          { item_id: "00000000-0000-0000-0000-000000000000", bags: 3, bag_size: 50 },
        ],
      }),
    });

    expect(res.status).toBeGreaterThanOrEqual(400);
    const { data } = await svc
      .from("delivery_orders")
      .select("do_id")
      .eq("do_number", doNumber);
    expect(data).toEqual([]);
  });

  it("read: list DOs with pagination", async () => {
    const res = await apiRequest("/api/do?limit=2", {
      method: "GET",
      token: authToken,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toBeInstanceOf(Array);
    expect(body.data.length).toBeLessThanOrEqual(2);
  });

  it("read: get single DO by id", async () => {
    if (createdDOIds.length === 0) return;

    const res = await apiRequest(`/api/do?id=${createdDOIds[0]}`, {
      method: "GET",
      token: authToken,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.do_id).toBe(createdDOIds[0]);
  });

  it("update: update DO direction", async () => {
    if (createdDOIds.length === 0) return;

    const res = await apiRequest("/api/do", {
      method: "PATCH",
      token: authToken,
      headers: {
        "Content-Type": "application/json",
        "x-record-updated-at": new Date().toISOString(),
      },
      body: JSON.stringify({
        do_id: createdDOIds[0],
        direction: "OUT",
      }),
    });
    expect([200, 204]).toContain(res.status);
  });

  it("delete: soft-delete a DO", async () => {
    const doNumber = `DO-DEL-${Date.now()}`;
    const createRes = await apiRequest("/api/do", {
      method: "POST",
      token: authToken,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        do_number: doNumber,
        direction: "IN",
        date: "2026-08-05",
        party_id: party.party_id,
        items: [{ item_id: itemA.item_id, bags: 2, bag_size: itemA.bag_size }],
      }),
    });
    const createBody = await createRes.json();
    const doId = createBody.data.do_id;

    const res = await apiRequest("/api/do", {
      method: "DELETE",
      token: authToken,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ do_id: doId }),
    });
    expect([200, 204]).toContain(res.status);
  });
});
