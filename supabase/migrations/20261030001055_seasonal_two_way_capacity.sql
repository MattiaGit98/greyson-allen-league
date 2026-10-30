-- La capacità Two-way fa parte dello stato ripristinabile della stagione.
-- Un client aperto prima del cambio di capacità non deve poterla sovrascrivere.
-- Nessuna annata specifica: l'assenza del campo identifica il formato precedente (2).
create or replace function public.canonical_league_state_for_concurrency(state_payload jsonb)
returns jsonb
language sql
immutable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'twoWaySlotLimit', case when jsonb_typeof(state_payload->'twoWaySlotLimit') = 'number'
      then state_payload->'twoWaySlotLimit' else '2'::jsonb end,
    'teams', coalesce((
      select jsonb_agg(
        item - array['players', 'cutPlayers', 'qualifyingOffers', 'draftAssets']::text[]
        order by item->>'code'
      )
      from jsonb_array_elements(
        case when jsonb_typeof(state_payload->'teams') = 'array'
          then state_payload->'teams' else '[]'::jsonb end
      ) as team(item)
    ), '[]'::jsonb),
    'rosterEntries', case when jsonb_typeof(state_payload->'rosterEntries') = 'array'
      then state_payload->'rosterEntries' else '[]'::jsonb end,
    'draftAssets', case when jsonb_typeof(state_payload->'draftAssets') = 'array'
      then state_payload->'draftAssets' else '[]'::jsonb end,
    'qualifyingOfferRights', case when jsonb_typeof(state_payload->'qualifyingOfferRights') = 'array'
      then state_payload->'qualifyingOfferRights' else '[]'::jsonb end,
    'playerList', coalesce((
      select jsonb_agg(player order by case when player->>'role' = 'X' then 1 else 0 end, ordinal)
      from jsonb_array_elements(
        case when jsonb_typeof(state_payload->'playerList') = 'array'
          then state_payload->'playerList' else '[]'::jsonb end
      ) with ordinality as players(player, ordinal)
    ), '[]'::jsonb),
    'playerListStatus', to_jsonb(coalesce(state_payload->>'playerListStatus', 'offseason')),
    'publicNotice', to_jsonb(trim(coalesce(state_payload->>'publicNotice', ''))),
    'homepageHonoursTable', to_jsonb(coalesce(state_payload->>'homepageHonoursTable', '')),
    'homepageCompetition', coalesce(state_payload->'homepageCompetition', 'null'::jsonb),
    'draftOrders', case when jsonb_typeof(state_payload->'draftOrders') = 'array'
      then state_payload->'draftOrders' else '[]'::jsonb end,
    'finalizedDraftPositionYears', case when jsonb_typeof(state_payload->'finalizedDraftPositionYears') = 'array'
      then state_payload->'finalizedDraftPositionYears' else '[]'::jsonb end
  );
$$;

revoke all on function public.canonical_league_state_for_concurrency(jsonb) from public, anon, authenticated;
