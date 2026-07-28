import { notFound } from "next/navigation";
import {
  draftAssets,
  entriesForTeam,
  parseContract,
  qualifyingOfferRights,
  teams,
  type RosterEntry,
} from "@/lib/demo-data";

export function generateStaticParams() {
  return teams.map(({ slug }) => ({ slug }));
}

function ContractBadges({ entry }: { entry: RosterEntry }) {
  const contract = parseContract(entry.contract);
  return (
    <span className="badges">
      <span className="badge">{contract.raw}</span>
      {contract.isTeamOption && <span className="badge option">Team option</span>}
      {contract.hasQualifyingRight && <span className="badge qo">QO</span>}
      {contract.isExtended && <span className="badge extension">Esteso</span>}
    </span>
  );
}

export default async function TeamPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const team = teams.find((item) => item.slug === slug);
  if (!team) notFound();
  const entries = entriesForTeam(team.code);
  const active = entries.filter((entry) => entry.state === "active");
  const cut = entries.filter((entry) => entry.state === "cut");
  const rights = qualifyingOfferRights.filter((right) => right.teamCode === team.code);
  const picks = draftAssets.filter((asset) => asset.teamCode === team.code);
  const roleCounts = {
    G: active.filter((entry) => entry.role === "G").length,
    A: active.filter((entry) => entry.role === "A").length,
    C: active.filter((entry) => entry.role === "C").length,
  };

  return (
    <section className="section page-top">
      <p className="eyebrow">{team.code} · Stagione 2025/26</p>
      <h1>{team.name}</h1>
      <p className="lede">{team.owner}</p>
      <div className="metrics compact four">
        <article><span>Cap libero</span><strong>{team.credits}</strong><small>su 1.000 iniziali</small></article>
        <article><span>Costo totale</span><strong>{team.cost}</strong><small>rosa e dead cap</small></article>
        <article><span>Roster attivo</span><strong>{team.players}</strong><small>{roleCounts.G} G · {roleCounts.A} A · {roleCounts.C} C</small></article>
        <article><span>Diritti QO</span><strong>{rights.length}</strong><small>{picks.length} asset al draft</small></article>
      </div>

      <div className="content-heading"><div><p className="eyebrow">Roster</p><h2>Giocatori sotto contratto</h2></div><span>{active.length} attivi</span></div>
      <div className="roster-table">
        <div className="roster-head"><span>Ruolo</span><span>Giocatore</span><span>Contratto</span><span>Costo</span></div>
        {(["G", "A", "C"] as const).flatMap((role) =>
          active.filter((entry) => entry.role === role).map((entry) => (
            <div className="roster-row" key={`${entry.name}-${role}`}>
              <span><b className={`role role-${role.toLowerCase()}`}>{role}</b></span>
              <span><strong>{entry.name}</strong><small>Slot regolare</small></span>
              <ContractBadges entry={entry} />
              <span className="credit">{entry.cost} CR</span>
            </div>
          )),
        )}
      </div>

      <div className="team-subgrid">
        <section>
          <div className="content-heading small"><h2>Dead cap</h2><span>{cut.length}</span></div>
          {cut.length ? cut.map((entry) => (
            <article className="compact-item" key={entry.name}>
              <div><strong>{entry.name}</strong><small>Tagliato · scadenza {entry.contract}</small></div>
              <b>{entry.cost} CR</b>
            </article>
          )) : <p className="quiet">Nessun contratto tagliato a carico.</p>}
        </section>
        <section>
          <div className="content-heading small"><h2>Qualifying offer</h2><span>{rights.length}</span></div>
          {rights.length ? rights.map((right) => (
            <article className="compact-item" key={right.playerName}>
              <div><strong>{right.playerName}</strong><small>Esercitabile alla prossima asta</small></div>
              <b>{right.qualifyingAmount} CR</b>
            </article>
          )) : <p className="quiet">Nessun diritto disponibile.</p>}
        </section>
      </div>

      <div className="content-heading"><div><p className="eyebrow">Draft capital</p><h2>Scelte e condizioni</h2></div><span>{picks.length} asset</span></div>
      <div className="asset-grid">
        {picks.map((pick, index) => (
          <article className="asset-card" key={`${pick.year}-${pick.round}-${index}`}>
            <span>{pick.year} · {pick.round}</span>
            <strong>{pick.label}</strong>
            <small>Origine / posizione: {pick.originOrOverall}</small>
          </article>
        ))}
      </div>
    </section>
  );
}
