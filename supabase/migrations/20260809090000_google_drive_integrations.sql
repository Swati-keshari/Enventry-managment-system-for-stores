-- Google Drive OAuth connections are stored per warehouse.
-- Refresh tokens are encrypted by the application before they reach Postgres.

create table drive_integrations (
  warehouse_id            uuid primary key references warehouses(warehouse_id) on delete cascade,
  refresh_token_encrypted text not null,
  account_email           text,
  root_folder_id          text not null,
  connected_by            uuid references app_users(user_id) on delete set null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

alter table drive_integrations enable row level security;

-- Tokens are server-only. Browser clients must use the authenticated API.
create index idx_drive_integrations_connected_by
  on drive_integrations(connected_by);

