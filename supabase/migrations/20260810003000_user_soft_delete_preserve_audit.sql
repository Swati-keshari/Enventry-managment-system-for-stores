-- Soft-delete users so audit_log rows are never removed or unlinked.
-- Keeping the app_users row means audit_log.user_id stays valid (no SET NULL).

alter table app_users
  add column if not exists deleted_at timestamptz;

comment on column app_users.deleted_at is
  'When set, user is removed from the warehouse but retained forever for audit history. Audit logs are never deleted when a user is removed.';

create index if not exists app_users_active_warehouse_idx
  on app_users (warehouse_id)
  where deleted_at is null;

-- Authenticated clients must never delete audit history.
revoke delete on audit_log from authenticated;
revoke delete on audit_log from anon;
