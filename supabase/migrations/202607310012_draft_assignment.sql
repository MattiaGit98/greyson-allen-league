create or replace function public.replace_league_state_and_draft_history(
  state_payload jsonb,
  draft_history_payload jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Operazione riservata agli amministratori' using errcode = '42501';
  end if;

  if state_payload is null or jsonb_typeof(state_payload) <> 'object' then
    raise exception 'Stato della lega non valido' using errcode = '22023';
  end if;
  if draft_history_payload is null or jsonb_typeof(draft_history_payload) <> 'array' then
    raise exception 'Storico Draft non valido' using errcode = '22023';
  end if;

  insert into public.league_state_overrides(state_key, payload, updated_at, updated_by)
  values ('current', state_payload, now(), auth.uid())
  on conflict (state_key) do update
  set payload = excluded.payload,
      updated_at = excluded.updated_at,
      updated_by = excluded.updated_by;

  insert into public.history_competition_content(category, entries, updated_by, updated_at)
  values ('Draft', draft_history_payload, auth.uid(), now())
  on conflict (category) do update
  set entries = excluded.entries,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at;

  insert into public.audit_log(user_id, action, entity_type, old_data, new_data, reason)
  values (
    auth.uid(),
    'draft_player_assigned',
    'draft',
    null,
    jsonb_build_object('state_key', 'current', 'history_category', 'Draft'),
    'Assegnazione dal pannello Draft'
  );
end;
$$;

revoke all on function public.replace_league_state_and_draft_history(jsonb, jsonb) from public;
grant execute on function public.replace_league_state_and_draft_history(jsonb, jsonb) to authenticated;

notify pgrst, 'reload schema';
