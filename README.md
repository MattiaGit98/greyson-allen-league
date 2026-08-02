# Greyson Allen League

Gestionale web della lega Dunkest, sviluppato con Next.js, TypeScript e Supabase.

## Fonte dei dati

Supabase è la fonte ufficiale dello stato corrente. Il sito non ricostruisce la lega confrontando file iniziali o situazioni passate:

- fase e annata arrivano dalla stagione attiva in `seasons`;
- squadre, roster, scelte, Q.O. e listone arrivano da `league_state_overrides/current`;
- calendario, competizioni e storico hanno tabelle dedicate;
- i movimenti sono registrati al momento dell'operazione e non vengono dedotti a posteriori.

`data/league-snapshot.json` e gli script in `scripts/` servono soltanto per la migrazione iniziale. Non vengono usati dal sito in esecuzione.

## Avvio locale su questo PC

Aprire PowerShell nella cartella del progetto ed eseguire:

```powershell
$env:Path="$PWD\.node-runtime\node-v24.18.0-win-x64;$env:Path"
npm.cmd run dev
```

Poi aprire `http://localhost:3000`. Il file `.env.local` deve contenere l'URL e la chiave pubblicabile del progetto Supabase.

Con un'installazione normale di Node.js è sufficiente `npm run dev`.

## Controlli tecnici

```powershell
npm.cmd run check
npm.cmd run build
```

`check` esegue il controllo TypeScript e tutti i test automatici. `build` verifica anche la compilazione completa di produzione.

## Database

In un database nuovo, eseguire una sola volta le migration in `supabase/migrations`, in ordine di nome, e poi il seed iniziale. In un database già avviato, eseguire soltanto le migration successive all'ultima già applicata: non rilanciare il seed sui dati correnti.

Prima di ogni avanzamento della lega il sito scarica un backup importabile dell’intera situazione e crea anche un punto di ripristino interno. La pagina **Importa dati** può ripristinare fase, roster, listone, calendario, competizioni, storico e movimenti; prima di applicare il file scarica automaticamente un nuovo backup della situazione corrente. Dalla pagina Backup sono disponibili il backup ripristinabile e le copie leggibili Excel e HTML statico di Squadre e Storico.

## Struttura essenziale

- `app/`: pagine pubbliche, amministrazione e operazioni server;
- `components/`: componenti condivisi dell'interfaccia;
- `lib/`: regole, calcoli e accesso allo stato corrente;
- `supabase/migrations/`: evoluzione ordinata del database;
- `data/league-snapshot.json`: sola sorgente storica per l'inizializzazione.

La documentazione operativa è in `docs/`.
