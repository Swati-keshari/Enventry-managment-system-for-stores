-- Atomic audit append + chain repair for concurrent-safe hash linking.

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
  p_timestamp timestamptz default now()
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  prev_hash text;
  new_log_id bigint;
begin
  -- Serialize appends per warehouse so previous_hash is always correct.
  perform pg_advisory_xact_lock(hashtext(p_warehouse_id::text));

  select current_hash
    into prev_hash
  from audit_log
  where warehouse_id = p_warehouse_id
  order by "timestamp" desc, log_id desc
  limit 1;

  insert into audit_log (
    warehouse_id,
    user_id,
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

create or replace function repair_audit_chain(p_warehouse_id uuid)
returns table(ok boolean, repaired_count integer, message text)
language plpgsql
security definer
set search_path = public
as $$
declare
  prev_hash text := null;
  rec record;
  fixed integer := 0;
begin
  perform pg_advisory_xact_lock(hashtext(p_warehouse_id::text));

  for rec in
    select log_id, previous_hash, current_hash
    from audit_log
    where warehouse_id = p_warehouse_id
    order by "timestamp" asc, log_id asc
    for update
  loop
    if rec.previous_hash is distinct from prev_hash then
      update audit_log
      set previous_hash = prev_hash
      where log_id = rec.log_id;
      fixed := fixed + 1;
    end if;
    prev_hash := rec.current_hash;
  end loop;

  ok := true;
  repaired_count := fixed;
  message := format('Repaired %s audit link(s). Chain is contiguous again.', fixed);
  return next;
end;
$$;

revoke all on function append_audit_log(uuid, uuid, text, text, text, jsonb, jsonb, text, text, text, text, text, timestamptz) from public;
revoke all on function repair_audit_chain(uuid) from public;
grant execute on function append_audit_log(uuid, uuid, text, text, text, jsonb, jsonb, text, text, text, text, text, timestamptz) to service_role;
grant execute on function repair_audit_chain(uuid) to service_role;
