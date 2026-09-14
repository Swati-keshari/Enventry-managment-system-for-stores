/**
 * Seed Fixtures — SQL helpers for seeding test data into Supabase.
 *
 * These functions use the service-role client to insert test data
 * and provide cleanup functions to remove it after tests.
 */
import { SupabaseClient } from "@supabase/supabase-js";

/** IDs generated per test run to avoid collisions */
export const TEST_PREFIX = `test_${Date.now()}`;

export interface SeedWarehouse {
  warehouse_id: string;
  name: string;
}

export interface SeedUser {
  user_id: string;
  email: string;
  name: string;
  role: "admin" | "manager" | "staff";
  warehouse_id: string;
}

export interface SeedItem {
  item_id: string;
  name: string;
  bag_size: number;
  warehouse_id: string;
}

export interface SeedParty {
  party_id: string;
  name: string;
  warehouse_id: string;
}

export interface SeedDO {
  do_id: string;
  do_number: string;
  direction: "IN" | "OUT";
  date: string;
  warehouse_id: string;
  party_id: string;
  created_by: string;
}

/**
 * Create a warehouse row via service role.
 */
export async function seedWarehouse(
  svc: SupabaseClient,
  name?: string
): Promise<SeedWarehouse> {
  const whName = name || `Warehouse ${TEST_PREFIX}`;
  const { data, error } = await svc
    .from("warehouses")
    .insert({ name: whName })
    .select("warehouse_id, name")
    .single();

  if (error) throw new Error(`seedWarehouse failed: ${error.message}`);
  return data as SeedWarehouse;
}

/**
 * Create a warehouse user via service role auth + app_users insert.
 */
export async function seedUser(
  svc: SupabaseClient,
  warehouseId: string,
  role: "admin" | "manager" | "staff" = "staff",
  suffix?: string
): Promise<SeedUser> {
  const email = `user_${suffix || TEST_PREFIX}@test.wharehouse.dev`;
  const password = "TestPass123!";

  // Create auth user
  const { data: authData, error: authError } = await svc.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (authError) throw new Error(`seedUser auth failed: ${authError.message}`);

  // Link to warehouse
  const { error: linkError } = await svc.from("app_users").insert({
    user_id: authData.user.id,
    warehouse_id: warehouseId,
    email,
    name: `User ${role} ${suffix || TEST_PREFIX}`,
    role,
  });
  if (linkError) throw new Error(`seedUser link failed: ${linkError.message}`);

  return {
    user_id: authData.user.id,
    email,
    name: `User ${role} ${suffix || TEST_PREFIX}`,
    role,
    warehouse_id: warehouseId,
  };
}

/**
 * Create an item in a warehouse.
 */
export async function seedItem(
  svc: SupabaseClient,
  warehouseId: string,
  name?: string,
  bagSize: number = 50
): Promise<SeedItem> {
  const itemName = name || `Item ${TEST_PREFIX}`;
  const { data, error } = await svc
    .from("items")
    .insert({
      warehouse_id: warehouseId,
      name: itemName,
      bag_size: bagSize,
    })
    .select("item_id, name, bag_size, warehouse_id")
    .single();

  if (error) throw new Error(`seedItem failed: ${error.message}`);
  return data as SeedItem;
}

/**
 * Create a party (trading partner) in a warehouse.
 */
export async function seedParty(
  svc: SupabaseClient,
  warehouseId: string,
  name?: string
): Promise<SeedParty> {
  const partyName = name || `Party ${TEST_PREFIX}`;
  const { data, error } = await svc
    .from("parties")
    .insert({
      warehouse_id: warehouseId,
      name: partyName,
    })
    .select("party_id, name, warehouse_id")
    .single();

  if (error) throw new Error(`seedParty failed: ${error.message}`);
  return data as SeedParty;
}

/**
 * Create a delivery order with optional items.
 */
export async function seedDO(
  svc: SupabaseClient,
  warehouseId: string,
  createdBy: string,
  partyId: string,
  direction: "IN" | "OUT",
  date: string,
  doNumber?: string,
  items?: Array<{ itemId: string; bags: number; bagSize: number }>
): Promise<SeedDO> {
  const num = doNumber || `DO-${TEST_PREFIX}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

  const { data: doData, error: doError } = await svc
    .from("delivery_orders")
    .insert({
      warehouse_id: warehouseId,
      do_number: num,
      direction,
      date,
      party_id: partyId,
      created_by: createdBy,
    })
    .select("do_id, do_number, direction, date, warehouse_id, party_id, created_by")
    .single();

  if (doError) throw new Error(`seedDO failed: ${doError.message}`);

  // Insert line items if provided
  if (items && items.length > 0) {
    const lineItems = items.map((item, idx) => ({
      do_id: doData.do_id,
      item_id: item.itemId,
      sequence_num: idx + 1,
      bags: item.bags,
      bag_size: item.bagSize,
      total_weight: item.bags * item.bagSize,
    }));

    const { error: lineError } = await svc.from("do_items").insert(lineItems);
    if (lineError) throw new Error(`seedDO items failed: ${lineError.message}`);
  }

  return doData as SeedDO;
}

/**
 * Cleanup all test data. Call this in afterAll / afterEach.
 */
export async function cleanupTestData(svc: SupabaseClient): Promise<void> {
  // Delete audit_log, do_items, delivery_orders, files, items, parties, app_users, warehouses
  // using test prefix matching where possible.
  // Note: RLS may block some of these — use service role client.
  const tables = [
    "audit_log",
    "do_items",
    "delivery_orders",
    "files",
    "items",
    "parties",
    "app_users",
    "warehouses",
  ];

  for (const table of tables) {
    try { await svc.from(table).delete().like("name", `%${TEST_PREFIX}%`); } catch {}
  }
}
