-- =====================================================================
-- Rollback: Warehouse management schema
-- Run this to undo the core schema migration
-- =====================================================================

-- Drop triggers first
drop trigger if exists trg_do_items_count on do_items;
drop trigger if exists trg_warehouses_updated on warehouses;
drop trigger if exists trg_users_updated on app_users;
drop trigger if exists trg_items_updated on items;
drop trigger if exists trg_do_updated on delivery_orders;

-- Drop trigger functions
drop function if exists sync_do_item_count();
drop function if exists set_updated_at();

-- Drop RLS policies
drop policy if exists "own warehouse only" on warehouses;
drop policy if exists "own warehouse only" on app_users;
drop policy if exists "own warehouse only" on parties;
drop policy if exists "own warehouse only" on items;
drop policy if exists "own warehouse only" on delivery_orders;
drop policy if exists "own warehouse only" on do_items;
drop policy if exists "read own warehouse audit" on audit_log;
drop policy if exists "insert own warehouse audit" on audit_log;

-- Drop RLS
alter table warehouses disable row level security;
alter table app_users disable row level security;
alter table parties disable row level security;
alter table items disable row level security;
alter table delivery_orders disable row level security;
alter table do_items disable row level security;
alter table audit_log disable row level security;
alter table files disable row level security;

-- Drop views
drop view if exists product_summary;
drop view if exists item_totals;

-- Drop tables in reverse dependency order
drop table if exists files;
drop table if exists do_items;
drop table if exists delivery_orders;
drop table if exists items;
drop table if exists parties;
drop table if exists audit_log;
drop table if exists app_users;
drop table if exists warehouses;

-- Drop helper function
drop function if exists purge_deleted_warehouses(boolean);
drop function if exists recoverable_warehouses();
drop function if exists verify_audit_integrity(uuid);
drop function if exists current_warehouse_id();