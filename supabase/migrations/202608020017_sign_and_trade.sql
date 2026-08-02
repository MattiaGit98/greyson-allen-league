alter table public.league_movements
  add column if not exists history_category text,
  add column if not exists before_history jsonb,
  add column if not exists after_history jsonb;

create or replace function public.apply_league_state_and_history_movement(
  expected_before_state jsonb,
  next_state jsonb,
  history_category text,
  expected_before_history jsonb,
  next_history jsonb,
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
  current_history jsonb;
  movement_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Operazione riservata agli amministratori' using errcode = '42501';
  end if;
  if next_state is null or jsonb_typeof(next_state) <> 'object' then
    raise exception 'Stato della lega non valido' using errcode = '22023';
  end if;
  if history_category is null or history_category = ''
    or expected_before_history is null or jsonb_typeof(expected_before_history) <> 'array'
    or next_history is null or jsonb_typeof(next_history) <> 'array'
  then
    raise exception 'Storico non valido' using errcode = '22023';
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

  select entries into current_history
  from public.history_competition_content
  where category = history_category
  for update;
  if current_history is not null and current_history <> expected_before_history then
    raise exception 'Lo storico è cambiato: aggiorna la pagina' using errcode = '40001';
  end if;

  insert into public.league_state_overrides(state_key, payload, updated_at, updated_by)
  values ('current', next_state, now(), auth.uid())
  on conflict (state_key) do update
  set payload = excluded.payload,
      updated_at = excluded.updated_at,
      updated_by = excluded.updated_by;

  insert into public.history_competition_content(category, entries, updated_by, updated_at)
  values (history_category, next_history, auth.uid(), now())
  on conflict (category) do update
  set entries = excluded.entries,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at;

  insert into public.league_movements(
    operation_type,
    summary,
    before_state,
    after_state,
    history_category,
    before_history,
    after_history,
    created_by
  ) values (
    movement_type,
    movement_summary,
    expected_before_state,
    next_state,
    history_category,
    expected_before_history,
    next_history,
    auth.uid()
  ) returning id into movement_id;
  return movement_id;
end;
$$;

revoke all on function public.apply_league_state_and_history_movement(jsonb, jsonb, text, jsonb, jsonb, text, text) from public;
grant execute on function public.apply_league_state_and_history_movement(jsonb, jsonb, text, jsonb, jsonb, text, text) to authenticated;

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
  current_history jsonb;
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

  if movement_row.history_category is not null then
    select entries into current_history
    from public.history_competition_content
    where category = movement_row.history_category
    for update;
    if coalesce(current_history, '[]'::jsonb) <> coalesce(movement_row.after_history, '[]'::jsonb) then
      raise exception 'Lo storico è stato modificato successivamente' using errcode = '40001';
    end if;
    insert into public.history_competition_content(category, entries, updated_by, updated_at)
    values (movement_row.history_category, movement_row.before_history, auth.uid(), now())
    on conflict (category) do update
    set entries = excluded.entries,
        updated_by = excluded.updated_by,
        updated_at = excluded.updated_at;
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
