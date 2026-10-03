-- Impedisce i lost update sui salvataggi editoriali e rende atomiche le due
-- operazioni amministrative che attraversano piu tabelle: avanzamento della
-- lega e modifica dell'identità di una squadra.

create or replace function public.canonical_league_state_for_concurrency(state_payload jsonb)
returns jsonb
language sql
immutable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'teams', coalesce((
      select jsonb_agg(
        item - array['players', 'cutPlayers', 'qualifyingOffers', 'draftAssets']::text[]
        order by item->>'code'
      )
      from jsonb_array_elements(
        case when jsonb_typeof(state_payload->'teams') = 'array'
          then state_payload->'teams'
          else '[]'::jsonb
        end
      ) as team(item)
    ), '[]'::jsonb),
    'rosterEntries', case when jsonb_typeof(state_payload->'rosterEntries') = 'array'
      then state_payload->'rosterEntries' else '[]'::jsonb end,
    'draftAssets', case when jsonb_typeof(state_payload->'draftAssets') = 'array'
      then state_payload->'draftAssets' else '[]'::jsonb end,
    'qualifyingOfferRights', case when jsonb_typeof(state_payload->'qualifyingOfferRights') = 'array'
      then state_payload->'qualifyingOfferRights' else '[]'::jsonb end,
    'playerList', coalesce((
      select jsonb_agg(player order by case when player->>'role' = 'X' then 1 else 0 end, ordinal)
      from jsonb_array_elements(
        case when jsonb_typeof(state_payload->'playerList') = 'array'
          then state_payload->'playerList'
          else '[]'::jsonb
        end
      ) with ordinality as players(player, ordinal)
    ), '[]'::jsonb),
    'playerListStatus', to_jsonb(coalesce(state_payload->>'playerListStatus', 'offseason')),
    'publicNotice', to_jsonb(trim(coalesce(state_payload->>'publicNotice', ''))),
    'homepageHonoursTable', to_jsonb(coalesce(state_payload->>'homepageHonoursTable', '')),
    'homepageCompetition', coalesce(state_payload->'homepageCompetition', 'null'::jsonb),
    'draftOrders', case when jsonb_typeof(state_payload->'draftOrders') = 'array'
      then state_payload->'draftOrders' else '[]'::jsonb end,
    'finalizedDraftPositionYears', case when jsonb_typeof(state_payload->'finalizedDraftPositionYears') = 'array'
      then state_payload->'finalizedDraftPositionYears' else '[]'::jsonb end
  );
$$;

revoke all on function public.canonical_league_state_for_concurrency(jsonb) from public, anon, authenticated;

create or replace function public.replace_league_state_if_unchanged(
  expected_state_payload jsonb,
  next_state_payload jsonb,
  audit_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_state jsonb;
begin
  if not public.is_admin() then
    raise exception 'Operazione riservata agli amministratori' using errcode = '42501';
  end if;
  if expected_state_payload is null
    or next_state_payload is null
    or jsonb_typeof(expected_state_payload) <> 'object'
    or jsonb_typeof(next_state_payload) <> 'object'
  then
    raise exception 'Stato della lega non valido' using errcode = '22023';
  end if;

  select payload into current_state
  from public.league_state_overrides
  where state_key = 'current'
  for update;

  if current_state is null then
    raise exception 'Stato della lega non inizializzato' using errcode = '22023';
  end if;
  if public.canonical_league_state_for_concurrency(current_state)
    <> public.canonical_league_state_for_concurrency(expected_state_payload)
  then
    raise exception 'Lo stato della lega è stato modificato da un''altra sessione. Aggiorna la pagina e riprova.' using errcode = '40001';
  end if;

  update public.league_state_overrides
  set payload = next_state_payload,
      updated_at = now(),
      updated_by = auth.uid()
  where state_key = 'current';

  insert into public.audit_log(user_id, action, entity_type, old_data, new_data, reason)
  values (
    auth.uid(),
    'league_state_replaced_with_concurrency_check',
    'league_state',
    jsonb_build_object('state_key', 'current'),
    jsonb_build_object('state_key', 'current'),
    coalesce(nullif(trim(audit_reason), ''), 'Aggiornamento amministrativo dello stato della lega')
  );
end;
$$;

revoke all on function public.replace_league_state_if_unchanged(jsonb, jsonb, text) from public, anon;
grant execute on function public.replace_league_state_if_unchanged(jsonb, jsonb, text) to authenticated;

-- La vecchia RPC resta definita per non alterare la cronologia dello schema,
-- ma non è più invocabile dall'applicazione.
revoke all on function public.replace_league_state(jsonb) from public, anon, authenticated;
revoke all on function public.replace_league_state_and_draft_history(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.set_active_season_status(public.season_status) from public, anon, authenticated;

create or replace function public.rename_league_team(
  expected_state_payload jsonb,
  next_state_payload jsonb,
  original_code text,
  next_code text,
  next_name text,
  next_owner text,
  expected_draft_history_payload jsonb,
  next_draft_history_payload jsonb,
  competition_updates jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_state jsonb;
  current_history jsonb;
  current_content jsonb;
  target_team_id uuid;
  update_row jsonb;
  update_season_id uuid;
  update_competition_name text;
begin
  if not public.is_admin() then
    raise exception 'Operazione riservata agli amministratori' using errcode = '42501';
  end if;
  if expected_state_payload is null
    or next_state_payload is null
    or jsonb_typeof(expected_state_payload) <> 'object'
    or jsonb_typeof(next_state_payload) <> 'object'
    or competition_updates is null
    or jsonb_typeof(competition_updates) <> 'array'
  then
    raise exception 'Dati della squadra non validi' using errcode = '22023';
  end if;
  if original_code !~ '^[A-Z]{3}$'
    or next_code !~ '^[A-Z]{3}$'
    or coalesce(trim(next_name), '') = ''
    or char_length(next_name) > 100
    or coalesce(trim(next_owner), '') = ''
    or char_length(next_owner) > 200
  then
    raise exception 'Identità della squadra non valida' using errcode = '22023';
  end if;
  if (expected_draft_history_payload is null) <> (next_draft_history_payload is null)
    or (expected_draft_history_payload is not null and (
      jsonb_typeof(expected_draft_history_payload) <> 'array'
      or jsonb_typeof(next_draft_history_payload) <> 'array'
    ))
  then
    raise exception 'Storico Draft non valido' using errcode = '22023';
  end if;

  select payload into current_state
  from public.league_state_overrides
  where state_key = 'current'
  for update;
  if current_state is null then
    raise exception 'Stato della lega non inizializzato' using errcode = '22023';
  end if;
  if public.canonical_league_state_for_concurrency(current_state)
    <> public.canonical_league_state_for_concurrency(expected_state_payload)
  then
    raise exception 'Lo stato della lega è stato modificato da un''altra sessione. Aggiorna la pagina e riprova.' using errcode = '40001';
  end if;

  select id into target_team_id
  from public.teams
  where code = original_code
  for update;
  if target_team_id is null then
    raise exception 'Squadra non trovata' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.teams
    where id <> target_team_id
      and (code = next_code or lower(name) = lower(next_name) or slug = lower(next_code))
  ) then
    raise exception 'Sigla o nome squadra già utilizzati' using errcode = '23505';
  end if;

  if expected_draft_history_payload is not null then
    select entries into current_history
    from public.history_competition_content
    where category = 'Draft'
    for update;
    if not found then
      raise exception 'Storico Draft non disponibile' using errcode = '22023';
    end if;
    if current_history is distinct from expected_draft_history_payload then
      raise exception 'Lo storico Draft è stato modificato da un''altra sessione. Aggiorna la pagina e riprova.' using errcode = '40001';
    end if;
  end if;

  lock table public.competition_content in share row exclusive mode;
  if (select count(*) from public.competition_content) <> jsonb_array_length(competition_updates) then
    raise exception 'Le competizioni sono state modificate da un''altra sessione. Aggiorna la pagina e riprova.' using errcode = '40001';
  end if;

  for update_row in
    select value
    from jsonb_array_elements(competition_updates)
    order by value->>'season_id', value->>'competition_name'
  loop
    if jsonb_typeof(update_row) <> 'object'
      or coalesce(update_row->>'season_id', '') = ''
      or coalesce(trim(update_row->>'competition_name'), '') = ''
      or update_row->'expected_content' is null
      or update_row->'next_content' is null
    then
      raise exception 'Aggiornamento competizione non valido' using errcode = '22023';
    end if;
    begin
      update_season_id := (update_row->>'season_id')::uuid;
    exception when invalid_text_representation then
      raise exception 'Stagione della competizione non valida' using errcode = '22023';
    end;
    update_competition_name := update_row->>'competition_name';

    select content into current_content
    from public.competition_content
    where season_id = update_season_id
      and competition_name = update_competition_name
    for update;
    if not found then
      raise exception 'Contenuto della competizione non trovato' using errcode = '22023';
    end if;
    if current_content is distinct from update_row->'expected_content' then
      raise exception 'Le competizioni sono state modificate da un''altra sessione. Aggiorna la pagina e riprova.' using errcode = '40001';
    end if;
  end loop;

  update public.teams
  set code = next_code,
      name = next_name,
      owner_name = next_owner,
      slug = lower(next_code)
  where id = target_team_id;

  if expected_draft_history_payload is not null
    and current_history is distinct from next_draft_history_payload
  then
    update public.history_competition_content
    set entries = next_draft_history_payload,
        updated_by = auth.uid(),
        updated_at = now()
    where category = 'Draft';
  end if;

  for update_row in
    select value
    from jsonb_array_elements(competition_updates)
    order by value->>'season_id', value->>'competition_name'
  loop
    if update_row->'expected_content' is distinct from update_row->'next_content' then
      update public.competition_content
      set content = update_row->'next_content',
          updated_by = auth.uid(),
          updated_at = now()
      where season_id = (update_row->>'season_id')::uuid
        and competition_name = update_row->>'competition_name';
    end if;
  end loop;

  update public.league_state_overrides
  set payload = next_state_payload,
      updated_at = now(),
      updated_by = auth.uid()
  where state_key = 'current';

  insert into public.audit_log(user_id, action, entity_type, old_data, new_data, reason)
  values (
    auth.uid(),
    'league_team_renamed',
    'team',
    jsonb_build_object('code', original_code),
    jsonb_build_object('code', next_code, 'name', next_name, 'owner', next_owner),
    'Aggiornamento atomico dell''identità della squadra'
  );
end;
$$;

revoke all on function public.rename_league_team(jsonb, jsonb, text, text, text, text, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.rename_league_team(jsonb, jsonb, text, text, text, text, jsonb, jsonb, jsonb) to authenticated;

create or replace function public.advance_league_transition(
  expected_state_payload jsonb,
  next_state_payload jsonb,
  requested_season_id uuid,
  expected_season_name text,
  expected_timeline_moment text,
  next_timeline_moment text,
  next_status public.season_status,
  next_team_options_resolved boolean,
  next_trade_deadline_passed boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_state jsonb;
  current_season_name text;
  current_timeline_moment text;
begin
  if not public.is_admin() then
    raise exception 'Operazione riservata agli amministratori' using errcode = '42501';
  end if;
  if expected_state_payload is null
    or next_state_payload is null
    or jsonb_typeof(expected_state_payload) <> 'object'
    or jsonb_typeof(next_state_payload) <> 'object'
    or expected_timeline_moment is null
    or next_timeline_moment is null
  then
    raise exception 'Dati dell''avanzamento non validi' using errcode = '22023';
  end if;

  select payload into current_state
  from public.league_state_overrides
  where state_key = 'current'
  for update;
  if current_state is null then
    raise exception 'Stato della lega non inizializzato' using errcode = '22023';
  end if;
  if public.canonical_league_state_for_concurrency(current_state)
    <> public.canonical_league_state_for_concurrency(expected_state_payload)
  then
    raise exception 'Lo stato della lega è stato modificato da un''altra sessione. Aggiorna la pagina e riprova.' using errcode = '40001';
  end if;

  select name, timeline_moment
  into current_season_name, current_timeline_moment
  from public.seasons
  where id = requested_season_id and is_active = true
  for update;
  if current_season_name is distinct from expected_season_name
    or current_timeline_moment is distinct from expected_timeline_moment
  then
    raise exception 'La fase della lega è cambiata. Aggiorna la pagina e riprova.' using errcode = '40001';
  end if;

  update public.league_state_overrides
  set payload = next_state_payload,
      updated_at = now(),
      updated_by = auth.uid()
  where state_key = 'current';

  update public.seasons
  set status = next_status,
      timeline_moment = next_timeline_moment,
      team_options_resolved = next_team_options_resolved,
      trade_deadline_passed = next_trade_deadline_passed
  where id = requested_season_id;

  insert into public.audit_log(user_id, action, entity_type, old_data, new_data, reason)
  values (
    auth.uid(),
    'league_phase_advanced',
    'season',
    jsonb_build_object('name', expected_season_name, 'timeline_moment', expected_timeline_moment),
    jsonb_build_object('name', expected_season_name, 'timeline_moment', next_timeline_moment),
    'Avanzamento atomico della fase della lega'
  );
end;
$$;

revoke all on function public.advance_league_transition(jsonb, jsonb, uuid, text, text, text, public.season_status, boolean, boolean) from public, anon;
grant execute on function public.advance_league_transition(jsonb, jsonb, uuid, text, text, text, public.season_status, boolean, boolean) to authenticated;

create or replace function public.advance_league_and_archive_competitions(
  expected_state_payload jsonb,
  state_payload jsonb,
  requested_season_id uuid,
  expected_season_name text,
  expected_timeline_moment text,
  next_season_name text,
  history_payload jsonb,
  competition_payload jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_state jsonb;
  active_season_name text;
  active_timeline_moment text;
  category_key text;
  category_value jsonb;
begin
  if not public.is_admin() then
    raise exception 'Operazione riservata agli amministratori' using errcode = '42501';
  end if;
  if expected_state_payload is null
    or state_payload is null
    or jsonb_typeof(expected_state_payload) <> 'object'
    or jsonb_typeof(state_payload) <> 'object'
  then
    raise exception 'Stato della lega non valido' using errcode = '22023';
  end if;
  if history_payload is null
    or jsonb_typeof(history_payload) <> 'object'
    or (select count(*) from jsonb_object_keys(history_payload)) <> 6
    or not history_payload ?& array[
      'Playoff', 'Coppa', 'All Star Game', 'March Madness', 'Conference League', 'Regular season'
    ]
  then
    raise exception 'Archivio delle competizioni non valido' using errcode = '22023';
  end if;
  if competition_payload is null
    or jsonb_typeof(competition_payload) <> 'object'
    or (select count(*) from jsonb_object_keys(competition_payload)) <> 7
    or not competition_payload ?& array[
      'Girone coppa', 'Tabellone coppa', 'Regular season', 'Playoff',
      'Conference League', 'All Star Game', 'March Madness'
    ]
  then
    raise exception 'Nuove competizioni non valide' using errcode = '22023';
  end if;
  if expected_season_name is null
    or expected_timeline_moment is null
    or next_season_name is null
    or next_season_name !~ '^\d{4}/\d{2}$'
  then
    raise exception 'Annata non valida' using errcode = '22023';
  end if;

  select payload into current_state
  from public.league_state_overrides
  where state_key = 'current'
  for update;
  if current_state is null then
    raise exception 'Stato della lega non inizializzato' using errcode = '22023';
  end if;
  if public.canonical_league_state_for_concurrency(current_state)
    <> public.canonical_league_state_for_concurrency(expected_state_payload)
  then
    raise exception 'Lo stato della lega è stato modificato da un''altra sessione. Aggiorna la pagina e riprova.' using errcode = '40001';
  end if;

  select name, timeline_moment
  into active_season_name, active_timeline_moment
  from public.seasons
  where id = requested_season_id and is_active = true
  for update;
  if active_season_name is distinct from expected_season_name
    or active_timeline_moment is distinct from expected_timeline_moment
  then
    raise exception 'La fase della lega è cambiata. Aggiorna la pagina e riprova.' using errcode = '40001';
  end if;

  for category_key, category_value in select key, value from jsonb_each(history_payload)
  loop
    if jsonb_typeof(category_value) <> 'array' then
      raise exception 'Storico non valido per %', category_key using errcode = '22023';
    end if;
    insert into public.history_competition_content(category, entries, updated_by, updated_at)
    values (category_key, category_value, auth.uid(), now())
    on conflict (category) do update
    set entries = excluded.entries,
        updated_by = excluded.updated_by,
        updated_at = excluded.updated_at;
  end loop;

  update public.league_state_overrides
  set payload = state_payload,
      updated_at = now(),
      updated_by = auth.uid()
  where state_key = 'current';

  for category_key, category_value in select key, value from jsonb_each(competition_payload)
  loop
    if jsonb_typeof(category_value) <> 'object' then
      raise exception 'Competizione non valida per %', category_key using errcode = '22023';
    end if;
    insert into public.competition_content(
      season_id, competition_name, content, updated_by, updated_at
    ) values (
      requested_season_id, category_key, category_value, auth.uid(), now()
    )
    on conflict (season_id, competition_name) do update
    set content = excluded.content,
        updated_by = excluded.updated_by,
        updated_at = excluded.updated_at;
  end loop;

  update public.seasons
  set name = next_season_name,
      status = 'offseason'::public.season_status,
      team_options_resolved = false,
      trade_deadline_passed = false,
      timeline_moment = 'offseason_start',
      phase_dates = '{}'::jsonb
  where id = requested_season_id;

  update public.calendar_events
  set date_text = ''
  where season_id = requested_season_id;

  insert into public.audit_log(user_id, action, entity_type, old_data, new_data, reason)
  values (
    auth.uid(),
    'league_advanced',
    'season',
    jsonb_build_object('name', active_season_name, 'timeline_moment', active_timeline_moment),
    jsonb_build_object('name', next_season_name, 'timeline_moment', 'offseason_start'),
    'Chiusura stagione atomica con archiviazione automatica delle competizioni'
  );
end;
$$;

revoke all on function public.advance_league_and_archive_competitions(jsonb, jsonb, uuid, text, text, text, jsonb, jsonb) from public, anon;
grant execute on function public.advance_league_and_archive_competitions(jsonb, jsonb, uuid, text, text, text, jsonb, jsonb) to authenticated;

drop function if exists public.advance_league_and_archive_competitions(jsonb, text, text, jsonb, jsonb);

notify pgrst, 'reload schema';
