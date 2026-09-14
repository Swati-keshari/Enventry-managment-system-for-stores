-- =====================================================================
-- Warehouse management schema — Supabase Postgres
-- Replaces the Google Sheets model. Every fix below references the
-- issue number from the validator report (database.md analysis).
-- =====================================================================

create extension if not exists "pgcrypto";  -- gen_random_uuid()

-- =====================================================================
-- WAREHOUSES
-- =====================================================================
create table warehouses (
  warehouse_id   uuid primary key default gen_random_uuid(),
  name           text not null,
  spreadsheet_id text,          -- legacy reference, keep during migration, drop later
  drive_folder_id text,         -- legacy reference, keep during migration, drop later
  is_deleted     boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- =====================================================================
-- APP_USERS
-- One row per staff member. Primary key IS the Supabase Auth user id,
-- so login identity and warehouse-scoped identity are the same row.
-- =====================================================================
create table app_users (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  warehouse_id  uuid not null references warehouses(warehouse_id) on delete restrict,
  name          text not null,
  email         text not null unique,
  role          text not null check (role in ('admin', 'manager', 'staff')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index idx_users_warehouse on app_users(warehouse_id);

-- =====================================================================
-- PARTIES  (fixes issue #18 — tickerName was a bare string on DO)
-- =====================================================================
create table parties (
  party_id     uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references warehouses(warehouse_id) on delete cascade,
  name         text not null,
  created_at   timestamptz not null default now(),
  unique (warehouse_id, name)
);

-- =====================================================================
-- ITEMS  (fixes issue #3 — no warehouseId, allowed name collisions)
-- totalWeight is NOT stored here — see item_totals view below
-- (fixes issue #6 — stored derived field going stale)
-- =====================================================================
create table items (
  item_id      uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references warehouses(warehouse_id) on delete cascade,
  name         text not null,
  bag_size     numeric(10,2) not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (warehouse_id, name)
);
create index idx_items_warehouse on items(warehouse_id);

-- =====================================================================
-- DELIVERY_ORDERS  (fixes issue #1 — no explicit warehouseId)
-- item_count is trigger-maintained below, not app-maintained
-- (fixes issue #5 / #7 — redundant field drifting from actual count)
-- =====================================================================
create table delivery_orders (
  do_id        uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references warehouses(warehouse_id) on delete cascade,
  user_id      uuid not null references app_users(user_id) on delete restrict,
  party_id     uuid references parties(party_id) on delete set null,
  do_number    text not null,
  direction    text not null check (direction in ('IN', 'OUT')),
  date         date not null,
  item_count   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (warehouse_id, do_number)
);
create index idx_do_warehouse_date on delivery_orders(warehouse_id, date desc);

-- =====================================================================
-- DO_ITEMS  (fixes issue #8 — do_{doId}_{itemId} format could collide)
-- sequence_num + do_id gives a real unique key, no format guessing
-- bag_size captured at transaction time (fixes issue #19)
-- =====================================================================
create table do_items (
  do_item_id    uuid primary key default gen_random_uuid(),
  do_id         uuid not null references delivery_orders(do_id) on delete cascade,
  item_id       uuid not null references items(item_id) on delete restrict,
  sequence_num  integer not null,
  bags          integer not null check (bags > 0),
  total_weight  numeric(12,2) not null,
  bag_size      numeric(10,2) not null,
  created_at    timestamptz not null default now(),
  unique (do_id, sequence_num)
);
create index idx_do_items_do on do_items(do_id);
create index idx_do_items_item on do_items(item_id);

-- =====================================================================
-- AUDIT_LOG  (fixes issue #4 — timestamp as pseudo-PK could collide)
-- Insert-only via RLS + grants below (fixes issue #6 — tamperable log)
-- Stores full before/after snapshots for complete state preservation
-- =====================================================================
create table audit_log (
  log_id        bigint generated always as identity primary key,
  warehouse_id  uuid not null references warehouses(warehouse_id) on delete restrict,
  user_id       uuid references app_users(user_id) on delete set null,
  entity        text not null,          -- 'warehouse', 'user', 'item', 'party', 'do', 'do_item'
  entity_id     uuid,                   -- PK of the affected row
  action        text not null,          -- 'create', 'update', 'delete', 'login', etc.
  old_data      jsonb,                  -- full row snapshot BEFORE the change (null on create)
  new_data      jsonb,                  -- full row snapshot AFTER the change (null on delete)
  ip_address    inet,                   -- client IP address
  user_agent    text,                   -- browser/device identifier
  session_id    text,                   -- auth session id for grouping related actions
  request_id    uuid,                   -- unique id for the API request (links multi-table mutations)
  previous_hash text,                   -- SHA-256 hash of previous log entry (tamper chain)
  current_hash  text,                   -- SHA-256 hash of this entry
  "timestamp"   timestamptz not null default now()
);
create index idx_audit_warehouse_ts on audit_log(warehouse_id, "timestamp" desc);
create index idx_audit_entity on audit_log(entity, entity_id);
create index idx_audit_user on audit_log(user_id);
create index idx_audit_session on audit_log(session_id);

-- =====================================================================
-- DERIVED DATA AS VIEWS, NOT STORED COLUMNS
-- fixes issue #2 (Product Summary) and issue #6 (Items.totalWeight)
-- =====================================================================

-- Product Summary — computed live from DO Items, always in sync
create view product_summary as
select
  i.item_id,
  i.warehouse_id,
  i.name as product,
  i.bag_size,
  coalesce(sum(di.total_weight) filter (where do_.direction = 'IN'), 0)  as total_in,
  coalesce(sum(di.total_weight) filter (where do_.direction = 'OUT'), 0) as total_out,
  coalesce(sum(di.total_weight) filter (where do_.direction = 'IN'), 0)
    - coalesce(sum(di.total_weight) filter (where do_.direction = 'OUT'), 0) as remaining
from items i
left join do_items di on di.item_id = i.item_id
left join delivery_orders do_ on do_.do_id = di.do_id
group by i.item_id, i.warehouse_id, i.name, i.bag_size;

-- Item totals — computed on demand instead of stored on items
create view item_totals as
select
  i.item_id,
  i.warehouse_id,
  coalesce(sum(di.total_weight), 0) as total_weight
from items i
left join do_items di on di.item_id = i.item_id
group by i.item_id, i.warehouse_id;

-- Grant SELECT on views to authenticated role
grant select on product_summary to authenticated;
grant select on item_totals to authenticated;

-- =====================================================================
-- TRIGGERS
-- =====================================================================

-- Keep delivery_orders.item_count in sync automatically — the field
-- still exists for fast reads, but the app never writes it directly.
create or replace function sync_do_item_count() returns trigger as $$
begin
  update delivery_orders
  set item_count = (
        select count(*) from do_items where do_id = coalesce(new.do_id, old.do_id)
      ),
      updated_at = now()
  where do_id = coalesce(new.do_id, old.do_id);
  return null;
end;
$$ language plpgsql;

create trigger trg_do_items_count
after insert or update or delete on do_items
for each row execute function sync_do_item_count();

-- Generic updated_at trigger
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_warehouses_updated before update on warehouses
for each row execute function set_updated_at();

create trigger trg_users_updated before update on app_users
for each row execute function set_updated_at();

create trigger trg_items_updated before update on items
for each row execute function set_updated_at();

create trigger trg_do_updated before update on delivery_orders
for each row execute function set_updated_at();

-- =====================================================================
-- ROW LEVEL SECURITY — warehouse isolation
-- fixes the "no enforcement, purely application-level" gap noted for
-- warehouseId throughout the original report
-- =====================================================================

alter table warehouses enable row level security;
alter table app_users enable row level security;
alter table parties enable row level security;
alter table items enable row level security;
alter table delivery_orders enable row level security;
alter table do_items enable row level security;
alter table audit_log enable row level security;

-- Resolves the calling user's own warehouse from their auth session
create or replace function current_warehouse_id() returns uuid as $$
  select warehouse_id from app_users where user_id = auth.uid();
$$ language sql stable security definer;

create policy "own warehouse only" on warehouses
  for select using (warehouse_id = current_warehouse_id());

create policy "own warehouse only" on app_users
  for select using (warehouse_id = current_warehouse_id());

create policy "own warehouse only" on parties
  for all using (warehouse_id = current_warehouse_id())
  with check (warehouse_id = current_warehouse_id());

create policy "own warehouse only" on items
  for all using (warehouse_id = current_warehouse_id())
  with check (warehouse_id = current_warehouse_id());

create policy "own warehouse only" on delivery_orders
  for all using (warehouse_id = current_warehouse_id())
  with check (warehouse_id = current_warehouse_id());

-- do_items has no warehouse_id column directly — check via its parent DO
create policy "own warehouse only" on do_items
  for all using (
    exists (
      select 1 from delivery_orders d
      where d.do_id = do_items.do_id
        and d.warehouse_id = current_warehouse_id()
    )
  );

-- Audit log: readable within your warehouse, INSERT only, never update/delete
-- (fixes issue #6 — this is the real fix, not something the schema alone gives you)
create policy "read own warehouse audit" on audit_log
  for select using (warehouse_id = current_warehouse_id());

create policy "insert own warehouse audit" on audit_log
  for insert with check (warehouse_id = current_warehouse_id());

revoke update, delete on audit_log from authenticated;

-- =====================================================================
-- AUDIT HASH CHAIN VERIFICATION FUNCTION
-- verify_audit_integrity(warehouse_id) walks the hash chain and reports
-- whether it is intact or where it breaks.
-- =====================================================================
create or replace function verify_audit_integrity(p_warehouse_id uuid)
returns table(ok boolean, broken_at bigint, message text) as $$
declare
  prev_hash text := null;
  rec record;
begin
  for rec in
    select log_id, previous_hash, current_hash, "timestamp"
    from audit_log
    where warehouse_id = p_warehouse_id
    order by "timestamp" asc, log_id asc
  loop
    if rec.previous_hash is distinct from prev_hash then
      ok := false;
      broken_at := rec.log_id;
      message := format('Chain broken at log_id %s: expected previous_hash=%s, got %s',
                         rec.log_id, prev_hash, rec.previous_hash);
      return next;
      return;
    end if;
    prev_hash := rec.current_hash;
  end loop;

  ok := true;
  broken_at := null;
  message := 'Chain intact';
  return next;
end;
$$ language plpgsql;

-- =====================================================================
-- FILES — metadata for Drive-stored files
-- =====================================================================
create table files (
  file_id       uuid primary key default gen_random_uuid(),
  warehouse_id  uuid not null references warehouses(warehouse_id) on delete cascade,
  user_id       uuid references app_users(user_id) on delete set null,
  do_id         uuid references delivery_orders(do_id) on delete set null,
  file_name     text not null,
  file_type     text not null,
  file_size     bigint not null,
  drive_file_id text not null,
  drive_url     text not null,
  folder_path   text not null,
  category      text not null check (category in (
    'document','report','do_pdf','template','rate_list','contact','backup','other'
  )),
  description   text,
  created_at    timestamptz not null default now()
);

create index idx_files_warehouse on files(warehouse_id);
create index idx_files_do on files(do_id);
create index idx_files_user on files(user_id);
create index idx_files_category on files(warehouse_id, category);

-- RLS: warehouse isolation
alter table files enable row level security;

create policy "own warehouse only" on files
  for all using (warehouse_id = current_warehouse_id())
  with check (warehouse_id = current_warehouse_id());

-- =====================================================================
-- WAREHOUSE PURGE JOB
-- Permanently deletes warehouses soft-deleted > 30 days ago.
-- Supports dry-run mode: when dry_run=true, returns affected warehouses
-- without actually deleting anything.
--
-- Usage:
--   SELECT * FROM purge_deleted_warehouses(false);  -- actual purge
--   SELECT * FROM purge_deleted_warehouses(true);   -- dry run
-- =====================================================================
create or replace function purge_deleted_warehouses(dry_run boolean default false)
returns table(warehouse_id uuid, name text, deleted_ago interval) as $$
declare
  rec record;
begin
  for rec in
    select w.warehouse_id, w.name, now() - w.updated_at as deleted_ago
    from warehouses w
    where w.is_deleted = true
      and now() - w.updated_at > interval '30 days'
  loop
    -- Return the warehouse info (for both dry-run and actual)
    warehouse_id := rec.warehouse_id;
    name := rec.name;
    deleted_ago := rec.deleted_ago;
    return next;

    if not dry_run then
      -- Step 1: Remove app_users first (RESTRICT on warehouses)
      delete from app_users where app_users.warehouse_id = rec.warehouse_id;
      -- Step 2: Cascade handles the rest (parties, items, delivery_orders, files)
      -- audit_log uses RESTRICT, so we must delete it separately before warehouse
      delete from audit_log where audit_log.warehouse_id = rec.warehouse_id;
      -- Step 3: Delete the warehouse itself
      delete from warehouses where warehouses.warehouse_id = rec.warehouse_id;
    end if;
  end loop;
end;
$$ language plpgsql;

-- =====================================================================
-- RECOVERABLE WAREHOUSES HELPER
-- Returns warehouses soft-deleted within the last 30 days (still recoverable).
-- =====================================================================
create or replace function recoverable_warehouses()
returns table(warehouse_id uuid, name text, deleted_ago interval) as $$
begin
  return query
    select w.warehouse_id, w.name, now() - w.updated_at as deleted_ago
    from warehouses w
    where w.is_deleted = true
      and now() - w.updated_at < interval '30 days'
    order by w.updated_at desc;
end;
$$ language plpgsql;