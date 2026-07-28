# Mappa regole

La colonna “azione” indica il modulo previsto; “esito” distingue errore bloccante (`E`) e avviso (`W`).

| Rif. | Regola applicativa | Azione | Esito |
|---|---|---|---|
| 2(a) | slot massimi 15 regular, 2 two-way, 3 G-League, 1 DPE | roster, scambio, acquisto | E |
| 2(b) | in stagione almeno 5 G, 5 A, 3 C; DPE e fuori-listone esclusi | roster, scambio, taglio | E/W secondo operazione automatica da confermare |
| 2(c) | assegnazione casuale a 1 per ripristinare minimi | correzione roster | operazione admin tracciata |
| 3(b) | contratto entro 5 giorni dalla regular season | contratti/calendario | E |
| 3(c) | biennale -5%, triennale -10%, ceil | contratti | calcolo |
| 3(d) | estensione: asta >=200, originale triennale, max 1 residuo, non esteso stagione precedente, +25% ceil | estensione | E |
| 4(a) | asta tra -1 mese e -7 giorni, dopo listone | sessione asta | E |
| 4(c) | chiusura con minimo 13 per squadra | chiudi asta | E |
| 4(g) | acquisto oltre slot ammesso solo con successiva liberazione | acquisto | W + operazione composta |
| 5(a) | FA da consegna contratti a ultima giornata RS | free agency | E |
| 5(c) | waiver minimo 8 ore prima finestra | free agency | E |
| 5(e) | prima deadline annuale con QO; dopo annuale semplice | free agency | calcolo |
| 5(f) | ultime tre dopo deadline: max 1 | free agency | E |
| 6(f) | costi draft: 25,21,17,14,12,11,10,9,8,7,6,5,4,3,2; secondo giro 1 | draft | calcolo |
| 7(a) | TO per rookie; U23 solo entro 15 | contratti | E |
| 7(b) | esercizio entro un mese; +2 anni e raddoppio ultimo | team option | E/calcolo |
| 8 | QO/RFA e matching | asta | procedura guidata |
| 9(a) | offseason pre-draft cap 1000 senza eccezioni | cap | E |
| 9(b) | draft può sforare; poi blocco incrementi | draft/cap | E |
| 9(c) | asta può sforare solo con acquisto da 1 | asta/cap | E |
| 9(d) | stagione cap 1100; sopra 1000 FA max 1; sopra 1100 niente incrementi | FA/cap | E |
| 9(e) | future seasons <=1000 | tutte | E |
| 9(f) | TO non pesa su anni futuri finché non esercitata | cap | calcolo |
| 10(a–b) | taglio libera slot ma mantiene cap; niente riacquisto finché pesa | taglio/acquisto | E |
| 10(c–d,f) | release gratuito con prove e finestre | release | E + conferma admin |
| 10(e) | buyout: taglio, durata a 1, costo concentrato | buyout | E/calcolo |
| 10(j) | stretch una volta, 2/3 rate ceil, non dopo buyout | stretch | E/calcolo |
| 11 | soglie e spostamenti slot sviluppo | roster | E |
| 12 | DPE, sospensione cap corrente e reintegro | roster/cap | E |
| 13 | scambi, deadline, contratti invariati, scelte 3 anni | trade RPC | E |
| 14 | protezioni/swap e loro esclusività | scelte/trade | E |

## Valutazioni standard

Ogni funzione pura restituisce:

```ts
{
  valid: boolean;
  errors: { code: string; message: string }[];
  warnings: { code: string; message: string }[];
  appliedRules: string[];
  calculated?: Record<string, number | string | boolean>;
}
```

I codici sono stabili per i test; i messaggi sono in italiano e adatti all'interfaccia.
