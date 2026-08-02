create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons on delete cascade,
  sort_order integer not null check (sort_order > 0),
  event_text text not null default '',
  date_text text not null default '',
  updated_by uuid references auth.users,
  updated_at timestamptz not null default now(),
  unique (season_id, sort_order)
);

alter table public.calendar_events enable row level security;

insert into public.calendar_events (season_id, sort_order, event_text, date_text)
select season.id, item.sort_order, item.event_text, ''
from public.seasons as season
cross join (values
  (1, 'Scadenza esercizio team option'),
  (2, 'Inizio draft'),
  (3, 'Inizio rilasci gratuiti'),
  (4, 'Asta'),
  (5, 'Consegna contratti'),
  (6, 'Inizio regular season'),
  (7, 'Quarti di finale coppa'),
  (8, 'Trade deadline'),
  (9, 'Termine buyout'),
  (10, 'Termine free agency'),
  (11, 'Ultima giornata regular season'),
  (12, 'Fase finale coppa'),
  (13, 'Play-in'),
  (14, 'Quarti di finale playoff'),
  (15, 'Semifinali playoff'),
  (16, 'Qualificazioni All Star Game'),
  (17, 'Fase finale All Star Game'),
  (18, 'Finale playoff'),
  (19, 'March Madness'),
  (20, 'Data termine stagione')
) as item(sort_order, event_text)
where season.is_active = true
on conflict (season_id, sort_order) do nothing;

drop policy if exists public_read on public.calendar_events;
create policy public_read
on public.calendar_events
for select
using (true);

drop policy if exists admin_all on public.calendar_events;
create policy admin_all
on public.calendar_events
for all
using (public.is_admin())
with check (public.is_admin());

create or replace function public.replace_active_calendar(payload jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  active_season_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Operazione riservata agli amministratori' using errcode = '42501';
  end if;

  if payload is null or jsonb_typeof(payload) <> 'array' then
    raise exception 'Calendario non valido' using errcode = '22023';
  end if;

  select id into active_season_id
  from public.seasons
  where is_active = true;

  if active_season_id is null then
    raise exception 'Nessuna stagione attiva' using errcode = '22023';
  end if;

  delete from public.calendar_events
  where season_id = active_season_id;

  insert into public.calendar_events (
    season_id,
    sort_order,
    event_text,
    date_text,
    updated_by,
    updated_at
  )
  select
    active_season_id,
    item.position::integer,
    left(trim(coalesce(item.value ->> 'event', '')), 500),
    left(trim(coalesce(item.value ->> 'date', '')), 500),
    auth.uid(),
    now()
  from jsonb_array_elements(payload) with ordinality as item(value, position)
  where nullif(trim(coalesce(item.value ->> 'event', '')), '') is not null
     or nullif(trim(coalesce(item.value ->> 'date', '')), '') is not null;
end;
$$;

grant execute on function public.replace_active_calendar(jsonb) to authenticated;

notify pgrst, 'reload schema';
