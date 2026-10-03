# Backup e ripristino

## Backup disponibili

La pagina **Importa dati** produce il backup JSON ripristinabile dell’intera lega. Contiene fase e annata, squadre, roster, listone, scelte, Q.O., calendario, classifiche, tabelloni, storico e registro movimenti. Sono conservati anche i collegamenti tra movimenti e storico Draft necessari per un eventuale annullamento. Il file include un controllo di integrità e può essere reimportato soltanto dal pannello dedicato.

Il repository non contiene alcun backup della lega. Sono accettati soltanto i backup completi nel formato corrente; i file devono essere conservati privatamente fuori dalla cartella del progetto.

Prima di ogni avanzamento della lega questo backup viene scaricato automaticamente. Anche ogni ripristino scarica prima un nuovo backup della situazione che sta per essere sostituita; se il download fallisce, l’importazione non comincia.

La pagina amministrativa Backup offre il backup ripristinabile completo e mantiene inoltre due copie limitate a Squadre e Storico:

- Excel: copia leggibile dei dati;
- HTML statico: sola consultazione, non utilizzabile per ripristinare il database.

Ogni avanzamento della lega salva inoltre in `league_phase_backups` lo stato immediatamente precedente. Un ripristino completo da file invalida questi punti interni, perché appartengono alla situazione sostituita.

## Flusso di importazione

Il browser legge il file localmente soltanto per mostrare l’anteprima. Prima di qualsiasi upload scarica obbligatoriamente un nuovo backup completo della situazione corrente: se questo download preventivo fallisce, il ripristino non comincia. La route di esportazione restituisce questo backup come risposta in streaming, così anche il download non dipende dal limite delle risposte Vercel non trasmesse in streaming.

Il file scelto viene quindi caricato direttamente, con upload riprendibile, nel bucket privato Supabase Storage `league-backup-imports`. Il contenuto completo del backup non attraversa il body di una Vercel Function. Alla route di ripristino viene inviato soltanto il path temporaneo, composto dall’ID dell’admin autenticato e da un UUID casuale.

La route verifica nuovamente sessione, ruolo amministratore e path, scarica il file dal bucket privato, applica il limite di 100 MB e valida formato, versione e checksum con `parseImportableLeagueBackup`. Il ripristino continua a essere eseguito dalla funzione PostgreSQL `restore_importable_league_backup`, quindi la sostituzione dello stato della lega rimane atomica: un errore della RPC annulla l’intera operazione.

Il file temporaneo viene eliminato dopo il tentativo di ripristino, sia in caso di successo sia, per quanto possibile, in caso di errore. Il browser effettua inoltre un secondo tentativo di pulizia come protezione contro errori di rete tra la route e il client. Il bucket non espone URL pubblici e le policy consentono upload, lettura e cancellazione soltanto agli admin autenticati, limitatamente ai file di cui sono proprietari nel proprio prefisso.

Il formato resta `greyson-allen-league-importable-backup`, versione `2`; nessun dato viene rimosso dall’export, compresi tutti i movimenti con `before_state` e `after_state`.

## Sicurezza

Conservare almeno una copia dei backup fuori dal PC e da Supabase. Prima di migration o rettifiche estese, creare sempre un export manuale. Un HTML o un Excel non sostituiscono il JSON né un backup completo del database offerto dal provider.
