create table if not exists public.competition_content (
  season_id uuid not null references public.seasons on delete cascade,
  competition_name text not null check (competition_name in (
    'Girone coppa',
    'Tabellone coppa',
    'Regular season',
    'Playoff',
    'Conference League',
    'All Star Game',
    'March Madness'
  )),
  content jsonb not null check (jsonb_typeof(content) = 'object'),
  updated_by uuid references auth.users,
  updated_at timestamptz not null default now(),
  primary key (season_id, competition_name)
);

alter table public.competition_content enable row level security;

insert into public.competition_content (season_id, competition_name, content)
select season.id, item.competition_name, item.content
from public.seasons as season
cross join (values
  ('Girone coppa', '{"kind":"cup_group","rounds":5,"results":{}}'::jsonb),
  ('Regular season', '{"kind":"ranking","positions":[null,null,null,null,null,null,null,null,null,null,null,null,null,null]}'::jsonb),
  ('March Madness', '{"kind":"ranking","positions":[null,null,null,null,null,null,null,null,null,null,null,null,null,null]}'::jsonb),
  ('Tabellone coppa', '{"kind":"bracket","stages":[{"name":"Quarti di finale","matches":[{"teams":[{"teamCode":null,"score":"","homeAdvantage":false},{"teamCode":null,"score":"","homeAdvantage":false}]},{"teams":[{"teamCode":null,"score":"","homeAdvantage":false},{"teamCode":null,"score":"","homeAdvantage":false}]},{"teams":[{"teamCode":null,"score":"","homeAdvantage":false},{"teamCode":null,"score":"","homeAdvantage":false}]},{"teams":[{"teamCode":null,"score":"","homeAdvantage":false},{"teamCode":null,"score":"","homeAdvantage":false}]}]},{"name":"Semifinali","matches":[{"teams":[{"teamCode":null,"score":"","homeAdvantage":false},{"teamCode":null,"score":"","homeAdvantage":false}]},{"teams":[{"teamCode":null,"score":"","homeAdvantage":false},{"teamCode":null,"score":"","homeAdvantage":false}]}]},{"name":"Finale","matches":[{"teams":[{"teamCode":null,"score":"","homeAdvantage":false},{"teamCode":null,"score":"","homeAdvantage":false}]}]}]}'::jsonb),
  ('Playoff', '{"kind":"bracket","stages":[{"name":"Play-in","matches":[{"teams":[{"teamCode":null,"score":"","homeAdvantage":false},{"teamCode":null,"score":"","homeAdvantage":false}]},{"teams":[{"teamCode":null,"score":"","homeAdvantage":false},{"teamCode":null,"score":"","homeAdvantage":false}]},{"teams":[{"teamCode":null,"score":"","homeAdvantage":false},{"teamCode":null,"score":"","homeAdvantage":false}]}]},{"name":"Quarti di finale","matches":[{"teams":[{"teamCode":null,"score":"","homeAdvantage":false},{"teamCode":null,"score":"","homeAdvantage":false}]},{"teams":[{"teamCode":null,"score":"","homeAdvantage":false},{"teamCode":null,"score":"","homeAdvantage":false}]},{"teams":[{"teamCode":null,"score":"","homeAdvantage":false},{"teamCode":null,"score":"","homeAdvantage":false}]},{"teams":[{"teamCode":null,"score":"","homeAdvantage":false},{"teamCode":null,"score":"","homeAdvantage":false}]}]},{"name":"Semifinali","matches":[{"teams":[{"teamCode":null,"score":"","homeAdvantage":false},{"teamCode":null,"score":"","homeAdvantage":false}]},{"teams":[{"teamCode":null,"score":"","homeAdvantage":false},{"teamCode":null,"score":"","homeAdvantage":false}]}]},{"name":"Finale","matches":[{"teams":[{"teamCode":null,"score":"","homeAdvantage":false},{"teamCode":null,"score":"","homeAdvantage":false}]}]}]}'::jsonb),
  ('Conference League', '{"kind":"bracket","stages":[{"name":"Qualificazioni","matches":[{"teams":[{"teamCode":null,"score":"","homeAdvantage":false},{"teamCode":null,"score":"","homeAdvantage":false}]},{"teams":[{"teamCode":null,"score":"","homeAdvantage":false},{"teamCode":null,"score":"","homeAdvantage":false}]},{"teams":[{"teamCode":null,"score":"","homeAdvantage":false},{"teamCode":null,"score":"","homeAdvantage":false}]}]},{"name":"Quarti di finale","matches":[{"teams":[{"teamCode":null,"score":"","homeAdvantage":false},{"teamCode":null,"score":"","homeAdvantage":false}]},{"teams":[{"teamCode":null,"score":"","homeAdvantage":false},{"teamCode":null,"score":"","homeAdvantage":false}]},{"teams":[{"teamCode":null,"score":"","homeAdvantage":false},{"teamCode":null,"score":"","homeAdvantage":false}]},{"teams":[{"teamCode":null,"score":"","homeAdvantage":false},{"teamCode":null,"score":"","homeAdvantage":false}]}]},{"name":"Semifinali","matches":[{"teams":[{"teamCode":null,"score":"","homeAdvantage":false},{"teamCode":null,"score":"","homeAdvantage":false}]},{"teams":[{"teamCode":null,"score":"","homeAdvantage":false},{"teamCode":null,"score":"","homeAdvantage":false}]}]},{"name":"Finale","matches":[{"teams":[{"teamCode":null,"score":"","homeAdvantage":false},{"teamCode":null,"score":"","homeAdvantage":false}]}]}]}'::jsonb),
  ('All Star Game', '{"kind":"bracket","stages":[{"name":"Quarti di finale","matches":[{"teams":[{"teamCode":null,"score":"","homeAdvantage":false},{"teamCode":null,"score":"","homeAdvantage":false}]},{"teams":[{"teamCode":null,"score":"","homeAdvantage":false},{"teamCode":null,"score":"","homeAdvantage":false}]},{"teams":[{"teamCode":null,"score":"","homeAdvantage":false},{"teamCode":null,"score":"","homeAdvantage":false}]},{"teams":[{"teamCode":null,"score":"","homeAdvantage":false},{"teamCode":null,"score":"","homeAdvantage":false}]}]},{"name":"Semifinali","matches":[{"teams":[{"teamCode":null,"score":"","homeAdvantage":false},{"teamCode":null,"score":"","homeAdvantage":false}]},{"teams":[{"teamCode":null,"score":"","homeAdvantage":false},{"teamCode":null,"score":"","homeAdvantage":false}]}]},{"name":"Finale","matches":[{"teams":[{"teamCode":null,"score":"","homeAdvantage":false},{"teamCode":null,"score":"","homeAdvantage":false}]}]}]}'::jsonb)
) as item(competition_name, content)
where season.is_active = true
on conflict (season_id, competition_name) do nothing;

drop policy if exists public_read on public.competition_content;
create policy public_read
on public.competition_content
for select
using (true);

drop policy if exists admin_all on public.competition_content;
create policy admin_all
on public.competition_content
for all
using (public.is_admin())
with check (public.is_admin());

create or replace function public.replace_active_competition_content(target_name text, payload jsonb)
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

  if target_name not in (
    'Girone coppa',
    'Tabellone coppa',
    'Regular season',
    'Playoff',
    'Conference League',
    'All Star Game',
    'March Madness'
  ) or payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception 'Contenuto non valido' using errcode = '22023';
  end if;

  select id into active_season_id
  from public.seasons
  where is_active = true;

  if active_season_id is null then
    raise exception 'Nessuna stagione attiva' using errcode = '22023';
  end if;

  insert into public.competition_content (
    season_id,
    competition_name,
    content,
    updated_by,
    updated_at
  ) values (
    active_season_id,
    target_name,
    payload,
    auth.uid(),
    now()
  )
  on conflict (season_id, competition_name) do update
  set content = excluded.content,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at;
end;
$$;

grant execute on function public.replace_active_competition_content(text, jsonb) to authenticated;

notify pgrst, 'reload schema';
