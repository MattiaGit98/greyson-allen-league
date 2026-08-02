# Importazioni Excel

## Listone stagionale

Il listone ufficiale si gestisce da `/admin/listone`:

1. scaricare il modello Excel;
2. compilarlo senza modificare le intestazioni;
3. importarlo dalla stessa pagina;
4. controllare e confermare gli abbinamenti proposti con i nomi già presenti nei roster.

Prima della conferma definitiva nessun nome del roster viene modificato. Dopo la conferma, i nomi abbinati vengono allineati al listone e lo stato dei giocatori viene calcolato dal roster e dalle Q.O.

## Import iniziale storico

`scripts/import-excel.ts`, `scripts/generate-seed.ts` e `data/league-snapshot.json` sono strumenti di migrazione iniziale. Non partecipano al funzionamento quotidiano del sito e non vanno rieseguiti su una lega già operativa.

Il comando `import:excel` è un dry-run: legge il vecchio `Roster.xlsx` e produce `import-report.json`, senza scrivere su Supabase.
