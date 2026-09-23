import Link from "next/link";
import { Fragment } from "react";
import { CompetitionContentView } from "@/components/competition-explorer";
import type { CompetitionContent, CompetitionName, CompetitionTeam } from "@/lib/competitions";
import type { HistoryHonoursRow } from "@/lib/history-competitions";

export function HomeHonoursFeature({ title, rows }: { title: string; rows: HistoryHonoursRow[] }) {
  return (
    <section className="home-season-feature">
      <header><div><span>Albo d'oro</span><h2>{title}</h2></div><Link href="/storico">Vai allo storico →</Link></header>
      <div className="home-honours-table">
        <div><span>Stagione</span><span>Squadra</span><span>Proprietari</span></div>
        {rows.map((row, index) => <div key={`${row.season}-${index}`}><strong>{row.season || "—"}</strong><span>{row.team || "—"}</span><span>{row.owners || "—"}</span></div>)}
        {!rows.length && <p>Nessun dato registrato.</p>}
      </div>
    </section>
  );
}

export function HomeDraftFeature({ year, rows, firstRoundLastPosition }: { year: number; rows: Array<{ pick: string; team: string; player: string }>; firstRoundLastPosition: number }) {
  return (
    <section className="home-season-feature">
      <header><div><span>Draft {year}</span><h2>Tabellone draft</h2></div><Link href={`/storico?category=Draft&season=${year}`}>Vai allo storico →</Link></header>
      <div className="home-draft-board">
        <div><span>#</span><span>Squadra</span><span>Giocatore</span></div>
        {rows.map((row, index) => {
          const position = Number(row.pick) || index + 1;
          return <Fragment key={`${row.pick}-${index}`}>
            {position === 1 && firstRoundLastPosition > 0 && <div className="home-draft-round-divider first-round" role="heading" aria-level={3}>1° giro</div>}
            {position === firstRoundLastPosition + 1 && firstRoundLastPosition > 0 && <div className="home-draft-round-divider second-round" role="heading" aria-level={3}>2° giro</div>}
            <div className={row.player ? "is-assigned" : ""}><strong>{row.pick || String(index + 1)}</strong><span>{row.team || "—"}</span><span className={row.player ? "home-draft-player" : ""}>{row.player || "Da assegnare"}</span></div>
          </Fragment>;
        })}
      </div>
    </section>
  );
}

export function HomeCompetitionFeature({ name, content, teams }: { name: CompetitionName; content: CompetitionContent; teams: CompetitionTeam[] }) {
  return (
    <section className="home-season-feature home-competition-feature">
      <header><div><span>Competizione</span><h2>{name}</h2></div><Link href="/competizioni">Vedi tutto →</Link></header>
      <CompetitionContentView content={content} teams={teams} />
    </section>
  );
}
