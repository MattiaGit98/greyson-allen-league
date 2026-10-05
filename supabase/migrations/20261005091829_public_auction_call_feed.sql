-- Espone al frontend soltanto i dati pubblici necessari per mostrare le
-- chiamate dell'asta, senza rendere accessibili before_state e after_state.
create or replace view public.league_movement_feed as
select
  movement.id,
  movement.operation_type,
  movement.summary,
  movement.created_at,
  movement.reverted_at is not null as reverted,
  case when movement.operation_type = 'acquisto_asta' then auction_call.entry ->> 'name' end as auction_player_name,
  case when movement.operation_type = 'acquisto_asta' then auction_call.entry ->> 'teamCode' end as auction_team_code,
  case
    when movement.operation_type = 'acquisto_asta'
      and coalesce(auction_call.entry ->> 'cost', '') ~ '^\d+$'
    then (auction_call.entry ->> 'cost')::integer
  end as auction_cost,
  case when movement.operation_type = 'acquisto_asta' then auction_call.entry ->> 'role' end as auction_role,
  case
    when movement.operation_type = 'acquisto_asta'
    then coalesce(nullif(movement.season_name, ''), auction_call.entry ->> 'contractStartSeason')
  end as auction_season_name
from public.league_movements movement
left join lateral (
  select candidate.value as entry
  from jsonb_array_elements(coalesce(movement.after_state -> 'rosterEntries', '[]'::jsonb)) candidate(value)
  where movement.operation_type = 'acquisto_asta'
    and candidate.value ->> 'state' = 'active'
    and coalesce(candidate.value ->> 'contractStartSeason', '') <> ''
    and not exists (
      select 1
      from jsonb_array_elements(coalesce(movement.before_state -> 'rosterEntries', '[]'::jsonb)) previous(value)
      where previous.value ->> 'state' = 'active'
        and lower(trim(previous.value ->> 'name')) = lower(trim(candidate.value ->> 'name'))
    )
  order by candidate.value ->> 'name'
  limit 1
) auction_call on true;

revoke all privileges on table public.league_movement_feed from public;
grant select on table public.league_movement_feed to anon, authenticated;
