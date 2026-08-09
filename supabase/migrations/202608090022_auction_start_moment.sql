alter table public.seasons
drop constraint if exists seasons_timeline_moment_check;

update public.seasons
set timeline_moment = 'auction_start'
where timeline_moment = 'free_releases_start';

alter table public.seasons
add constraint seasons_timeline_moment_check check (timeline_moment in (
  'offseason_start',
  'team_option_deadline',
  'auction_start',
  'auction_completed',
  'contract_delivery',
  'trade_deadline',
  'buyout_end',
  'free_agency_end'
));

update public.league_phase_backups
set from_phase = case when from_phase = 'free_releases_start' then 'auction_start' else from_phase end,
    to_phase = case when to_phase = 'free_releases_start' then 'auction_start' else to_phase end,
    season_snapshot = case
      when season_snapshot ->> 'timeline_moment' = 'free_releases_start'
        then jsonb_set(season_snapshot, '{timeline_moment}', '"auction_start"'::jsonb)
      else season_snapshot
    end
where from_phase = 'free_releases_start'
   or to_phase = 'free_releases_start'
   or season_snapshot ->> 'timeline_moment' = 'free_releases_start';

update public.calendar_events
set event_text = 'Inizio asta',
    updated_at = now()
where event_text = 'Inizio rilasci gratuiti';

update public.calendar_events
set event_text = 'Termine asta',
    updated_at = now()
where event_text = 'Asta';

do $migration$
declare
  restore_definition text;
begin
  if to_regprocedure('public.restore_importable_league_backup(jsonb)') is not null then
    select pg_get_functiondef('public.restore_importable_league_backup(jsonb)'::regprocedure)
    into restore_definition;
    execute replace(restore_definition, 'free_releases_start', 'auction_start');
  end if;
end
$migration$;

notify pgrst, 'reload schema';
