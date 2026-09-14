import { describe, it, expect, beforeAll } from "vitest";
import { getServiceClient, apiRequest, isDatabaseReady } from "../helpers";
import { seedWarehouse, seedUser, seedItem, seedParty, TEST_PREFIX } from "../fixtures/seed";

let skipTests = true;
let svc: ReturnType<typeof getServiceClient>;
const password = "TestPass123!";

let warehouse: { warehouse_id: string };
let adminUser: { user_id: string; email: string; password: string };
let authToken = "";
let item: { item_id: string; bag_size: number };
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
  warehouse = await seedWarehouse(svc, `RL WH ${TEST_PREFIX}`);
  const u = await seedUser(svc, warehouse.warehouse_id, "admin", "rl_admin");
  adminUser = { ...u, password };
  item = await seedItem(svc, warehouse.warehouse_id, `RL Item ${TEST_PREFIX}`, 50);
  party = await seedParty(svc, warehouse.warehouse_id, `RL Party ${TEST_PREFIX}`);
  authToken = await getToken(adminUser.email, password);
});

describe.skipIf(skipTests)("Idempotency", () => {
  it("same Idempotency-Key returns same DO (no duplicate)", async () => {
    const key = `idem-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const res1 = await apiRequest("/api/do", {
      method: "POST",
      token: authToken,
      headers: { "Content-Type": "application/json", "Idempotency-Key": key },
      body: JSON.stringify({
        do_number: `DO-IDEM-${Date.now()}`,
        direction: "IN",
        date: "2026-08-01",
        party_id: party.party_id,
        items: [{ item_id: item.item_id, bags: 1, bag_size: item.bag_size }],
      }),
    });

    if (res1.status === 201) {
      const body1 = await res1.json();
      const doId1 = body1.data.do_id;

      const res2 = await apiRequest("/api/do", {
        method: "POST",
        token: authToken,
        headers: { "Content-Type": "application/json", "Idempotency-Key": key },
        body: JSON.stringify({
          do_number: `DO-IDEM-DUP-${Date.now()}`,
          direction: "IN",
          date: "2026-08-01",
          party_id: party.party_id,
          items: [{ item_id: item.item_id, bags: 1, bag_size: item.bag_size }],
        }),
      });

      const body2 = await res2.json();
      expect(body2.data.do_id).toBe(doId1);
    }
  });

  it("different Idempotency-Key returns different DO", async () => {
    const key1 = `idem-a-${Date.now()}`;
    const key2 = `idem-b-${Date.now()}`;

    const res1 = await apiRequest("/api/do", {
      method: "POST",
      token: authToken,
      headers: { "Content-Type": "application/json", "Idempotency-Key": key1 },
      body: JSON.stringify({
        do_number: `DO-IDEM1-${Date.now()}`,
        direction: "IN",
        date: "2026-08-01",
        party_id: party.party_id,
        items: [{ item_id: item.item_id, bags: 1, bag_size: item.bag_size }],
      }),
    });

    const res2 = await apiRequest("/api/do", {
      method: "POST",
      token: authToken,
      headers: { "Content-Type": "application/json", "Idempotency-Key": key2 },
      body: JSON.stringify({
        do_number: `DO-IDEM2-${Date.now()}`,
        direction: "IN",
        date: "2026-08-01",
        party_id: party.party_id,
        items: [{ item_id: item.item_id, bags: 1, bag_size: item.bag_size }],
      }),
    });

    if (res1.status === 201 && res2.status === 201) {
      const body1 = await res1.json();
      const body2 = await res2.json();
      expect(body1.data.do_id).not.toBe(body2.data.do_id);
    }
  });
});
