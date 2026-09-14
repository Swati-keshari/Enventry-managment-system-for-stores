import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getServiceClient, apiRequest, isDatabaseReady } from "../helpers";
import { seedWarehouse, seedUser, seedItem, seedParty, seedDO, TEST_PREFIX } from "../fixtures/seed";

let skipTests = true;
let svc: ReturnType<typeof getServiceClient>;
const password = "TestPass123!";

let warehouse: { warehouse_id: string };
let adminUser: { user_id: string; email: string; password: string };
let authToken = "";
let item: { item_id: string };
let party: { party_id: string };
let doId: string;

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
  warehouse = await seedWarehouse(svc, `Drive WH ${TEST_PREFIX}`);
  const u = await seedUser(svc, warehouse.warehouse_id, "admin", "drive_admin");
  adminUser = { ...u, password };
  item = await seedItem(svc, warehouse.warehouse_id, `Drive Item ${TEST_PREFIX}`, 50);
  party = await seedParty(svc, warehouse.warehouse_id, `Drive Party ${TEST_PREFIX}`);
  const doData = await seedDO(svc, warehouse.warehouse_id, adminUser.user_id, party.party_id, "IN", "2026-08-01", `DO-DRIVE-${TEST_PREFIX}`, [{ itemId: item.item_id, bags: 1, bagSize: 50 }]);
  doId = doData.do_id;
  authToken = await getToken(adminUser.email, password);
});

afterAll(async () => {
  if (skipTests) return;
  try { await svc.from("files").delete().like("file_name", `%${TEST_PREFIX}%`); } catch {}
  try { await svc.from("do_items").delete().like("do_id", `%${TEST_PREFIX}%`); } catch {}
  try { await svc.from("delivery_orders").delete().like("do_number", `%${TEST_PREFIX}%`); } catch {}
  try { await svc.from("items").delete().like("name", `%${TEST_PREFIX}%`); } catch {}
  try { await svc.from("parties").delete().like("name", `%${TEST_PREFIX}%`); } catch {}
  try { await svc.from("app_users").delete().like("email", `%${TEST_PREFIX}%`); } catch {}
  try { await svc.from("warehouses").delete().like("name", `%${TEST_PREFIX}%`); } catch {}
});

describe.skipIf(skipTests)("Drive Upload (Mocked)", () => {
  it("upload endpoint exists and requires auth", async () => {
    const res = await apiRequest("/api/files", { method: "POST" });
    expect([401, 403, 405]).toContain(res.status);
  });

  it("upload endpoint rejects without file", async () => {
    const res = await apiRequest("/api/files", {
      method: "POST",
      token: authToken,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ do_id: doId, category: "document" }),
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("files endpoint requires auth for listing", async () => {
    const res = await apiRequest(`/api/files?do_id=${doId}`, { method: "GET" });
    expect([401, 403]).toContain(res.status);
  });

  it("files list returns array for authenticated user", async () => {
    const res = await apiRequest(`/api/files?do_id=${doId}`, {
      method: "GET",
      token: authToken,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toBeInstanceOf(Array);
  });

  it("MIME type validation rejects non-allowed types", async () => {
    const fakeExe = new Blob(["fake executable content"], { type: "application/exe" });
    const formData = new FormData();
    formData.append("file", fakeExe, `malware-${TEST_PREFIX}.exe`);
    formData.append("do_id", doId);
    formData.append("category", "document");

    const res = await fetch(`${process.env.BASE_URL || "http://localhost:3000"}/api/files`, {
      method: "POST",
      headers: { Authorization: `Bearer ${authToken}` },
      body: formData,
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it("empty file is rejected", async () => {
    const emptyFile = new Blob([], { type: "application/pdf" });
    const formData = new FormData();
    formData.append("file", emptyFile, `empty-${TEST_PREFIX}.pdf`);
    formData.append("do_id", doId);
    formData.append("category", "document");

    const res = await fetch(`${process.env.BASE_URL || "http://localhost:3000"}/api/files`, {
      method: "POST",
      headers: { Authorization: `Bearer ${authToken}` },
      body: formData,
    });
    expect(res.status).toBe(400);
  });

  it("delete endpoint requires auth", async () => {
    const res = await apiRequest("/api/files", { method: "DELETE" });
    expect([401, 403, 405]).toContain(res.status);
  });

  it("delete non-existent file returns error", async () => {
    const res = await apiRequest("/api/files", {
      method: "DELETE",
      token: authToken,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_id: "00000000-0000-0000-0000-000000000000" }),
    });
    expect([400, 404]).toContain(res.status);
  });
});
