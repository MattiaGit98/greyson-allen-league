-- Registra uno spostamento di slot e invalida nella stessa transazione le
-- bozze contrattuali dei giocatori spostati. La validita dello spostamento
-- resta responsabilita delle regole applicative; la RPC garantisce coerenza,
-- concorrenza e atomicita tra stato, bozze e movimento.
create or replace function public.apply_slot_movement(
  expected_before_state jsonb,
  next_state jsonb,
  requested_season_name text,
  reset_contract_drafts jsonb,
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
  current_season_name text;
  reset_row jsonb;
  movement_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Operazione riservata agli amministratori' using errcode = '42501';
  end if;
  if expected_before_state is null
    or next_state is null
    or jsonb_typeof(expected_before_state) <> 'object'
    or jsonb_typeof(next_state) <> 'object'
    or coalesce(trim(requested_season_name), '') = ''
    or reset_contract_drafts is null
    or jsonb_typeof(reset_contract_drafts) <> 'array'
    or jsonb_array_length(reset_contract_drafts) = 0
    or coalesce(trim(movement_type), '') = ''
    or coalesce(trim(movement_summary), '') = ''
  then
    raise exception 'Dati dello spostamento non validi' using errcode = '22023';
  end if;

  for reset_row in select value from jsonb_array_elements(reset_contract_drafts)
  loop
    if jsonb_typeof(reset_row) <> 'object'
      or coalesce(trim(reset_row ->> 'team_code'), '') = ''
      or coalesce(trim(reset_row ->> 'player_name'), '') = ''
    then
      raise exception 'Giocatore da invalidare non valido' using errcode = '22023';
    end if;
  end loop;

  select payload into current_state
  from public.league_state_overrides
  where state_key = 'current'
  for update;
  if current_state is null then
    raise exception 'Stato della lega non inizializzato' using errcode = '22023';
  end if;
  if public.canonical_league_state_for_concurrency(current_state)
    <> public.canonical_league_state_for_concurrency(expected_before_state)
  then
    raise exception 'Lo stato della lega e stato modificato da un''altra sessione. Aggiorna la pagina e riprova.' using errcode = '40001';
  end if;

  select name into current_season_name
  from public.seasons
  where is_active = true
  for update;
  if current_season_name is distinct from requested_season_name then
    raise exception 'La stagione attiva e cambiata. Aggiorna la pagina e riprova.' using errcode = '40001';
  end if;

  update public.league_state_overrides
  set payload = next_state,
      updated_at = now(),
      updated_by = auth.uid()
  where state_key = 'current';

  delete from public.post_auction_contract_drafts draft
  where draft.season_name = requested_season_name
    and exists (
      select 1
      from jsonb_array_elements(reset_contract_drafts) as reset_items(item)
      where upper(trim(reset_items.item ->> 'team_code')) = upper(trim(draft.team_code))
        and lower(trim(regexp_replace(reset_items.item ->> 'player_name', '[[:space:]]+', ' ', 'g')))
          = lower(trim(regexp_replace(draft.player_name, '[[:space:]]+', ' ', 'g')))
    );

  insert into public.league_movements(
    operation_type,
    summary,
    before_state,
    after_state,
    season_name,
    created_by
  ) values (
    movement_type,
    movement_summary,
    expected_before_state || jsonb_build_object(
      '_movementMeta', jsonb_build_object('season_name', requested_season_name, 'undo_before_moment', null)
    ),
    next_state || jsonb_build_object(
      '_movementMeta', jsonb_build_object('season_name', requested_season_name, 'undo_before_moment', null)
    ),
    requested_season_name,
    auth.uid()
  ) returning id into movement_id;

  return movement_id;
end;
$$;

revoke all on function public.apply_slot_movement(jsonb, jsonb, text, jsonb, text, text) from public, anon;
grant execute on function public.apply_slot_movement(jsonb, jsonb, text, jsonb, text, text) to authenticated;

-- Elimina eventuali bozze gia salvate con uno slot diverso da quello corrente.
-- Non vengono toccate le bozze coerenti.
delete from public.post_auction_contract_drafts draft
using public.league_state_overrides state
where state.state_key = 'current'
  and exists (
    select 1
    from jsonb_array_elements(state.payload -> 'rosterEntries') as roster(entry)
    where lower(trim(coalesce(roster.entry ->> 'state', ''))) = 'active'
      and upper(trim(coalesce(roster.entry ->> 'teamCode', ''))) = upper(trim(draft.team_code))
      and lower(trim(regexp_replace(coalesce(roster.entry ->> 'name', ''), '[[:space:]]+', ' ', 'g')))
        = lower(trim(regexp_replace(draft.player_name, '[[:space:]]+', ' ', 'g')))
      and coalesce(roster.entry ->> 'slot', '') <> draft.slot
  );

notify pgrst, 'reload schema';
