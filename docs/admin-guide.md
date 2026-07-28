# Guida amministratore

Documento iniziale. Le operazioni non sono edit diretti:

1. scegliere l'operazione;
2. compilare gli elementi coinvolti;
3. leggere situazione prima/dopo, errori e avvisi;
4. confermare;
5. conservare il link alla transazione.

Le correzioni richiedono una motivazione. L'annullamento crea un reversal e non cancella la transazione originale. Le modifiche manuali al database non fanno parte del flusso operativo.

## Momento della lega

In `/admin/impostazioni` l'amministratore imposta la macro-fase:

1. **Offseason** — contratti, opzioni, qualifying offer e scambi;
2. **Asta** — sessione d'asta; scambi sospesi;
3. **Stagione** — roster minimo, free agency e salary cap stagionale.

Il valore è salvato in `seasons.status` tramite RPC protetta e ogni cambio entra nell'audit log.
