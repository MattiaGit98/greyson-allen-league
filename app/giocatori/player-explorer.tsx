"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { parseContract, type RosterEntry } from "@/lib/demo-data";

type Row = RosterEntry & { teamName: string; hasFutureQualifyingRight: boolean };

export function PlayerExplorer({ rows }: { rows: Row[] }) {
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("all");
  const [status, setStatus] = useState("active");
  const filtered = useMemo(() => rows.filter((row) => {
    const matchesQuery = `${row.name} ${row.teamName} ${row.teamCode}`.toLowerCase().includes(query.toLowerCase());
    return matchesQuery && (role === "all" || row.role === role) && (status === "all" || row.state === status);
  }), [query, role, rows, status]);

  return (
    <>
      <div className="filter-bar">
        <label className="search-field"><span>Cerca</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nome o squadra…" /></label>
        <label><span>Ruolo</span><select value={role} onChange={(event) => setRole(event.target.value)}><option value="all">Tutti</option><option>G</option><option>A</option><option>C</option></select></label>
        <label><span>Stato</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">Tutti</option><option value="active">In roster</option><option value="cut">Tagliati</option></select></label>
      </div>
      <p className="result-count">{filtered.length} risultati</p>
      <div className="player-list">
        {filtered.map((row, index) => {
          const contract = parseContract(row.contract);
          return (
            <article className="player-row" key={`${row.name}-${row.teamCode}-${row.state}-${index}`}>
              <span className={`role role-${row.role?.toLowerCase() ?? "none"}`}>{row.role ?? "—"}</span>
              <div><strong>{row.name}</strong><small><Link href={`/squadre/${row.teamCode.toLowerCase()}`}>{row.teamName}</Link> · {row.state === "cut" ? "Dead cap" : "Roster attivo"}</small></div>
              <span className="badges">
                <span className="badge">{row.contract}</span>
                {contract.isTeamOption && <span className="badge option">TO</span>}
                {(contract.hasQualifyingRight || row.hasFutureQualifyingRight) && <span className="badge qo">QO</span>}
                {contract.isExtensionEligible && <span className="badge extension">Estendibile</span>}
              </span>
              <b>{row.cost} CR</b>
            </article>
          );
        })}
      </div>
    </>
  );
}
