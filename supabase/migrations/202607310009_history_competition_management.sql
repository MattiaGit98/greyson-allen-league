create table if not exists public.history_competition_content (
  category text primary key check (category in (
    'Albo d''oro',
    'Numero titoli',
    'Playoff',
    'Coppa',
    'All Star Game',
    'March Madness',
    'Conference League',
    'Draft',
    'Regular season',
    'Roster vincitore'
  )),
  entries jsonb not null default '[]'::jsonb check (jsonb_typeof(entries) = 'array'),
  updated_by uuid references auth.users,
  updated_at timestamptz not null default now()
);

alter table public.history_competition_content enable row level security;

drop policy if exists public_read on public.history_competition_content;
create policy public_read
on public.history_competition_content
for select
using (true);

drop policy if exists admin_all on public.history_competition_content;
create policy admin_all
on public.history_competition_content
for all
using (public.is_admin())
with check (public.is_admin());

create or replace function public.replace_history_competition_content(target_category text, payload jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Operazione riservata agli amministratori' using errcode = '42501';
  end if;

  if target_category not in (
    'Albo d''oro',
    'Numero titoli',
    'Playoff',
    'Coppa',
    'All Star Game',
    'March Madness',
    'Conference League',
    'Draft',
    'Regular season',
    'Roster vincitore'
  ) or payload is null or jsonb_typeof(payload) <> 'array' then
    raise exception 'Contenuto non valido' using errcode = '22023';
  end if;

  insert into public.history_competition_content (
    category,
    entries,
    updated_by,
    updated_at
  ) values (
    target_category,
    payload,
    auth.uid(),
    now()
  )
  on conflict (category) do update
  set entries = excluded.entries,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at;
end;
$$;

grant execute on function public.replace_history_competition_content(text, jsonb) to authenticated;

notify pgrst, 'reload schema';
