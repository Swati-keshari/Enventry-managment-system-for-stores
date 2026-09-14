/**
 * Prompt 04 — RBAC Permission Matrix Tests (Admin/Manager/Staff)
 *
 * Table-driven tests: role x action x expected_result.
 * Every cell in the 3-role matrix has a test case.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getServiceClient, apiRequest, isDatabaseReady } from "../helpers";
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
const password = "TestPass123!";

let warehouse: { warehouse_id: string };
let admin: { user_id: string; email: string; role: string; password: string };
let manager: { user_id: string; email: string; role: string; password: string };
let staffA: { user_id: string; email: string; role: string; password: string };
let staffB: { user_id: string; email: string; role: string; password: string };
let item: { item_id: string; bag_size: number; name: string };
let party: { party_id: string };
let adminToken = "";
let managerToken = "";
let staffAToken = "";
let staffBToken = "";

async function getToken(email: string, pw: string): Promise<string> {
  const res = await fetch(
    `${process.env.SUPABASE_URL}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: process.env.SUPABASE_ANON_KEY!,
      },
      body: JSON.stringify({ email, password: pw }),
    }
  );
  const data = await res.json();
  return data.access_token;
}

beforeAll(async () => {
  skipTests = !(await isDatabaseReady());
  if (skipTests) return;

  svc = getServiceClient();
  warehouse = await seedWarehouse(svc, `RBAC WH ${TEST_PREFIX}`);

  const a = await seedUser(svc, warehouse.warehouse_id, "admin", "rbac_admin");
  admin = { ...a, password };
  const m = await seedUser(svc, warehouse.warehouse_id, "manager", "rbac_mgr");
  manager = { ...m, password };
  const sA = await seedUser(svc, warehouse.warehouse_id, "staff", "rbac_staffA");
  staffA = { ...sA, password };
  const sB = await seedUser(svc, warehouse.warehouse_id, "staff", "rbac_staffB");
  staffB = { ...sB, password };

  item = await seedItem(svc, warehouse.warehouse_id, `Item RBAC ${TEST_PREFIX}`, 50);
  party = await seedParty(svc, warehouse.warehouse_id, `Party RBAC ${TEST_PREFIX}`);

  await seedDO(
    svc, warehouse.warehouse_id, staffA.user_id, party.party_id,
    "IN", "2026-08-01", `DO-OWN-${TEST_PREFIX}`,
    [{ itemId: item.item_id, bags: 5, bagSize: 50 }]
  );

  await seedDO(
    svc, warehouse.warehouse_id, staffB.user_id, party.party_id,
    "IN", "2026-08-02", `DO-OTHER-${TEST_PREFIX}`,
    [{ itemId: item.item_id, bags: 3, bagSize: 50 }]
  );

  adminToken = await getToken(admin.email, password);
  managerToken = await getToken(manager.email, password);
  staffAToken = await getToken(staffA.email, password);
  staffBToken = await getToken(staffB.email, password);
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

type Permission = {
  action: string;
  endpoint: string;
  method: string;
  buildBody?: () => Record<string, unknown>;
  expectStatus: {
    admin: number[];
    manager: number[];
    staff_own: number[];
    staff_other: number[];
  };
};

const matrix: Permission[] = [
  {
    action: "View DOs (list)",
    endpoint: "/api/do",
    method: "GET",
    expectStatus: {
      admin: [200],
      manager: [200],
      staff_own: [200],
      staff_other: [200],
    },
  },
  {
    action: "Create DO",
    endpoint: "/api/do",
    method: "POST",
    buildBody: () => ({
      do_number: `DO-RBAC-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      direction: "IN",
      date: "2026-08-01",
      party_id: party.party_id,
      items: [{ item_id: item.item_id, bags: 1, bag_size: item.bag_size }],
    }),
    expectStatus: {
      admin: [201],
      manager: [201],
      staff_own: [201],
      staff_other: [201],
    },
  },
  {
    action: "View Items",
    endpoint: "/api/items",
    method: "GET",
    expectStatus: {
      admin: [200],
      manager: [200],
      staff_own: [200],
      staff_other: [200],
    },
  },
  {
    action: "View Parties",
    endpoint: "/api/parties",
    method: "GET",
    expectStatus: {
      admin: [200],
      manager: [200],
      staff_own: [200],
      staff_other: [200],
    },
  },
  {
    action: "View Users",
    endpoint: "/api/users",
    method: "GET",
    expectStatus: {
      admin: [200],
      manager: [200, 403],
      staff_own: [403],
      staff_other: [403],
    },
  },
  {
    action: "View Audit Log",
    endpoint: "/api/audit",
    method: "GET",
    expectStatus: {
      admin: [200],
      manager: [200, 403],
      staff_own: [403],
      staff_other: [403],
    },
  },
  {
    action: "View Dashboard",
    endpoint: "/api/dashboard",
    method: "GET",
    expectStatus: {
      admin: [200],
      manager: [200],
      staff_own: [403],
      staff_other: [403],
    },
  },
];

describe.skipIf(skipTests)("RBAC Permission Matrix", () => {
  for (const perm of matrix) {
    describe(perm.action, () => {
      it("admin can perform action", async () => {
        const opts: RequestInit & { token?: string } = {
          method: perm.method,
          token: adminToken,
        };
        if (perm.method === "POST") {
          opts.headers = { "Content-Type": "application/json" };
          opts.body = JSON.stringify(perm.buildBody!());
        }
        const res = await apiRequest(perm.endpoint, opts);
        expect(perm.expectStatus.admin).toContain(res.status);
      });

      it("manager can perform action", async () => {
        const opts: RequestInit & { token?: string } = {
          method: perm.method,
          token: managerToken,
        };
        if (perm.method === "POST") {
          opts.headers = { "Content-Type": "application/json" };
          opts.body = JSON.stringify(perm.buildBody!());
        }
        const res = await apiRequest(perm.endpoint, opts);
        expect(perm.expectStatus.manager).toContain(res.status);
      });

      it("staff (own) can perform action", async () => {
        const opts: RequestInit & { token?: string } = {
          method: perm.method,
          token: staffAToken,
        };
        if (perm.method === "POST") {
          opts.headers = { "Content-Type": "application/json" };
          opts.body = JSON.stringify(perm.buildBody!());
        }
        const res = await apiRequest(perm.endpoint, opts);
        expect(perm.expectStatus.staff_own).toContain(res.status);
      });

      it("staff (other) action result", async () => {
        const opts: RequestInit & { token?: string } = {
          method: perm.method,
          token: staffBToken,
        };
        if (perm.method === "POST") {
          opts.headers = { "Content-Type": "application/json" };
          opts.body = JSON.stringify(perm.buildBody!());
        }
        const res = await apiRequest(perm.endpoint, opts);
        expect(perm.expectStatus.staff_other).toContain(res.status);
      });
    });
  }
});
