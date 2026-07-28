"use client";

import { useMemo, useState } from "react";
import type { DraftAsset, QualifyingOfferRight, RosterEntry, TeamSummary } from "@/lib/demo-data";

type SortKey = "role" | "name" | "contract" | "cost";
type SortState = { key: SortKey; direction: "asc" | "desc" };

export function TeamAccordion({
  teams,
  rosterEntries,
  draftAssets,
  qualifyingOfferRights,
  initialTeam,
  showQualifyingOffers,
}: {
  teams: TeamSummary[];
  rosterEntries: RosterEntry[];
  draftAssets: DraftAsset[];
  qualifyingOfferRights: QualifyingOfferRight[];
  initialTeam?: string;
  showQualifyingOffers: boolean;
}) {
  const [openTeam, setOpenTeam] = useState<string | null>(
    initialTeam && teams.some((team) => team.code === initialTeam) ? initialTeam : null,
  );
  const [sort, setSort] = useState<SortState>({ key: "cost", direction: "desc" });

  const changeSort = (key: SortKey) => {
    setSort((current) => current.key === key
      ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
      : { key, direction: key === "cost" ? "desc" : "asc" });
  };

  return (
    <div className="team-accordion">
      {teams.map((team) => {
        const expanded = openTeam === team.code;
        return (
          <article className={`team-accordion-item ${expanded ? "open" : ""}`} key={team.code}>
            <button
              className="team-accordion-trigger"
              type="button"
              aria-expanded={expanded}
              onClick={() => setOpenTeam(expanded ? null : team.code)}
            >
              <b>{team.code}</b>
              <strong>{team.name}</strong>
              <span>{team.owner}</span>
              <i aria-hidden="true">{expanded ? "−" : "+"}</i>
            </button>
            {expanded && (
              <TeamDetails
                team={team}
                entries={rosterEntries.filter((entry) => entry.teamCode === team.code)}
                assets={draftAssets.filter((asset) => asset.teamCode === team.code)}
                rights={qualifyingOfferRights.filter((right) => right.teamCode === team.code)}
                showQualifyingOffers={showQualifyingOffers}
                sort={sort}
                changeSort={changeSort}
              />
            )}
          </article>
        );
      })}
    </div>
  );
}

function TeamDetails({
  team,
  entries,
  assets,
  rights,
  showQualifyingOffers,
  sort,
  changeSort,
}: {
  team: TeamSummary;
  entries: RosterEntry[];
  assets: DraftAsset[];
  rights: QualifyingOfferRight[];
  showQualifyingOffers: boolean;
  sort: SortState;
  changeSort: (key: SortKey) => void;
}) {
  const active = entries.filter((entry) => entry.state === "active");
  const regular = active.filter((entry) => entry.slot === "regular");
  const twoWay = active.filter((entry) => entry.slot === "two_way");
  const gLeague = active.filter((entry) => entry.slot === "g_league");
  const dpe = active.filter((entry) => entry.slot === "dpe");
  const cut = entries.filter((entry) => entry.state === "cut");
  const roles = {
    G: active.filter((entry) => entry.slot !== "dpe" && entry.role === "G").length,
    A: active.filter((entry) => entry.slot !== "dpe" && entry.role === "A").length,
    C: active.filter((entry) => entry.slot !== "dpe" && entry.role === "C").length,
  };
  const sortedRegular = useMemo(() => [...regular].sort((left, right) => {
    const direction = sort.direction === "asc" ? 1 : -1;
    if (sort.key === "cost") return (left.cost - right.cost) * direction;
    if (sort.key === "contract") {
      const contract = (value: string) => Number(String(value).match(/\d+/)?.[0] ?? 999);
      return (contract(left.contract) - contract(right.contract)) * direction;
    }
    if (sort.key === "role") return String(left.role ?? "").localeCompare(String(right.role ?? ""), "it") * direction;
    return left.name.localeCompare(right.name, "it") * direction;
  }), [regular, sort]);

  return (
    <div className="team-accordion-content">
      <div className="team-summary-strip">
        <SummaryValue label="Cap libero" value={`${team.credits} CR`} />
        <SummaryValue label="Cap 26/27" value={`${team.nextSeasonCredits} CR`} />
        <SummaryValue label="Cap 27/28" value={`${team.followingSeasonCredits} CR`} />
        <SummaryValue label="Giocatori" value={`${active.length} · ${roles.G} G / ${roles.A} A / ${roles.C} C`} />
      </div>

      <DataSection label="Roster normale">
        <div className="data-table roster-data-table">
          <div className="data-head">
            <SortButton label="Ruolo" sortKey="role" sort={sort} onClick={changeSort} />
            <SortButton label="Giocatore" sortKey="name" sort={sort} onClick={changeSort} />
            <SortButton label="Scadenza" sortKey="contract" sort={sort} onClick={changeSort} />
            <SortButton label="Costo" sortKey="cost" sort={sort} onClick={changeSort} />
          </div>
          {sortedRegular.map((entry) => <PlayerDataRow entry={entry} key={entry.name} />)}
          {!sortedRegular.length && <EmptyRow />}
        </div>
      </DataSection>

      <DataSection label="Two-way">
        <SimplePlayerTable entries={twoWay} />
      </DataSection>

      <DataSection label="G-League">
        <SimplePlayerTable entries={gLeague} />
      </DataSection>

      <DataSection label="Scelte">
        <div className="data-table draft-data-table">
          <div className="data-head"><span>Anno</span><span>Giro</span><span>Scelta / condizione</span><span>Origine</span></div>
          {assets.map((asset, index) => (
            <div className="data-row" key={`${asset.year}-${asset.round}-${index}`}>
              <span>{asset.year}</span><span>{asset.round}</span><strong>{asset.label}</strong><span>{asset.originOrOverall}</span>
            </div>
          ))}
          {!assets.length && <EmptyRow />}
        </div>
      </DataSection>

      <DataSection label="Disabled player exception">
        <SimplePlayerTable entries={dpe} />
      </DataSection>

      <DataSection label="Tagliati">
        <SimplePlayerTable entries={cut} />
      </DataSection>

      <DataSection label="Qualifying offer — prossima asta">
        <div className="data-table qo-data-table">
          <div className="data-head"><span>Giocatore</span><span>Importo</span></div>
          {showQualifyingOffers && rights.map((right) => (
            <div className="data-row" key={right.playerName}><strong>{right.playerName}</strong><span>{right.qualifyingAmount} CR</span></div>
          ))}
          {(!showQualifyingOffers || !rights.length) && <EmptyRow />}
        </div>
      </DataSection>
    </div>
  );
}

function SummaryValue({ label, value }: { label: string; value: string }) {
  return <div><span>{label}</span><strong>{value}</strong></div>;
}

function DataSection({ label, children }: { label: string; children: React.ReactNode }) {
  return <section className="accordion-data-section"><p>{label}</p>{children}</section>;
}

function SortButton({ label, sortKey, sort, onClick }: { label: string; sortKey: SortKey; sort: SortState; onClick: (key: SortKey) => void }) {
  const active = sort.key === sortKey;
  return <button type="button" onClick={() => onClick(sortKey)}>{label}{active ? (sort.direction === "asc" ? " ↑" : " ↓") : ""}</button>;
}

function SimplePlayerTable({ entries }: { entries: RosterEntry[] }) {
  return (
    <div className="data-table roster-data-table">
      <div className="data-head"><span>Ruolo</span><span>Giocatore</span><span>Scadenza</span><span>Costo</span></div>
      {entries.map((entry) => <PlayerDataRow entry={entry} key={`${entry.name}-${entry.state}`} />)}
      {!entries.length && <EmptyRow />}
    </div>
  );
}

function PlayerDataRow({ entry }: { entry: RosterEntry }) {
  return (
    <div className="data-row">
      <span>{entry.role ?? "—"}</span><strong>{entry.name}</strong><span>{entry.contract || "—"}</span><span>{entry.cost} CR</span>
    </div>
  );
}

function EmptyRow() {
  return <div className="data-empty">—</div>;
}
