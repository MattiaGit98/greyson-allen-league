import Link from "next/link";
import { teams } from "@/lib/demo-data";

export default function HomePage() {
  const totalPlayers = teams.reduce((sum, team) => sum + team.players, 0);
  const totalCredits = teams.reduce((sum, team) => sum + team.credits, 0);
  return (
    <>
      <section className="hero">
        <div>
          <p className="eyebrow">Stagione 2025/26 · Offseason</p>
          <h1>La lega, finalmente<br />fuori dal foglio.</h1>
          <p className="hero-copy">Rose, cap e contratti in un’unica vista. Dati reali importati dal roster ufficiale.</p>
          <div className="actions">
            <Link className="button primary" href="/squadre">Esplora le squadre</Link>
            <Link className="button secondary" href="/asta">Apri asta live</Link>
          </div>
        </div>
        <aside className="status-card">
          <span className="live-dot" /> Stato lega
          <strong>Offseason</strong>
          <p>Mercato scambi aperto</p>
        </aside>
      </section>
      <section className="metrics" aria-label="Numeri della lega">
        <article><span>Squadre</span><strong>{teams.length}</strong><small>tutte attive</small></article>
        <article><span>Giocatori in rosa</span><strong>{totalPlayers}</strong><small>slot regolari e sviluppo</small></article>
        <article><span>Cap disponibile</span><strong>{totalCredits.toLocaleString("it-IT")}</strong><small>crediti complessivi</small></article>
      </section>
      <section className="section">
        <div className="section-heading">
          <div><p className="eyebrow">League board</p><h2>Situazione squadre</h2></div>
          <Link href="/squadre">Vedi classifica cap →</Link>
        </div>
        <div className="team-grid">
          {teams.slice(0, 6).map((team, index) => (
            <Link href={`/squadre/${team.slug}`} className="team-card" key={team.code}>
              <div className="team-top">
                <span className={`team-avatar hue-${index % 4}`}>{team.code}</span>
                <span className="pill">{team.players}/20 slot</span>
              </div>
              <h3>{team.name}</h3>
              <p>{team.owner}</p>
              <div className="cap-row"><span>Cap libero</span><strong>{team.credits} CR</strong></div>
              <div className="progress"><i style={{ width: `${Math.min(100, team.cost / 10)}%` }} /></div>
              <div className="card-meta"><span>Costo rosa {team.cost}</span><span>{Math.max(0, 20 - team.players)} liberi</span></div>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
