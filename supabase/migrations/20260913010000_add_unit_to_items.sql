-- =====================================================================
-- Add unit support to items and do_items tables
-- Converts warehouse management to general-purpose inventory management
-- =====================================================================

-- Add unit column to items table
ALTER TABLE items ADD COLUMN IF NOT EXISTS unit text NOT NULL DEFAULT 'kg';

-- Add unit column to do_items table
ALTER TABLE do_items ADD COLUMN IF NOT EXISTS unit text NOT NULL DEFAULT 'kg';

-- Add total_quantity column to do_items (replaces total_weight semantics)
-- This stores the quantity in the item's native unit
ALTER TABLE do_items ADD COLUMN IF NOT EXISTS total_quantity numeric(12,2) NOT NULL DEFAULT 0;

-- Update the product_summary view to include unit
DROP VIEW IF EXISTS product_summary;
CREATE VIEW product_summary AS
SELECT
  i.item_id,
  i.warehouse_id,
  i.name as product,
  i.bag_size as default_quantity,
  i.unit,
  coalesce(sum(di.total_weight) filter (where do_.direction = 'IN'), 0)  as total_in,
  coalesce(sum(di.total_weight) filter (where do_.direction = 'OUT'), 0) as total_out,
  coalesce(sum(di.total_weight) filter (where do_.direction = 'IN'), 0)
    - coalesce(sum(di.total_weight) filter (where do_.direction = 'OUT'), 0) as remaining
FROM items i
left join do_items di on di.item_id = i.item_id
left join delivery_orders do_ on do_.do_id = di.do_id
group by i.item_id, i.warehouse_id, i.name, i.bag_size, i.unit;

-- Update item_totals view to include unit
DROP VIEW IF EXISTS item_totals;
CREATE VIEW item_totals AS
SELECT
  i.item_id,
  i.warehouse_id,
  i.unit,
  coalesce(sum(di.total_weight), 0) as total_weight
FROM items i
left join do_items di on di.item_id = i.item_id
group by i.item_id, i.warehouse_id, i.unit;

-- Update existing items to have default unit of 'kg'
UPDATE items SET unit = 'kg' WHERE unit IS NULL OR unit = '';
UPDATE do_items SET unit = 'kg' WHERE unit IS NULL OR unit = '';
