-- Persist vehicle number on each DO item line.

alter table do_items
  add column if not exists vehicle_number text;

comment on column do_items.vehicle_number is
  'Optional vehicle/truck number captured for this DO item line.';
