# Deployment

## Ambienti

- locale: `.env.local`, dati demo o Supabase locale;
- staging: progetto Supabase separato e import di prova;
- produzione: database vuoto, migration versionate, import approvato.

Impostare `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`. La `SUPABASE_SERVICE_ROLE_KEY` è server-only e non deve comparire in bundle o log.

Prima del deploy: `npm ci`, `npm test`, `npm run build`, migration su staging, smoke test pubblico e verifica che una sessione anonima non possa scrivere.
