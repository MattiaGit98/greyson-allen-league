create table public.public_content_overrides (
  scope text not null check (scope in ('standings','history')),
  sheet_name text not null,
  row_number integer not null check (row_number > 0),
  column_number integer not null check (column_number > 0),
  value text not null default '',
  updated_by uuid references auth.users,
  updated_at timestamptz not null default now(),
  primary key (scope, sheet_name, row_number, column_number)
);

alter table public.public_content_overrides enable row level security;

create policy public_read
on public.public_content_overrides
for select
using (true);

create policy admin_all
on public.public_content_overrides
for all
using (public.is_admin())
with check (public.is_admin());
