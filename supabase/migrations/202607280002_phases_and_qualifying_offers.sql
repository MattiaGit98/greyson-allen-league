create type public.qualifying_offer_status as enum ('eligible','extended','accepted','declined','matched','expired');

create table public.qualifying_offer_rights (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons,
  team_id uuid not null references public.teams,
  player_id uuid not null references public.players,
  qualifying_amount integer not null check (qualifying_amount > 0),
  status public.qualifying_offer_status not null default 'eligible',
  source_roster_entry_id uuid references public.roster_entries,
  extended_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  unique(season_id, player_id)
);

alter table public.qualifying_offer_rights enable row level security;
create policy public_read on public.qualifying_offer_rights for select using (true);
create policy admin_all on public.qualifying_offer_rights
  for all using (public.is_admin()) with check (public.is_admin());

create or replace function public.set_active_season_status(requested_status public.season_status)
returns public.seasons
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_season public.seasons;
  previous_status public.season_status;
  allowed boolean;
begin
  if not public.is_admin() then
    raise exception 'Operazione riservata agli amministratori';
  end if;

  select * into current_season
  from public.seasons
  where is_active
  for update;

  if current_season.id is null then
    raise exception 'Nessuna stagione attiva';
  end if;

  if requested_status not in ('offseason','auction','regular_season') then
    raise exception 'Fase non gestibile da questo controllo';
  end if;

  allowed :=
    requested_status = current_season.status
    or (current_season.status in ('setup','completed') and requested_status = 'offseason')
    or (current_season.status = 'offseason' and requested_status = 'auction')
    or (current_season.status = 'auction' and requested_status in ('offseason','regular_season'))
    or (current_season.status = 'regular_season' and requested_status = 'offseason');

  if not allowed then
    raise exception 'Transizione non consentita: % → %', current_season.status, requested_status;
  end if;

  previous_status := current_season.status;
  update public.seasons
  set status = requested_status
  where id = current_season.id
  returning * into current_season;

  insert into public.audit_log(user_id, action, entity_type, entity_id, old_data, new_data, reason)
  values (
    auth.uid(),
    'season_phase_changed',
    'season',
    current_season.id,
    jsonb_build_object('status', previous_status),
    jsonb_build_object('status', requested_status),
    'Cambio fase dalla pagina impostazioni'
  );

  return current_season;
end;
$$;

revoke all on function public.set_active_season_status(public.season_status) from public;
grant execute on function public.set_active_season_status(public.season_status) to authenticated;
