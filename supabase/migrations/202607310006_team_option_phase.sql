alter table public.seasons
add column if not exists team_options_resolved boolean not null default false;

update public.seasons
set name = '2026/27'
where is_active = true
  and name = '2025/26';
