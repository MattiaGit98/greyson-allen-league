import Link from "next/link";
import { qualifyingOfferRights, teams } from "@/lib/demo-data";

export default function QualifyingOfferPage() {
  return (
    <section className="section page-top admin-dashboard">
      <p className="eyebrow">Offseason · Articolo 8</p>
      <h1>Qualifying offer</h1>
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
                  <div><strong>{right.playerName}</strong><small>Diritto registrato</small></div>
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
