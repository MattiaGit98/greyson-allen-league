create or replace function public.apply_trade_movement(
  expected_before_state jsonb,
  next_state jsonb,
  requested_season_name text,
  reset_contract_player_names jsonb,
  requested_history_category text,
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
  if next_state is null or jsonb_typeof(next_state) <> 'object'
    or coalesce(trim(requested_season_name), '') = ''
    or reset_contract_player_names is null
    or jsonb_typeof(reset_contract_player_names) <> 'array'
    or exists (
      select 1
      from jsonb_array_elements(reset_contract_player_names) as items(value)
      where jsonb_typeof(items.value) <> 'string' or trim(items.value #>> '{}') = ''
    )
  then
    raise exception 'Dati dello scambio non validi' using errcode = '22023';
  end if;
  if requested_history_category is not null and (
    requested_history_category = ''
    or expected_before_history is null
    or jsonb_typeof(expected_before_history) <> 'array'
    or next_history is null
    or jsonb_typeof(next_history) <> 'array'
  ) then
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

  if requested_history_category is not null then
    select entries into current_history
    from public.history_competition_content
    where category = requested_history_category
    for update;
    if current_history is not null and current_history <> expected_before_history then
      raise exception 'Lo storico è cambiato: aggiorna la pagina' using errcode = '40001';
    end if;
  end if;

  insert into public.league_state_overrides(state_key, payload, updated_at, updated_by)
  values ('current', next_state, now(), auth.uid())
  on conflict (state_key) do update
  set payload = excluded.payload,
      updated_at = excluded.updated_at,
      updated_by = excluded.updated_by;

  if requested_history_category is not null then
    insert into public.history_competition_content(category, entries, updated_by, updated_at)
    values (requested_history_category, next_history, auth.uid(), now())
    on conflict (category) do update
    set entries = excluded.entries,
        updated_by = excluded.updated_by,
        updated_at = excluded.updated_at;
  end if;

  delete from public.post_auction_contract_drafts
  where season_name = requested_season_name
    and player_name in (
      select names.value
      from jsonb_array_elements_text(reset_contract_player_names) as names(value)
    );

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
    requested_history_category,
    expected_before_history,
    next_history,
    auth.uid()
  ) returning id into movement_id;

  return movement_id;
end;
$$;

revoke all on function public.apply_trade_movement(jsonb, jsonb, text, jsonb, text, jsonb, jsonb, text, text) from public;
grant execute on function public.apply_trade_movement(jsonb, jsonb, text, jsonb, text, jsonb, jsonb, text, text) to authenticated;

notify pgrst, 'reload schema';
