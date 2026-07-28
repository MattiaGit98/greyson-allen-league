create table public.imported_draft_assets (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons,
  owning_team_id uuid not null references public.teams,
  label text not null,
  round_text text not null,
  draft_year integer not null check (draft_year between 2020 and 2100),
  origin_or_overall text not null,
  source text not null default 'initial_excel_import',
  created_at timestamptz not null default now()
);

alter table public.imported_draft_assets enable row level security;
create policy public_read on public.imported_draft_assets for select using (true);
create policy admin_all on public.imported_draft_assets
  for all using (public.is_admin()) with check (public.is_admin());

create index imported_draft_assets_owner_year
  on public.imported_draft_assets(owning_team_id, draft_year);
