alter table public.seasons
drop constraint if exists seasons_timeline_moment_check;

alter table public.seasons
add constraint seasons_timeline_moment_check check (timeline_moment in (
  'offseason_start',
  'team_option_deadline',
  'auction_start',
  'auction_completed',
  'contract_delivery',
  'trade_deadline',
  'buyout_end',
  'free_agency_end',
  'free_agency_reopening'
));

do $migration$
declare
  restore_definition text;
begin
  if to_regprocedure('public.restore_importable_league_backup(jsonb)') is not null then
    select pg_get_functiondef('public.restore_importable_league_backup(jsonb)'::regprocedure)
    into restore_definition;
    execute replace(
      restore_definition,
      '''buyout_end'', ''free_agency_end''',
      '''buyout_end'', ''free_agency_end'', ''free_agency_reopening'''
    );
  end if;
end
$migration$;

notify pgrst, 'reload schema';
