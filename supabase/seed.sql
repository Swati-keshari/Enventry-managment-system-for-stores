-- =====================================================================
-- Seed Script: Demo Warehouse (DEV ONLY)
-- Creates one warehouse with sample data for testing
-- =====================================================================

-- =====================================================================
-- 1. CREATE DEMO WAREHOUSE
-- =====================================================================
insert into warehouses (warehouse_id, name, spreadsheet_id, drive_folder_id)
values (
  '11111111-1111-1111-1111-111111111111',
  'Demo Warehouse - Mumbai',
  'legacy_sheet_123',  -- placeholder for migration
  'legacy_folder_456'  -- placeholder for migration
);

-- =====================================================================
-- 2. CREATE DEMO USERS (requires auth.users to exist first)
-- Note: In real setup, users are created via Supabase Auth first.
-- This seed assumes you've manually created auth users or are using
-- the Supabase dashboard to create users first.
-- =====================================================================

-- For demo purposes, we'll create a dummy user entry
-- In production, this would be done via Supabase Auth invite flow
-- You can run this AFTER creating auth users in Supabase dashboard

-- Uncomment and modify the UUIDs below after creating auth users:
/*
insert into app_users (user_id, warehouse_id, name, email, role)
values
  ('AUTH_USER_UUID_1', '11111111-1111-1111-1111-111111111111', 'Admin User', 'admin@demo.com', 'admin'),
  ('AUTH_USER_UUID_2', '11111111-1111-1111-1111-111111111111', 'Manager User', 'manager@demo.com', 'manager'),
  ('AUTH_USER_UUID_3', '11111111-1111-1111-1111-111111111111', 'Staff User', 'staff@demo.com', 'staff');
*/

-- =====================================================================
-- 3. CREATE DEMO PARTIES
-- =====================================================================
insert into parties (party_id, warehouse_id, name)
values
  ('22222222-2222-2222-2222-222222222221', '11111111-1111-1111-1111-111111111111', 'ABC Suppliers Pvt Ltd'),
  ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'XYZ Traders'),
  ('22222222-2222-2222-2222-222222222223', '11111111-1111-1111-1111-111111111111', 'Quick Transport Co'),
  ('22222222-2222-2222-2222-222222222224', '11111111-1111-1111-1111-111111111111', 'Local Distributors');

-- =====================================================================
-- 4. CREATE DEMO ITEMS
-- =====================================================================
insert into items (item_id, warehouse_id, name, bag_size)
values
  ('33333333-3333-3333-3333-333333333301', '11111111-1111-1111-1111-111111111111', 'Wheat Flour', 50.00),
  ('33333333-3333-3333-3333-333333333302', '11111111-1111-1111-1111-111111111111', 'Basmati Rice', 30.00),
  ('33333333-3333-3333-3333-333333333303', '11111111-1111-1111-1111-111111111111', 'Table Salt', 25.00),
  ('33333333-3333-3333-3333-333333333304', '11111111-1111-1111-1111-111111111111', 'Sugar', 50.00),
  ('33333333-3333-3333-3333-333333333305', '11111111-1111-1111-1111-111111111111', 'Paddy Rice', 50.00),
  ('33333333-3333-3333-3333-333333333306', '11111111-1111-1111-1111-111111111111', 'Groundnuts', 25.00),
  ('33333333-3333-3333-3333-333333333307', '11111111-1111-1111-1111-111111111111', 'Gram (Chana)', 50.00),
  ('33333333-3333-3333-3333-333333333308', '11111111-1111-1111-1111-111111111111', 'Malza', 50.00);

-- =====================================================================
-- 5. CREATE DEMO DELIVERY ORDERS (requires app_users to exist)
-- Uncomment after creating auth users above
-- =====================================================================

/*
-- DO #1: Wheat IN from ABC Suppliers
insert into delivery_orders (do_id, warehouse_id, user_id, party_id, do_number, direction, date)
values (
  '44444444-4444-4444-4444-444444444401',
  '11111111-1111-1111-1111-111111111111',
  'AUTH_USER_UUID_1',  -- admin user
  '22222222-2222-2222-2222-222222222221',  -- ABC Suppliers
  'DO-001',
  'IN',
  '2026-08-01'
);

-- DO #1 Items: Wheat
insert into do_items (do_id, item_id, sequence_num, bags, total_weight, bag_size)
values ('44444444-4444-4444-4444-444444444401', '33333333-3333-3333-3333-333333333301', 1, 4, 200.00, 50.00);

-- DO #2: Rice IN from XYZ Traders
insert into delivery_orders (do_id, warehouse_id, user_id, party_id, do_number, direction, date)
values (
  '44444444-4444-4444-4444-444444444402',
  '11111111-1111-1111-1111-111111111111',
  'AUTH_USER_UUID_2',  -- manager user
  '22222222-2222-2222-2222-222222222222',  -- XYZ Traders
  'DO-002',
  'IN',
  '2026-08-02'
);

-- DO #2 Items: Rice
insert into do_items (do_id, item_id, sequence_num, bags, total_weight, bag_size)
values ('44444444-4444-4444-4444-444444444402', '33333333-3333-3333-3333-333333333302', 1, 3, 90.00, 30.00);

-- DO #3: Wheat OUT to Local Distributors
insert into delivery_orders (do_id, warehouse_id, user_id, party_id, do_number, direction, date)
values (
  '44444444-4444-4444-4444-444444444403',
  '11111111-1111-1111-1111-111111111111',
  'AUTH_USER_UUID_3',  -- staff user
  '22222222-2222-2222-2222-222222222224',  -- Local Distributors
  'DO-003',
  'OUT',
  '2026-08-03'
);

-- DO #3 Items: Wheat
insert into do_items (do_id, item_id, sequence_num, bags, total_weight, bag_size)
values ('44444444-4444-4444-4444-444444444403', '33333333-3333-3333-3333-333333333301', 1, 2, 100.00, 50.00);

-- DO #4: Multiple items IN
insert into delivery_orders (do_id, warehouse_id, user_id, party_id, do_number, direction, date)
values (
  '44444444-4444-4444-4444-444444444404',
  '11111111-1111-1111-1111-111111111111',
  'AUTH_USER_UUID_1',  -- admin user
  '22222222-2222-2222-2222-222222222223',  -- Quick Transport
  'DO-004',
  'IN',
  '2026-08-05'
);

-- DO #4 Items: Salt, Sugar, Groundnuts
insert into do_items (do_id, item_id, sequence_num, bags, total_weight, bag_size)
values
  ('44444444-4444-4444-4444-444444444404', '33333333-3333-3333-3333-333333333303', 1, 2, 50.00, 25.00),
  ('44444444-4444-4444-4444-444444444404', '33333333-3333-3333-3333-333333333304', 2, 3, 150.00, 50.00),
  ('44444444-4444-4444-4444-444444444404', '33333333-3333-3333-3333-333333333306', 3, 4, 100.00, 25.00);
*/

-- =====================================================================
-- 6. DEMO AUDIT LOG ENTRIES
-- =====================================================================
-- Note: Audit log entries are typically created by triggers/application
-- This is just for demo purposes to show the structure

/*
insert into audit_log (warehouse_id, user_id, entity, entity_id, action, new_data, ip_address, user_agent)
values
  ('11111111-1111-1111-1111-111111111111', 'AUTH_USER_UUID_1', 'warehouse', '11111111-1111-1111-1111-111111111111', 'create', '{"name":"Demo Warehouse - Mumbai"}'::jsonb, '192.168.1.100', 'Mozilla/5.0'),
  ('11111111-1111-1111-1111-111111111111', 'AUTH_USER_UUID_1', 'item', '33333333-3333-3333-3333-333333333301', 'create', '{"name":"Wheat Flour","bag_size":50}'::jsonb, '192.168.1.100', 'Mozilla/5.0');
*/

-- =====================================================================
-- NOTES FOR DEVELOPERS
-- =====================================================================
-- 1. This seed script is for DEV/TESTING only
-- 2. In production, users are created via Supabase Auth invite flow
-- 3. Uncomment the user creation sections after creating auth users
-- 4. Uncomment DO creation after creating users
-- 5. The demo warehouse uses fixed UUIDs for consistency in tests
-- 6. All demo data belongs to warehouse '11111111-1111-1111-1111-111111111111'