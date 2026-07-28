# Importazione Excel

L'import è separato dal runtime. Il file non viene letto dall'app.

## Procedura

1. Conservare una copia immutabile del file.
2. Eseguire `npm run import:excel -- "C:\...\Roster.xlsx"`.
3. Esaminare `import-report.json`.
4. Correggere gli errori critici alla fonte o registrare una decisione amministrativa.
5. Solo dopo un report valido implementare/eseguire la modalità `--apply` contro un database di prova.
6. Confrontare squadre, costi, cap, contratti, tagli e scelte.
7. Ripetere su produzione con backup pre-import.

## Sicurezza e idempotenza

Lo script attuale è intenzionalmente dry-run e non può scrivere. Calcola un fingerprint SHA-256 del file. La futura modalità apply registrerà il fingerprint in `import_runs`, con indice univoco, impedendo una seconda importazione accidentale.

Errori critici: squadra/codice mancante, ruolo invalido, costo invalido, giocatore attivo duplicato. Warning: scadenza ambigua, giocatore non presente nel listone, sezioni non identificate.

## Decisioni richieste prima dell'apply

- confermare `27`, `28`, `(Q)`, `(E)` e `S.P.`;
- chiarire le righe 62–66;
- fornire il listone popolato o accettare anagrafiche NBA incomplete.
