-- Mantiene la migrazione di ripristino compatibile anche con database in cui
-- l'estensione dei movimenti Draft non è ancora stata applicata separatamente.
alter table public.league_movements
  add column if not exists history_category text,
  add column if not exists before_history jsonb,
  add column if not exists after_history jsonb;

create or replace function public.restore_importable_league_backup(backup_document jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  payload jsonb;
  season_payload jsonb;
  state_payload jsonb;
  history_payload jsonb;
  competition_payload jsonb;
  calendar_payload jsonb;
  movement_payload jsonb;
  active_season_id uuid;
  previous_season jsonb;
  previous_state jsonb;
  item_key text;
  item_value jsonb;
begin
  if not public.is_admin() then
    raise exception 'Operazione riservata agli amministratori' using errcode = '42501';
  end if;
  if backup_document is null
    or jsonb_typeof(backup_document) <> 'object'
    or backup_document ->> 'format' <> 'greyson-allen-league-importable-backup'
    or coalesce((backup_document ->> 'formatVersion')::integer, 0) <> 1
  then
    raise exception 'Formato del backup non valido' using errcode = '22023';
  end if;

  payload := backup_document -> 'payload';
  season_payload := payload -> 'activeSeason';
  state_payload := payload -> 'leagueState';
  history_payload := payload -> 'history';
  competition_payload := payload -> 'competitions';
  calendar_payload := payload -> 'calendar';
  movement_payload := payload -> 'movements';

  if payload is null
    or jsonb_typeof(payload) <> 'object'
    or season_payload is null
    or jsonb_typeof(season_payload) <> 'object'
    or coalesce(season_payload ->> 'name', '') !~ '^\d{4}/\d{2}$'
    or (season_payload ->> 'status') not in ('offseason', 'regular_season')
    or (season_payload ->> 'timeline_moment') not in (
      'offseason_start', 'team_option_deadline', 'free_releases_start', 'auction_completed',
      'contract_delivery', 'trade_deadline', 'buyout_end', 'free_agency_end'
    )
    or jsonb_typeof(season_payload -> 'team_options_resolved') <> 'boolean'
    or jsonb_typeof(season_payload -> 'trade_deadline_passed') <> 'boolean'
    or (
      (season_payload ->> 'timeline_moment') in ('offseason_start', 'team_option_deadline', 'free_releases_start')
      and (season_payload ->> 'status') <> 'offseason'
    )
    or (
      (season_payload ->> 'timeline_moment') in ('auction_completed', 'contract_delivery', 'trade_deadline', 'buyout_end', 'free_agency_end')
      and (season_payload ->> 'status') <> 'regular_season'
    )
    or ((season_payload ->> 'team_options_resolved')::boolean <> ((season_payload ->> 'timeline_moment') <> 'offseason_start'))
    or ((season_payload ->> 'trade_deadline_passed')::boolean <> ((season_payload ->> 'timeline_moment') in ('trade_deadline', 'buyout_end', 'free_agency_end')))
  then
    raise exception 'Fase o annata del backup non valide' using errcode = '22023';
  end if;
  if jsonb_typeof(state_payload) is distinct from 'object'
    or jsonb_typeof(state_payload -> 'teams') is distinct from 'array'
    or jsonb_typeof(state_payload -> 'rosterEntries') is distinct from 'array'
    or jsonb_typeof(state_payload -> 'draftAssets') is distinct from 'array'
    or jsonb_typeof(state_payload -> 'qualifyingOfferRights') is distinct from 'array'
    or jsonb_typeof(state_payload -> 'playerList') is distinct from 'array'
  then
    raise exception 'Stato della lega non valido' using errcode = '22023';
  end if;
  if jsonb_typeof(history_payload) is distinct from 'object' then
    raise exception 'Storico del backup non valido' using errcode = '22023';
  end if;
  if (select count(*) from jsonb_object_keys(history_payload)) <> 10
    or not history_payload ?& array[
      'Albo d''oro', 'Numero titoli', 'Playoff', 'Coppa', 'All Star Game',
      'March Madness', 'Conference League', 'Draft', 'Regular season', 'Roster vincitore'
    ]
  then
    raise exception 'Storico del backup non valido' using errcode = '22023';
  end if;
  if jsonb_typeof(competition_payload) is distinct from 'object' then
    raise exception 'Classifiche e tabelloni del backup non validi' using errcode = '22023';
  end if;
  if (select count(*) from jsonb_object_keys(competition_payload)) <> 7
    or not competition_payload ?& array[
      'Girone coppa', 'Tabellone coppa', 'Regular season', 'Playoff',
      'Conference League', 'All Star Game', 'March Madness'
    ]
  then
    raise exception 'Classifiche e tabelloni del backup non validi' using errcode = '22023';
  end if;
  if jsonb_typeof(calendar_payload) is distinct from 'array' or jsonb_array_length(calendar_payload) > 300 then
    raise exception 'Calendario del backup non valido' using errcode = '22023';
  end if;
  if jsonb_typeof(movement_payload) is distinct from 'array' or jsonb_array_length(movement_payload) > 50000 then
    raise exception 'Registro movimenti del backup non valido' using errcode = '22023';
  end if;

  select s.id, to_jsonb(s)
  into active_season_id, previous_season
  from public.seasons as s
  where s.is_active = true
  for update;
  if active_season_id is null then
    raise exception 'Nessuna stagione attiva' using errcode = '22023';
  end if;
  select league_state.payload into previous_state
  from public.league_state_overrides as league_state
  where league_state.state_key = 'current'
  for update;

  update public.seasons
  set name = season_payload ->> 'name',
      status = (season_payload ->> 'status')::public.season_status,
      team_options_resolved = (season_payload ->> 'team_options_resolved')::boolean,
      trade_deadline_passed = (season_payload ->> 'trade_deadline_passed')::boolean,
      timeline_moment = season_payload ->> 'timeline_moment'
  where id = active_season_id;

  insert into public.league_state_overrides(state_key, payload, updated_at, updated_by)
  values ('current', state_payload, now(), auth.uid())
  on conflict (state_key) do update
  set payload = excluded.payload,
      updated_at = excluded.updated_at,
      updated_by = excluded.updated_by;

  delete from public.history_competition_content
  where category is not null;
  for item_key, item_value in select key, value from jsonb_each(history_payload)
  loop
    if jsonb_typeof(item_value) <> 'array' then
      raise exception 'Storico non valido per %', item_key using errcode = '22023';
    end if;
    insert into public.history_competition_content(category, entries, updated_by, updated_at)
    values (item_key, item_value, auth.uid(), now());
  end loop;

  delete from public.competition_content where season_id = active_season_id;
  for item_key, item_value in select key, value from jsonb_each(competition_payload)
  loop
    if jsonb_typeof(item_value) <> 'object' then
      raise exception 'Competizione non valida per %', item_key using errcode = '22023';
    end if;
    insert into public.competition_content(season_id, competition_name, content, updated_by, updated_at)
    values (active_season_id, item_key, item_value, auth.uid(), now());
  end loop;

  delete from public.calendar_events where season_id = active_season_id;
  insert into public.calendar_events(season_id, sort_order, event_text, date_text, updated_by, updated_at)
  select
    active_season_id,
    item.position::integer,
    left(coalesce(item.value ->> 'event', ''), 500),
    left(coalesce(item.value ->> 'date', ''), 500),
    auth.uid(),
    now()
  from jsonb_array_elements(calendar_payload) with ordinality as item(value, position);

  delete from public.league_movements
  where id is not null;
  for item_value in select value from jsonb_array_elements(movement_payload)
  loop
    if jsonb_typeof(item_value) <> 'object'
      or jsonb_typeof(item_value -> 'before_state') <> 'object'
      or jsonb_typeof(item_value -> 'after_state') <> 'object'
      or nullif(item_value ->> 'operation_type', '') is null
      or nullif(item_value ->> 'summary', '') is null
      or (
        item_value ->> 'history_category' is null
        and (
          coalesce(item_value -> 'before_history', 'null'::jsonb) <> 'null'::jsonb
          or coalesce(item_value -> 'after_history', 'null'::jsonb) <> 'null'::jsonb
        )
      )
      or (
        item_value ->> 'history_category' is not null
        and (
          coalesce(jsonb_typeof(item_value -> 'before_history'), '') <> 'array'
          or coalesce(jsonb_typeof(item_value -> 'after_history'), '') <> 'array'
        )
      )
    then
      raise exception 'Movimento non valido nel backup' using errcode = '22023';
    end if;
    insert into public.league_movements(
      id, operation_type, summary, before_state, after_state,
      history_category, before_history, after_history,
      created_at, created_by, reverted_at, reverted_by
    ) values (
      (item_value ->> 'id')::uuid,
      item_value ->> 'operation_type',
      item_value ->> 'summary',
      item_value -> 'before_state',
      item_value -> 'after_state',
      item_value ->> 'history_category',
      case when item_value ->> 'history_category' is null then null else item_value -> 'before_history' end,
      case when item_value ->> 'history_category' is null then null else item_value -> 'after_history' end,
      (item_value ->> 'created_at')::timestamptz,
      auth.uid(),
      case when item_value ->> 'reverted_at' is null then null else (item_value ->> 'reverted_at')::timestamptz end,
      case when item_value ->> 'reverted_at' is null then null else auth.uid() end
    );
  end loop;

  delete from public.league_phase_backups
  where id is not null;

  insert into public.audit_log(user_id, action, entity_type, old_data, new_data, reason)
  values (
    auth.uid(),
    'importable_backup_restored',
    'league',
    jsonb_build_object('season', previous_season, 'state', previous_state),
    jsonb_build_object(
      'season', season_payload,
      'source_exported_at', backup_document ->> 'exportedAt',
      'source_checksum', backup_document ->> 'checksum'
    ),
    'Ripristino completo da backup importabile'
  );
end;
$$;

revoke all on function public.restore_importable_league_backup(jsonb) from public;
grant execute on function public.restore_importable_league_backup(jsonb) to authenticated;

notify pgrst, 'reload schema';
