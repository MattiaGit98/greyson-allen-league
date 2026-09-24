-- Durante il Draft consente di annullare soltanto l'ultima scelta ancora attiva.
-- La scelta e l'eventuale annullamento diventano definitivi all'Inizio asta.
create or replace function public.revert_league_state_movement(
  requested_movement_id uuid,
  expected_current_state jsonb,
  restored_state jsonb,
  requested_reversal_summary text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_state jsonb;
  current_history jsonb;
  current_season_name text;
  current_moment text;
  latest_draft_movement_id uuid;
  movement_row public.league_movements;
  original_movement public.league_movements;
begin
  if not public.is_admin() then
    raise exception 'Operazione riservata agli amministratori' using errcode = '42501';
  end if;

  select * into movement_row
  from public.league_movements
  where id = requested_movement_id
  for update;
  if movement_row.id is null or movement_row.reverted_at is not null then
    raise exception 'Movimento non disponibile' using errcode = '22023';
  end if;

  if movement_row.operation_type = 'scelta_draft'
    or movement_row.undo_before_moment = 'auction_start'
  then
    select name, timeline_moment
    into current_season_name, current_moment
    from public.seasons
    where is_active = true
    for update;
    if current_season_name is null or current_moment is distinct from 'team_option_deadline' then
      raise exception 'Le scelte del Draft non possono più essere modificate dall''Inizio asta' using errcode = '22023';
    end if;
  end if;

  if movement_row.operation_type = 'scelta_draft' then
    select id into latest_draft_movement_id
    from public.league_movements
    where operation_type = 'scelta_draft'
      and reverted_at is null
      and (
        season_name = current_season_name
        or (
          season_name is null
          and after_history @> jsonb_build_array(
            jsonb_build_object('season', split_part(current_season_name, '/', 1))
          )
        )
      )
    order by created_at desc, id desc
    limit 1
    for update;
    if latest_draft_movement_id is distinct from movement_row.id then
      raise exception 'Puoi annullare soltanto l''ultima scelta effettuata nel Draft in corso' using errcode = '22023';
    end if;
  end if;

  select payload into current_state
  from public.league_state_overrides
  where state_key = 'current'
  for update;
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

  if movement_row.operation_type = 'movimento_annullato'
    and movement_row.reverts_movement_id is not null
  then
    select * into original_movement
    from public.league_movements
    where id = movement_row.reverts_movement_id
    for update;
    if original_movement.id is null or original_movement.reverted_at is null then
      raise exception 'Il movimento originario non è più coerente con il suo annullamento' using errcode = '40001';
    end if;

    delete from public.league_movements where id = movement_row.id;
    update public.league_movements
    set reverted_at = null, reverted_by = null
    where id = original_movement.id;
    return;
  end if;

  update public.league_movements
  set reverted_at = now(), reverted_by = auth.uid()
  where id = movement_row.id;

  insert into public.league_movements(
    operation_type,
    summary,
    before_state,
    after_state,
    history_category,
    before_history,
    after_history,
    season_name,
    undo_before_moment,
    reverts_movement_id,
    created_by
  ) values (
    'movimento_annullato',
    coalesce(nullif(trim(requested_reversal_summary), ''), 'Movimento annullato: ' || movement_row.summary),
    current_state,
    restored_state,
    movement_row.history_category,
    movement_row.after_history,
    movement_row.before_history,
    case
      when movement_row.operation_type = 'scelta_draft' then current_season_name
      else movement_row.season_name
    end,
    case
      when movement_row.operation_type = 'scelta_draft' then 'auction_start'
      else movement_row.undo_before_moment
    end,
    movement_row.id,
    auth.uid()
  );
end;
$$;

revoke all on function public.revert_league_state_movement(uuid, jsonb, jsonb, text) from public;
grant execute on function public.revert_league_state_movement(uuid, jsonb, jsonb, text) to authenticated;

notify pgrst, 'reload schema';
