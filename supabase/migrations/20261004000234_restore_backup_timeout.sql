-- Il ripristino completo include anche tutti i movimenti con before_state e
-- after_state. Il timeout predefinito del ruolo authenticated (8 secondi) non
-- e sufficiente per backup di dimensioni realistiche.
--
-- L'eccezione resta limitata a questa RPC amministrativa e conserva una sola
-- transazione atomica: allo scadere del limite PostgreSQL annulla tutto.
alter function public.restore_importable_league_backup(jsonb)
set statement_timeout = '60s';

