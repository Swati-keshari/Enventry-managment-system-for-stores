-- Clearer audit integrity messages when previous_hash is null/empty,
-- and keep repair/verify helpers in sync.

create or replace function verify_audit_integrity(p_warehouse_id uuid)
returns table(ok boolean, broken_at bigint, message text) as $$
declare
  prev_hash text := null;
  rec record;
  got_label text;
  expected_label text;
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
      expected_label := coalesce(prev_hash, '<null>');
      got_label := coalesce(nullif(rec.previous_hash, ''), '<null>');
      message := format(
        'log_id %s: expected previous_hash=%s, got %s',
        rec.log_id,
        expected_label,
        got_label
      );
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
