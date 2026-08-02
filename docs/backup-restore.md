# Backup e ripristino

## Backup disponibili

La pagina **Importa dati** produce il backup JSON ripristinabile dell’intera lega. Contiene fase e annata, squadre, roster, listone, scelte, Q.O., calendario, classifiche, tabelloni, storico e registro movimenti. Sono conservati anche i collegamenti tra movimenti e storico Draft necessari per un eventuale annullamento. Il file include un controllo di integrità e può essere reimportato soltanto dal pannello dedicato.

Prima di ogni avanzamento della lega questo backup viene scaricato automaticamente. Anche ogni ripristino scarica prima un nuovo backup della situazione che sta per essere sostituita; se il download fallisce, l’importazione non comincia.

La pagina amministrativa Backup offre il backup ripristinabile completo e mantiene inoltre due copie limitate a Squadre e Storico:

- Excel: copia leggibile dei dati;
- HTML statico: sola consultazione, non utilizzabile per ripristinare il database.

Ogni avanzamento della lega salva inoltre in `league_phase_backups` lo stato immediatamente precedente. Un ripristino completo da file invalida questi punti interni, perché appartengono alla situazione sostituita.

## Sicurezza

Conservare almeno una copia dei backup fuori dal PC e da Supabase. Prima di migration o rettifiche estese, creare sempre un export manuale. Un HTML o un Excel non sostituiscono il JSON né un backup completo del database offerto dal provider.
