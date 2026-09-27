-- Distingue l'annuale con team option (es. 27 + T.O.) dalla T.O. pura,
-- che da ora indica esclusivamente una decisione pendente in offseason.
create or replace function public.normalize_annual_team_option_state(input_state jsonb, option_year text)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case
    when input_state is null
      or jsonb_typeof(input_state) <> 'object'
      or jsonb_typeof(input_state -> 'rosterEntries') <> 'array'
      or option_year !~ '^[0-9]{2}$'
      then input_state
    else jsonb_set(
      input_state,
      '{rosterEntries}',
      coalesce((
        select jsonb_agg(
          case
            when upper(trim(item.value ->> 'contract')) = 'T.O.'
              then item.value || jsonb_build_object('contract', option_year || ' + T.O.')
            else item.value
          end
          order by item.position
        )
        from jsonb_array_elements(input_state -> 'rosterEntries') with ordinality as item(value, position)
      ), '[]'::jsonb),
      false
    )
  end;
$$;

update public.league_state_overrides state
set payload = public.normalize_annual_team_option_state(
      state.payload,
      right(active_season.name, 2)
    ),
    updated_at = now()
from public.seasons active_season
where state.state_key = 'current'
  and active_season.is_active = true
  and active_season.team_options_resolved = true;

-- Mantiene coerenti gli snapshot annullabili creati nella stagione attiva
-- dopo la risoluzione delle opzioni.
update public.league_movements movement
set before_state = public.normalize_annual_team_option_state(movement.before_state, right(active_season.name, 2)),
    after_state = public.normalize_annual_team_option_state(movement.after_state, right(active_season.name, 2))
from public.seasons active_season
where active_season.is_active = true
  and active_season.team_options_resolved = true
  and movement.season_name = active_season.name;

update public.league_phase_backups backup
set state_snapshot = public.normalize_annual_team_option_state(
      backup.state_snapshot,
      right(backup.season_snapshot ->> 'name', 2)
    )
where coalesce((backup.season_snapshot ->> 'team_options_resolved')::boolean, false) = true;

drop function public.normalize_annual_team_option_state(jsonb, text);

notify pgrst, 'reload schema';
