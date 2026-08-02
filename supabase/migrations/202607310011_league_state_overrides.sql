create table if not exists public.league_state_overrides (
  state_key text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users
);

alter table public.league_state_overrides enable row level security;

drop policy if exists public_read on public.league_state_overrides;
create policy public_read on public.league_state_overrides
  for select using (true);

drop policy if exists admin_all on public.league_state_overrides;
create policy admin_all on public.league_state_overrides
  for all using (public.is_admin()) with check (public.is_admin());

create or replace function public.replace_league_state(state_payload jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Operazione riservata agli amministratori';
  end if;

  insert into public.league_state_overrides(state_key, payload, updated_at, updated_by)
  values ('current', state_payload, now(), auth.uid())
  on conflict (state_key) do update
  set payload = excluded.payload,
      updated_at = excluded.updated_at,
      updated_by = excluded.updated_by;

  insert into public.audit_log(user_id, action, entity_type, old_data, new_data, reason)
  values (
    auth.uid(),
    'league_state_replaced',
    'league_state',
    null,
    jsonb_build_object('state_key', 'current'),
    'Rettifica manuale dalla pagina amministrazione'
  );
end;
$$;

revoke all on function public.replace_league_state(jsonb) from public;
grant execute on function public.replace_league_state(jsonb) to authenticated;
