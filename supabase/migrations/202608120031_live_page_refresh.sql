-- Lightweight public signal for refreshing pages already open in the browser.
-- The event contains only a revision number, never the league-state JSON payload.
create table if not exists public.league_live_revision (
  id smallint primary key default 1 check (id = 1),
  revision bigint not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.league_live_revision enable row level security;

drop policy if exists public_read on public.league_live_revision;
create policy public_read on public.league_live_revision
  for select using (true);

insert into public.league_live_revision (id)
values (1)
on conflict (id) do nothing;

create or replace function public.bump_league_live_revision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.league_live_revision
  set revision = revision + 1,
      updated_at = clock_timestamp()
  where id = 1;
  return null;
end;
$$;

revoke all on function public.bump_league_live_revision() from public;

do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'league_state_overrides',
    'league_movements',
    'seasons',
    'calendar_events',
    'competition_content',
    'public_content_overrides',
    'history_competition_content',
    'imported_draft_assets'
  ]
  loop
    execute format('drop trigger if exists league_live_revision_%1$s on public.%1$I', target_table);
    execute format(
      'create trigger league_live_revision_%1$s after insert or update or delete on public.%1$I for each statement execute function public.bump_league_live_revision()',
      target_table
    );
  end loop;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'league_live_revision'
  ) then
    alter publication supabase_realtime add table public.league_live_revision;
  end if;
end;
$$;
