alter table public.league_movements
  add column if not exists season_name text,
  add column if not exists undo_before_moment text;

-- Le decisioni T.O. già registrate appartengono alla stagione attiva al
-- momento dell'aggiornamento. Da questo momento in poi il dato viene salvato
-- esplicitamente insieme a ogni singolo movimento.
update public.league_movements movement
set season_name = active_season.name,
    undo_before_moment = 'team_option_deadline'
from (
  select name
  from public.seasons
  where is_active = true
  limit 1
) active_season
where movement.operation_type = 'team_option'
  and movement.season_name is null;

create or replace function public.apply_league_state_movements(
  expected_before_state jsonb,
  next_state jsonb,
  movement_rows jsonb
)
returns uuid[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_state jsonb;
  movement_row jsonb;
  row_before jsonb;
  row_after jsonb;
  previous_state jsonb := expected_before_state;
  movement_id uuid;
  movement_ids uuid[] := array[]::uuid[];
begin
  if not public.is_admin() then
    raise exception 'Operazione riservata agli amministratori' using errcode = '42501';
  end if;
  if next_state is null or jsonb_typeof(next_state) <> 'object' then
    raise exception 'Stato della lega non valido' using errcode = '22023';
  end if;
  if movement_rows is null
    or jsonb_typeof(movement_rows) <> 'array'
    or jsonb_array_length(movement_rows) = 0
  then
    raise exception 'Movimenti non validi' using errcode = '22023';
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

  for movement_row in select value from jsonb_array_elements(movement_rows)
  loop
    row_before := movement_row->'before_state';
    row_after := movement_row->'after_state';
    if jsonb_typeof(movement_row) <> 'object'
      or jsonb_typeof(row_before) <> 'object'
      or jsonb_typeof(row_after) <> 'object'
      or coalesce(trim(movement_row->>'operation_type'), '') = ''
      or coalesce(trim(movement_row->>'summary'), '') = ''
    then
      raise exception 'Riga movimento non valida' using errcode = '22023';
    end if;
    if row_before <> previous_state then
      raise exception 'Sequenza dei movimenti non valida' using errcode = '22023';
    end if;

    insert into public.league_movements(
      operation_type,
      summary,
      before_state,
      after_state,
      season_name,
      undo_before_moment,
      created_by
    ) values (
      movement_row->>'operation_type',
      movement_row->>'summary',
      row_before || jsonb_build_object(
        '_movementMeta',
        jsonb_build_object(
          'season_name', nullif(trim(movement_row->>'season_name'), ''),
          'undo_before_moment', nullif(trim(movement_row->>'undo_before_moment'), '')
        )
      ),
      row_after || jsonb_build_object(
        '_movementMeta',
        jsonb_build_object(
          'season_name', nullif(trim(movement_row->>'season_name'), ''),
          'undo_before_moment', nullif(trim(movement_row->>'undo_before_moment'), '')
        )
      ),
      nullif(trim(movement_row->>'season_name'), ''),
      nullif(trim(movement_row->>'undo_before_moment'), ''),
      auth.uid()
    ) returning id into movement_id;
    movement_ids := array_append(movement_ids, movement_id);
    previous_state := row_after;
  end loop;

  if previous_state <> next_state then
    raise exception 'Lo stato finale non coincide con i movimenti' using errcode = '22023';
  end if;

  insert into public.league_state_overrides(state_key, payload, updated_at, updated_by)
  values ('current', next_state, now(), auth.uid())
  on conflict (state_key) do update
  set payload = excluded.payload,
      updated_at = excluded.updated_at,
      updated_by = excluded.updated_by;

  return movement_ids;
end;
$$;

revoke all on function public.apply_league_state_movements(jsonb, jsonb, jsonb) from public;
grant execute on function public.apply_league_state_movements(jsonb, jsonb, jsonb) to authenticated;

notify pgrst, 'reload schema';
