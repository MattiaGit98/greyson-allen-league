-- safeupdate rifiuta gli UPDATE privi di WHERE anche dentro una funzione.
-- Questo passaggio deve aggiornare intenzionalmente tutte le squadre prima di
-- ripristinarne sigle, nomi e slug; ogni squadra ha sempre un id non nullo.
do $migration$
declare
  function_definition text;
  unsafe_fragment constant text := 'slug = ''__restore_slug_'' || id::text;';
  safe_fragment constant text := 'slug = ''__restore_slug_'' || id::text'
    || chr(13) || chr(10) || '    where id is not null;';
  fragment_count integer;
begin
  select pg_get_functiondef(p.oid)
  into function_definition
  from pg_proc as p
  join pg_namespace as n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'restore_importable_league_backup'
    and pg_get_function_identity_arguments(p.oid) = 'backup_document jsonb';

  if function_definition is null then
    raise exception 'Funzione di ripristino non trovata';
  end if;

  fragment_count := (
    length(function_definition) - length(replace(function_definition, unsafe_fragment, ''))
  ) / length(unsafe_fragment);

  if fragment_count <> 1 then
    raise exception 'UPDATE temporaneo delle squadre non riconosciuto in modo univoco';
  end if;

  execute replace(function_definition, unsafe_fragment, safe_fragment);
end;
$migration$;

-- CREATE OR REPLACE conserva normalmente la configurazione restituita da
-- pg_get_functiondef; la ribadiamo per rendere esplicito il requisito.
alter function public.restore_importable_league_backup(jsonb)
set statement_timeout = '60s';

