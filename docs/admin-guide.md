# Guida amministratore

Documento iniziale. Le operazioni non sono edit diretti:

1. scegliere l'operazione;
2. compilare gli elementi coinvolti;
3. leggere situazione prima/dopo, errori e avvisi;
4. confermare;
5. conservare il link alla transazione.

Le correzioni richiedono una motivazione. L'annullamento crea un reversal e non cancella la transazione originale. Le modifiche manuali al database non fanno parte del flusso operativo.

## Centro di controllo locale

`/admin` mostra contratti in scadenza, dead cap, QO e roster ancora incompleti. Da `/admin/operazioni` sono disponibili anteprime guidate per:

- acquisto con controllo cap, slot e proprietà;
- taglio con evidenza del dead cap e del blocco di riacquisizione;
- scambio con proprietà e consistenza finale delle rose.

Finché Supabase non è configurato, queste procedure non scrivono dati: servono a verificare flusso e messaggi prima di attivare le operazioni reali.

## Momento della lega

In `/admin/impostazioni` l'amministratore imposta la macro-fase:

1. **Offseason** — contratti, opzioni, qualifying offer e scambi;
2. **Asta** — sessione d'asta; scambi sospesi;
3. **Stagione** — roster minimo, free agency e salary cap stagionale.

Il valore è salvato in `seasons.status` tramite RPC protetta e ogni cambio entra nell'audit log.
