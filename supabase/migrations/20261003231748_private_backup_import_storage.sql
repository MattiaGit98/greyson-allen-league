-- Area temporanea privata per i backup importabili. I file sono caricati
-- direttamente dal browser e rimossi subito dopo il tentativo di ripristino.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'league-backup-imports',
  'league-backup-imports',
  false,
  104857600,
  array['application/json']::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "admins upload temporary league backups" on storage.objects;
create policy "admins upload temporary league backups"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'league-backup-imports'
  and (select public.is_admin())
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and name ~* (
    '^'
    || (select auth.uid())::text
    || '/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.json$'
  )
);

drop policy if exists "admins read own temporary league backups" on storage.objects;
create policy "admins read own temporary league backups"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'league-backup-imports'
  and (select public.is_admin())
  and owner_id = (select auth.uid())::text
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and name ~* (
    '^'
    || (select auth.uid())::text
    || '/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.json$'
  )
);

drop policy if exists "admins delete own temporary league backups" on storage.objects;
create policy "admins delete own temporary league backups"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'league-backup-imports'
  and (select public.is_admin())
  and owner_id = (select auth.uid())::text
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and name ~* (
    '^'
    || (select auth.uid())::text
    || '/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.json$'
  )
);
