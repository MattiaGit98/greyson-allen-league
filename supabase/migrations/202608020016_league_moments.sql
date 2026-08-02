alter table public.seasons
add column if not exists timeline_moment text;

update public.seasons
set timeline_moment = case
  when status = 'offseason' and coalesce(team_options_resolved, false) = false then 'offseason_start'
  when status = 'offseason' then 'team_option_deadline'
  when status = 'regular_season' and coalesce(trade_deadline_passed, false) = true then 'trade_deadline'
  when status = 'regular_season' then 'contract_delivery'
  else 'team_option_deadline'
end
where timeline_moment is null;

alter table public.seasons
alter column timeline_moment set default 'offseason_start';

alter table public.seasons
alter column timeline_moment set not null;

alter table public.seasons
drop constraint if exists seasons_timeline_moment_check;

alter table public.seasons
add constraint seasons_timeline_moment_check check (timeline_moment in (
  'offseason_start',
  'team_option_deadline',
  'free_releases_start',
  'auction_completed',
  'contract_delivery',
  'trade_deadline',
  'buyout_end',
  'free_agency_end'
));

notify pgrst, 'reload schema';
