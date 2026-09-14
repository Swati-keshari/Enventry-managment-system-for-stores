-- =====================================================================
-- One-time migration: Seed default items & parties for existing warehouses
-- Safe to run multiple times (idempotent — skips warehouses that already
-- have items or parties).
-- =====================================================================

-- ─── Default items ────────────────────────────────────────────────────
DO $$
DECLARE
  wh RECORD;
  default_items JSONB := '[
    {"name": "Wheat", "bag_size": 50},
    {"name": "Rice", "bag_size": 100},
    {"name": "Salt", "bag_size": 25},
    {"name": "Sugar", "bag_size": 50},
    {"name": "Duddy", "bag_size": 50},
    {"name": "Nuts", "bag_size": 50},
    {"name": "Gram", "bag_size": 50},
    {"name": "Malta", "bag_size": 50}
  ]'::jsonb;
  item JSONB;
BEGIN
  FOR wh IN SELECT warehouse_id FROM warehouses
  LOOP
    -- Only insert if warehouse has zero items
    IF NOT EXISTS (SELECT 1 FROM items WHERE warehouse_id = wh.warehouse_id) THEN
      FOR item IN SELECT * FROM jsonb_array_elements(default_items)
      LOOP
        INSERT INTO items (warehouse_id, name, bag_size)
        VALUES (
          wh.warehouse_id,
          item->>'name',
          (item->>'bag_size')::numeric
        )
        ON CONFLICT (warehouse_id, name) DO NOTHING;
      END LOOP;
    END IF;
  END LOOP;
END $$;

-- ─── Default parties ──────────────────────────────────────────────────
DO $$
DECLARE
  wh RECORD;
  default_parties TEXT[] := ARRAY[
    'ABC Suppliers',
    'XYZ Traders',
    'Quick Transport',
    'Local Distributors'
  ];
  party_name TEXT;
BEGIN
  FOR wh IN SELECT warehouse_id FROM warehouses
  LOOP
    -- Only insert if warehouse has zero parties
    IF NOT EXISTS (SELECT 1 FROM parties WHERE warehouse_id = wh.warehouse_id) THEN
      FOREACH party_name IN ARRAY default_parties
      LOOP
        INSERT INTO parties (warehouse_id, name)
        VALUES (wh.warehouse_id, party_name)
        ON CONFLICT (warehouse_id, name) DO NOTHING;
      END LOOP;
    END IF;
  END LOOP;
END $$;
