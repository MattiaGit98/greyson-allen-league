# Greyson Allen League

Gestionale web della lega Dunkest, sviluppato con Next.js, TypeScript e Supabase.

## Fonte dei dati

Supabase è l'unica fonte dello stato corrente. Il repository non contiene fotografie, seed o copie locali della lega e il sito non ricostruisce lo stato confrontando situazioni passate:

- fase e annata arrivano dalla stagione attiva in `seasons`;
- squadre, roster, scelte, Q.O. e listone arrivano da `league_state_overrides/current`;
- calendario, competizioni e storico hanno tabelle dedicate;
- i movimenti sono registrati al momento dell'operazione e non vengono dedotti a posteriori.

Un ambiente che non è collegato al progetto Supabase operativo non dispone di squadre, roster o altri dati della lega. Gli eventuali backup importabili devono essere conservati privatamente fuori dal repository.

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

In un database nuovo, eseguire le migration in `supabase/migrations` in ordine di nome. Le migration costruiscono lo schema ma non inizializzano una lega: i dati devono provenire da una configurazione amministrativa o da un backup privato compatibile. In un database già avviato vanno applicate soltanto le migration successive all'ultima registrata.

Prima di ogni avanzamento della lega il sito scarica un backup importabile dell’intera situazione e crea anche un punto di ripristino interno. La pagina **Importa dati** può ripristinare fase, roster, listone, calendario, competizioni, storico e movimenti; prima di applicare il file scarica automaticamente un nuovo backup della situazione corrente. Dalla pagina Backup sono disponibili il backup ripristinabile e le copie leggibili Excel e HTML statico di Squadre e Storico.

## Struttura essenziale

- `app/`: pagine pubbliche, amministrazione e operazioni server;
- `components/`: componenti condivisi dell'interfaccia;
- `lib/`: regole, calcoli e accesso allo stato corrente;
- `supabase/migrations/`: evoluzione ordinata della struttura del database;
- `data/`: dati statici generali dell'applicazione, mai lo stato della lega.

La documentazione operativa è in `docs/`.
