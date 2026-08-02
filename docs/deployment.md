# Pubblicazione

## Variabili richieste

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` oppure `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Le eventuali chiavi service-role sono esclusivamente server-side e non devono comparire nel browser, nel repository o nei log.

## Verifica prima della pubblicazione

```bash
npm ci
npm run check
npm run build
```

Applicare prima le migration mancanti su un ambiente di prova, verificare accesso pubblico e amministrativo, quindi ripetere sul database di produzione. Il database deve avere una stagione attiva e lo stato `league_state_overrides/current`; in caso contrario il sito mostra deliberatamente un errore invece di dati fittizi.
