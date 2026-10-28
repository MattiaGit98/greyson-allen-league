"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { publicPlayerStatus, type PublicPlayerListRow as Row, type PublicPlayerStatus as PlayerStatusKind } from "@/lib/public-player-list";

type PlayerCategory = "rookie" | "under23" | "veteran";

const allRoles: Row["role"][] = ["G", "A", "C", "X"];
const preAuctionStatuses: PlayerStatusKind[] = ["fa", "qo", "roster"];
const postAuctionStatuses: PlayerStatusKind[] = ["fa", "expiring", "not_expiring", "pending"];
const allCategories: PlayerCategory[] = ["rookie", "under23", "veteran"];

function categoryOf(row: Row): PlayerCategory {
  if (row.rookie) return "rookie";
  if (row.under23) return "under23";
  return "veteran";
}

function toggleSelection<T>(selected: T[], value: T): T[] {
  if (!selected.includes(value)) return [...selected, value];
  if (selected.length === 1) return selected;
  return selected.filter((item) => item !== value);
}

export function PlayerExplorer({ rows, seasonName, postAuction, showPendingFilter, showOrder, showRealTeam, showEligibility, showQualifyingOfferFilter }: {
  rows: Row[];
  seasonName: string;
  postAuction: boolean;
  showPendingFilter: boolean;
  showOrder: boolean;
  showRealTeam: boolean;
  showEligibility: boolean;
  showQualifyingOfferFilter: boolean;
}) {
  const availableStatuses = postAuction
    ? showPendingFilter ? postAuctionStatuses : postAuctionStatuses.filter((status) => status !== "pending")
    : preAuctionStatuses;
  const [query, setQuery] = useState("");
  const [roles, setRoles] = useState<Row["role"][]>(allRoles);
  const [statuses, setStatuses] = useState<PlayerStatusKind[]>(availableStatuses);
  const [categories, setCategories] = useState<PlayerCategory[]>(allCategories);
  const filtered = useMemo(() => rows.filter((row) => {
    const matchesQuery = row.name.toLowerCase().includes(query.toLowerCase());
    const matchesCategory = !showEligibility || categories.includes(categoryOf(row));
    const status = publicPlayerStatus(row, seasonName, postAuction);
    const matchesStatus = statuses.includes(status)
      || (postAuction && status === "pending" && !showPendingFilter)
      || (postAuction && status === "qo" && statuses.length === availableStatuses.length);
    return matchesQuery
      && roles.includes(row.role)
      && matchesStatus
      && matchesCategory;
  }), [availableStatuses.length, categories, postAuction, query, roles, rows, seasonName, showEligibility, showPendingFilter, statuses]);
  const filtersAreActive = roles.length !== allRoles.length
    || statuses.length !== availableStatuses.length
    || (showEligibility && categories.length !== allCategories.length);

  function resetFilters() {
    setRoles(allRoles);
    setStatuses(availableStatuses);
    setCategories(allCategories);
  }

  return (
    <>
      <div className={`filter-bar player-filter-bar${postAuction ? " is-post-auction" : ""}${postAuction && !showPendingFilter ? " without-pending" : ""}`}>
        <label className="search-field player-list-editor-search">
          <span>Cerca giocatore</span>
          <div className="player-list-search-control">
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="6.5" />
              <path d="m16 16 4 4" />
            </svg>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Scrivi il nome…"
            />
            {query && <button type="button" onClick={() => setQuery("")} aria-label="Cancella ricerca">×</button>}
          </div>
        </label>
        <PlayerCheckFilter
          label="Ruolo"
          options={allRoles.map((value) => ({ value, label: value }))}
          selected={roles}
          onToggle={(value) => setRoles((current) => toggleSelection(current, value))}
        />
        <PlayerCheckFilter
          className="player-status-filter"
          label="Stato"
          options={postAuction ? [
            { value: "fa", label: "FA" },
            { value: "expiring", label: "In scad." },
            { value: "not_expiring", label: "Non in scad." },
            ...(showPendingFilter ? [{ value: "pending" as const, label: "Da ass." }] : []),
          ] : [
            { value: "fa", label: "FA" },
            ...(showQualifyingOfferFilter ? [{ value: "qo" as const, label: "Q.O." }] : []),
            { value: "roster", label: "A roster" },
          ]}
          selected={statuses}
          onToggle={(value) => setStatuses((current) => toggleSelection(current, value))}
        />
        {showEligibility && <PlayerCheckFilter
          className="player-category-filter"
          label="Categoria"
          options={[
            { value: "rookie", label: <><span className="filter-label-full">Rookie</span><span className="filter-label-short">R</span></> },
            { value: "under23", label: "U23" },
            { value: "veteran", label: "Veterani" },
          ]}
          selected={categories}
          onToggle={(value) => setCategories((current) => toggleSelection(current, value))}
        />}
        <button className="player-filter-reset" type="button" onClick={resetFilters} disabled={!filtersAreActive}>Azzera filtri</button>
      </div>

      <PublicPlayerList
        rows={filtered}
        seasonName={seasonName}
        postAuction={postAuction}
        showOrder={showOrder}
        showRealTeam={showRealTeam}
        showEligibility={showEligibility}
        emptyLabel={rows.length ? "Nessun giocatore corrisponde ai filtri" : "Listone non ancora pubblicato"}
      />
    </>
  );
}

export function PublicPlayerList({
  rows,
  seasonName = "",
  postAuction = false,
  showOrder,
  showRealTeam,
  showEligibility,
  emptyLabel = "Listone non ancora pubblicato",
}: {
  rows: Row[];
  seasonName?: string;
  postAuction?: boolean;
  showOrder: boolean;
  showRealTeam: boolean;
  showEligibility: boolean;
  emptyLabel?: string;
}) {
  return (
    <div className={`player-list${showOrder ? "" : " without-order"}${showRealTeam ? "" : " without-real-team"}`}>
      <div className="player-list-head">
        {showOrder && <span>#</span>}
        <span>Giocatore</span>
        <span>Ruolo</span>
        {showRealTeam && <span>Squadra NBA</span>}
        <span>Stato</span>
      </div>
      {rows.map((row) => {
        const owningTeamCode = row.rosterTeamCode ?? row.qualifyingTeamCode;
        return (
          <article className={`player-row ${showRealTeam && row.realTeam ? "has-real-team" : ""} ${showEligibility && row.rookie ? "is-rookie" : ""} ${showEligibility && row.under23 ? "is-under23" : ""}`} key={row.listOrder}>
            {showOrder && <span className="player-order">{row.publicOrder}</span>}
            <span className="player-identity">
              {owningTeamCode
                ? <Link className="player-name player-team-link" href={`/squadre?team=${encodeURIComponent(owningTeamCode)}&player=${encodeURIComponent(row.name)}`}>{row.name}</Link>
                : <strong className="player-name">{row.name}</strong>}
              <span className="player-flags">
                {showEligibility && row.rookie && <small className="player-flag player-flag-rookie">Rookie</small>}
                {showEligibility && row.under23 && <small className="player-flag player-flag-u23">U23</small>}
              </span>
            </span>
            <span><i className={`mini-role mini-role-${row.role.toLowerCase()}`}>{row.role}</i></span>
            {showRealTeam && <strong className="real-team">{row.realTeam}</strong>}
            <PlayerStatus row={row} seasonName={seasonName} postAuction={postAuction} />
          </article>
        );
      })}
      {!rows.length && <div className="data-empty">{emptyLabel}</div>}
    </div>
  );
}

function PlayerCheckFilter<T extends string>({ className = "", label, options, selected, onToggle }: {
  className?: string;
  label: string;
  options: { value: T; label: ReactNode }[];
  selected: T[];
  onToggle: (value: T) => void;
}) {
  return (
    <fieldset className={`player-check-filter ${className}`.trim()}>
      <legend>{label}</legend>
      <div>
        {options.map((option) => {
          const checked = selected.includes(option.value);
          return (
            <label key={option.value}>
              <input
                type="checkbox"
                checked={checked}
                disabled={checked && selected.length === 1}
                onChange={() => onToggle(option.value)}
              />
              <span>{option.label}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function PlayerStatus({ row, seasonName, postAuction }: { row: Row; seasonName: string; postAuction: boolean }) {
  if (row.rosterTeamCode) {
    if (!postAuction) return <span className="player-status player-status-roster">{row.rosterTeamCode}</span>;
    const status = publicPlayerStatus(row, seasonName, true);
    const label = status === "expiring" ? "In scad." : status === "pending" ? "Da ass." : "Non in scad.";
    const fullLabel = status === "expiring" ? "In scadenza" : status === "pending" ? "Contratto da assegnare" : "Non in scadenza";
    return <span className={`player-status player-status-roster-detail player-status-${status}`} aria-label={`${row.rosterTeamCode}, ${fullLabel}`}>
      <strong>{row.rosterTeamCode}</strong><small aria-hidden="true">{label}</small>
    </span>;
  }
  if (row.qualifyingTeamCode) {
    return <span className="player-status player-status-highlight"><strong>Q.O. {row.qualifyingTeamCode}</strong></span>;
  }
  return <span className="player-status player-status-highlight"><strong>FA</strong></span>;
}
