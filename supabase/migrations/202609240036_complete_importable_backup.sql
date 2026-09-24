-- Rende il backup importabile un vero snapshot funzionale della lega.
-- Il formato 2 include anche date delle fasi, anagrafica fisica delle squadre,
-- bozze private dei contratti e metadati necessari ad annullare i movimenti.
create or replace function public.restore_importable_league_backup(backup_document jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  format_version integer;
  payload jsonb;
  season_payload jsonb;
  team_payload jsonb;
  state_payload jsonb;
  history_payload jsonb;
  competition_payload jsonb;
  calendar_payload jsonb;
  contract_draft_payload jsonb;
  movement_payload jsonb;
  active_season_id uuid;
  previous_season jsonb;
  previous_state jsonb;
  item_key text;
  item_value jsonb;
  team_value jsonb;
begin
  if not public.is_admin() then
    raise exception 'Operazione riservata agli amministratori' using errcode = '42501';
  end if;

  begin
    format_version := coalesce((backup_document ->> 'formatVersion')::integer, 0);
  exception when others then
    format_version := 0;
  end;
  if backup_document is null
    or jsonb_typeof(backup_document) <> 'object'
    or backup_document ->> 'format' <> 'greyson-allen-league-importable-backup'
    or format_version not in (1, 2)
  then
    raise exception 'Formato del backup non valido' using errcode = '22023';
  end if;

  payload := backup_document -> 'payload';
  season_payload := payload -> 'activeSeason';
  team_payload := payload -> 'teamRecords';
  state_payload := payload -> 'leagueState';
  history_payload := payload -> 'history';
  competition_payload := payload -> 'competitions';
  calendar_payload := payload -> 'calendar';
  contract_draft_payload := payload -> 'contractDrafts';
  movement_payload := payload -> 'movements';

  if payload is null
    or jsonb_typeof(payload) <> 'object'
    or season_payload is null
    or jsonb_typeof(season_payload) <> 'object'
    or coalesce(season_payload ->> 'name', '') !~ '^\d{4}/\d{2}$'
    or (season_payload ->> 'status') not in ('offseason', 'regular_season')
    or (season_payload ->> 'timeline_moment') not in (
      'offseason_start', 'team_option_deadline', 'auction_start', 'auction_completed',
      'contract_delivery', 'trade_deadline', 'buyout_end', 'free_agency_end',
      'free_agency_reopening'
    )
    or jsonb_typeof(season_payload -> 'team_options_resolved') <> 'boolean'
    or jsonb_typeof(season_payload -> 'trade_deadline_passed') <> 'boolean'
    or (
      (season_payload ->> 'timeline_moment') in ('offseason_start', 'team_option_deadline', 'auction_start')
      and (season_payload ->> 'status') <> 'offseason'
    )
    or (
      (season_payload ->> 'timeline_moment') in (
        'auction_completed', 'contract_delivery', 'trade_deadline', 'buyout_end',
        'free_agency_end', 'free_agency_reopening'
      )
      and (season_payload ->> 'status') <> 'regular_season'
    )
    or ((season_payload ->> 'team_options_resolved')::boolean <> ((season_payload ->> 'timeline_moment') <> 'offseason_start'))
    or ((season_payload ->> 'trade_deadline_passed')::boolean <> ((season_payload ->> 'timeline_moment') in (
      'trade_deadline', 'buyout_end', 'free_agency_end', 'free_agency_reopening'
    )))
  then
    raise exception 'Fase o annata del backup non valide' using errcode = '22023';
  end if;
  if format_version = 2 and jsonb_typeof(season_payload -> 'phase_dates') is distinct from 'object' then
    raise exception 'Date delle fasi del backup non valide' using errcode = '22023';
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
  if jsonb_typeof(history_payload) is distinct from 'object'
    or (select count(*) from jsonb_object_keys(history_payload)) <> 10
    or not history_payload ?& array[
      'Albo d''oro', 'Numero titoli', 'Playoff', 'Coppa', 'All Star Game',
      'March Madness', 'Conference League', 'Draft', 'Regular season', 'Roster vincitore'
    ]
  then
    raise exception 'Storico del backup non valido' using errcode = '22023';
  end if;
  if jsonb_typeof(competition_payload) is distinct from 'object'
    or (select count(*) from jsonb_object_keys(competition_payload)) <> 7
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
  if format_version = 2 and (
    jsonb_typeof(team_payload) is distinct from 'array'
    or jsonb_array_length(team_payload) > 100
    or jsonb_typeof(contract_draft_payload) is distinct from 'array'
    or jsonb_array_length(contract_draft_payload) > 10000
  ) then
    raise exception 'Archivio completo del backup non valido' using errcode = '22023';
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

  if format_version = 2 then
    perform 1 from public.teams for update;
    if (select count(*) from public.teams) <> jsonb_array_length(team_payload)
      or exists (
        select 1
        from jsonb_array_elements(team_payload) as item(value)
        where jsonb_typeof(item.value) <> 'object'
          or coalesce(item.value ->> 'id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          or coalesce(item.value ->> 'code', '') !~ '^[A-Z]{3}$'
          or coalesce(trim(item.value ->> 'name'), '') = ''
          or coalesce(trim(item.value ->> 'slug'), '') = ''
          or coalesce(trim(item.value ->> 'owner_name'), '') = ''
          or jsonb_typeof(item.value -> 'active') is distinct from 'boolean'
          or not exists (select 1 from public.teams where id = (item.value ->> 'id')::uuid)
      )
      or (
        select count(distinct item.value ->> 'id')
        from jsonb_array_elements(team_payload) as item(value)
      ) <> jsonb_array_length(team_payload)
      or (
        select count(distinct item.value ->> 'code')
        from jsonb_array_elements(team_payload) as item(value)
      ) <> jsonb_array_length(team_payload)
      or (
        select count(distinct item.value ->> 'name')
        from jsonb_array_elements(team_payload) as item(value)
      ) <> jsonb_array_length(team_payload)
      or (
        select count(distinct item.value ->> 'slug')
        from jsonb_array_elements(team_payload) as item(value)
      ) <> jsonb_array_length(team_payload)
      or exists (
        select 1 from public.teams as database_team
        where not exists (
          select 1 from jsonb_array_elements(team_payload) as stored_team(value)
          where stored_team.value ->> 'id' = database_team.id::text
        )
      )
      or exists (
        select 1 from jsonb_array_elements(state_payload -> 'teams') as state_team(value)
        where not exists (
          select 1 from jsonb_array_elements(team_payload) as stored_team(value)
          where (stored_team.value ->> 'active')::boolean
            and stored_team.value ->> 'code' = state_team.value ->> 'code'
        )
      )
      or exists (
        select 1 from jsonb_array_elements(team_payload) as stored_team(value)
        where (stored_team.value ->> 'active')::boolean
          and not exists (
            select 1 from jsonb_array_elements(state_payload -> 'teams') as state_team(value)
            where state_team.value ->> 'code' = stored_team.value ->> 'code'
          )
      )
    then
      raise exception 'Archivio delle squadre non coerente con il database' using errcode = '22023';
    end if;

    -- Due passaggi permettono anche scambi di sigle, nomi o slug senza urtare
    -- temporaneamente i vincoli univoci.
    update public.teams
    set code = 'RESTORE' || upper(replace(id::text, '-', '')),
        name = '__restore_name_' || id::text,
        slug = '__restore_slug_' || id::text;
    for team_value in select value from jsonb_array_elements(team_payload)
    loop
      update public.teams
      set code = team_value ->> 'code',
          name = team_value ->> 'name',
          slug = team_value ->> 'slug',
          owner_name = team_value ->> 'owner_name',
          logo_url = case when jsonb_typeof(team_value -> 'logo_url') = 'string' then team_value ->> 'logo_url' else null end,
          active = (team_value ->> 'active')::boolean
      where id = (team_value ->> 'id')::uuid;
    end loop;
  end if;

  update public.seasons
  set name = season_payload ->> 'name',
      status = (season_payload ->> 'status')::public.season_status,
      team_options_resolved = (season_payload ->> 'team_options_resolved')::boolean,
      trade_deadline_passed = (season_payload ->> 'trade_deadline_passed')::boolean,
      timeline_moment = season_payload ->> 'timeline_moment',
      phase_dates = case when format_version = 2 then season_payload -> 'phase_dates' else phase_dates end
  where id = active_season_id;

  insert into public.league_state_overrides(state_key, payload, updated_at, updated_by)
  values ('current', state_payload, now(), auth.uid())
  on conflict (state_key) do update
  set payload = excluded.payload,
      updated_at = excluded.updated_at,
      updated_by = excluded.updated_by;

  delete from public.history_competition_content where category is not null;
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

  if format_version = 2 then
    delete from public.post_auction_contract_drafts where season_name is not null;
    for item_value in select value from jsonb_array_elements(contract_draft_payload)
    loop
      if jsonb_typeof(item_value) <> 'object'
        or coalesce(item_value ->> 'season_name', '') !~ '^\d{4}/\d{2}$'
        or coalesce(item_value ->> 'team_code', '') !~ '^[A-Z]{3}$'
        or coalesce(trim(item_value ->> 'player_name'), '') = ''
        or coalesce(item_value ->> 'contract_kind', '') not in ('annual', 'biennial', 'triennial', 'team_option')
        or coalesce(item_value ->> 'slot', '') not in ('regular', 'two_way', 'g_league')
      then
        raise exception 'Bozza di contratto non valida nel backup' using errcode = '22023';
      end if;
      insert into public.post_auction_contract_drafts(
        season_name, team_code, player_name, contract_kind, slot, updated_at, updated_by
      ) values (
        item_value ->> 'season_name',
        item_value ->> 'team_code',
        item_value ->> 'player_name',
        item_value ->> 'contract_kind',
        item_value ->> 'slot',
        now(),
        auth.uid()
      );
    end loop;
  end if;

  delete from public.league_movements where id is not null;
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
      season_name, undo_before_moment, reverts_movement_id,
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
      item_value ->> 'season_name',
      item_value ->> 'undo_before_moment',
      null,
      (item_value ->> 'created_at')::timestamptz,
      auth.uid(),
      case when item_value ->> 'reverted_at' is null then null else (item_value ->> 'reverted_at')::timestamptz end,
      case when item_value ->> 'reverted_at' is null then null else auth.uid() end
    );
  end loop;

  -- I riferimenti agli annullamenti vengono applicati solo dopo avere inserito
  -- tutte le righe, quindi l'ordine del JSON non può rompere la foreign key.
  for item_value in select value from jsonb_array_elements(movement_payload)
  loop
    if item_value ->> 'reverts_movement_id' is not null then
      update public.league_movements
      set reverts_movement_id = (item_value ->> 'reverts_movement_id')::uuid
      where id = (item_value ->> 'id')::uuid;
    end if;
  end loop;

  -- I punti di rollback creati dopo lo snapshot non appartengono più alla
  -- linea temporale ripristinata.
  delete from public.league_phase_backups where id is not null;

  insert into public.audit_log(user_id, action, entity_type, old_data, new_data, reason)
  values (
    auth.uid(),
    'importable_backup_restored',
    'league',
    jsonb_build_object('season', previous_season, 'state', previous_state),
    jsonb_build_object(
      'season', season_payload,
      'source_exported_at', backup_document ->> 'exportedAt',
      'source_checksum', backup_document ->> 'checksum',
      'format_version', format_version
    ),
    'Ripristino completo da backup importabile'
  );
end;
$$;

revoke all on function public.restore_importable_league_backup(jsonb) from public;
grant execute on function public.restore_importable_league_backup(jsonb) to authenticated;

notify pgrst, 'reload schema';
