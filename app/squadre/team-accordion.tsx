"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { DraftAsset, PlayerListEntry, QualifyingOfferRight, RosterEntry, TeamSummary } from "@/lib/league-types";
import { calculateCapSpace, contractCostForSeason, followingSeasonName } from "@/lib/season-time";
import { entriesForDpeAdjustedCap } from "@/lib/dpe-rules";
import { isStretchUnavailable } from "@/lib/stretch-provision";
import { highlightedDraftYear } from "@/lib/draft-positions";
import { isFourthDraftPick } from "@/lib/future-draft-picks";
import { sortPlayerEntries, type RosterSortKey as SortKey, type RosterSortState as SortState } from "@/lib/roster-display-sort";

const dataSectionKeys = ["roster", "two_way", "g_league", "dpe", "draft", "cut", "qualifying_offer"] as const;
type DataSectionKey = (typeof dataSectionKeys)[number];
type OpenSectionsByTeam = Record<string, DataSectionKey[]>;
type TeamSort = "name" | "cap_desc" | "cap_asc" | "roster_space" | "two_way_space";
type PlayerFilter = { roles: Array<"G" | "A" | "C" | "X">; slots: Array<"regular" | "two_way" | "g_league" | "dpe"> };

const playerRoles = ["G", "A", "C", "X"] as const;
const playerSlots = ["regular", "two_way", "g_league", "dpe"] as const;
const sectionLabels: Record<DataSectionKey, string> = {
  roster: "Roster",
  two_way: "Two-way",
  g_league: "G-League",
  dpe: "DPE",
  draft: "Scelte",
  cut: "Tagliati",
  qualifying_offer: "Qualifying offer",
};

export function TeamAccordion({
  teams,
  rosterEntries,
  draftAssets,
  finalizedDraftPositionYears,
  qualifyingOfferRights,
  playerList,
  playerListPublished,
  inSeason,
  initialTeam,
  showQualifyingOffers,
  capSeasonName,
  countTeamOptions,
  pendingAuctionContracts,
}: {
  teams: TeamSummary[];
  rosterEntries: RosterEntry[];
  draftAssets: DraftAsset[];
  finalizedDraftPositionYears: number[];
  qualifyingOfferRights: QualifyingOfferRight[];
  playerList: PlayerListEntry[];
  playerListPublished: boolean;
  inSeason: boolean;
  initialTeam?: string;
  showQualifyingOffers: boolean;
  capSeasonName: string;
  countTeamOptions: boolean;
  pendingAuctionContracts: boolean;
}) {
  const [openTeams, setOpenTeams] = useState<string[]>(
    initialTeam && teams.some((team) => team.code === initialTeam) ? [initialTeam] : [],
  );
  const [openSectionsByTeam, setOpenSectionsByTeam] = useState<OpenSectionsByTeam>(() => (
    initialTeam && teams.some((team) => team.code === initialTeam) ? { [initialTeam]: ["roster"] } : {}
  ));
  const [sort, setSort] = useState<SortState>({ key: "cost", direction: "desc" });
  const [explorerOpen, setExplorerOpen] = useState(false);
  const [playerQuery, setPlayerQuery] = useState("");
  const [teamSort, setTeamSort] = useState<TeamSort>("name");
  const [playerFilter, setPlayerFilter] = useState<PlayerFilter>({ roles: [], slots: [] });
  const [sectionsToExpand, setSectionsToExpand] = useState<DataSectionKey[]>(["roster"]);
  const teamRefs = useRef(new Map<string, HTMLElement>());
  const highlightedYear = highlightedDraftYear(draftAssets, finalizedDraftPositionYears);
  const displayedDraftAssets = draftAssets;
  const normalizedQuery = normalizePlayerName(playerQuery);
  const teamMetrics = useMemo(() => new Map(teams.map((team) => {
    const entries = rosterEntries.filter((entry) => entry.teamCode === team.code);
    const capSpaces = teamCapSpaces(entries, capSeasonName, countTeamOptions);
    const active = entries.filter((entry) => entry.state === "active");
    return [team.code, {
      currentCap: capSpaces[0],
      rosterSpace: 15 - active.filter((entry) => entry.slot === "regular").length,
      twoWaySpace: 2 - active.filter((entry) => entry.slot === "two_way").length,
    }];
  })), [capSeasonName, countTeamOptions, rosterEntries, teams]);
  const hasPlayerFilter = playerFilter.roles.length > 0 || playerFilter.slots.length > 0;
  const displayedTeams = useMemo(() => teams
    .filter((team) => normalizedQuery || !hasPlayerFilter || rosterEntries.some((entry) => (
      entry.teamCode === team.code && entry.state === "active" && matchesPlayerFilter(entry, playerFilter)
    )))
    .slice()
    .sort((left, right) => {
      const leftMetrics = teamMetrics.get(left.code)!;
      const rightMetrics = teamMetrics.get(right.code)!;
      if (teamSort === "cap_desc") return rightMetrics.currentCap - leftMetrics.currentCap || left.name.localeCompare(right.name, "it");
      if (teamSort === "cap_asc") return leftMetrics.currentCap - rightMetrics.currentCap || left.name.localeCompare(right.name, "it");
      if (teamSort === "roster_space") return rightMetrics.rosterSpace - leftMetrics.rosterSpace || left.name.localeCompare(right.name, "it");
      if (teamSort === "two_way_space") return rightMetrics.twoWaySpace - leftMetrics.twoWaySpace || left.name.localeCompare(right.name, "it");
      return left.name.localeCompare(right.name, "it");
    }), [hasPlayerFilter, normalizedQuery, playerFilter, rosterEntries, teamMetrics, teamSort, teams]);
  const playerMatches = useMemo(() => {
    if (!normalizedQuery) return [];
    return displayedTeams.flatMap((team) => rosterEntries
      .filter((entry) => entry.teamCode === team.code && entry.state === "active" && normalizePlayerName(entry.name).includes(normalizedQuery))
      .map((entry) => ({
        teamCode: team.code,
        playerName: entry.name,
        section: slotSectionFor(entry.slot),
      })));
  }, [displayedTeams, normalizedQuery, rosterEntries]);
  const highlightedPlayer = playerMatches[0]?.playerName;
  const highlightedTeam = playerMatches[0]?.teamCode;
  const highlightedSection = playerMatches[0]?.section;
  const explorerTargetCodes = useMemo(() => (
    normalizedQuery ? (highlightedTeam ? [highlightedTeam] : []) : displayedTeams.map((team) => team.code)
  ), [displayedTeams, highlightedTeam, normalizedQuery]);

  useEffect(() => {
    if (!highlightedTeam || !highlightedSection) return;
    setOpenTeams((current) => current.includes(highlightedTeam) ? current : [...current, highlightedTeam]);
    setOpenSectionsByTeam((current) => {
      const sections = current[highlightedTeam] ?? [];
      return sections.includes(highlightedSection) ? current : { ...current, [highlightedTeam]: [...sections, highlightedSection] };
    });
    const frame = window.requestAnimationFrame(() => teamRefs.current.get(highlightedTeam)?.scrollIntoView({ behavior: "smooth", block: "start" }));
    return () => window.cancelAnimationFrame(frame);
  }, [highlightedPlayer, highlightedSection, highlightedTeam]);

  useEffect(() => {
    if (!explorerOpen || !hasPlayerFilter || !explorerTargetCodes.length) return;
    setOpenTeams((current) => [...new Set([...current, ...explorerTargetCodes])]);
    setOpenSectionsByTeam((current) => ({
      ...current,
      ...Object.fromEntries(explorerTargetCodes.map((code) => [code, sectionsToExpand])),
    }));
  }, [explorerOpen, explorerTargetCodes, hasPlayerFilter, sectionsToExpand]);
  const allExpanded = teams.length > 0
    && openTeams.length === teams.length
    && teams.every((team) => dataSectionKeys.every((section) => openSectionsByTeam[team.code]?.includes(section)));
  const rosterOnlyExpanded = teams.length > 0
    && openTeams.length === teams.length
    && teams.every((team) => {
      const sections = openSectionsByTeam[team.code] ?? [];
      return sections.length === 1 && sections[0] === "roster";
    });

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

  const toggleRosterOnly = () => {
    if (rosterOnlyExpanded) {
      setOpenTeams([]);
      setOpenSectionsByTeam({});
      return;
    }
    setOpenTeams(teams.map((team) => team.code));
    setOpenSectionsByTeam(Object.fromEntries(
      teams.map((team) => [team.code, ["roster"]]),
    ));
  };

  const toggleTeam = (teamCode: string, expanded: boolean) => {
    setOpenTeams((current) => expanded
      ? current.filter((code) => code !== teamCode)
      : [...current, teamCode]);
    setOpenSectionsByTeam((current) => {
      if (!expanded) return { ...current, [teamCode]: sectionsToExpand };
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

  const togglePlayerFilter = (kind: keyof PlayerFilter, value: string) => {
    setPlayerFilter((current) => {
      const values = current[kind] as string[];
      return {
        ...current,
        [kind]: values.includes(value) ? values.filter((item) => item !== value) : [...values, value],
      } as PlayerFilter;
    });
  };

  const togglePreferredSection = (section: DataSectionKey) => {
    const next = sectionsToExpand.includes(section)
      ? sectionsToExpand.filter((item) => item !== section)
      : [...sectionsToExpand, section];
    setSectionsToExpand(next);
    setOpenTeams((current) => [...new Set([...current, ...explorerTargetCodes])]);
    setOpenSectionsByTeam((current) => ({
      ...current,
      ...Object.fromEntries(explorerTargetCodes.map((code) => [code, next])),
    }));
  };

  const resetExplorer = () => {
    setPlayerQuery("");
    setTeamSort("name");
    setPlayerFilter({ roles: [], slots: [] });
    setSectionsToExpand(["roster"]);
    setOpenSectionsByTeam((current) => Object.fromEntries(
      Object.keys(current).map((teamCode) => [teamCode, ["roster"]]),
    ));
  };

  return (
    <>
      <section className={`team-explorer ${explorerOpen ? "open" : ""}`}>
        <button className="team-explorer-toggle" type="button" aria-expanded={explorerOpen} onClick={() => {
          if (explorerOpen) {
            setPlayerQuery("");
            setPlayerFilter({ roles: [], slots: [] });
            setTeamSort("name");
          }
          setExplorerOpen(!explorerOpen);
        }}>
          <span>Ricerca e visualizzazione</span>
          <i aria-hidden="true">{explorerOpen ? "−" : "+"}</i>
        </button>
        {explorerOpen && (
          <div className="team-explorer-controls">
            <label className="team-player-search">
              <span>Cerca giocatore</span>
              <input value={playerQuery} onChange={(event) => setPlayerQuery(event.target.value)} placeholder="Scrivi un nome…" autoFocus />
              {playerQuery && <button type="button" onClick={() => setPlayerQuery("")} aria-label="Cancella ricerca">×</button>}
              {playerQuery && <small>{highlightedPlayer ? `Primo risultato: ${highlightedPlayer}` : "Nessun giocatore trovato"}</small>}
            </label>
            <fieldset className="team-explorer-fieldset">
              <legend>Filtra per ruolo</legend>
              <div className="team-explorer-checks">
                {playerRoles.map((role) => <label key={role}><input type="checkbox" checked={playerFilter.roles.includes(role)} onChange={() => togglePlayerFilter("roles", role)} /> {role}</label>)}
              </div>
            </fieldset>
            <fieldset className="team-explorer-fieldset">
              <legend>Filtra per slot</legend>
              <div className="team-explorer-checks">
                {playerSlots.map((slot) => <label key={slot}><input type="checkbox" checked={playerFilter.slots.includes(slot)} onChange={() => togglePlayerFilter("slots", slot)} /> {slotLabel(slot)}</label>)}
              </div>
            </fieldset>
            <label className="team-explorer-select">
              <span>Ordina squadre</span>
              <select value={teamSort} onChange={(event) => setTeamSort(event.target.value as TeamSort)}>
                <option value="name">Alfabetico</option>
                <option value="cap_desc">Cap libero: maggiore prima</option>
                <option value="cap_asc">Cap libero: minore prima</option>
                <option value="roster_space">Spazio roster: maggiore prima</option>
                <option value="two_way_space">Spazio Two-way: maggiore prima</option>
              </select>
            </label>
            <fieldset className="team-explorer-fieldset team-explorer-sections">
              <legend>Menu da aprire</legend>
              <div className="team-explorer-checks">
                {dataSectionKeys.map((section) => <label key={section}><input type="checkbox" checked={sectionsToExpand.includes(section)} onChange={() => togglePreferredSection(section)} /> {sectionLabels[section]}</label>)}
              </div>
            </fieldset>
            <button className="team-explorer-reset" type="button" onClick={resetExplorer}>Azzera filtri</button>
          </div>
        )}
      </section>
      <div className="team-accordion-toolbar">
        <button type="button" onClick={toggleRosterOnly}>
          <span>{rosterOnlyExpanded ? "−" : "+"}</span>
          {rosterOnlyExpanded ? "Minimizza roster" : "Espandi roster"}
        </button>
        <button type="button" onClick={toggleEverything}>
          <span>{allExpanded ? "−" : "+"}</span>
          {allExpanded ? "Minimizza tutto" : "Espandi tutto"}
        </button>
      </div>
      <div className="team-accordion">
      {displayedTeams.map((team, index) => {
        const expanded = openTeams.includes(team.code);
        const metrics = teamMetrics.get(team.code)!;
        return (
          <article
            className={`team-accordion-item ${expanded ? "open" : ""} ${team.code === highlightedTeam ? "player-search-team" : ""}`}
            key={team.code}
            ref={(element) => {
              if (element) teamRefs.current.set(team.code, element);
              else teamRefs.current.delete(team.code);
            }}
          >
            <button
              className="team-accordion-trigger"
              type="button"
              aria-expanded={expanded}
              onClick={() => toggleTeam(team.code, expanded)}
            >
              <b className={`team-code-badge team-hue-${index % 7}`}>{team.code}</b>
              <span className="team-accordion-identity">
                <strong>{team.name}</strong>
                <small>{team.owner}</small>
              </span>
              <CapCurrent value={metrics.currentCap} />
              <i aria-hidden="true">{expanded ? "−" : "+"}</i>
            </button>
            {expanded && (
              <TeamDetails
                entries={rosterEntries.filter((entry) => entry.teamCode === team.code)}
                assets={displayedDraftAssets.filter((asset) => asset.teamCode === team.code)}
                allDraftAssets={draftAssets}
                rights={qualifyingOfferRights.filter((right) => right.teamCode === team.code)}
                playerList={playerList}
                playerListPublished={playerListPublished}
                inSeason={inSeason}
                highlightedDraftYear={highlightedYear}
                showQualifyingOffers={showQualifyingOffers}
                capSeasonName={capSeasonName}
                countTeamOptions={countTeamOptions}
                pendingAuctionContracts={pendingAuctionContracts}
                sort={sort}
                changeSort={changeSort}
                openSections={openSectionsByTeam[team.code] ?? ["roster"]}
                toggleSection={(section) => toggleDataSection(team.code, section)}
                playerFilter={playerFilter}
                highlightedPlayer={team.code === highlightedTeam ? highlightedPlayer : undefined}
              />
            )}
          </article>
        );
      })}
      </div>
    </>
  );
}

function teamCapSpaces(entries: RosterEntry[], capSeasonName: string, countTeamOptions: boolean) {
  const capSeasons = [capSeasonName, followingSeasonName(capSeasonName), followingSeasonName(capSeasonName, 2)];
  return capSeasons.map((seasonName, index) => calculateCapSpace({
    entries: entriesForDpeAdjustedCap(entries, index),
    seasonName,
    optionSeasonName: capSeasonName,
    countTeamOptions,
  }));
}

function matchesPlayerFilter(entry: RosterEntry, filter: PlayerFilter) {
  const role = entry.role ?? "X";
  const roleMatches = !filter.roles.length || filter.roles.includes(role);
  const slotMatches = !filter.slots.length || filter.slots.includes(entry.slot);
  return roleMatches && slotMatches;
}

function slotSectionFor(slot: RosterEntry["slot"]): DataSectionKey {
  if (slot === "two_way") return "two_way";
  if (slot === "g_league") return "g_league";
  if (slot === "dpe") return "dpe";
  return "roster";
}

function slotLabel(slot: PlayerFilter["slots"][number]) {
  return slot === "regular" ? "Roster" : slot === "two_way" ? "Two-way" : slot === "g_league" ? "G-League" : "DPE";
}

function CapCurrent({ value }: { value: number }) {
  const tone = value < 0 ? "negative" : value > 0 ? "positive" : "neutral";
  return <span className={`team-current-cap ${tone}`}>
    <small>Cap libero</small>
    <strong>{value}</strong>
  </span>;
}

function TeamDetails({
  entries,
  assets,
  allDraftAssets,
  rights,
  playerList,
  playerListPublished,
  inSeason,
  showQualifyingOffers,
  capSeasonName,
  countTeamOptions,
  pendingAuctionContracts,
  highlightedDraftYear,
  sort,
  changeSort,
  openSections,
  toggleSection,
  playerFilter,
  highlightedPlayer,
}: {
  entries: RosterEntry[];
  assets: DraftAsset[];
  allDraftAssets: DraftAsset[];
  rights: QualifyingOfferRight[];
  playerList: PlayerListEntry[];
  playerListPublished: boolean;
  inSeason: boolean;
  showQualifyingOffers: boolean;
  capSeasonName: string;
  countTeamOptions: boolean;
  pendingAuctionContracts: boolean;
  highlightedDraftYear: number | null;
  sort: SortState;
  changeSort: (key: SortKey) => void;
  openSections: DataSectionKey[];
  toggleSection: (section: DataSectionKey) => void;
  playerFilter: PlayerFilter;
  highlightedPlayer?: string;
}) {
  const active = entries.filter((entry) => entry.state === "active");
  const regular = active.filter((entry) => entry.slot === "regular");
  const twoWay = active.filter((entry) => entry.slot === "two_way");
  const gLeague = active.filter((entry) => entry.slot === "g_league");
  const dpe = active.filter((entry) => entry.slot === "dpe");
  const cut = entries.filter((entry) => entry.state === "cut");
  const sortedAssets = assets
    .filter((asset) => !isFourthDraftPick(asset, allDraftAssets) || hasVisibleFourthDraftClause(asset))
    .sort(compareDraftAssets);
  const eligibleAssetCount = sortedAssets.filter((asset) => !isFourthDraftPick(asset, allDraftAssets)).length;
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
  const capSpaces = teamCapSpaces(entries, capSeasonName, countTeamOptions);
  return (
    <div className="team-accordion-content">
      <div className="team-summary-strip">
        <SummaryValue label={`Cap libero ${capSeasons[1]}`} value={`${capSpaces[1]}`} />
        <SummaryValue label={`Cap libero ${capSeasons[2]}`} value={`${capSpaces[2]}`} />
        <SummaryValue label="Ruoli" value={`${roles.G} G / ${roles.A} A / ${roles.C} C`} kind="roles" />
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
        <SimplePlayerTable entries={regular} seasonName={capSeasonName} playerList={playerList} pendingAuctionContracts={pendingAuctionContracts} sort={sort} onSort={changeSort} playerFilter={playerFilter} highlightedPlayer={highlightedPlayer} />
      </DataSection>

      <DataSection label={`Two-way (${twoWay.length}/2)`} expanded={openSections.includes("two_way")} onToggle={() => toggleSection("two_way")}>
        <SimplePlayerTable entries={twoWay} seasonName={capSeasonName} playerList={playerList} pendingAuctionContracts={pendingAuctionContracts} sort={sort} onSort={changeSort} playerFilter={playerFilter} highlightedPlayer={highlightedPlayer} />
      </DataSection>

      <DataSection label={`G-League (${gLeague.length}/3)`} expanded={openSections.includes("g_league")} onToggle={() => toggleSection("g_league")}>
        <SimplePlayerTable entries={gLeague} seasonName={capSeasonName} playerList={playerList} pendingAuctionContracts={pendingAuctionContracts} sort={sort} onSort={changeSort} playerFilter={playerFilter} highlightedPlayer={highlightedPlayer} />
      </DataSection>

      <DataSection label={`Disabled player exception (${dpe.length}/1)`} expanded={openSections.includes("dpe")} onToggle={() => toggleSection("dpe")}>
        <SimplePlayerTable entries={dpe} seasonName={capSeasonName} playerList={playerList} pendingAuctionContracts={pendingAuctionContracts} playerFilter={playerFilter} highlightedPlayer={highlightedPlayer} />
      </DataSection>

      <DataSection label={`Scelte (${eligibleAssetCount})`} expanded={openSections.includes("draft")} onToggle={() => toggleSection("draft")}>
        <div className="data-table draft-data-table">
          <div className="data-head"><span>Anno</span><span>Giro</span><span>SQ / POS</span><span>Clausola</span></div>
          {sortedAssets.map((asset, index) => {
            const numericalPosition = numericValue(asset.originOrOverall);
            const isHighlightedDraft = asset.year === highlightedDraftYear;
            const isNonTradableFuturePick = isFourthDraftPick(asset, allDraftAssets);
            return (
            <div className={`data-row draft-row ${isHighlightedDraft ? "next-draft-position" : ""} ${isNonTradableFuturePick ? "future-draft-pick" : ""}`} key={`${asset.year}-${asset.round}-${index}`}>
              <span><i className="draft-year">{asset.year}</i></span>
              <span><i className={`draft-round ${asset.round === "1° giro" ? "first-round" : "second-round"}`}>{asset.round}</i></span>
              <strong>
                {numericalPosition !== null
                  ? <i className={isHighlightedDraft ? "draft-position" : "draft-origin"}>#{numericalPosition}</i>
                  : <i className={`draft-origin ${isHighlightedDraft ? "draft-origin-next" : ""}`}>{asset.originOrOverall}</i>}
              </strong>
              <span>{isNonTradableFuturePick ? `Non scambiabile · ${draftCondition(asset.label)}` : draftCondition(asset.label)}</span>
            </div>
          )})}
          {!sortedAssets.length && <EmptyRow />}
        </div>
      </DataSection>

      <DataSection label={`Tagliati (${cut.length})`} expanded={openSections.includes("cut")} onToggle={() => toggleSection("cut")}>
        <SimplePlayerTable entries={cut} seasonName={capSeasonName} playerList={playerList} pendingAuctionContracts={pendingAuctionContracts} cutPlayers playerFilter={playerFilter} highlightedPlayer={highlightedPlayer} />
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

function SummaryValue({ label, value, kind }: { label: string; value: string; kind?: "roles" }) {
  return <div className={kind}><span>{label}</span><strong>{value}</strong></div>;
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
  playerList,
  pendingAuctionContracts,
  cutPlayers = false,
  sort,
  onSort,
  playerFilter,
  highlightedPlayer,
}: {
  entries: RosterEntry[];
  seasonName: string;
  playerList: PlayerListEntry[];
  pendingAuctionContracts: boolean;
  cutPlayers?: boolean;
  sort?: SortState;
  onSort?: (key: SortKey) => void;
  playerFilter?: PlayerFilter;
  highlightedPlayer?: string;
}) {
  const filteredEntries = playerFilter ? entries.filter((entry) => matchesPlayerFilter(entry, playerFilter)) : entries;
  const sortedEntries = sort
    ? sortPlayerEntries(filteredEntries, seasonName, sort)
    : [...filteredEntries].sort((left, right) => (
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
      {sortedEntries.map((entry) => <PlayerDataRow
        entry={entry}
        seasonName={seasonName}
        player={playerList.find((item) => normalizePlayerName(item.name) === normalizePlayerName(entry.name))}
        pendingAuctionContract={pendingAuctionContracts && isPendingAuctionContract(entry, seasonName)}
        cutPlayer={cutPlayers}
        highlighted={Boolean(highlightedPlayer && normalizePlayerName(entry.name) === normalizePlayerName(highlightedPlayer))}
        key={`${entry.name}-${entry.state}`}
      />)}
      {!sortedEntries.length && <EmptyRow />}
    </div>
  );
}

function PlayerDataRow({
  entry,
  seasonName,
  player,
  pendingAuctionContract,
  cutPlayer = false,
  highlighted = false,
}: {
  entry: RosterEntry;
  seasonName: string;
  player?: PlayerListEntry;
  pendingAuctionContract: boolean;
  cutPlayer?: boolean;
  highlighted?: boolean;
}) {
  return (
    <div className={`data-row ${pendingAuctionContract ? "pending-auction-contract" : ""} ${highlighted ? "player-search-match" : ""}`}>
      <strong>{entry.name}</strong>
      <span>{cutPlayer
        ? isStretchUnavailable(entry) ? <i className="stretch-status applied">X</i> : "—"
        : entry.role ? <i className={`mini-role mini-role-${entry.role.toLowerCase()}`}>{entry.role}</i> : "X"}</span>
      <span><ContractDisplay
        value={entry.contract}
        auctionAcquisition={entry.auctionAcquisition}
        playoffTeamOptionPromotionSeason={entry.playoffTeamOptionPromotionSeason}
        slot={entry.slot}
        pendingAuctionContract={pendingAuctionContract}
        teamOptionEligible={Boolean(player?.rookie || (player?.under23 && (entry.auctionPrice ?? entry.cost) <= 15))}
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

function hasVisibleFourthDraftClause(asset: DraftAsset) {
  return Boolean(asset.clauseResolution) || draftCondition(asset.label) !== "—";
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

function isPendingAuctionContract(entry: RosterEntry, seasonName: string) {
  return entry.auctionPrice !== undefined && entry.contractStartSeason === seasonName;
}

function ContractDisplay({
  value,
  auctionAcquisition,
  playoffTeamOptionPromotionSeason,
  slot,
  pendingAuctionContract,
  teamOptionEligible,
}: Pick<RosterEntry, "auctionAcquisition" | "playoffTeamOptionPromotionSeason" | "slot"> & {
  value: string;
  pendingAuctionContract: boolean;
  teamOptionEligible: boolean;
}) {
  if (pendingAuctionContract) {
    const pendingMarkers = [
      ...(auctionAcquisition === "restricted_free_agent" ? [{ label: "RFA", kind: "rfa" }] : []),
      ...(auctionAcquisition === "qualifying_offer" ? [{ label: "Q.O.", kind: "acquisition-qo" }] : []),
      ...(teamOptionEligible && (slot === "two_way" || slot === "g_league") ? [{ label: "T.O. obbligatoria", kind: "pending-option" }] : []),
      ...(teamOptionEligible && slot !== "two_way" && slot !== "g_league" ? [{ label: "T.O. possibile", kind: "pending-option" }] : []),
    ];
    return <span className="contract-group">
      <i className="contract-value contract-pending">Da definire</i>
      {pendingMarkers.map((marker) => <i className={`contract-marker contract-marker-${marker.kind}`} key={marker.kind}>{marker.label}</i>)}
    </span>;
  }
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
