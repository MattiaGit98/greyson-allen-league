# Greyson Allen League

Gestionale web mobile-first per la lega privata Dunkest. Il database PostgreSQL è la fonte ufficiale; Excel serve solo per la migrazione iniziale e per esportazioni di sicurezza.

## Stato

La Fase 0 è documentata e una prima applicazione locale consultabile è presente: progetto Next.js strict, modello SQL con RLS e audit, motore di regole tipizzato, importatore Excel in modalità `dry-run`, snapshot indipendente dall'Excel e interfacce pubbliche/amministrative basate sui dati reali.

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

La demo pubblica funziona anche senza Supabase. Sono disponibili le anteprime guidate delle operazioni; salvataggio, login e aggiornamenti realtime richiedono le variabili Supabase.

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

Per rigenerare lo snapshot usato dalla demo:

```bash
npm run import:excel -- "C:\percorso\Roster.xlsx" --phase=offseason --snapshot=data/league-snapshot.json
```

## Documentazione

- [Analisi dei file e milestone](docs/analysis.md)
- [Modello dati](docs/data-model.md)
- [Mappa delle regole](docs/rules-map.md)
- [Guida amministratore](docs/admin-guide.md)
- [Deployment](docs/deployment.md)
- [Backup e ripristino](docs/backup-restore.md)

## Milestone

1. Fase 0 — completata: analisi, assunzioni, modello, route e wireframe.
2. Fase 1 — avanzata: schema, RLS, app shell, snapshot iniziale e regole.
3. Fase 2 — avanzata in locale: squadre complete, giocatori ricercabili, dead cap, QO e asset draft.
4. Prossimo blocco: collegare Supabase e rendere persistenti operazioni, movimenti e asta.

Le decisioni ancora da confermare sono elencate in `docs/analysis.md`; non bloccano l'architettura.
