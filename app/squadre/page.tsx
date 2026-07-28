import Link from "next/link";
import { teams } from "@/lib/demo-data";

export default function TeamsPage() {
  return (
    <section className="section page-top">
      <p className="eyebrow">Stagione 2025/26</p>
      <h1>Tutte le squadre</h1>
      <div className="list-table">
        <div className="table-head"><span>Squadra</span><span>Giocatori</span><span>Costo</span><span>Cap libero</span></div>
        {teams.map((team) => (
          <Link href={`/squadre/${team.slug}`} className="table-row" key={team.code}>
            <span><b>{team.code}</b><span><strong>{team.name}</strong><small>{team.owner}</small></span></span>
            <span>{team.players}</span><span>{team.cost}</span><span className="credit">{team.credits} CR</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
