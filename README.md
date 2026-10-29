# Greyson Allen League

Applicazione web per la gestione della Greyson Allen League, una lega di fantasy basket basata su Dunkest. Riunisce la consultazione pubblica della lega e gli strumenti amministrativi in un unico progetto, accessibile da desktop e dispositivi mobili e installabile come Progressive Web App (PWA).

[Applicazione](https://greyson-allen-league.vercel.app/) · [Regolamento](content/Regolamento.tex) · [Documentazione](docs/)

## Funzionalità

- Consultazione di squadre, roster, contratti, salary cap e scelte draft.
- Listone giocatori con ricerca, filtri e collegamenti alle squadre proprietarie.
- Calendario, classifiche, tabelloni delle competizioni e storico della lega.
- Simulatore pubblico di scambi con verifica dei vincoli e riepilogo condivisibile.
- Area amministrativa riservata per asta, draft, free agency, scambi e operazioni sui contratti.
- Avanzamento delle fasi della lega, controlli regolamentari, registro dei movimenti e annullamento delle operazioni consentite.
- Backup ripristinabili e copie di consultazione in formato Excel e HTML.

Le pagine pubbliche si aggiornano automaticamente quando cambiano i dati della lega. La PWA utilizza la stessa applicazione del sito: pagine e dati richiedono una connessione Internet e non vengono serviti da copie offline.

## Architettura

- **Next.js 15, React 19 e TypeScript** per interfaccia, rendering e operazioni server.
- **Supabase** per database PostgreSQL, autenticazione, Storage e aggiornamenti Realtime.
- **Vercel** per il deploy dell'applicazione.
- **Vitest** per i test automatici delle regole e dei flussi applicativi.

Sito web e PWA condividono repository, codice applicativo, deploy e backend. L'accesso amministrativo richiede un account autenticato e autorizzato.

### Stato della lega

Supabase è l'unica fonte dello stato corrente: annata, fase, squadre, roster, contratti, listone, calendario, competizioni e movimenti vengono letti dal backend. Il registro dei movimenti viene alimentato dalle operazioni effettuate, non ricostruito dal confronto tra versioni del repository.

Il repository contiene il codice e le migration dello schema, **non una copia della lega, seed o dati dimostrativi**. Senza un backend correttamente configurato, l'applicazione segnala l'indisponibilità dei dati invece di mostrare uno stato iniziale o una copia obsoleta. I backup operativi devono essere conservati privatamente, fuori dal repository.

## Sviluppo locale

Sono necessari Node.js, npm e un progetto Supabase configurato. La verifica automatica su GitHub utilizza Node.js 22.

Installare le dipendenze e predisporre la configurazione locale:

```bash
npm ci
cp .env.example .env.local
```

Compilare `.env.local` con l'URL e la chiave pubblicabile del progetto Supabase di sviluppo. Le variabili richieste e le indicazioni per il deploy sono descritte nella [guida alla pubblicazione](docs/deployment.md).

Avviare il server di sviluppo:

```bash
npm run dev
```

L'applicazione è disponibile all'indirizzo `http://localhost:3000`.

Le migration in `supabase/migrations/` descrivono l'evoluzione dello schema e vanno applicate in ordine al database di destinazione. Non creano una lega preconfigurata. Per dati, autorizzazioni e ripristino consultare la documentazione dedicata; non inserire credenziali riservate o backup nel repository.

## Verifica del progetto

```bash
npm run check
npm run build
```

`check` esegue il controllo TypeScript e la suite di test. `build` genera la versione di produzione. Gli stessi comandi vengono eseguiti dal workflow [Verify](.github/workflows/verify.yml) su push e pull request.

Per eseguire soltanto i test:

```bash
npm test
```

## Struttura del repository

```text
app/                  Pagine pubbliche, area amministrativa e operazioni server
components/           Componenti condivisi dell'interfaccia
content/              Sorgente del regolamento
data/                 Dati statici generali, non lo stato della lega
lib/                  Regole, calcoli, accesso ai dati e test associati
public/               Asset statici, icone PWA e service worker
supabase/migrations/  Evoluzione versionata dello schema del database
docs/                 Documentazione tecnica e operativa
```

## Documentazione

- [Pubblicazione e configurazione](docs/deployment.md)
- [Modello dei dati](docs/data-model.md)
- [Guida amministratore](docs/admin-guide.md)
- [Importazione dei dati](docs/import-guide.md)
- [Backup e ripristino](docs/backup-restore.md)
