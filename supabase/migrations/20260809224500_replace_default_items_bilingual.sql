-- Replace warehouse item catalogs with the bilingual default list.
-- Renames known old English names when safe, deletes unused leftovers, inserts missing defaults.

DO $$
DECLARE
  wh RECORD;
  default_items JSONB := '[
    {"name": "Gram (चना)", "bag_size": 50},
    {"name": "Maize (मक्का)", "bag_size": 50},
    {"name": "Nuts (मेवा)", "bag_size": 50},
    {"name": "Paddy (धान)", "bag_size": 50},
    {"name": "Rice (चावल)", "bag_size": 50},
    {"name": "Salt (नमक)", "bag_size": 50},
    {"name": "Sugar (चीनी)", "bag_size": 50},
    {"name": "Wheat (गेहूं)", "bag_size": 50}
  ]'::jsonb;
  rename_map JSONB := '[
    {"from": "Wheat", "to": "Wheat (गेहूं)"},
    {"from": "Rice", "to": "Rice (चावल)"},
    {"from": "Salt", "to": "Salt (नमक)"},
    {"from": "Sugar", "to": "Sugar (चीनी)"},
    {"from": "Nuts", "to": "Nuts (मेवा)"},
    {"from": "Gram", "to": "Gram (चना)"},
    {"from": "Paddy", "to": "Paddy (धान)"},
    {"from": "Duddy", "to": "Paddy (धान)"},
    {"from": "Maize", "to": "Maize (मक्का)"},
    {"from": "Malta", "to": "Maize (मक्का)"},
    {"from": "Malza", "to": "Maize (मक्का)"}
  ]'::jsonb;
  item JSONB;
  pair JSONB;
  default_names TEXT[];
  rename_from TEXT;
  rename_to TEXT;
BEGIN
  SELECT array_agg(elem->>'name')
  INTO default_names
  FROM jsonb_array_elements(default_items) AS elem;

  FOR wh IN SELECT warehouse_id FROM warehouses
  LOOP
    FOR pair IN SELECT * FROM jsonb_array_elements(rename_map)
    LOOP
      rename_from := pair->>'from';
      rename_to := pair->>'to';

      IF EXISTS (
        SELECT 1 FROM items
        WHERE warehouse_id = wh.warehouse_id
          AND lower(name) = lower(rename_from)
      ) AND NOT EXISTS (
        SELECT 1 FROM items
        WHERE warehouse_id = wh.warehouse_id
          AND name = rename_to
      ) THEN
        UPDATE items
        SET name = rename_to, bag_size = 50
        WHERE warehouse_id = wh.warehouse_id
          AND lower(name) = lower(rename_from);
      END IF;
    END LOOP;

    UPDATE items
    SET bag_size = 50
    WHERE warehouse_id = wh.warehouse_id
      AND name = ANY (default_names)
      AND bag_size IS DISTINCT FROM 50;

    DELETE FROM items i
    WHERE i.warehouse_id = wh.warehouse_id
      AND i.name <> ALL (default_names)
      AND NOT EXISTS (
        SELECT 1 FROM do_items di WHERE di.item_id = i.item_id
      );

    FOR item IN SELECT * FROM jsonb_array_elements(default_items)
    LOOP
      INSERT INTO items (warehouse_id, name, bag_size)
      VALUES (
        wh.warehouse_id,
        item->>'name',
        (item->>'bag_size')::numeric
      )
      ON CONFLICT (warehouse_id, name) DO UPDATE
        SET bag_size = EXCLUDED.bag_size;
    END LOOP;
  END LOOP;
END $$;
