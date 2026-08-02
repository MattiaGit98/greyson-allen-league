create table if not exists public.league_movements (
  id uuid primary key default gen_random_uuid(),
  operation_type text not null,
  summary text not null,
  before_state jsonb not null,
  after_state jsonb not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users,
  reverted_at timestamptz,
  reverted_by uuid references auth.users
);

alter table public.league_movements enable row level security;
drop policy if exists admin_all on public.league_movements;
create policy admin_all on public.league_movements
  for all using (public.is_admin()) with check (public.is_admin());

create or replace view public.league_movement_feed as
select id, operation_type, summary, created_at, (reverted_at is not null) as reverted
from public.league_movements
order by created_at desc;
grant select on public.league_movement_feed to anon, authenticated;

create or replace function public.apply_league_state_movement(
  expected_before_state jsonb,
  next_state jsonb,
  movement_type text,
  movement_summary text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_state jsonb;
  movement_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Operazione riservata agli amministratori' using errcode = '42501';
  end if;
  if next_state is null or jsonb_typeof(next_state) <> 'object' then
    raise exception 'Stato della lega non valido' using errcode = '22023';
  end if;

  select payload into current_state
  from public.league_state_overrides
  where state_key = 'current'
  for update;
  if current_state is not null and (
    coalesce(current_state->'rosterEntries', '[]'::jsonb) <> coalesce(expected_before_state->'rosterEntries', '[]'::jsonb)
    or coalesce(current_state->'draftAssets', '[]'::jsonb) <> coalesce(expected_before_state->'draftAssets', '[]'::jsonb)
    or coalesce(current_state->'qualifyingOfferRights', '[]'::jsonb) <> coalesce(expected_before_state->'qualifyingOfferRights', '[]'::jsonb)
    or coalesce(current_state->'playerList', '[]'::jsonb) <> coalesce(expected_before_state->'playerList', '[]'::jsonb)
  ) then
    raise exception 'Lo stato della lega è cambiato: aggiorna la pagina' using errcode = '40001';
  end if;

  insert into public.league_state_overrides(state_key, payload, updated_at, updated_by)
  values ('current', next_state, now(), auth.uid())
  on conflict (state_key) do update
  set payload = excluded.payload,
      updated_at = excluded.updated_at,
      updated_by = excluded.updated_by;

  insert into public.league_movements(operation_type, summary, before_state, after_state, created_by)
  values (movement_type, movement_summary, expected_before_state, next_state, auth.uid())
  returning id into movement_id;
  return movement_id;
end;
$$;

revoke all on function public.apply_league_state_movement(jsonb, jsonb, text, text) from public;
grant execute on function public.apply_league_state_movement(jsonb, jsonb, text, text) to authenticated;

create or replace function public.revert_league_state_movement(
  requested_movement_id uuid,
  expected_current_state jsonb,
  restored_state jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_state jsonb;
  movement_row public.league_movements;
begin
  if not public.is_admin() then
    raise exception 'Operazione riservata agli amministratori' using errcode = '42501';
  end if;
  select * into movement_row from public.league_movements
  where id = requested_movement_id for update;
  if movement_row.id is null or movement_row.reverted_at is not null then
    raise exception 'Movimento non disponibile' using errcode = '22023';
  end if;
  select payload into current_state from public.league_state_overrides
  where state_key = 'current' for update;
  if coalesce(current_state->'rosterEntries', '[]'::jsonb) <> coalesce(expected_current_state->'rosterEntries', '[]'::jsonb)
    or coalesce(current_state->'draftAssets', '[]'::jsonb) <> coalesce(expected_current_state->'draftAssets', '[]'::jsonb)
    or coalesce(current_state->'qualifyingOfferRights', '[]'::jsonb) <> coalesce(expected_current_state->'qualifyingOfferRights', '[]'::jsonb)
    or coalesce(current_state->'playerList', '[]'::jsonb) <> coalesce(expected_current_state->'playerList', '[]'::jsonb)
  then
    raise exception 'Lo stato della lega è cambiato: aggiorna la pagina' using errcode = '40001';
  end if;

  update public.league_state_overrides
  set payload = restored_state, updated_at = now(), updated_by = auth.uid()
  where state_key = 'current';
  update public.league_movements
  set reverted_at = now(), reverted_by = auth.uid()
  where id = requested_movement_id;
end;
$$;

revoke all on function public.revert_league_state_movement(uuid, jsonb, jsonb) from public;
grant execute on function public.revert_league_state_movement(uuid, jsonb, jsonb) to authenticated;

create table if not exists public.league_phase_backups (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons,
  from_phase text not null,
  to_phase text not null,
  season_snapshot jsonb not null,
  state_snapshot jsonb not null,
  history_snapshot jsonb not null,
  competition_snapshot jsonb not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users,
  restored_at timestamptz,
  restored_by uuid references auth.users
);

alter table public.league_phase_backups enable row level security;
drop policy if exists admin_all on public.league_phase_backups;
create policy admin_all on public.league_phase_backups
  for all using (public.is_admin()) with check (public.is_admin());

create or replace function public.restore_league_phase_backup(requested_backup_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  backup_row public.league_phase_backups;
  item_key text;
  item_value jsonb;
begin
  if not public.is_admin() then
    raise exception 'Operazione riservata agli amministratori' using errcode = '42501';
  end if;
  select * into backup_row from public.league_phase_backups
  where id = requested_backup_id for update;
  if backup_row.id is null or backup_row.restored_at is not null then
    raise exception 'Backup non disponibile' using errcode = '22023';
  end if;

  update public.seasons
  set name = backup_row.season_snapshot->>'name',
      status = (backup_row.season_snapshot->>'status')::public.season_status,
      team_options_resolved = coalesce((backup_row.season_snapshot->>'team_options_resolved')::boolean, false),
      trade_deadline_passed = coalesce((backup_row.season_snapshot->>'trade_deadline_passed')::boolean, false)
  where id = backup_row.season_id;

  insert into public.league_state_overrides(state_key, payload, updated_at, updated_by)
  values ('current', backup_row.state_snapshot, now(), auth.uid())
  on conflict (state_key) do update
  set payload = excluded.payload, updated_at = excluded.updated_at, updated_by = excluded.updated_by;

  delete from public.history_competition_content;
  for item_key, item_value in select key, value from jsonb_each(backup_row.history_snapshot)
  loop
    insert into public.history_competition_content(category, entries, updated_by, updated_at)
    values (item_key, item_value, auth.uid(), now());
  end loop;

  delete from public.competition_content where season_id = backup_row.season_id;
  for item_key, item_value in select key, value from jsonb_each(backup_row.competition_snapshot)
  loop
    insert into public.competition_content(season_id, competition_name, content, updated_by, updated_at)
    values (backup_row.season_id, item_key, item_value, auth.uid(), now());
  end loop;

  update public.league_phase_backups
  set restored_at = now(), restored_by = auth.uid()
  where id = requested_backup_id;
end;
$$;

revoke all on function public.restore_league_phase_backup(uuid) from public;
grant execute on function public.restore_league_phase_backup(uuid) to authenticated;

notify pgrst, 'reload schema';
