# Modello dati corrente

## Principio

Il database è la fonte ufficiale. Il frontend non ricostruisce lo stato confrontando Excel, snapshot iniziali o movimenti passati.

## Dati operativi

- `seasons`: annata attiva e momento della lega;
- `league_state_overrides`, riga `current`: squadre, roster, tagliati, scelte, Q.O., listone e posizioni draft correnti;
- `league_movements`: registro persistente delle operazioni, con stato prima/dopo per consentire annullamenti sicuri;
- `league_phase_backups`: situazione precedente ai passaggi di fase;
- `calendar_events`: calendario modificabile;
- `competition_content`: classifiche e tabelloni correnti;
- `history_competition_content`: storico della lega.

Le tabelle normalizzate create dalle prime migration restano disponibili per compatibilità con l'importazione iniziale, ma le pagine correnti non le usano come fallback.

Il ripristino da file usa la funzione SQL `restore_importable_league_backup`: fase, stato, calendario, competizioni, storico e movimenti vengono sostituiti nella stessa transazione. Un errore in qualsiasi gruppo annulla tutto il ripristino.

## Scritture

Le operazioni amministrative calcolano il nuovo stato sul server e lo salvano tramite funzioni SQL protette. I limiti degli slot sono bloccanti; gli sforamenti del cap previsti dal regolamento vengono mostrati come avvisi forzabili e registrati nel movimento.

Le policy RLS consentono la lettura pubblica dei dati necessari alla visualizzazione e riservano le scritture agli utenti presenti in `admin_users`.
