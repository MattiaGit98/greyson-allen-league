"use client";

import { useState } from "react";
import type { DraftAsset, PlayerListEntry, QualifyingOfferRight, RosterEntry, TeamSummary } from "@/lib/league-types";
import { calculateCapSpace, contractCostForSeason, followingSeasonName } from "@/lib/season-time";
import { entriesForDpeAdjustedCap } from "@/lib/dpe-rules";
import { isStretchUnavailable } from "@/lib/stretch-provision";
import { highlightedDraftYear } from "@/lib/draft-positions";
import { sortPlayerEntries, type RosterSortKey as SortKey, type RosterSortState as SortState } from "@/lib/roster-display-sort";

const dataSectionKeys = ["roster", "two_way", "g_league", "dpe", "draft", "cut", "qualifying_offer"] as const;
type DataSectionKey = (typeof dataSectionKeys)[number];
type OpenSectionsByTeam = Record<string, DataSectionKey[]>;

export function TeamAccordion({
  teams,
  rosterEntries,
  draftAssets,
  draftPositionYears,
  qualifyingOfferRights,
  playerList,
  playerListPublished,
  inSeason,
  initialTeam,
  showQualifyingOffers,
  capSeasonName,
  countTeamOptions,
}: {
  teams: TeamSummary[];
  rosterEntries: RosterEntry[];
  draftAssets: DraftAsset[];
  draftPositionYears: number[];
  qualifyingOfferRights: QualifyingOfferRight[];
  playerList: PlayerListEntry[];
  playerListPublished: boolean;
  inSeason: boolean;
  initialTeam?: string;
  showQualifyingOffers: boolean;
  capSeasonName: string;
  countTeamOptions: boolean;
}) {
  const [openTeams, setOpenTeams] = useState<string[]>(
    initialTeam && teams.some((team) => team.code === initialTeam) ? [initialTeam] : [],
  );
  const [openSectionsByTeam, setOpenSectionsByTeam] = useState<OpenSectionsByTeam>(() => (
    initialTeam && teams.some((team) => team.code === initialTeam) ? { [initialTeam]: ["roster"] } : {}
  ));
  const [sort, setSort] = useState<SortState>({ key: "cost", direction: "desc" });
  const highlightedYear = highlightedDraftYear(draftAssets, draftPositionYears);
  const allExpanded = teams.length > 0
    && openTeams.length === teams.length
    && teams.every((team) => dataSectionKeys.every((section) => openSectionsByTeam[team.code]?.includes(section)));

  const changeSort = (key: SortKey) => {
    setSort((current) => current.key === key
      ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
      : { key, direction: key === "cost" ? "desc" : "asc" });
  };

  const toggleEverything = () => {
    if (allExpanded) {
      setOpenTeams([]);
      setOpenSectionsByTeam({});
      return;
    }
    setOpenTeams(teams.map((team) => team.code));
    setOpenSectionsByTeam(Object.fromEntries(
      teams.map((team) => [team.code, [...dataSectionKeys]]),
    ));
  };

  const toggleTeam = (teamCode: string, expanded: boolean) => {
    setOpenTeams((current) => expanded
      ? current.filter((code) => code !== teamCode)
      : [...current, teamCode]);
    setOpenSectionsByTeam((current) => {
      if (!expanded) return { ...current, [teamCode]: ["roster"] };
      const next = { ...current };
      delete next[teamCode];
      return next;
    });
  };

  const toggleDataSection = (teamCode: string, section: DataSectionKey) => {
    setOpenSectionsByTeam((current) => {
      const openSections = current[teamCode] ?? [];
      return {
        ...current,
        [teamCode]: openSections.includes(section)
          ? openSections.filter((item) => item !== section)
          : [...openSections, section],
      };
    });
  };

  return (
    <>
      <div className="team-accordion-toolbar">
        <button type="button" onClick={toggleEverything}>
          <span>{allExpanded ? "−" : "+"}</span>
          {allExpanded ? "Minimizza tutto" : "Espandi tutto"}
        </button>
      </div>
      <div className="team-accordion">
      {teams.map((team, index) => {
        const expanded = openTeams.includes(team.code);
        return (
          <article className={`team-accordion-item ${expanded ? "open" : ""}`} key={team.code}>
            <button
              className="team-accordion-trigger"
              type="button"
              aria-expanded={expanded}
              onClick={() => toggleTeam(team.code, expanded)}
            >
              <b className={`team-code-badge team-hue-${index % 7}`}>{team.code}</b>
              <strong>{team.name}</strong>
              <span>{team.owner}</span>
              <i aria-hidden="true">{expanded ? "−" : "+"}</i>
            </button>
            {expanded && (
              <TeamDetails
                entries={rosterEntries.filter((entry) => entry.teamCode === team.code)}
                assets={draftAssets.filter((asset) => asset.teamCode === team.code)}
                rights={qualifyingOfferRights.filter((right) => right.teamCode === team.code)}
                playerList={playerList}
                playerListPublished={playerListPublished}
                inSeason={inSeason}
                highlightedDraftYear={highlightedYear}
                showQualifyingOffers={showQualifyingOffers}
                capSeasonName={capSeasonName}
                countTeamOptions={countTeamOptions}
                sort={sort}
                changeSort={changeSort}
                openSections={openSectionsByTeam[team.code] ?? ["roster"]}
                toggleSection={(section) => toggleDataSection(team.code, section)}
              />
            )}
          </article>
        );
      })}
      </div>
    </>
  );
}

function TeamDetails({
  entries,
  assets,
  rights,
  playerList,
  playerListPublished,
  inSeason,
  showQualifyingOffers,
  capSeasonName,
  countTeamOptions,
  highlightedDraftYear,
  sort,
  changeSort,
  openSections,
  toggleSection,
}: {
  entries: RosterEntry[];
  assets: DraftAsset[];
  rights: QualifyingOfferRight[];
  playerList: PlayerListEntry[];
  playerListPublished: boolean;
  inSeason: boolean;
  showQualifyingOffers: boolean;
  capSeasonName: string;
  countTeamOptions: boolean;
  highlightedDraftYear: number | null;
  sort: SortState;
  changeSort: (key: SortKey) => void;
  openSections: DataSectionKey[];
  toggleSection: (section: DataSectionKey) => void;
}) {
  const active = entries.filter((entry) => entry.state === "active");
  const regular = active.filter((entry) => entry.slot === "regular");
  const twoWay = active.filter((entry) => entry.slot === "two_way");
  const gLeague = active.filter((entry) => entry.slot === "g_league");
  const dpe = active.filter((entry) => entry.slot === "dpe");
  const cut = entries.filter((entry) => entry.state === "cut");
  const sortedAssets = [...assets].sort(compareDraftAssets);
  const officialRoles = new Map(playerList.map((player) => [normalizePlayerName(player.name), player.role]));
  const roles = active
    .filter((entry) => entry.slot !== "dpe")
    .reduce((counts, entry) => {
      const role = officialRoles.get(normalizePlayerName(entry.name));
      if (role === "G" || role === "A" || role === "C") counts[role] += 1;
      return counts;
    }, { G: 0, A: 0, C: 0 });
  const missingRoles = {
    G: Math.max(0, 5 - roles.G),
    A: Math.max(0, 5 - roles.A),
    C: Math.max(0, 3 - roles.C),
  };
  const roleMinimumMissing = missingRoles.G > 0 || missingRoles.A > 0 || missingRoles.C > 0;
  const capSeasons = [capSeasonName, followingSeasonName(capSeasonName), followingSeasonName(capSeasonName, 2)];
  const capSpaces = capSeasons.map((seasonName, index) => calculateCapSpace({
    entries: entriesForDpeAdjustedCap(entries, index),
    seasonName,
    optionSeasonName: capSeasonName,
    countTeamOptions,
  }));
  return (
    <div className="team-accordion-content">
      <div className="current-cap-highlight">
        <span>Cap libero {capSeasons[0]}</span>
        <strong>{capSpaces[0]}</strong>
      </div>

      <div className="team-summary-strip">
        <SummaryValue label={`Cap libero ${capSeasons[1]}`} value={`${capSpaces[1]}`} />
        <SummaryValue label={`Cap libero ${capSeasons[2]}`} value={`${capSpaces[2]}`} />
        <SummaryValue label="Ruoli" value={`${roles.G} G / ${roles.A} A / ${roles.C} C`} />
      </div>

      {inSeason && playerListPublished && roleMinimumMissing && (
        <section className="team-role-minimum-warning">
          <div>
            <span>Minimi di ruolo non rispettati</span>
            <strong>{[
              missingRoles.G ? `G ${roles.G}/5` : "",
              missingRoles.A ? `A ${roles.A}/5` : "",
              missingRoles.C ? `C ${roles.C}/3` : "",
            ].filter(Boolean).join(" · ")}</strong>
          </div>
          <p>Serve l’assegnazione casuale di un free agent fino al termine della stagione, a 1 credito e indipendentemente dal salary cap; se necessario va liberato uno slot.</p>
          <small>Art. 2(b-c)</small>
        </section>
      )}

      <DataSection label={`Roster (${regular.length}/15)`} expanded={openSections.includes("roster")} onToggle={() => toggleSection("roster")}>
        <SimplePlayerTable entries={regular} seasonName={capSeasonName} sort={sort} onSort={changeSort} />
      </DataSection>

      <DataSection label={`Two-way (${twoWay.length}/2)`} expanded={openSections.includes("two_way")} onToggle={() => toggleSection("two_way")}>
        <SimplePlayerTable entries={twoWay} seasonName={capSeasonName} sort={sort} onSort={changeSort} />
      </DataSection>

      <DataSection label={`G-League (${gLeague.length}/3)`} expanded={openSections.includes("g_league")} onToggle={() => toggleSection("g_league")}>
        <SimplePlayerTable entries={gLeague} seasonName={capSeasonName} sort={sort} onSort={changeSort} />
      </DataSection>

      <DataSection label={`Disabled player exception (${dpe.length}/1)`} expanded={openSections.includes("dpe")} onToggle={() => toggleSection("dpe")}>
        <SimplePlayerTable entries={dpe} seasonName={capSeasonName} />
      </DataSection>

      <DataSection label={`Scelte (${sortedAssets.length})`} expanded={openSections.includes("draft")} onToggle={() => toggleSection("draft")}>
        <div className="data-table draft-data-table">
          <div className="data-head"><span>Anno</span><span>Giro</span><span>SQ / POS</span><span>Clausola</span></div>
          {sortedAssets.map((asset, index) => {
            const numericalPosition = numericValue(asset.originOrOverall);
            const isHighlightedDraft = asset.year === highlightedDraftYear;
            return (
            <div className={`data-row draft-row ${isHighlightedDraft ? "next-draft-position" : ""}`} key={`${asset.year}-${asset.round}-${index}`}>
              <span><i className="draft-year">{asset.year}</i></span>
              <span>{asset.round}</span>
              <strong>
                {numericalPosition !== null
                  ? <i className={isHighlightedDraft ? "draft-position" : "draft-origin"}>#{numericalPosition}</i>
                  : <i className={`draft-origin ${isHighlightedDraft ? "draft-origin-next" : ""}`}>{asset.originOrOverall}</i>}
              </strong>
              <span>{draftCondition(asset.label)}</span>
            </div>
          )})}
          {!sortedAssets.length && <EmptyRow />}
        </div>
      </DataSection>

      <DataSection label={`Tagliati (${cut.length})`} expanded={openSections.includes("cut")} onToggle={() => toggleSection("cut")}>
        <SimplePlayerTable entries={cut} seasonName={capSeasonName} cutPlayers />
      </DataSection>

      <DataSection label={`Qualifying offer (${showQualifyingOffers ? rights.length : 0})`} expanded={openSections.includes("qualifying_offer")} onToggle={() => toggleSection("qualifying_offer")}>
        <div className="data-table qo-data-table">
          <div className="data-head"><span>Giocatore</span><span>Importo</span></div>
          {showQualifyingOffers && rights.map((right) => (
            <div className="data-row" key={right.playerName}><strong>{right.playerName}</strong><span className="credit-value">{right.qualifyingAmount}</span></div>
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

function DataSection({
  label,
  expanded,
  onToggle,
  children,
}: {
  label: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className={`accordion-data-section ${expanded ? "open" : ""}`}>
      <button className="accordion-data-section-trigger" type="button" aria-expanded={expanded} onClick={onToggle}>
        <span>{label}</span>
        <i aria-hidden="true">{expanded ? "−" : "+"}</i>
      </button>
      {expanded && children}
    </section>
  );
}

function SortButton({ label, sortKey, sort, onClick }: { label: string; sortKey: SortKey; sort: SortState; onClick: (key: SortKey) => void }) {
  const active = sort.key === sortKey;
  return <button type="button" onClick={() => onClick(sortKey)}>{label}{active ? (sort.direction === "asc" ? " ↑" : " ↓") : ""}</button>;
}

function SimplePlayerTable({
  entries,
  seasonName,
  cutPlayers = false,
  sort,
  onSort,
}: {
  entries: RosterEntry[];
  seasonName: string;
  cutPlayers?: boolean;
  sort?: SortState;
  onSort?: (key: SortKey) => void;
}) {
  const sortedEntries = sort
    ? sortPlayerEntries(entries, seasonName, sort)
    : [...entries].sort((left, right) => (
      contractCostForSeason(right, seasonName) - contractCostForSeason(left, seasonName)
      || left.name.localeCompare(right.name, "it")
    ));
  return (
    <div className={`data-table roster-data-table ${cutPlayers ? "cut-player-table" : ""}`}>
      <div className="data-head">
        {sort && onSort && !cutPlayers ? <>
          <SortButton label="Giocatore" sortKey="name" sort={sort} onClick={onSort} />
          <SortButton label="Ruolo" sortKey="role" sort={sort} onClick={onSort} />
          <SortButton label="Scadenza" sortKey="contract" sort={sort} onClick={onSort} />
          <SortButton label="Costo" sortKey="cost" sort={sort} onClick={onSort} />
        </> : <>
          <span>Giocatore</span>
          <span>{cutPlayers ? "Stretch" : "Ruolo"}</span>
          <span>Scadenza</span>
          <span>Costo</span>
        </>}
      </div>
      {sortedEntries.map((entry) => <PlayerDataRow entry={entry} seasonName={seasonName} cutPlayer={cutPlayers} key={`${entry.name}-${entry.state}`} />)}
      {!sortedEntries.length && <EmptyRow />}
    </div>
  );
}

function PlayerDataRow({ entry, seasonName, cutPlayer = false }: { entry: RosterEntry; seasonName: string; cutPlayer?: boolean }) {
  return (
    <div className="data-row">
      <strong>{entry.name}</strong>
      <span>{cutPlayer
        ? isStretchUnavailable(entry) ? <i className="stretch-status applied">X</i> : "—"
        : entry.role ? <i className={`mini-role mini-role-${entry.role.toLowerCase()}`}>{entry.role}</i> : "—"}</span>
      <span><ContractDisplay
        value={entry.contract}
        auctionAcquisition={entry.auctionAcquisition}
        playoffTeamOptionPromotionSeason={entry.playoffTeamOptionPromotionSeason}
      /></span>
      <span><i className="credit-value">{contractCostForSeason(entry, seasonName)}</i></span>
    </div>
  );
}

function EmptyRow() {
  return <div className="data-empty">—</div>;
}

function normalizePlayerName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("it-IT");
}

function draftCondition(label: string) {
  const counterparty = label.match(/^C\.p\. se 1a (\d{4}) ([A-Z]+) in top 5$/i);
  if (counterparty) {
    return `Contropartita se la 1ª scelta ${counterparty[1]} ${counterparty[2]} rientra in top 5`;
  }
  const protectedPick = label.match(/^Protetta top 5, 1a (\d{4}) ([A-Z]+)$/i);
  if (protectedPick) {
    return `Protetta top 5; contropartita: 1ª scelta ${protectedPick[1]} ${protectedPick[2]}`;
  }
  const swapSubject = label.match(/^Soggetta a dir swap con ([A-Z]+)$/i);
  if (swapSubject) return `Subisce il diritto di swap con ${swapSubject[1]}`;
  const swapRight = label.match(/^Diritto di swap con ([A-Z]+)$/i);
  if (swapRight) return `Diritto di swap con ${swapRight[1]}`;
  return "—";
}

function numericValue(value: string | number) {
  if (typeof value === "number") return value;
  return /^\d+$/.test(value) ? Number(value) : null;
}

function compareDraftAssets(left: DraftAsset, right: DraftAsset) {
  if (left.year !== right.year) return left.year - right.year;
  const leftRound = Number(left.round.match(/\d+/)?.[0] ?? 99);
  const rightRound = Number(right.round.match(/\d+/)?.[0] ?? 99);
  if (leftRound !== rightRound) return leftRound - rightRound;
  const leftNumber = numericValue(left.originOrOverall);
  const rightNumber = numericValue(right.originOrOverall);
  if (leftNumber === null && rightNumber !== null) return -1;
  if (leftNumber !== null && rightNumber === null) return 1;
  if (leftNumber === null && rightNumber === null) {
    return String(left.originOrOverall).localeCompare(String(right.originOrOverall), "it");
  }
  return (leftNumber ?? 0) - (rightNumber ?? 0);
}

function ContractDisplay({ value, auctionAcquisition, playoffTeamOptionPromotionSeason }: Pick<RosterEntry, "auctionAcquisition" | "playoffTeamOptionPromotionSeason"> & { value: string }) {
  if (!value) return <i className="contract-value">—</i>;
  if (value === "T.O.") return <i className="contract-value contract-team-option">T.O.</i>;
  const year = value.match(/\d{2}/)?.[0] ?? value;
  const markers = [
    ...(value.includes("(E)") ? [{ label: "+ EXT", kind: "ext" }] : []),
    ...(value.includes("(Q)") ? [{ label: "+ Q.O.", kind: "qo" }] : []),
    ...(/\((?:2X|X2)\)/i.test(value) ? [{ label: "×2", kind: "double" }] : []),
    ...(playoffTeamOptionPromotionSeason ? [{ label: "+ PO", kind: "playoff-promotion" }] : []),
    ...(auctionAcquisition === "qualifying_offer" ? [{ label: "ACQ. Q.O.", kind: "acquisition-qo" }] : []),
    ...(auctionAcquisition === "restricted_free_agent" ? [{ label: "RFA", kind: "rfa" }] : []),
  ];
  return (
    <span className="contract-group">
      <i className="contract-value">{year}</i>
      {markers.map((marker) => <i
        className={`contract-marker contract-marker-${marker.kind}`}
        key={marker.kind}
        title={marker.kind === "double"
          ? "Costo raddoppiato nell’ultimo anno"
          : marker.kind === "playoff-promotion"
            ? `Promozione obbligatoria nel roster all’inizio dell’offseason ${playoffTeamOptionPromotionSeason}`
          : marker.kind === "acquisition-qo"
            ? "Acquistato tramite Q.O. accettata"
            : marker.kind === "rfa" ? "Acquistato come restricted free agent" : undefined}
      >{marker.label}</i>)}
    </span>
  );
}
