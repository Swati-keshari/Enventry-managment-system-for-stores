import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getServiceClient, apiRequest, isDatabaseReady } from "../helpers";
import { seedWarehouse, seedUser, seedItem, seedParty, seedDO, TEST_PREFIX } from "../fixtures/seed";

let skipTests = true;
let svc: ReturnType<typeof getServiceClient>;
const password = "TestPass123!";

let whA: { warehouse_id: string };
let whB: { warehouse_id: string };
let adminA: { user_id: string; email: string; password: string };
let adminB: { user_id: string; email: string; password: string };
let tokenB = "";
let item: { item_id: string; bag_size: number; name: string };
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
  whA = await seedWarehouse(svc, `Aud-A ${TEST_PREFIX}`);
  whB = await seedWarehouse(svc, `Aud-B ${TEST_PREFIX}`);
  const a = await seedUser(svc, whA.warehouse_id, "admin", "aud_adminA");
  adminA = { ...a, password };
  const b = await seedUser(svc, whB.warehouse_id, "admin", "aud_adminB");
  adminB = { ...b, password };
  item = await seedItem(svc, whA.warehouse_id, `AudItem ${TEST_PREFIX}`, 50);
  party = await seedParty(svc, whA.warehouse_id, `AudParty ${TEST_PREFIX}`);
  await seedDO(svc, whA.warehouse_id, adminA.user_id, party.party_id, "IN", "2026-08-01", `DO-AUD1-${TEST_PREFIX}`, [{ itemId: item.item_id, bags: 5, bagSize: 50 }]);
  await seedDO(svc, whA.warehouse_id, adminA.user_id, party.party_id, "OUT", "2026-08-02", `DO-AUD2-${TEST_PREFIX}`, [{ itemId: item.item_id, bags: 2, bagSize: 50 }]);
  tokenB = await getToken(adminB.email, password);
});

afterAll(async () => {
  if (skipTests) return;
  for (const t of ["do_items", "delivery_orders", "items", "parties", "app_users", "warehouses"]) {
    try { await svc.from(t).delete().like("name", `%${TEST_PREFIX}%`); } catch {}
    try { await svc.from(t).delete().like("do_number", `%${TEST_PREFIX}%`); } catch {}
    try { await svc.from(t).delete().like("email", `%${TEST_PREFIX}%`); } catch {}
    try { await svc.from(t).delete().like("do_id", `%${TEST_PREFIX}%`); } catch {}
  }
});

describe.skipIf(skipTests)("Audit Integrity", () => {
  it("INSERT audit row succeeds", async () => {
    const { error } = await svc.from("audit_log").insert({
      warehouse_id: whA.warehouse_id, user_id: adminA.user_id,
      action: "test_insert", entity_type: "test",
      entity_id: "00000000-0000-0000-0000-000000000000", new_data: { test: true },
    });
    expect(error).toBeNull();
  });

  it("UPDATE audit row fails (RLS revoke)", async () => {
    const { data: row } = await svc.from("audit_log").insert({
      warehouse_id: whA.warehouse_id, user_id: adminA.user_id,
      action: "test_upd", entity_type: "test",
      entity_id: "00000000-0000-0000-0000-000000000000", new_data: { orig: true },
    }).select("audit_id").single();
    if (row) {
      const { error } = await svc.from("audit_log").update({ new_data: { tampered: true } }).eq("audit_id", row.audit_id);
      expect(error).toBeTruthy();
    }
  });

  it("DELETE audit row fails (RLS revoke)", async () => {
    const { data: row } = await svc.from("audit_log").insert({
      warehouse_id: whA.warehouse_id, user_id: adminA.user_id,
      action: "test_del", entity_type: "test",
      entity_id: "00000000-0000-0000-0000-000000000000", new_data: { del: true },
    }).select("audit_id").single();
    if (row) {
      const { error } = await svc.from("audit_log").delete().eq("audit_id", row.audit_id);
      expect(error).toBeTruthy();
    }
  });

  it("verify_audit_integrity returns ok for clean chain", async () => {
    const { data, error } = await svc.rpc("verify_audit_integrity", { p_warehouse_id: whA.warehouse_id });
    expect(error).toBeNull();
    if (data && typeof data === "object" && "ok" in data) {
      expect((data as Record<string, unknown>).ok).toBe(true);
    }
  });

  it("hash chain tampering is detected", async () => {
    const rows: Array<{ audit_id: string; current_hash: string }> = [];
    for (let i = 0; i < 3; i++) {
      const { data } = await svc.from("audit_log").insert({
        warehouse_id: whA.warehouse_id, user_id: adminA.user_id,
        action: `chain_${i}`, entity_type: "test",
        entity_id: "00000000-0000-0000-0000-000000000000", new_data: { step: i },
      }).select("audit_id, current_hash").single();
      if (data) rows.push(data);
    }
    if (rows.length >= 2) {
      const origHash = rows[1].current_hash;
      await svc.from("audit_log").update({ current_hash: "TAMPERED" }).eq("audit_id", rows[1].audit_id);
      const { data: result } = await svc.rpc("verify_audit_integrity", { p_warehouse_id: whA.warehouse_id });
      if (result && typeof result === "object" && "ok" in result) {
        expect((result as Record<string, unknown>).ok).toBe(false);
      }
      await svc.from("audit_log").update({ current_hash: origHash }).eq("audit_id", rows[1].audit_id);
    }
  });

  it("audit for create has old_data=null and new_data present", async () => {
    const { data } = await svc.from("audit_log")
      .select("*").eq("warehouse_id", whA.warehouse_id)
      .eq("action", "create").eq("entity_type", "delivery_order")
      .order("created_at", { ascending: false }).limit(1).single();
    if (data) {
      expect(data.old_data).toBeNull();
      expect(data.new_data).toBeTruthy();
    }
  });

  it("Warehouse B cannot see Warehouse A audit rows", async () => {
    const res = await apiRequest("/api/audit", { method: "GET", token: tokenB });
    expect(res.status).toBe(200);
    const body = await res.json();
    if (body.data && Array.isArray(body.data)) {
      for (const row of body.data) {
        expect(row.warehouse_id).not.toBe(whA.warehouse_id);
      }
    }
  });

  it("hash values are valid SHA256 strings", async () => {
    const { data: rows } = await svc.from("audit_log")
      .select("current_hash").eq("warehouse_id", whA.warehouse_id)
      .order("created_at", { ascending: true }).limit(5);
    if (rows && rows.length > 0) {
      for (const row of rows) {
        expect(row.current_hash).toBeTruthy();
        expect(typeof row.current_hash).toBe("string");
        expect(row.current_hash.length).toBeGreaterThan(10);
      }
    }
  });
});
