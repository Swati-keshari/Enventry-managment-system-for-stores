/**
 * One-time script: Seed default items & parties into ALL existing warehouses
 * that don't have any yet.
 *
 * Usage:  node scripts/seed-existing-warehouses.mjs
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const headers = {
  apikey: SUPABASE_SERVICE_KEY,
  Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
  "Content-Type": "application/json",
  Prefer: "return=representation",
};

async function supabaseGet(table, query = "") {
  const url = `${SUPABASE_URL}/rest/v1/${table}?${query}`;
  const res = await fetch(url, { headers: { ...headers, Prefer: undefined } });
  if (!res.ok) throw new Error(`${table} GET failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function supabasePost(table, rows) {
  const url = `${SUPABASE_URL}/rest/v1/${table}`;
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`${table} POST failed: ${res.status} ${await res.text()}`);
  return res.json();
}

const DEFAULT_ITEMS = [
  { name: "Gram (चना)", bag_size: 50, unit: "kg" },
  { name: "Maize (मक्का)", bag_size: 50, unit: "kg" },
  { name: "Nuts (मेवा)", bag_size: 50, unit: "kg" },
  { name: "Paddy (धान)", bag_size: 50, unit: "kg" },
  { name: "Rice (चावल)", bag_size: 50, unit: "kg" },
  { name: "Salt (नमक)", bag_size: 50, unit: "kg" },
  { name: "Sugar (चीनी)", bag_size: 50, unit: "kg" },
  { name: "Wheat (गेहूं)", bag_size: 50, unit: "kg" },
];

const DEFAULT_PARTIES = [
  "ABC Suppliers",
  "XYZ Traders",
  "Quick Transport",
  "Local Distributors",
];

async function main() {
  const warehouses = await supabaseGet("warehouses", "select=warehouse_id,name");

  if (!warehouses || warehouses.length === 0) {
    console.log("No warehouses found. Nothing to seed.");
    return;
  }

  console.log(`Found ${warehouses.length} warehouse(s):\n`);

  for (const wh of warehouses) {
    console.log(`-- ${wh.name} (${wh.warehouse_id}) --`);

    // Items
    const existingItems = await supabaseGet(
      "items",
      `select=name&warehouse_id=eq.${wh.warehouse_id}`
    );
    const existingItemNames = new Set(existingItems.map((i) => i.name.toLowerCase()));
    const newItems = DEFAULT_ITEMS.filter((di) => !existingItemNames.has(di.name.toLowerCase()));

    if (newItems.length === 0) {
      console.log("  Items: already seeded, skipping.");
    } else {
      await supabasePost(
        "items",
        newItems.map((item) => ({
          warehouse_id: wh.warehouse_id,
          name: item.name,
          bag_size: item.bag_size,
          unit: item.unit,
        }))
      );
      console.log(`  Items: inserted ${newItems.length} (${newItems.map((i) => i.name).join(", ")})`);
    }

    // Parties
    const existingParties = await supabaseGet(
      "parties",
      `select=name&warehouse_id=eq.${wh.warehouse_id}`
    );
    const existingPartyNames = new Set(existingParties.map((p) => p.name.toLowerCase()));
    const newParties = DEFAULT_PARTIES.filter((dp) => !existingPartyNames.has(dp.toLowerCase()));

    if (newParties.length === 0) {
      console.log("  Parties: already seeded, skipping.");
    } else {
      await supabasePost(
        "parties",
        newParties.map((name) => ({
          warehouse_id: wh.warehouse_id,
          name,
        }))
      );
      console.log(`  Parties: inserted ${newParties.length} (${newParties.join(", ")})`);
    }

    console.log("");
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
