-- I giocatori gia tagliati non devono conservare un contratto dell'asta da
-- assegnare. La normalizzazione usa l'annata in cui il contratto e iniziato
-- e, per i vecchi record privi del metadato, l'annata della relativa snapshot.
create or replace function public.normalize_cut_pending_contracts(
  input_state jsonb,
  fallback_end_year text
)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case
    when input_state is null
      or jsonb_typeof(input_state) <> 'object'
      or jsonb_typeof(input_state -> 'rosterEntries') <> 'array'
      or fallback_end_year !~ '^[0-9]{2}$'
      then input_state
    else jsonb_set(
      input_state,
      '{rosterEntries}',
      coalesce((
        select jsonb_agg(
          case
            when lower(trim(coalesce(item.value ->> 'state', ''))) = 'cut'
              and upper(trim(regexp_replace(coalesce(item.value ->> 'contract', ''), '[[:space:]]+', ' ', 'g')))
                in ('', '-', 'PENDING', 'DA ASSEGNARE')
              then item.value || jsonb_build_object(
                'contract',
                case
                  when coalesce(item.value ->> 'contractStartSeason', '') ~ '^[0-9]{4}/[0-9]{2}$'
                    then right(item.value ->> 'contractStartSeason', 2)
                  else fallback_end_year
                end,
                'originalContractYears', 1
              )
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

-- Corregge lo stato corrente senza dipendere da nomi di giocatori o squadre.
update public.league_state_overrides state
set payload = public.normalize_cut_pending_contracts(state.payload, right(active_season.name, 2)),
    updated_at = now()
from public.seasons active_season
where state.state_key = 'current'
  and active_season.is_active = true
  and active_season.name ~ '^[0-9]{4}/[0-9]{2}$'
  and state.payload is distinct from public.normalize_cut_pending_contracts(state.payload, right(active_season.name, 2));

-- Impedisce che l'annullamento di un movimento della stagione attiva
-- reintroduca la rappresentazione non valida.
update public.league_movements movement
set before_state = public.normalize_cut_pending_contracts(movement.before_state, right(active_season.name, 2)),
    after_state = public.normalize_cut_pending_contracts(movement.after_state, right(active_season.name, 2))
from public.seasons active_season
where active_season.is_active = true
  and active_season.name ~ '^[0-9]{4}/[0-9]{2}$'
  and movement.season_name = active_season.name
  and (
    movement.before_state is distinct from public.normalize_cut_pending_contracts(movement.before_state, right(active_season.name, 2))
    or movement.after_state is distinct from public.normalize_cut_pending_contracts(movement.after_state, right(active_season.name, 2))
  );

-- Mantiene coerenti anche i punti di ripristino automatici delle fasi.
update public.league_phase_backups backup
set state_snapshot = public.normalize_cut_pending_contracts(
      backup.state_snapshot,
      right(backup.season_snapshot ->> 'name', 2)
    )
where coalesce(backup.season_snapshot ->> 'name', '') ~ '^[0-9]{4}/[0-9]{2}$'
  and backup.state_snapshot is distinct from public.normalize_cut_pending_contracts(
    backup.state_snapshot,
    right(backup.season_snapshot ->> 'name', 2)
  );

-- Una bozza privata non puo appartenere a un giocatore che nello stato
-- corrente e gia tagliato, indipendentemente dal testo del contratto.
delete from public.post_auction_contract_drafts draft
using public.league_state_overrides state
where state.state_key = 'current'
  and exists (
    select 1
    from jsonb_array_elements(state.payload -> 'rosterEntries') as roster(entry)
    where lower(trim(coalesce(roster.entry ->> 'state', ''))) = 'cut'
      and upper(trim(coalesce(roster.entry ->> 'teamCode', ''))) = upper(trim(draft.team_code))
      and lower(trim(regexp_replace(coalesce(roster.entry ->> 'name', ''), '[[:space:]]+', ' ', 'g')))
        = lower(trim(regexp_replace(draft.player_name, '[[:space:]]+', ' ', 'g')))
  );

drop function public.normalize_cut_pending_contracts(jsonb, text);

notify pgrst, 'reload schema';
