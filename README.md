# Greyson Allen League

Gestionale web mobile-first per la lega privata Dunkest. Il database PostgreSQL è la fonte ufficiale; Excel serve solo per la migrazione iniziale e per esportazioni di sicurezza.

## Stato

La Fase 0 è documentata e le fondamenta della Fase 1 sono presenti: progetto Next.js strict, modello SQL con RLS e audit, motore di regole tipizzato, importatore Excel in modalità `dry-run`, test unitari e prima dashboard pubblica basata esclusivamente sui dati reali ricavati dal roster.

## Stack

- Next.js App Router, React, TypeScript strict
- Supabase (PostgreSQL, Auth, RLS, Realtime)
- CSS modulare senza dipendenza da una libreria UI
- Vitest per il motore delle regole
- ExcelJS per il solo import iniziale

## Avvio locale

Requisiti: Node.js 20.11+ e npm.

```bash
npm install
copy .env.example .env.local
npm run dev
```

La demo pubblica funziona anche senza Supabase. Le operazioni amministrative richiedono le variabili Supabase.

## Database e sicurezza

Applicare nell'ordine le migration in `supabase/migrations`. Le chiavi `NEXT_PUBLIC_*` possono essere usate dal browser; la service role key è esclusivamente server-side. Tutte le tabelle operative hanno RLS: lettura pubblica selettiva e scrittura riservata agli utenti presenti in `admin_users`.

## Test

```bash
npm test
npm run build
```

## Importazione iniziale

```bash
npm run import:excel -- "C:\percorso\Roster.xlsx"
```

Il comando predefinito è un `dry-run`: genera `import-report.json` e non scrive nel database. Vedere [docs/import-guide.md](docs/import-guide.md).

## Documentazione

- [Analisi dei file e milestone](docs/analysis.md)
- [Modello dati](docs/data-model.md)
- [Mappa delle regole](docs/rules-map.md)
- [Guida amministratore](docs/admin-guide.md)
- [Deployment](docs/deployment.md)
- [Backup e ripristino](docs/backup-restore.md)

## Milestone

1. Fase 0 — completata: analisi, assunzioni, modello, route e wireframe.
2. Fase 1 — avviata: schema, RLS, app shell, seed e regole di base.
3. Fase 2 — prossima: collegare Supabase e completare squadre, giocatori e movimenti.

Le decisioni ancora da confermare sono elencate in `docs/analysis.md`; non bloccano l'architettura.
