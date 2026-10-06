# Backup e ripristino

## Backup disponibili

La pagina **Importa dati** produce il backup JSON ripristinabile dell’intera lega. Contiene fase e annata, squadre, roster, listone, scelte, Q.O., calendario, classifiche, tabelloni, storico e registro movimenti. Sono conservati anche i collegamenti tra movimenti e storico Draft necessari per un eventuale annullamento. Per evitare di ripetere l'intero roster in ogni movimento, l'export include negli snapshot dei movimenti soltanto le voci effettivamente coinvolte; lo stato corrente completo resta nel backup. I movimenti storici nel database non vengono riscritti da questa ottimizzazione. Il file include un controllo di integrità e può essere reimportato soltanto dal pannello dedicato.

Il repository non contiene alcun backup della lega. Sono accettati soltanto i backup completi nel formato corrente; i file devono essere conservati privatamente fuori dalla cartella del progetto.

Prima di ogni avanzamento della lega questo backup viene scaricato automaticamente. Anche ogni ripristino scarica prima un nuovo backup della situazione che sta per essere sostituita; se il download fallisce, l’importazione non comincia.

La pagina amministrativa Backup offre il backup ripristinabile completo e una copia HTML statica di sola consultazione, non utilizzabile per ripristinare il database.

La stessa pagina offre anche l'**Excel di emergenza asta**, scaricabile manualmente in qualsiasi momento. Il file contiene una fotografia essenziale dei dati correnti: squadre con cap libero, giocatori di roster/two-way/G-League, tagliati e Q.O.; in un secondo foglio il listone con ruolo e stato. Non include lo slot DPE tra i giocatori attivi né proprietari, sigle, scadenze o dati storici. Dopo un avanzamento riuscito a **Inizio asta** il browser tenta automaticamente di scaricarlo dallo stato appena aggiornato; se il download fallisce, l'avanzamento resta valido e compare un comando per riprovare. Questo Excel serve soltanto per consultazione di emergenza e **non è ripristinabile**: il backup JSON completo scaricato prima dell'avanzamento resta indispensabile.

Ogni avanzamento della lega salva inoltre in `league_phase_backups` lo stato immediatamente precedente. Un ripristino completo da file invalida questi punti interni, perché appartengono alla situazione sostituita.

## Flusso di importazione

Il browser legge il file localmente soltanto per mostrare l’anteprima. Prima di qualsiasi upload scarica obbligatoriamente un nuovo backup completo della situazione corrente: se questo download preventivo fallisce, il ripristino non comincia. La route di esportazione restituisce questo backup come risposta in streaming, così anche il download non dipende dal limite delle risposte Vercel non trasmesse in streaming.

Il file scelto viene quindi caricato direttamente, con upload riprendibile, nel bucket privato Supabase Storage `league-backup-imports`. Il contenuto completo del backup non attraversa il body di una Vercel Function. Alla route di ripristino viene inviato soltanto il path temporaneo, composto dall’ID dell’admin autenticato e da un UUID casuale.

La route verifica nuovamente sessione, ruolo amministratore e path, scarica il file dal bucket privato, applica il limite di 100 MB e valida formato, versione e checksum con `parseImportableLeagueBackup`. Il ripristino continua a essere eseguito dalla funzione PostgreSQL `restore_importable_league_backup`, quindi la sostituzione dello stato della lega rimane atomica: un errore della RPC annulla l’intera operazione.

La sola RPC di ripristino dispone di un timeout dedicato di 60 secondi, necessario per elaborare anche il registro completo dei movimenti. Il limite generale delle altre richieste autenticate non viene modificato.

Il file temporaneo viene eliminato dopo il tentativo di ripristino, sia in caso di successo sia, per quanto possibile, in caso di errore. Il browser effettua inoltre un secondo tentativo di pulizia come protezione contro errori di rete tra la route e il client. Il bucket non espone URL pubblici e le policy consentono upload, lettura e cancellazione soltanto agli admin autenticati, limitatamente ai file di cui sono proprietari nel proprio prefisso.

Il formato resta `greyson-allen-league-importable-backup`, versione `2`: tutti i movimenti restano nell'export con `before_state` e `after_state`, sufficienti per gli annullamenti. Le voci non modificate e ripetute in ciascuno snapshot non vengono esportate; il backup conserva separatamente lo stato completo della lega.

## Sicurezza

Conservare almeno una copia dei backup fuori dal PC e da Supabase. Prima di migration o rettifiche estese, creare sempre un export manuale. Un HTML o un Excel non sostituiscono il JSON né un backup completo del database offerto dal provider.
