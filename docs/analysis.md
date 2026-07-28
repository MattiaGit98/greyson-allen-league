# Analisi preliminare — Greyson Allen League

Analisi eseguita il 28 luglio 2026 sui file `Regolamento.pdf` (13 pagine, regolamento articolato in 15 sezioni) e `Roster.xlsx` (stagione indicata 2025/2026). Questa è la baseline della Fase 0: non sostituisce una validazione amministrativa prima dell'import definitivo.

## Sintesi verificata

- 14 squadre, tutte rappresentate nel foglio `Roster` in blocchi orizzontali da quattro colonne.
- 149 occorrenze giocatore tra rosa attiva (144) e giocatori tagliati (5), considerando le righe dati 8–27 e 29–42.
- `Cody Williams` compare attivo per SBB e tagliato per CHA: è una situazione valida. SBB ne detiene il contratto attivo, mentre il record CHA rappresenta il dead cap residuo.
- Il foglio `Listone` non contiene giocatori perché la lega è in offseason. Non è un'anomalia; squadra NBA, stato NBA, età, external id e presenza nel listone verranno completati quando sarà disponibile il listone della nuova stagione.
- Il file contiene anche 84 record di scelte/diritti futuri nelle righe 46–60.
- Le righe 62–66 contengono 37 diritti di qualifying offer con il relativo importo esercitabile alla prossima asta. Sono importati separatamente dalla rosa e dal dead cap.

## 1. Analisi Excel

### Foglio `Roster`

**Significato.** È un cruscotto denormalizzato: ogni squadra occupa quattro colonne e contiene dati anagrafici, cap, rosa, tagli, scelte future e diritti di qualifying offer.

**Layout e colonne ripetute.**

| Posizione nel blocco | Righe | Significato | Tipo |
|---|---:|---|---|
| colonna 1 | 2 | proprietario | testo |
| colonna 3 | 2 | codice squadra | testo, univoco |
| colonna 4 | 2 | cap residuo | formula numerica |
| colonne 1–4 | 3 | nome squadra (celle unite) | testo |
| colonne 1–4 | 4–6 | cap futuri e conteggi ruolo | formule descrittive |
| colonne 1–4 | 8–27 | giocatore, crediti, scadenza, ruolo | testo, intero, codice, enum G/A/C |
| colonne 1–4 | 29–42 | giocatore tagliato, crediti, scadenza, indicatore | misto |
| colonne 1–4 | 46–60 | scelta/condizione, giro, anno, squadra/originale | misto |
| colonne 1–2 | 62–66 | diritti di qualifying offer e relativo importo | testo, intero |

**Formule.** Sono presenti 56 formule:

- 14 saldi correnti: `1000 - SUM(costi righe 8:42)`;
- 28 formule di cap futuro, basate su anno/scadenza e marcatori `(Q)` / `(E)`;
- 14 conteggi dei ruoli nei soli slot attivi.

Le formule non saranno migrate come logica Excel. Il cap sarà derivato da contratti e oneri, mentre `team_seasons.current_credits` sarà aggiornato solo da transazioni atomiche e verificato da una vista di riconciliazione.

**Codici osservati.**

- ruolo: `G`, `A`, `C`;
- scadenza semplice: `27`, `28` (interpretazione provvisoria: fine stagione 2026/27 o 2027/28);
- `T.O.`: team option;
- `(Q)`: diritto/qualifying offer associato alla scadenza;
- `(E)`: estensione applicata;
- `S.P.` nel blocco tagli: sigla non documentata esplicitamente e da chiarire.

**Duplicazioni.** Nome squadra, proprietario, cap e schema delle colonne sono ripetuti orizzontalmente. Il costo del contratto compare sia nel roster sia nelle formule. Le scelte riportano descrizioni libere che duplicano proprietà/condizioni.

**Dati da importare.**

- stagione 2025/26;
- 14 squadre, proprietari e codici;
- contratti/roster attivi e tagliati con costo, scadenza, ruolo e marcatori;
- scelte dei draft 2026–2028, provenienza, protezioni e swap dopo parsing e verifica;
- saldo calcolato, solo come valore di controllo del risultato.

**Dati da non mantenere come fonte.**

- formule, celle unite, colori, layout, lettere decorative in colonna A;
- testi di cap futuri calcolati;
- celle vuote e righe formattate fino alla 1006;

**Problemi e campi mancanti.**

- non ci sono id stabili di squadra o giocatore;
- nessuna squadra NBA, stato del giocatore, età/data di nascita o data di acquisizione;
- origine dell'acquisizione quasi sempre assente;
- `Listone` vuoto;
- lo stesso giocatore può avere un solo roster entry attivo ma più oneri storici/dead cap;
- conteggio rosa attuale spesso sotto i minimi regolamentari: è plausibile perché il file fotografa l'offseason, non una violazione automatica;
- alcuni nomi necessitano conferma ortografica (`Micheal Porter Jr.` potrebbe essere un dato voluto o un refuso).

### Foglio `Listone`

**Significato atteso.** Catalogo dei giocatori Dunkest.

**Colonne presenti.** `GIOCATORE`, `RUOLO`, `TEAM (INIZIALE)`, `STATO`.

**Contenuto.** Nessuna riga dati, come previsto durante l'offseason. Le colonne sono mappabili a `players`; il vuoto genera un warning solo se l'import viene eseguito in fase `auction` o `regular_season`.

## 2. Analisi del regolamento

La mappa operativa completa è in `rules-map.md`. Qui sono riepilogate le regole che influenzano il primo modello.

| Area | Riferimento | Dato richiesto | Controllo automatico | Ambiguità/configurazione |
|---|---|---|---|---|
| Roster | art. 2(a–c) | tipo slot, ruolo, fase stagione | max 15 regular, 2 two-way, 3 G-League, 1 DPE; durante la stagione min 5 G, 5 A, 3 C | definire se i minimi bloccano una singola operazione o innescano assegnazione casuale |
| Contratti | art. 3 | origine, prezzo asta, durata originaria, estensioni | riduzione 5% biennale, 10% triennale; arrotondamento per eccesso | anno numerico Excel e semantica esatta `(E)` |
| Estensioni | art. 3(d) | costo asta, durata originale, ultima estensione, classifica, finestra | prezzo +25% arrotondato; requisiti 200+, triennale, max 1 anno residuo | come storicizzare la “stagione precedente” per file pregresso |
| Asta | art. 4 | listone, quotazione, slot, cap | finestra temporale, min 13, cap/offerta a 1, compatibilità slot | l'app v1 registra il risultato, non gestisce rilanci o sorteggi |
| Free agency | art. 5 | timestamp taglio, deadline, classifica | attesa 8 ore; annuale QO prima deadline; ultime 3 max 1 credito dopo deadline | calendario giornate da configurare |
| Draft | art. 6 | classifica, lottery, scelte | 2 giri, costi primo giro fissi, secondo a 1 | estrazione lottery fuori v1 |
| Team option | art. 7 | rookie/età, costo, stagione contratto | eleggibilità, +2 anni, raddoppio ultimo anno | serve data di nascita assente nell'Excel |
| QO/RFA | art. 8 | titolare precedente, categoria, offerte | ammissibilità QO, vincoli durata RFA | processo di rilancio/manual matching da modellare in asta |
| Salary cap | art. 9 | fase e oneri per stagione | 1000 offseason/futuro, regole draft/asta, 1100 in-season e blocco incrementi | cap come “costo rosa”, non portafoglio spendibile separato |
| Tagli/rilasci | art. 10 | stato NBA, partite, fonti, date | dead cap; blocco riacquisto; release/buyout/stretch | verifiche NBC Sports richiedono conferma amministrativa e prova |
| Two-way/G-League | art. 11 | TO/origine/costo/anno/slot | soglie 10 e 5, direzioni consentite e finestre | distinguere ruolo Dunkest da tipo slot |
| DPE | art. 12 | prognosi, calendario, ritorno | un solo slot; cap corrente sospeso; reintegro | verifica medica esterna manuale |
| Scambi | art. 13 | proprietà, contratti, scelte, finestra | atomicità, deadline, niente asta, no tagliati, slot finali | operazioni multi-team non vietate: modello le supporta, UI v1 parte da due |
| Scelte | art. 14 | anno, giro, origine, protezioni/swap | orizzonte 3 draft (4 per controparte protezione), esclusività condizioni | parsing descrizioni Excel richiede revisione |
| Nuova stagione | art. 1(l) e varie | stato stagione, finestre | transizioni esplicite, rollover contratti/slot | calendario concreto non allegato |

## 3. Mappatura Excel → database

| Origine | Destinazione | Trasformazione | Validazione / problema |
|---|---|---|---|
| `Roster!C1:D1` | `seasons.name` | `2025/26` | unica stagione attiva |
| riga 2, colonna 1 blocco | `teams.owner_name` | trim | obbligatorio |
| riga 2, colonna 3 blocco | `teams.code`, `teams.slug` | uppercase; lowercase slug | univoco |
| riga 3 | `teams.name` | trim | univoco logico |
| formula saldo riga 2 | controllo su `team_seasons` | valore cached | non importare come autorità; deve coincidere con 1000 - oneri |
| righe 8–27, giocatore | `players.full_name` + `roster_entries.player_id` | trim; nome normalizzato per match | duplicato attivo proibito |
| righe 8–27, crediti | `roster_entries.current_cost` | intero positivo | costo >= 1 |
| righe 8–27, scadenza | `contract_terms` | parser `27`, `28`, `T.O.`, `(Q)`, `(E)` | semantica anno da confermare |
| righe 8–27, ruolo | `players.role` | enum G/A/C | ruolo mancante bloccante |
| righe 29–42 | `roster_entries` status `cut` + `cap_charges` | conservare costo/scadenza; non attribuisce proprietà attiva | può coesistere con un roster attivo presso un'altra squadra |
| righe 46–60 | `draft_picks` + `draft_pick_conditions` | parsing anno/giro/origine/testo | revisione manuale per swap/protezioni |
| righe 62–66 | `qualifying_offer_rights` | giocatore, squadra titolare, importo | importo intero positivo; non crea appartenenza attiva |
| `Listone!B:E` | `players` | normalizzazione | zero righe disponibili |

## 4. Assunzioni provvisorie

1. Il cap iniziale è 1.000 e il saldo Excel è un controllo, non una voce di credito.
2. I numeri `27` e `28` indicano la stagione di scadenza terminante rispettivamente nel 2027 e 2028.
3. `T.O.` non implica una scadenza ricavabile dal solo file: viene importata con `option_type=team` e warning.
4. Le rose sotto i minimi non vengono segnalate come errore durante `offseason`.
5. `(Q)` indica eleggibilità/diritto QO; `(E)` indica estensione già applicata. Entrambi restano campi separati, non parte di una stringa.
6. I record delle righe 62–66 sono importati come diritti di qualifying offer e non come contratti attivi.
7. Un record `cut` può coesistere con il roster attivo dello stesso giocatore presso un'altra squadra; il vincolo di unicità considera solo gli stati `pending` e `active`.

## 5. Route e componenti

| Route | Accesso | Componenti principali |
|---|---|---|
| `/` | pubblico | LeagueHero, LeagueMetrics, TeamCard, RecentTransactions |
| `/squadre` | pubblico | TeamFilters, TeamGrid/Table |
| `/squadre/[slug]` | pubblico | TeamHeader, CapSummary, RosterByRole, ContractBadge, TeamTimeline |
| `/giocatori` | pubblico | PlayerSearch, PlayerFilters, PlayerTable |
| `/movimenti` | pubblico | TransactionTimeline |
| `/asta` | pubblico | LivePurchase, TeamAuctionBoard, ConnectionStatus |
| `/asta/proiezione` | pubblico | ProjectionPurchase, CompactFeed |
| `/admin` | admin | Alerts, QuickActions, ExpiringContracts |
| `/admin/asta/[id]` | admin | AuctionResultForm, ValidationPreview, UndoLast |

Le operazioni critiche passano da server action/API protetta a funzioni PostgreSQL `security definer` con controllo del ruolo; mai da update indipendenti nel client.

## 6. Strategie

- **Realtime:** subscribe a `transactions`, `auction_events` e `team_seasons`; al reconnect si rilegge lo snapshot ordinato per `sequence_number`. Gli id evento rendono idempotente il reducer client.
- **Atomicità:** funzioni RPC dedicate per acquisto, scambio, taglio, estensione e reversal; lock delle righe `team_seasons` coinvolte in ordine UUID per evitare deadlock.
- **Annullamento:** una nuova `transaction` di tipo `reversal` punta all'originale. La funzione controlla che non esista già un reversal e applica gli item inversi.
- **Storico:** `transactions` è il registro di dominio; `audit_log` conserva prima/dopo e attore. Nessun hard delete di entità operative.
- **Valori derivati:** saldo materializzato per concorrenza e velocità, sempre riconciliabile con `cap_charges`; costo rosa e conteggi sono viste/query.

## 7. Wireframe testuale

**Mobile squadra:** header compatto → tre KPI swipe-free → tab G/A/C → card giocatore (ruolo, costo, scadenza, badge) → ultimi movimenti.

**Desktop squadra:** header e KPI → filtri → tabella unica con ruolo, giocatore, slot, costo, contratto, stato → timeline laterale.

**Admin operazione:** selezione → anteprima con situazione prima/dopo → errori e warning separati → conferma → esito con link alla transazione.

**Asta:** ricerca giocatore sticky → squadra/prezzo/contratto → preview cap e slot → conferma rapida → feed ultimo acquisto; su proiettore ultimo acquisto occupa almeno metà schermo.

## 8. Piano prima milestone

1. App shell responsive e pagine pubbliche base con dati di controllo reali.
2. Schema PostgreSQL, enum, indici, vincoli, RLS, audit e publication realtime.
3. Motore regole puro per cap, roster, contratti e asta con test.
4. Importatore Excel dry-run idempotente e report.
5. Configurazione Supabase e seed/import in ambiente di prova.
6. Verifica manuale dei warning residui, soprattutto la sigla S.P.

La milestone è completata quando build e test passano in un ambiente Node, la migration è applicata su un progetto Supabase di prova e il report d'import non presenta errori critici irrisolti.
