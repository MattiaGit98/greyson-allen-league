-- Include anche il salvataggio atomico del pannello Draft, così questo
-- aggiornamento può essere eseguito anche se la migrazione 012 non lo è stata.
create or replace function public.replace_league_state_and_draft_history(
  state_payload jsonb,
  draft_history_payload jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Operazione riservata agli amministratori' using errcode = '42501';
  end if;

  if state_payload is null or jsonb_typeof(state_payload) <> 'object' then
    raise exception 'Stato della lega non valido' using errcode = '22023';
  end if;
  if draft_history_payload is null or jsonb_typeof(draft_history_payload) <> 'array' then
    raise exception 'Storico Draft non valido' using errcode = '22023';
  end if;

  insert into public.league_state_overrides(state_key, payload, updated_at, updated_by)
  values ('current', state_payload, now(), auth.uid())
  on conflict (state_key) do update
  set payload = excluded.payload,
      updated_at = excluded.updated_at,
      updated_by = excluded.updated_by;

  insert into public.history_competition_content(category, entries, updated_by, updated_at)
  values ('Draft', draft_history_payload, auth.uid(), now())
  on conflict (category) do update
  set entries = excluded.entries,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at;

  insert into public.audit_log(user_id, action, entity_type, old_data, new_data, reason)
  values (
    auth.uid(),
    'draft_player_assigned',
    'draft',
    null,
    jsonb_build_object('state_key', 'current', 'history_category', 'Draft'),
    'Assegnazione dal pannello Draft'
  );
end;
$$;

revoke all on function public.replace_league_state_and_draft_history(jsonb, jsonb) from public;
grant execute on function public.replace_league_state_and_draft_history(jsonb, jsonb) to authenticated;

create or replace function public.advance_league_and_archive_competitions(
  state_payload jsonb,
  expected_season_name text,
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
  active_season_id uuid;
  active_season_name text;
  active_season_status public.season_status;
  category_key text;
  category_value jsonb;
begin
  if not public.is_admin() then
    raise exception 'Operazione riservata agli amministratori' using errcode = '42501';
  end if;

  if state_payload is null or jsonb_typeof(state_payload) <> 'object' then
    raise exception 'Stato della lega non valido' using errcode = '22023';
  end if;
  if history_payload is null
    or jsonb_typeof(history_payload) <> 'object'
    or jsonb_object_length(history_payload) <> 6
    or not history_payload ?& array[
      'Playoff',
      'Coppa',
      'All Star Game',
      'March Madness',
      'Conference League',
      'Regular season'
    ]
  then
    raise exception 'Archivio delle competizioni non valido' using errcode = '22023';
  end if;
  if competition_payload is null
    or jsonb_typeof(competition_payload) <> 'object'
    or jsonb_object_length(competition_payload) <> 7
    or not competition_payload ?& array[
      'Girone coppa',
      'Tabellone coppa',
      'Regular season',
      'Playoff',
      'Conference League',
      'All Star Game',
      'March Madness'
    ]
  then
    raise exception 'Nuove competizioni non valide' using errcode = '22023';
  end if;
  if expected_season_name is null
    or next_season_name is null
    or next_season_name !~ '^\d{4}/\d{2}$'
  then
    raise exception 'Annata non valida' using errcode = '22023';
  end if;

  select id, name, status
  into active_season_id, active_season_name, active_season_status
  from public.seasons
  where is_active = true
  for update;

  if active_season_id is null then
    raise exception 'Nessuna stagione attiva' using errcode = '22023';
  end if;
  if active_season_name <> expected_season_name then
    raise exception 'L''annata attiva è cambiata: aggiorna la pagina' using errcode = '40001';
  end if;
  if active_season_status <> 'regular_season' then
    raise exception 'La lega non è in fase Stagione' using errcode = '22023';
  end if;

  for category_key, category_value in
    select key, value from jsonb_each(history_payload)
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

  insert into public.league_state_overrides(state_key, payload, updated_at, updated_by)
  values ('current', state_payload, now(), auth.uid())
  on conflict (state_key) do update
  set payload = excluded.payload,
      updated_at = excluded.updated_at,
      updated_by = excluded.updated_by;

  for category_key, category_value in
    select key, value from jsonb_each(competition_payload)
  loop
    if jsonb_typeof(category_value) <> 'object' then
      raise exception 'Competizione non valida per %', category_key using errcode = '22023';
    end if;
    insert into public.competition_content(
      season_id,
      competition_name,
      content,
      updated_by,
      updated_at
    ) values (
      active_season_id,
      category_key,
      category_value,
      auth.uid(),
      now()
    )
    on conflict (season_id, competition_name) do update
    set content = excluded.content,
        updated_by = excluded.updated_by,
        updated_at = excluded.updated_at;
  end loop;

  update public.seasons
  set name = next_season_name,
      status = 'offseason',
      team_options_resolved = false
  where id = active_season_id;

  insert into public.audit_log(user_id, action, entity_type, old_data, new_data, reason)
  values (
    auth.uid(),
    'league_advanced',
    'season',
    jsonb_build_object('name', active_season_name, 'status', active_season_status),
    jsonb_build_object('name', next_season_name, 'status', 'offseason'),
    'Chiusura stagione con archiviazione automatica delle competizioni'
  );
end;
$$;

revoke all on function public.advance_league_and_archive_competitions(jsonb, text, text, jsonb, jsonb) from public;
grant execute on function public.advance_league_and_archive_competitions(jsonb, text, text, jsonb, jsonb) to authenticated;

notify pgrst, 'reload schema';
