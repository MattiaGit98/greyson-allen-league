-- I campi pubblici delle chiamate d'asta si calcolano quando il movimento
-- viene scritto. Le letture del registro non devono aprire gli snapshot JSON.
alter table public.league_movements
  add column if not exists auction_player_name text,
  add column if not exists auction_team_code text,
  add column if not exists auction_cost integer,
  add column if not exists auction_role text,
  add column if not exists auction_season_name text;

create or replace function public.set_league_movement_auction_call()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  previous_names text[];
  auction_entry jsonb;
begin
  new.auction_player_name := null;
  new.auction_team_code := null;
  new.auction_cost := null;
  new.auction_role := null;
  new.auction_season_name := null;

  if new.operation_type <> 'acquisto_asta' then
    return new;
  end if;

  select coalesce(array_agg(lower(btrim(previous.value ->> 'name'))), array[]::text[])
    into previous_names
  from jsonb_array_elements(
    case when jsonb_typeof(new.before_state -> 'rosterEntries') = 'array'
      then new.before_state -> 'rosterEntries' else '[]'::jsonb end
  ) previous(value)
  where previous.value ->> 'state' = 'active'
    and previous.value ->> 'name' is not null;

  select candidate.value into auction_entry
  from jsonb_array_elements(
    case when jsonb_typeof(new.after_state -> 'rosterEntries') = 'array'
      then new.after_state -> 'rosterEntries' else '[]'::jsonb end
  ) candidate(value)
  where candidate.value ->> 'state' = 'active'
    and coalesce(candidate.value ->> 'contractStartSeason', '') <> ''
    and lower(btrim(candidate.value ->> 'name')) <> all(previous_names)
  order by candidate.value ->> 'name'
  limit 1;

  if auction_entry is null then
    return new;
  end if;

  new.auction_player_name := auction_entry ->> 'name';
  new.auction_team_code := auction_entry ->> 'teamCode';
  if coalesce(auction_entry ->> 'cost', '') ~ '^\d+$' then
    new.auction_cost := (auction_entry ->> 'cost')::integer;
  end if;
  new.auction_role := auction_entry ->> 'role';
  new.auction_season_name := coalesce(
    nullif(new.season_name, ''),
    auction_entry ->> 'contractStartSeason'
  );
  return new;
end;
$$;

revoke all on function public.set_league_movement_auction_call() from public, anon, authenticated;

create trigger league_movement_auction_call_metadata
before insert or update of operation_type, before_state, after_state, season_name
on public.league_movements
for each row execute function public.set_league_movement_auction_call();

-- Le vecchie assegnazioni mantengono gli snapshot completi per gli annullamenti.
-- Questa riscrittura innocua attiva il trigger solo sulle chiamate d'asta.
update public.league_movements
set season_name = season_name
where operation_type = 'acquisto_asta';

create or replace view public.league_movement_feed as
select
  movement.id,
  movement.operation_type,
  movement.summary,
  movement.created_at,
  movement.reverted_at is not null as reverted,
  movement.auction_player_name,
  movement.auction_team_code,
  movement.auction_cost,
  movement.auction_role,
  movement.auction_season_name
from public.league_movements movement;

revoke all privileges on table public.league_movement_feed from public, anon, authenticated;
grant select on table public.league_movement_feed to anon, authenticated;

create index if not exists league_movements_public_recent_idx
  on public.league_movements (created_at desc)
  where reverted_at is null;

create index if not exists league_movements_auction_calls_idx
  on public.league_movements (auction_season_name, created_at desc)
  where reverted_at is null and operation_type = 'acquisto_asta';
