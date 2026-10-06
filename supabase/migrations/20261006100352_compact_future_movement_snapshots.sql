-- Le quattro collezioni grandi contengono soltanto le identità modificate dal
-- movimento. Gli altri campi dello snapshot restano intatti. Il ripristino
-- continua a ricevere l'intero stato corrente dalla RPC, non da questi delta.
create or replace function public.league_movement_entry_key(entry jsonb, collection_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case collection_name
    when 'rosterEntries' then coalesce(lower(btrim(entry ->> 'name')), '')
    when 'playerList' then coalesce(lower(btrim(entry ->> 'name')), '')
    when 'qualifyingOfferRights' then coalesce(lower(btrim(entry ->> 'playerName')), '')
    when 'draftAssets' then
      coalesce(entry ->> 'year', '') || '|' || coalesce(entry ->> 'round', '') || '|'
      || coalesce(entry ->> 'originTeamCode', entry ->> 'originOrOverall', '')
    else ''
  end;
$$;

create or replace function public.compact_league_movement_entries(
  before_entries jsonb,
  after_entries jsonb,
  collection_name text
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with before_rows as materialized (
    select value, ordinal,
      public.league_movement_entry_key(value, collection_name) as entry_key
    from jsonb_array_elements(
      case when jsonb_typeof(before_entries) = 'array' then before_entries else '[]'::jsonb end
    ) with ordinality as entry(value, ordinal)
  ),
  after_rows as materialized (
    select value, ordinal,
      public.league_movement_entry_key(value, collection_name) as entry_key
    from jsonb_array_elements(
      case when jsonb_typeof(after_entries) = 'array' then after_entries else '[]'::jsonb end
    ) with ordinality as entry(value, ordinal)
  ),
  before_groups as (
    select entry_key, jsonb_agg(value order by value::text) as entries
    from before_rows group by entry_key
  ),
  after_groups as (
    select entry_key, jsonb_agg(value order by value::text) as entries
    from after_rows group by entry_key
  ),
  changed as (
    select coalesce(before_groups.entry_key, after_groups.entry_key) as entry_key
    from before_groups full join after_groups using (entry_key)
    where before_groups.entries is distinct from after_groups.entries
  )
  select jsonb_build_object(
    'before', coalesce((select jsonb_agg(value order by ordinal)
      from before_rows where entry_key in (select entry_key from changed)), '[]'::jsonb),
    'after', coalesce((select jsonb_agg(value order by ordinal)
      from after_rows where entry_key in (select entry_key from changed)), '[]'::jsonb)
  );
$$;

create or replace function public.compact_league_movement_snapshots()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  before_original jsonb := new.before_state;
  after_original jsonb := new.after_state;
  before_compact jsonb := new.before_state;
  after_compact jsonb := new.after_state;
  collection_name text;
  changed_entries jsonb;
begin
  foreach collection_name in array array[
    'rosterEntries', 'draftAssets', 'qualifyingOfferRights', 'playerList'
  ] loop
    changed_entries := public.compact_league_movement_entries(
      before_original -> collection_name,
      after_original -> collection_name,
      collection_name
    );
    before_compact := jsonb_set(before_compact, array[collection_name], changed_entries -> 'before', true);
    after_compact := jsonb_set(after_compact, array[collection_name], changed_entries -> 'after', true);
  end loop;

  new.before_state := before_compact;
  new.after_state := after_compact;
  return new;
end;
$$;

revoke all on function public.league_movement_entry_key(jsonb, text) from public, anon, authenticated;
revoke all on function public.compact_league_movement_entries(jsonb, jsonb, text) from public, anon, authenticated;
revoke all on function public.compact_league_movement_snapshots() from public, anon, authenticated;

create trigger league_movement_compact_snapshots
before insert or update of before_state, after_state
on public.league_movements
for each row execute function public.compact_league_movement_snapshots();
