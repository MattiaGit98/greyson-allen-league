# Guida amministratore

## Flusso normale

1. Aprire `/admin` e controllare gli avvisi prima del prossimo avanzamento.
2. Usare sempre il blocco specifico per l'operazione.
3. Leggere errori, avvisi di cap e situazione prima/dopo.
4. Confermare l'operazione. Ogni salvataggio aggiorna lo stato corrente e registra il movimento.
5. Usare **Annulla movimenti** solo se gli elementi coinvolti non sono stati modificati da operazioni successive.

## Avanzamento della lega

La pagina **Avanzamento della lega** mostra il momento corrente e il passaggio successivo. Prima della conferma presenta:

- operazioni automatiche previste;
- possibilità che si aprono o si chiudono;
- avvisi espandibili;
- errori bloccanti da risolvere.

Il passaggio crea un backup della situazione immediatamente precedente. Fase e annata cambiano esclusivamente tramite l’avanzamento della lega, che applica anche gli automatismi previsti.

Le modifiche collegate all'avanzamento vengono confermate dal database come un'unica transazione: se una parte fallisce, nessuna parte dell'avanzamento viene conservata. Se nel frattempo un'altra sessione ha cambiato lo stato o la fase, l'operazione viene rifiutata e la pagina va aggiornata.

## Stato corrente

Le pagine pubbliche e amministrative leggono lo stesso stato Supabase. Se lo stato non è disponibile, il sito mostra un errore esplicito invece di usare dati iniziali o valori dimostrativi.

La lista Movimenti è un registro persistente: non nasce dal confronto con vecchi snapshot. Gli annullamenti sono anch'essi operazioni registrate.
