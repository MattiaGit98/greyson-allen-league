-- PostgreSQL concede EXECUTE sulle nuove funzioni al ruolo PUBLIC. Revocarlo
-- soltanto ad anon non rimuove il privilegio ereditato da PUBLIC, quindi tutte
-- le RPC amministrative vengono qui ristrette esplicitamente agli autenticati.

revoke all on function public.advance_league_and_archive_competitions(jsonb, text, text, jsonb, jsonb) from public, anon;
grant execute on function public.advance_league_and_archive_competitions(jsonb, text, text, jsonb, jsonb) to authenticated;

revoke all on function public.apply_league_state_and_history_movement(jsonb, jsonb, text, jsonb, jsonb, text, text) from public, anon;
grant execute on function public.apply_league_state_and_history_movement(jsonb, jsonb, text, jsonb, jsonb, text, text) to authenticated;

revoke all on function public.apply_league_state_movement(jsonb, jsonb, text, text) from public, anon;
grant execute on function public.apply_league_state_movement(jsonb, jsonb, text, text) to authenticated;

revoke all on function public.apply_league_state_movements(jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.apply_league_state_movements(jsonb, jsonb, jsonb) to authenticated;

revoke all on function public.apply_trade_movement(jsonb, jsonb, text, jsonb, text, jsonb, jsonb, text, text) from public, anon;
grant execute on function public.apply_trade_movement(jsonb, jsonb, text, jsonb, text, jsonb, jsonb, text, text) to authenticated;

revoke all on function public.publish_post_auction_contracts(jsonb, jsonb, uuid, text, jsonb) from public, anon;
grant execute on function public.publish_post_auction_contracts(jsonb, jsonb, uuid, text, jsonb) to authenticated;

revoke all on function public.replace_active_calendar(jsonb) from public, anon;
grant execute on function public.replace_active_calendar(jsonb) to authenticated;

revoke all on function public.replace_active_competition_content(text, jsonb) from public, anon;
grant execute on function public.replace_active_competition_content(text, jsonb) to authenticated;

revoke all on function public.replace_history_competition_content(text, jsonb) from public, anon;
grant execute on function public.replace_history_competition_content(text, jsonb) to authenticated;

revoke all on function public.replace_league_state(jsonb) from public, anon;
grant execute on function public.replace_league_state(jsonb) to authenticated;

revoke all on function public.replace_league_state_and_draft_history(jsonb, jsonb) from public, anon;
grant execute on function public.replace_league_state_and_draft_history(jsonb, jsonb) to authenticated;

revoke all on function public.replace_post_auction_contract_drafts(text, text, jsonb) from public, anon;
grant execute on function public.replace_post_auction_contract_drafts(text, text, jsonb) to authenticated;

revoke all on function public.restore_importable_league_backup(jsonb) from public, anon;
grant execute on function public.restore_importable_league_backup(jsonb) to authenticated;

revoke all on function public.restore_league_phase_backup(uuid) from public, anon;
grant execute on function public.restore_league_phase_backup(uuid) to authenticated;

revoke all on function public.revert_league_state_movement(uuid, jsonb, jsonb, text) from public, anon;
grant execute on function public.revert_league_state_movement(uuid, jsonb, jsonb, text) to authenticated;

revoke all on function public.set_active_season_status(public.season_status) from public, anon;
grant execute on function public.set_active_season_status(public.season_status) to authenticated;

-- Funzioni trigger: possono essere invocate dai trigger senza essere eseguibili
-- direttamente da alcun ruolo client.
revoke all on function public.bump_league_live_revision() from public, anon, authenticated;
revoke all on function public.reset_trade_deadline_outside_season() from public, anon, authenticated;

notify pgrst, 'reload schema';
