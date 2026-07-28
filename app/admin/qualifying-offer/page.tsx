import Link from "next/link";
import { qualifyingOfferRights, teams } from "@/lib/demo-data";

export default function QualifyingOfferPage() {
  return (
    <section className="section page-top admin-dashboard">
      <p className="eyebrow">Offseason · Articolo 8</p>
      <h1>Qualifying offer</h1>
      <p className="lede">Diritti presenti nell’ultimo blocco del roster e utilizzabili quando il giocatore viene chiamato alla prossima asta.</p>
      <div className="rule-callout">
        <b>Come verranno gestite</b>
        <p>L’offerta iniziale è pari al vecchio costo. Se nessuno supera la cifra, il giocatore resta con contratto annuale; se arriva un’offerta, diventa restricted free agent e si attiva la procedura di matching.</p>
      </div>
      <div className="qo-groups">
        {teams.filter((team) => team.qualifyingOffers > 0).map((team) => {
          const rights = qualifyingOfferRights.filter((right) => right.teamCode === team.code);
          return (
            <section className="qo-team" key={team.code}>
              <div className="content-heading small">
                <h2><Link href={`/squadre/${team.slug}`}>{team.code}</Link></h2><span>{rights.length} diritti</span>
              </div>
              {rights.map((right) => (
                <article className="compact-item" key={right.playerName}>
                  <div><strong>{right.playerName}</strong><small>Elegibile · non ancora estesa</small></div>
                  <b>{right.qualifyingAmount} CR</b>
                </article>
              ))}
            </section>
          );
        })}
      </div>
    </section>
  );
}
