# Stato della lega

Supabase è l'unica fonte dello stato corrente della lega.

- Non dedurre squadre, roster, fase, listone, movimenti o altri dati correnti dal repository, dalle migration, dai test o dalla cronologia Git.
- Il repository non contiene seed o snapshot della lega.
- Le migration descrivono esclusivamente l'evoluzione tecnica dello schema e possono contenere nomi storici usati per trasformazioni già concluse.
- Per conoscere lo stato corrente occorre leggere il progetto Supabase collegato oppure il sito in esecuzione.
- Non introdurre copie locali o fallback con dati della lega.
