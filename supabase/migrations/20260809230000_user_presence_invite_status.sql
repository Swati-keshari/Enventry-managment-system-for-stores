-- User presence + invite acceptance tracking.

alter table app_users
  add column if not exists invite_status text not null default 'accepted'
    check (invite_status in ('pending', 'accepted')),
  add column if not exists invited_at timestamptz,
  add column if not exists last_seen_at timestamptz;

comment on column app_users.invite_status is
  'pending = invited but not yet signed in; accepted = invitation completed';
comment on column app_users.last_seen_at is
  'Last client heartbeat used for Active / Inactive presence';

-- Existing members are treated as already accepted.
update app_users
set invite_status = 'accepted'
where invite_status is distinct from 'accepted';

create index if not exists app_users_last_seen_at_idx
  on app_users (last_seen_at desc nulls last);

create index if not exists app_users_invite_status_idx
  on app_users (warehouse_id, invite_status);
