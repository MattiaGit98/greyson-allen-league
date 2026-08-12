alter table public.seasons
add column if not exists phase_dates jsonb not null default '{}'::jsonb;

alter table public.seasons
drop constraint if exists seasons_phase_dates_object;

alter table public.seasons
add constraint seasons_phase_dates_object check (jsonb_typeof(phase_dates) = 'object');

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
      trade_deadline_passed = coalesce((backup_row.season_snapshot->>'trade_deadline_passed')::boolean, false),
      timeline_moment = coalesce(backup_row.season_snapshot->>'timeline_moment', timeline_moment),
      phase_dates = coalesce(backup_row.season_snapshot->'phase_dates', '{}'::jsonb)
  where id = backup_row.season_id;

  insert into public.league_state_overrides(state_key, payload, updated_at, updated_by)
  values ('current', backup_row.state_snapshot, now(), auth.uid())
  on conflict (state_key) do update
  set payload = excluded.payload, updated_at = excluded.updated_at, updated_by = excluded.updated_by;

  delete from public.history_competition_content;
  for item_key, item_value in select key, value from jsonb_each(backup_row.history_snapshot) loop
    insert into public.history_competition_content(category, entries, updated_by, updated_at)
    values (item_key, item_value, auth.uid(), now());
  end loop;

  delete from public.competition_content where season_id = backup_row.season_id;
  for item_key, item_value in select key, value from jsonb_each(backup_row.competition_snapshot) loop
    insert into public.competition_content(season_id, competition_name, content, updated_by, updated_at)
    values (backup_row.season_id, item_key, item_value, auth.uid(), now());
  end loop;

  update public.league_phase_backups
  set restored_at = now(), restored_by = auth.uid()
  where id = requested_backup_id;
end;
$$;

notify pgrst, 'reload schema';
