-- Persist actor display name on audit rows so names survive user deletion
-- (audit_log.user_id is ON DELETE SET NULL when app_users is removed).

alter table audit_log
  add column if not exists actor_name text;

comment on column audit_log.actor_name is
  'Snapshot of actor display name at write time; survives app_users deletion.';

-- Backfill from live users where the FK still exists.
update audit_log a
set actor_name = u.name
from app_users u
where a.user_id = u.user_id
  and (a.actor_name is null or a.actor_name = '');

-- Backfill login/logout from payload email when user row is gone.
update audit_log
set actor_name = coalesce(
  nullif(new_data->>'name', ''),
  nullif(old_data->>'name', ''),
  nullif(new_data->>'email', ''),
  nullif(old_data->>'email', '')
)
where actor_name is null
  and action in ('login', 'logout', 'add_user', 'remove_user', 'update_user');

-- Preserve name before FK nullification on user delete.
create or replace function preserve_audit_actor_name()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update audit_log
  set actor_name = coalesce(nullif(actor_name, ''), old.name)
  where user_id = old.user_id;
  return old;
end;
$$;

drop trigger if exists trg_preserve_audit_actor_name on app_users;
create trigger trg_preserve_audit_actor_name
  before delete on app_users
  for each row
  execute function preserve_audit_actor_name();

-- Extend atomic append to store actor_name.
drop function if exists append_audit_log(uuid, uuid, text, text, text, jsonb, jsonb, text, text, text, text, text, timestamptz);

create or replace function append_audit_log(
  p_warehouse_id uuid,
  p_user_id uuid,
  p_entity text,
  p_entity_id text,
  p_action text,
  p_old_data jsonb,
  p_new_data jsonb,
  p_ip_address text,
  p_user_agent text,
  p_session_id text,
  p_request_id text,
  p_current_hash text,
  p_timestamp timestamptz default now(),
  p_actor_name text default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  prev_hash text;
  new_log_id bigint;
  resolved_actor text;
begin
  perform pg_advisory_xact_lock(hashtext(p_warehouse_id::text));

  resolved_actor := nullif(trim(coalesce(p_actor_name, '')), '');
  if resolved_actor is null and p_user_id is not null then
    select name into resolved_actor
    from app_users
    where user_id = p_user_id;
  end if;

  select current_hash
    into prev_hash
  from audit_log
  where warehouse_id = p_warehouse_id
  order by "timestamp" desc, log_id desc
  limit 1;

  insert into audit_log (
    warehouse_id,
    user_id,
    actor_name,
    entity,
    entity_id,
    action,
    old_data,
    new_data,
    ip_address,
    user_agent,
    session_id,
    request_id,
    previous_hash,
    current_hash,
    "timestamp"
  ) values (
    p_warehouse_id,
    p_user_id,
    resolved_actor,
    p_entity,
    nullif(p_entity_id, '')::uuid,
    p_action,
    p_old_data,
    p_new_data,
    nullif(p_ip_address, '')::inet,
    p_user_agent,
    nullif(p_session_id, ''),
    nullif(p_request_id, '')::uuid,
    prev_hash,
    p_current_hash,
    p_timestamp
  )
  returning log_id into new_log_id;

  return new_log_id;
end;
$$;

revoke all on function append_audit_log(uuid, uuid, text, text, text, jsonb, jsonb, text, text, text, text, text, timestamptz, text) from public;
grant execute on function append_audit_log(uuid, uuid, text, text, text, jsonb, jsonb, text, text, text, text, text, timestamptz, text) to service_role;
