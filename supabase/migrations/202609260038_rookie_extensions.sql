-- Converte il vecchio anno futuro marcato X2 nel secondo anno con R.E.
-- mantenendo invariati costo, slot e tutti i contratti gia raddoppiati.
create or replace function public.normalize_rookie_extension_state(input_state jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case
    when input_state is null
      or jsonb_typeof(input_state) <> 'object'
      or jsonb_typeof(input_state -> 'rosterEntries') <> 'array'
      then input_state
    else jsonb_set(
      input_state,
      '{rosterEntries}',
      coalesce((
        select jsonb_agg(
          case
            when upper(trim(item.value ->> 'contract')) ~ '^[0-9]{2}[[:space:]]*(\((2X|X2)\)|(2X|X2))$'
              then (item.value - 'teamOptionBaseCost' - 'teamOptionFinalYear')
                || jsonb_build_object(
                  'contract',
                  lpad(((((substring(trim(item.value ->> 'contract') from '^([0-9]{2})'))::integer + 99) % 100))::text, 2, '0') || ' + R.E.'
                )
            else item.value
          end
          order by item.position
        )
        from jsonb_array_elements(input_state -> 'rosterEntries') with ordinality as item(value, position)
      ), '[]'::jsonb),
      false
    )
  end;
$$;

create or replace function public.normalize_rookie_extension_text(input_text text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  normalized_text text := input_text;
  legacy_match text[];
  replacement text;
begin
  loop
    legacy_match := regexp_match(
      normalized_text,
      '([0-9]{2})[[:space:]]*(\((2X|X2)\)|(2X|X2))',
      'i'
    );
    exit when legacy_match is null;
    replacement := lpad((((legacy_match[1])::integer + 99) % 100)::text, 2, '0') || ' + R.E.';
    normalized_text := regexp_replace(
      normalized_text,
      '([0-9]{2})[[:space:]]*(\((2X|X2)\)|(2X|X2))',
      replacement,
      'i'
    );
  end loop;
  return normalized_text;
end;
$$;

update public.league_state_overrides
set payload = public.normalize_rookie_extension_state(payload),
    updated_at = now()
where state_key = 'current';

update public.league_movements
set before_state = public.normalize_rookie_extension_state(before_state),
    after_state = public.normalize_rookie_extension_state(after_state),
    summary = public.normalize_rookie_extension_text(summary);

update public.league_phase_backups
set state_snapshot = public.normalize_rookie_extension_state(state_snapshot);

drop function public.normalize_rookie_extension_text(text);
drop function public.normalize_rookie_extension_state(jsonb);

notify pgrst, 'reload schema';
