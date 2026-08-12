"use client";

import { useMemo, useState } from "react";

type PlayerStatus = "roster" | "qo" | "fa";
type Row = {
  name: string;
  role: "G" | "A" | "C" | "X";
  realTeam: string;
  rookie: boolean;
  under23: boolean;
  listOrder: number;
  rosterTeamCode: string | null;
  qualifyingTeamCode: string | null;
};

function statusOf(row: Row): PlayerStatus {
  if (row.rosterTeamCode) return "roster";
  if (row.qualifyingTeamCode) return "qo";
  return "fa";
}

export function PlayerExplorer({ rows, showRealTeam, showEligibility }: { rows: Row[]; showRealTeam: boolean; showEligibility: boolean }) {
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("all");
  const [status, setStatus] = useState("all");
  const [rookiesOnly, setRookiesOnly] = useState(false);
  const [under23Only, setUnder23Only] = useState(false);
  const filtered = useMemo(() => rows.filter((row) => {
    const matchesQuery = row.name.toLowerCase().includes(query.toLowerCase());
    const matchesCategory = !showEligibility
      || (!rookiesOnly && !under23Only)
      || (rookiesOnly && row.rookie)
      || (under23Only && row.under23);
    return matchesQuery
      && (role === "all" || row.role === role)
      && (status === "all" || statusOf(row) === status)
      && matchesCategory;
  }), [query, role, rookiesOnly, rows, showEligibility, status, under23Only]);

  return (
    <>
      <div className="filter-bar">
        <label className="search-field"><span>Cerca</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nome del giocatore…" /></label>
        <label><span>Ruolo</span><select value={role} onChange={(event) => setRole(event.target.value)}><option value="all">Tutti</option><option>G</option><option>A</option><option>C</option><option>X</option></select></label>
        <label><span>Stato</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">Tutti</option><option value="fa">FA</option><option value="qo">Q.O.</option><option value="roster">A roster</option></select></label>
        {showEligibility && <div className="player-category-filter" role="group" aria-label="Categoria">
          <span>Categoria</span>
          <label><input type="checkbox" checked={rookiesOnly} onChange={(event) => setRookiesOnly(event.target.checked)} /> Rookie</label>
          <label><input type="checkbox" checked={under23Only} onChange={(event) => setUnder23Only(event.target.checked)} /> U23</label>
        </div>}
      </div>

      <div className={`player-list${showRealTeam ? "" : " without-real-team"}`}>
        <div className="player-list-head">
          <span>#</span>
          <span>Giocatore</span>
          <span>Ruolo</span>
          {showRealTeam && <span>Squadra NBA</span>}
          <span>Stato</span>
        </div>
        {filtered.map((row) => (
          <article className={`player-row ${showRealTeam && row.realTeam ? "has-real-team" : ""} ${showEligibility && row.rookie ? "is-rookie" : ""} ${showEligibility && row.under23 ? "is-under23" : ""}`} key={row.listOrder}>
            <span className="player-order">{row.listOrder}</span>
            <span className="player-identity">
              <strong className="player-name">{row.name}</strong>
              <span className="player-flags">
                {showEligibility && row.rookie && <small className="player-flag player-flag-rookie">Rookie</small>}
                {showEligibility && row.under23 && <small className="player-flag player-flag-u23">U23</small>}
              </span>
            </span>
            <span><i className={`mini-role mini-role-${row.role.toLowerCase()}`}>{row.role}</i></span>
            {showRealTeam && <strong className="real-team">{row.realTeam}</strong>}
            <PlayerStatus row={row} />
          </article>
        ))}
        {!filtered.length && <div className="data-empty">{rows.length ? "Nessun giocatore corrisponde ai filtri" : "Listone non ancora pubblicato"}</div>}
      </div>
    </>
  );
}

function PlayerStatus({ row }: { row: Row }) {
  if (row.rosterTeamCode) return <span className="player-status player-status-roster">{row.rosterTeamCode}</span>;
  if (row.qualifyingTeamCode) {
    return <span className="player-status player-status-highlight"><strong>Q.O.</strong><small>{row.qualifyingTeamCode}</small></span>;
  }
  return <span className="player-status player-status-highlight"><strong>FA</strong></span>;
}
