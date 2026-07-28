# Backup e ripristino

- backup PostgreSQL giornaliero e immediatamente prima di migration/import;
- export CSV periodico di squadre, giocatori, contratti e transazioni;
- conservazione cifrata con almeno una copia fuori dal provider;
- prova di ripristino trimestrale su ambiente isolato.

Ripristino: bloccare le scritture, scegliere un backup consistente, ripristinare su un nuovo database, applicare solo le migration successive necessarie, riconciliare cap/roster, ruotare le chiavi e riaprire il traffico. Un export CSV non sostituisce il dump PostgreSQL.
