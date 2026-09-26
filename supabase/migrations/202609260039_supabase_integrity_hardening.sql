-- Corregge la validazione JSON della chiusura stagione e restringe i privilegi
-- che Supabase assegna per impostazione predefinita ai ruoli API.

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
    or (select count(*) from jsonb_object_keys(history_payload)) <> 6
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
    or (select count(*) from jsonb_object_keys(competition_payload)) <> 7
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
revoke execute on function public.advance_league_and_archive_competitions(jsonb, text, text, jsonb, jsonb) from anon;
grant execute on function public.advance_league_and_archive_competitions(jsonb, text, text, jsonb, jsonb) to authenticated;

-- Il feed pubblico deve essere esclusivamente leggibile. La vista resta
-- security definer per esporre soltanto la proiezione pubblica dei movimenti.
revoke all privileges on table public.league_movement_feed from public, anon, authenticated;
grant select on table public.league_movement_feed to anon, authenticated;

-- Tutte queste RPC modificano dati amministrativi. L'app le invoca come utente
-- autenticato e ciascuna continua anche a verificare public.is_admin().
revoke execute on function public.apply_league_state_and_history_movement(jsonb, jsonb, text, jsonb, jsonb, text, text) from anon;
revoke execute on function public.apply_league_state_movement(jsonb, jsonb, text, text) from anon;
revoke execute on function public.apply_league_state_movements(jsonb, jsonb, jsonb) from anon;
revoke execute on function public.apply_trade_movement(jsonb, jsonb, text, jsonb, text, jsonb, jsonb, text, text) from anon;
revoke execute on function public.publish_post_auction_contracts(jsonb, jsonb, uuid, text, jsonb) from anon;
revoke execute on function public.replace_active_calendar(jsonb) from anon;
revoke execute on function public.replace_active_competition_content(text, jsonb) from anon;
revoke execute on function public.replace_history_competition_content(text, jsonb) from anon;
revoke execute on function public.replace_league_state(jsonb) from anon;
revoke execute on function public.replace_league_state_and_draft_history(jsonb, jsonb) from anon;
revoke execute on function public.replace_post_auction_contract_drafts(text, text, jsonb) from anon;
revoke execute on function public.restore_importable_league_backup(jsonb) from anon;
revoke execute on function public.restore_league_phase_backup(uuid) from anon;
revoke execute on function public.revert_league_state_movement(uuid, jsonb, jsonb, text) from anon;
revoke execute on function public.set_active_season_status(public.season_status) from anon;

-- Funzioni richiamate soltanto dai trigger: nessun client deve eseguirle.
revoke execute on function public.bump_league_live_revision() from anon, authenticated;
revoke execute on function public.reset_trade_deadline_outside_season() from anon, authenticated;

-- Firma obsoleta, sostituita dalla versione a quattro argomenti che include il
-- riferimento al movimento di annullamento.
drop function if exists public.revert_league_state_movement(uuid, jsonb, jsonb);

notify pgrst, 'reload schema';
