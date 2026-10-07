-- La ricerca testuale del registro usa ILIKE con una sottostringa; l'indice
-- trigram accelera sia il feed pubblico sia il registro amministrativo.
create extension if not exists pg_trgm with schema extensions;

set search_path to public, extensions;

create index if not exists league_movements_summary_trgm_idx
  on public.league_movements using gin (summary gin_trgm_ops);

create index if not exists league_movements_operation_type_trgm_idx
  on public.league_movements using gin (operation_type gin_trgm_ops);

-- Il registro pubblico include anche gli originali annullati: l'indice
-- parziale sui soli movimenti attivi non copre piu questa lettura.
create index if not exists league_movements_feed_recent_all_idx
  on public.league_movements (created_at desc);

create index if not exists league_movements_type_recent_idx
  on public.league_movements (operation_type, created_at desc);

reset search_path;
