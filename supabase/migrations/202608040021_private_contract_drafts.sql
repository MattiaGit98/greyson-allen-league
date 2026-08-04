create table if not exists public.post_auction_contract_drafts (
  season_name text not null,
  team_code text not null,
  player_name text not null,
  contract_kind text not null check (contract_kind in ('annual', 'biennial', 'triennial', 'team_option')),
  slot text not null check (slot in ('regular', 'two_way', 'g_league')),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users,
  primary key (season_name, team_code, player_name)
);

alter table public.post_auction_contract_drafts enable row level security;

drop policy if exists admin_all on public.post_auction_contract_drafts;
create policy admin_all on public.post_auction_contract_drafts
  for all using (public.is_admin()) with check (public.is_admin());

revoke all on table public.post_auction_contract_drafts from anon, authenticated;
grant select, insert, update, delete on table public.post_auction_contract_drafts to authenticated;

create or replace function public.replace_post_auction_contract_drafts(
  requested_season_name text,
  requested_team_code text,
  draft_rows jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  draft_row jsonb;
begin
  if not public.is_admin() then
    raise exception 'Operazione riservata agli amministratori' using errcode = '42501';
  end if;
  if coalesce(trim(requested_season_name), '') = ''
    or coalesce(trim(requested_team_code), '') = ''
    or draft_rows is null
    or jsonb_typeof(draft_rows) <> 'array'
  then
    raise exception 'Bozze dei contratti non valide' using errcode = '22023';
  end if;

  delete from public.post_auction_contract_drafts
  where season_name = requested_season_name and team_code = requested_team_code;

  for draft_row in select value from jsonb_array_elements(draft_rows)
  loop
    if jsonb_typeof(draft_row) <> 'object'
      or coalesce(trim(draft_row->>'player_name'), '') = ''
      or coalesce(draft_row->>'contract_kind', '') not in ('annual', 'biennial', 'triennial', 'team_option')
      or coalesce(draft_row->>'slot', '') not in ('regular', 'two_way', 'g_league')
    then
      raise exception 'Riga della bozza non valida' using errcode = '22023';
    end if;

    insert into public.post_auction_contract_drafts(
      season_name,
      team_code,
      player_name,
      contract_kind,
      slot,
      updated_at,
      updated_by
    ) values (
      requested_season_name,
      requested_team_code,
      trim(draft_row->>'player_name'),
      draft_row->>'contract_kind',
      draft_row->>'slot',
      now(),
      auth.uid()
    );
  end loop;
end;
$$;

revoke all on function public.replace_post_auction_contract_drafts(text, text, jsonb) from public;
grant execute on function public.replace_post_auction_contract_drafts(text, text, jsonb) to authenticated;

create or replace function public.publish_post_auction_contracts(
  expected_state_payload jsonb,
  published_state_payload jsonb,
  requested_season_id uuid,
  requested_season_name text,
  expected_draft_rows jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_state jsonb;
  current_drafts jsonb;
  current_season_name text;
  current_moment text;
begin
  if not public.is_admin() then
    raise exception 'Operazione riservata agli amministratori' using errcode = '42501';
  end if;
  if expected_state_payload is null
    or published_state_payload is null
    or jsonb_typeof(expected_state_payload) <> 'object'
    or jsonb_typeof(published_state_payload) <> 'object'
    or expected_draft_rows is null
    or jsonb_typeof(expected_draft_rows) <> 'array'
  then
    raise exception 'Dati di pubblicazione non validi' using errcode = '22023';
  end if;

  select payload into current_state
  from public.league_state_overrides
  where state_key = 'current'
  for update;
  if coalesce(current_state->'rosterEntries', '[]'::jsonb) <> coalesce(expected_state_payload->'rosterEntries', '[]'::jsonb)
    or coalesce(current_state->'draftAssets', '[]'::jsonb) <> coalesce(expected_state_payload->'draftAssets', '[]'::jsonb)
    or coalesce(current_state->'qualifyingOfferRights', '[]'::jsonb) <> coalesce(expected_state_payload->'qualifyingOfferRights', '[]'::jsonb)
    or coalesce(current_state->'playerList', '[]'::jsonb) <> coalesce(expected_state_payload->'playerList', '[]'::jsonb)
    or coalesce(current_state->>'playerListStatus', 'offseason') <> coalesce(expected_state_payload->>'playerListStatus', 'offseason')
  then
    raise exception 'Lo stato della lega è cambiato: aggiorna la pagina' using errcode = '40001';
  end if;

  select name, timeline_moment
  into current_season_name, current_moment
  from public.seasons
  where id = requested_season_id and is_active = true
  for update;
  if current_season_name is distinct from requested_season_name or current_moment is distinct from 'auction_completed' then
    raise exception 'La consegna dei contratti non è disponibile in questo momento' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'team_code', team_code,
      'player_name', player_name,
      'contract_kind', contract_kind,
      'slot', slot
    ) order by team_code, player_name
  ), '[]'::jsonb)
  into current_drafts
  from public.post_auction_contract_drafts
  where season_name = requested_season_name;
  if jsonb_array_length(current_drafts) <> jsonb_array_length(expected_draft_rows)
    or not (current_drafts @> expected_draft_rows)
    or not (expected_draft_rows @> current_drafts)
  then
    raise exception 'Le bozze dei contratti sono cambiate: aggiorna la pagina' using errcode = '40001';
  end if;

  update public.league_state_overrides
  set payload = published_state_payload,
      updated_at = now(),
      updated_by = auth.uid()
  where state_key = 'current';

  update public.seasons
  set status = 'regular_season'::public.season_status,
      timeline_moment = 'contract_delivery',
      team_options_resolved = true,
      trade_deadline_passed = false
  where id = requested_season_id;

  insert into public.audit_log(user_id, action, entity_type, old_data, new_data, reason)
  values (
    auth.uid(),
    'post_auction_contracts_published',
    'league_state',
    null,
    jsonb_build_object('season_name', requested_season_name, 'contracts', jsonb_array_length(expected_draft_rows)),
    'Pubblicazione alla consegna dei contratti'
  );
end;
$$;

revoke all on function public.publish_post_auction_contracts(jsonb, jsonb, uuid, text, jsonb) from public;
grant execute on function public.publish_post_auction_contracts(jsonb, jsonb, uuid, text, jsonb) to authenticated;

notify pgrst, 'reload schema';
