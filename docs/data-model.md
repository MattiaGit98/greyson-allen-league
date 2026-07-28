# Modello dati proposto

## Principi

- UUID come chiavi tecniche; `code`, `slug` ed eventuali external id come chiavi naturali uniche.
- `transactions` rappresenta il fatto di dominio; `transaction_items` i suoi effetti.
- `roster_entries` conserva l'appartenenza e lo stato; `contract_terms` separa la struttura economica per anno.
- `cap_charges` rappresenta tutti gli oneri, inclusi dead cap, buyout e stretch.
- soft delete/stati espliciti; nessun hard delete nello storico.

## Relazioni principali

```text
seasons ─┬─< team_seasons >─ teams
         ├─< roster_entries >─ players
         ├─< transactions ─< transaction_items
         ├─< auction_sessions ─< auction_events
         └─< draft_picks ─< draft_pick_conditions

roster_entries ─< contract_terms
transactions ─< cap_charges
auth.users ─ admin_users
auth.users ─< audit_log
```

## Decisioni

- Un indice parziale su `roster_entries(season_id, player_id)` impedisce due appartenenze attive.
- `slot_type` è separato dal ruolo Dunkest.
- I contratti pluriennali non sono una sola scadenza testuale: ogni stagione ha un `contract_term`.
- `current_credits` rimane in `team_seasons` per locking atomico; una vista lo riconcilia con gli oneri.
- Scelte e condizioni sono strutturate; la descrizione originale dell'Excel resta in `source_note`.
- Le regole configurabili vivono in `league_rules`; le regole algoritmiche restano nel codice e nelle RPC.

## Stato e transizioni

- stagione: `setup → offseason → draft → auction → regular_season → postseason → completed`;
- roster: `pending → active → cut/released/expired/traded`;
- asta: `draft → active ↔ paused → completed`;
- transazione: `pending → committed → reversed`.

Le transizioni sono validate server-side; non sono normali update del client.
