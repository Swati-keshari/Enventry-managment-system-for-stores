import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getServiceClient, apiRequest, isDatabaseReady } from "../helpers";
import { seedWarehouse, seedUser, seedItem, seedParty, seedDO, TEST_PREFIX } from "../fixtures/seed";

let skipTests = true;
let svc: ReturnType<typeof getServiceClient>;
const password = "TestPass123!";

let warehouse: { warehouse_id: string };
let adminUser: { user_id: string; email: string; password: string };
let authToken = "";
let wheatItem: { item_id: string; bag_size: number; name: string };
let riceItem: { item_id: string; bag_size: number; name: string };
let party: { party_id: string };

async function getToken(email: string, pw: string): Promise<string> {
  const res = await fetch(`${process.env.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: process.env.SUPABASE_ANON_KEY! },
    body: JSON.stringify({ email, password: pw }),
  });
  return (await res.json()).access_token;
}

beforeAll(async () => {
  skipTests = !(await isDatabaseReady());
  if (skipTests) return;

  svc = getServiceClient();
  warehouse = await seedWarehouse(svc, `Dash WH ${TEST_PREFIX}`);
  const u = await seedUser(svc, warehouse.warehouse_id, "admin", "dash_admin");
  adminUser = { ...u, password };
  wheatItem = await seedItem(svc, warehouse.warehouse_id, `Wheat ${TEST_PREFIX}`, 50);
  riceItem = await seedItem(svc, warehouse.warehouse_id, `Rice ${TEST_PREFIX}`, 30);
  party = await seedParty(svc, warehouse.warehouse_id, `Party Dash ${TEST_PREFIX}`);

  // Seed golden fixture data
  await seedDO(svc, warehouse.warehouse_id, adminUser.user_id, party.party_id, "IN", "2026-08-01", `DO-100-${TEST_PREFIX}`, [{ itemId: wheatItem.item_id, bags: 10, bagSize: 50 }]);
  await seedDO(svc, warehouse.warehouse_id, adminUser.user_id, party.party_id, "IN", "2026-08-03", `DO-101-${TEST_PREFIX}`, [{ itemId: wheatItem.item_id, bags: 5, bagSize: 50 }]);
  await seedDO(svc, warehouse.warehouse_id, adminUser.user_id, party.party_id, "OUT", "2026-08-05", `DO-102-${TEST_PREFIX}`, [{ itemId: wheatItem.item_id, bags: 3, bagSize: 50 }]);
  await seedDO(svc, warehouse.warehouse_id, adminUser.user_id, party.party_id, "IN", "2026-08-02", `DO-103-${TEST_PREFIX}`, [{ itemId: riceItem.item_id, bags: 4, bagSize: 30 }]);
  await seedDO(svc, warehouse.warehouse_id, adminUser.user_id, party.party_id, "OUT", "2026-08-06", `DO-104-${TEST_PREFIX}`, [{ itemId: riceItem.item_id, bags: 2, bagSize: 30 }]);

  authToken = await getToken(adminUser.email, password);
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

describe.skipIf(skipTests)("Dashboard Aggregation Golden Fixtures", () => {
  it("date range 2026-08-01 to 2026-08-03: Wheat IN=750, OUT=0", async () => {
    const res = await apiRequest(`/api/dashboard?from=2026-08-01&to=2026-08-03`, { method: "GET", token: authToken });
    expect(res.status).toBe(200);
    const body = await res.json();
    const wheat = body.data?.find((r: { product: string }) => r.product.includes("Wheat"));
    if (wheat) {
      expect(wheat.total_in).toBe(750);
      expect(wheat.total_out).toBe(0);
      expect(wheat.remaining).toBe(600);
    }
  });

  it("date range 2026-08-01 to 2026-08-03: Rice IN=120, OUT=0", async () => {
    const res = await apiRequest(`/api/dashboard?from=2026-08-01&to=2026-08-03`, { method: "GET", token: authToken });
    const body = await res.json();
    const rice = body.data?.find((r: { product: string }) => r.product.includes("Rice"));
    if (rice) {
      expect(rice.total_in).toBe(120);
      expect(rice.total_out).toBe(0);
      expect(rice.remaining).toBe(60);
    }
  });

  it("date range 2026-08-05 to 2026-08-07: Wheat IN=0, OUT=150", async () => {
    const res = await apiRequest(`/api/dashboard?from=2026-08-05&to=2026-08-07`, { method: "GET", token: authToken });
    const body = await res.json();
    const wheat = body.data?.find((r: { product: string }) => r.product.includes("Wheat"));
    if (wheat) {
      expect(wheat.total_in).toBe(0);
      expect(wheat.total_out).toBe(150);
      expect(wheat.remaining).toBe(600);
    }
  });

  it("full range 2026-08-01 to 2026-08-07: Wheat IN=750, OUT=150", async () => {
    const res = await apiRequest(`/api/dashboard?from=2026-08-01&to=2026-08-07`, { method: "GET", token: authToken });
    const body = await res.json();
    const wheat = body.data?.find((r: { product: string }) => r.product.includes("Wheat"));
    if (wheat) {
      expect(wheat.total_in).toBe(750);
      expect(wheat.total_out).toBe(150);
      expect(wheat.remaining).toBe(600);
    }
  });

  it("full range: Rice IN=120, OUT=60", async () => {
    const res = await apiRequest(`/api/dashboard?from=2026-08-01&to=2026-08-07`, { method: "GET", token: authToken });
    const body = await res.json();
    const rice = body.data?.find((r: { product: string }) => r.product.includes("Rice"));
    if (rice) {
      expect(rice.total_in).toBe(120);
      expect(rice.total_out).toBe(60);
      expect(rice.remaining).toBe(60);
    }
  });

  it("empty warehouse returns empty array", async () => {
    const emptyWH = await seedWarehouse(svc, `Empty WH ${TEST_PREFIX}`);
    const u = await seedUser(svc, emptyWH.warehouse_id, "admin", "empty_admin");
    const emptyToken = await getToken(u.email, password);
    const res = await apiRequest(`/api/dashboard?from=2026-01-01&to=2026-12-31`, { method: "GET", token: emptyToken });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toBeInstanceOf(Array);
  });
});
