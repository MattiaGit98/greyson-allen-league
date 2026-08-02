alter table public.seasons
add column if not exists trade_deadline_passed boolean not null default false;

-- L'asta non è più una fase autonoma: si svolge nell'offseason dopo le T.O.
update public.seasons
set status = 'offseason',
    team_options_resolved = true,
    trade_deadline_passed = false
where status = 'auction';

create or replace function public.reset_trade_deadline_outside_season()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status <> 'regular_season' then
    new.trade_deadline_passed := false;
  end if;
  return new;
end;
$$;

drop trigger if exists reset_trade_deadline_outside_season on public.seasons;
create trigger reset_trade_deadline_outside_season
before insert or update of status on public.seasons
for each row execute function public.reset_trade_deadline_outside_season();

create or replace function public.set_active_season_status(requested_status public.season_status)
returns public.seasons
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_season public.seasons;
  previous_status public.season_status;
  allowed boolean;
begin
  if not public.is_admin() then
    raise exception 'Operazione riservata agli amministratori';
  end if;

  select * into current_season
  from public.seasons
  where is_active
  for update;

  if current_season.id is null then
    raise exception 'Nessuna stagione attiva';
  end if;
  if requested_status not in ('offseason','regular_season') then
    raise exception 'Fase non gestibile da questo controllo';
  end if;

  allowed :=
    requested_status = current_season.status
    or (current_season.status in ('setup','completed') and requested_status = 'offseason')
    or (current_season.status = 'offseason' and requested_status = 'regular_season')
    or (current_season.status = 'auction' and requested_status in ('offseason','regular_season'))
    or (current_season.status = 'regular_season' and requested_status = 'offseason');

  if not allowed then
    raise exception 'Transizione non consentita: % → %', current_season.status, requested_status;
  end if;

  previous_status := current_season.status;
  update public.seasons
  set status = requested_status
  where id = current_season.id
  returning * into current_season;

  insert into public.audit_log(user_id, action, entity_type, entity_id, old_data, new_data, reason)
  values (
    auth.uid(),
    'season_phase_changed',
    'season',
    current_season.id,
    jsonb_build_object('status', previous_status),
    jsonb_build_object('status', requested_status),
    'Cambio fase dalla pagina impostazioni'
  );

  return current_season;
end;
$$;

revoke all on function public.set_active_season_status(public.season_status) from public;
grant execute on function public.set_active_season_status(public.season_status) to authenticated;

notify pgrst, 'reload schema';
