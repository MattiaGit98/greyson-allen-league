import Link from "next/link";
import { qualifyingOfferRights, rosterEntries, teams } from "@/lib/demo-data";

const actions = [
  { href: "/admin/operazioni", number: "01", title: "Operazioni", text: "Acquisti, tagli e scambi." },
  { href: "/admin/qualifying-offer", number: "02", title: "Qualifying offer", text: "Diritti QO." },
  { href: "/admin/impostazioni", number: "03", title: "Fase della lega", text: "Offseason, asta e stagione." },
  { href: "/asta", number: "04", title: "Pannello asta", text: "Gestione asta." },
];

export default function AdminDashboardPage() {
  const expiring = rosterEntries.filter((entry) => entry.state === "active" && String(entry.contract).startsWith("27"));
  const underMinimum = teams.filter((team) => team.players < 13);
  const deadCap = rosterEntries.filter((entry) => entry.state === "cut");
  return (
    <section className="section page-top admin-dashboard">
      <p className="eyebrow">Amministrazione · Offseason</p>
      <h1>Centro di controllo</h1>
      <div className="admin-kpis">
        <article><span>Diritti QO</span><strong>{qualifyingOfferRights.length}</strong><small>per la prossima asta</small></article>
        <article><span>Contratti “27”</span><strong>{expiring.length}</strong><small>da verificare in offseason</small></article>
        <article><span>Dead cap</span><strong>{deadCap.length}</strong><small>contratti tagliati ancora a carico</small></article>
        <article><span>Roster sotto 13</span><strong>{underMinimum.length}</strong><small>ammesso in offseason</small></article>
      </div>
      <div className="admin-action-grid">
        {actions.map((action) => (
          <Link href={action.href} className="admin-action" key={action.href}>
            <span>{action.number}</span><h2>{action.title}</h2><p>{action.text}</p><b>Apri →</b>
          </Link>
        ))}
      </div>
      <div className="admin-columns">
        <section>
          <div className="content-heading small"><h2>Attenzioni offseason</h2><span>{underMinimum.length}</span></div>
          {underMinimum.map((team) => (
            <Link className="compact-item" href={`/squadre/${team.slug}`} key={team.code}>
              <div><strong>{team.name}</strong><small>{team.players} giocatori: completare entro la chiusura dell’asta</small></div><b>{team.credits} CR</b>
            </Link>
          ))}
        </section>
        <section>
          <div className="content-heading small"><h2>Contratti da rivedere</h2><span>{expiring.length}</span></div>
          {expiring.slice(0, 10).map((entry) => (
            <article className="compact-item" key={`${entry.teamCode}-${entry.name}`}>
              <div><strong>{entry.name}</strong><small>{entry.teamCode} · contratto {entry.contract}</small></div><b>{entry.cost} CR</b>
            </article>
          ))}
        </section>
      </div>
    </section>
  );
}
