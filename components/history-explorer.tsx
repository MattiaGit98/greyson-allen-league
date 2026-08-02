"use client";

import { useState } from "react";
import { BracketView } from "@/components/bracket-view";
import { Selector } from "@/components/competition-explorer";
import {
  aggregateHistoryNames,
  historyCompetitionNames,
  isHistoryCompetitionName,
  type HistoryCompetitionEntry,
  type HistoryCompetitionMap,
  type HistoryCompetitionName,
} from "@/lib/history-competitions";

export function HistoryExplorer({ competitions }: { competitions: HistoryCompetitionMap }) {
  const [selectedName, setSelectedName] = useState<HistoryCompetitionName>(historyCompetitionNames[0]);
  const [selectedSeason, setSelectedSeason] = useState("");
  const entries = competitions[selectedName];
  const isAggregate = aggregateHistoryNames.has(selectedName);
  const activeEntry = isAggregate
    ? undefined
    : entries.find((entry) => entry.season === selectedSeason) ?? entries[0];

  function changeSection(name: string) {
    if (!isHistoryCompetitionName(name)) return;
    setSelectedName(name);
    setSelectedSeason("");
  }

  return (
    <>
      <div className={`history-selectors ${isAggregate || !entries.length ? "single" : ""}`}>
        <Selector
          label="Visualizza"
          value={selectedName}
          onChange={changeSection}
          options={[...historyCompetitionNames]}
        />
        {!isAggregate && entries.length > 0 && (
          <label className="view-selector">
            <span>{selectedName === "Draft" ? "Draft" : "Stagione"}</span>
            <select
              value={activeEntry?.season ?? ""}
              onChange={(event) => setSelectedSeason(event.target.value)}
            >
              {entries.map((entry) => (
                <option value={entry.season} key={entry.season}>{entry.season}</option>
              ))}
            </select>
          </label>
        )}
      </div>
      {isAggregate
        ? <StructuredAggregateHistory entries={entries} />
        : activeEntry
          ? <StructuredHistoryContent category={selectedName} entry={activeEntry} />
          : <div className="history-empty">Nessun dato registrato</div>}
    </>
  );
}

function StructuredHistoryContent({
  category,
  entry,
}: {
  category: HistoryCompetitionName;
  entry: HistoryCompetitionEntry;
}) {
  if (entry.content.kind === "bracket") {
    return (
      <BracketView stages={entry.content.stages.map((stage) => ({
        name: stage.name,
        matches: stage.matches.map((match) => ({
          teams: match.teams.map((team) => ({
            name: team.teamName,
            score: team.score,
            homeAdvantage: team.homeAdvantage,
          })),
        })),
      }))} />
    );
  }
  if (entry.content.kind === "draft") {
    return (
      <HistoryTable
        title={`DRAFT ${entry.season}`}
        headers={["Scelta", "Squadra", "Giocatore"]}
        rows={entry.content.rows.map((row) => [row.pick, row.team, row.player])}
        accentFirst
      />
    );
  }
  if (entry.content.kind === "winning_roster") {
    return (
      <section className="winning-roster">
        <div><span>Campione</span><strong>{entry.content.teamName || "—"}</strong></div>
        <ul>{entry.content.players.map((player, index) => <li key={index}>{player || "—"}</li>)}</ul>
      </section>
    );
  }
  if (entry.content.kind !== "ranking") {
    return <div className="history-empty">Nessun dato registrato</div>;
  }
  return (
    <HistoryTable
      title={`${category} · ${entry.season}`.toUpperCase()}
      headers={["Pos.", "Squadra"]}
      rows={entry.content.positions.map((team, index) => [String(index + 1), team])}
      accentFirst
    />
  );
}

function StructuredAggregateHistory({ entries }: { entries: HistoryCompetitionEntry[] }) {
  if (!entries.length) return <div className="history-empty">Nessun dato registrato</div>;
  return (
    <div className="history-stack">
      {entries.map((entry, index) => {
        if (entry.content.kind === "honours") {
          return (
            <HistoryTable
              title={entry.season}
              headers={["Stagione", "Squadra", "Proprietari"]}
              rows={entry.content.rows.map((row) => [row.season, row.team, row.owners])}
              key={`${entry.season}-${index}`}
            />
          );
        }
        if (entry.content.kind === "title_counts") {
          return (
            <HistoryTable
              title={entry.season}
              headers={["Nome", "Titoli"]}
              rows={entry.content.rows.map((row) => [row.label, row.count])}
              key={`${entry.season}-${index}`}
            />
          );
        }
        return null;
      })}
    </div>
  );
}

function HistoryTable({
  title,
  headers,
  rows,
  accentFirst = false,
}: {
  title: string;
  headers: string[];
  rows: string[][];
  accentFirst?: boolean;
}) {
  return (
    <section className={`history-table-card history-columns-${headers.length} ${accentFirst ? "compact-first-column" : ""}`}>
      <h2>{title}</h2>
      <div className="history-table-head">
        {headers.map((header) => <span key={header}>{header}</span>)}
      </div>
      {rows.map((row, rowIndex) => (
        <div className="history-table-row" key={`${row[0]}-${rowIndex}`}>
          {row.map((value, columnIndex) => columnIndex === 0 && accentFirst
            ? <strong className="history-rank" key={columnIndex}>{value || "—"}</strong>
            : <span key={columnIndex}>{value || "—"}</span>)}
        </div>
      ))}
      {!rows.length && <div className="data-empty">Nessun dato registrato</div>}
    </section>
  );
}
