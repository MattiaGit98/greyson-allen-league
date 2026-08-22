"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
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
type TeamSort = "name" | "cap_desc" | "roster_space";
type ContractFilter =
  | "current_expiry"
  | "next_expiry"
  | "following_expiry"
  | "team_option"
  | "qualifying_offer"
  | "extension"
  | "pending";
type PlayerFilter = { roles: Array<"G" | "A" | "C" | "X">; contracts: ContractFilter[] };
type ExplorerDialog = "filter" | "view" | null;

const playerRoles = ["G", "A", "C", "X"] as const;
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
  capScaleMaximum,
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
  capScaleMaximum: number;
}) {
  const [openTeams, setOpenTeams] = useState<string[]>(
    initialTeam && teams.some((team) => team.code === initialTeam) ? [initialTeam] : [],
  );
  const [openSectionsByTeam, setOpenSectionsByTeam] = useState<OpenSectionsByTeam>(() => (
    initialTeam && teams.some((team) => team.code === initialTeam) ? { [initialTeam]: ["roster"] } : {}
  ));
  const [sort, setSort] = useState<SortState>({ key: "cost", direction: "desc" });
  const [explorerDialog, setExplorerDialog] = useState<ExplorerDialog>(null);
  const [mobileExplorerOpen, setMobileExplorerOpen] = useState(false);
  const [playerQuery, setPlayerQuery] = useState("");
  const [playerMatchIndex, setPlayerMatchIndex] = useState(0);
  const [teamSort, setTeamSort] = useState<TeamSort>("name");
  const [playerFilter, setPlayerFilter] = useState<PlayerFilter>({ roles: [], contracts: [] });
  const [sectionsToExpand, setSectionsToExpand] = useState<DataSectionKey[]>(["roster"]);
  const [filterDraft, setFilterDraft] = useState<PlayerFilter>({ roles: [], contracts: [] });
  const [viewDraft, setViewDraft] = useState<{ teamSort: TeamSort; sections: DataSectionKey[] }>({
    teamSort: "name",
    sections: ["roster"],
  });
  const teamRefs = useRef(new Map<string, HTMLElement>());
  const explorerRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const mobileToolbarRef = useRef<HTMLDivElement>(null);
  const accordionRef = useRef<HTMLDivElement>(null);
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
    }];
  })), [capSeasonName, countTeamOptions, rosterEntries, teams]);
  const hasPlayerFilter = playerFilter.roles.length > 0 || playerFilter.contracts.length > 0;
  const availableContractOptions = useMemo(() => contractFilterOptions(capSeasonName).filter((option) => rosterEntries.some((entry) => (
    entry.state === "active" && matchesContractFilter(entry, option.value, capSeasonName)
  ))), [capSeasonName, rosterEntries]);
  const capScaleMinimum = useMemo(() => {
    const capValues = [...teamMetrics.values()].map((metrics) => metrics.currentCap);
    return capValues.length ? 1000 - Math.max(...capValues) : 0;
  }, [teamMetrics]);
  const displayedTeams = useMemo(() => teams
    .filter((team) => normalizedQuery || !hasPlayerFilter || rosterEntries.some((entry) => (
      entry.teamCode === team.code && entry.state === "active" && matchesPlayerFilter(entry, playerFilter, capSeasonName)
    )))
    .slice()
    .sort((left, right) => {
      const leftMetrics = teamMetrics.get(left.code)!;
      const rightMetrics = teamMetrics.get(right.code)!;
      if (teamSort === "cap_desc") return rightMetrics.currentCap - leftMetrics.currentCap || left.name.localeCompare(right.name, "it");
      if (teamSort === "roster_space") return rightMetrics.rosterSpace - leftMetrics.rosterSpace || left.name.localeCompare(right.name, "it");
      return left.name.localeCompare(right.name, "it");
    }), [capSeasonName, hasPlayerFilter, normalizedQuery, playerFilter, rosterEntries, teamMetrics, teamSort, teams]);
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
  const currentPlayerMatchIndex = playerMatches.length ? Math.min(playerMatchIndex, playerMatches.length - 1) : 0;
  const currentPlayerMatch = playerMatches[currentPlayerMatchIndex];
  const highlightedPlayer = currentPlayerMatch?.playerName;
  const highlightedTeam = currentPlayerMatch?.teamCode;
  const highlightedSection = currentPlayerMatch?.section;
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
    if (!normalizedQuery) return;
    setOpenTeams(teams.map((team) => team.code));
    setOpenSectionsByTeam(Object.fromEntries(
      teams.map((team) => [team.code, [...dataSectionKeys]]),
    ));
  }, [normalizedQuery, teams]);

  useEffect(() => {
    const availableFilters = new Set(availableContractOptions.map((option) => option.value));
    const removeUnavailableFilters = (current: PlayerFilter) => {
      const contracts = current.contracts.filter((contract) => availableFilters.has(contract));
      return contracts.length === current.contracts.length ? current : { ...current, contracts };
    };
    setPlayerFilter(removeUnavailableFilters);
    setFilterDraft(removeUnavailableFilters);
  }, [availableContractOptions]);

  useEffect(() => {
    const explorer = explorerRef.current;
    const toolbar = toolbarRef.current;
    const mobileToolbar = mobileToolbarRef.current;
    const accordion = accordionRef.current;
    if (!explorer || !toolbar || !mobileToolbar || !accordion) return;
    const updateHeight = () => {
      accordion.style.setProperty("--team-explorer-height", `${explorer.offsetHeight}px`);
      accordion.style.setProperty("--team-toolbar-height", `${toolbar.offsetHeight}px`);
      accordion.style.setProperty("--team-mobile-toolbar-height", `${mobileToolbar.offsetHeight}px`);
      explorer.style.setProperty("--team-mobile-toolbar-height", `${mobileToolbar.offsetHeight}px`);
    };
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(explorer);
    observer.observe(toolbar);
    observer.observe(mobileToolbar);
    return () => observer.disconnect();
  }, []);
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

  const toggleDraftPlayerFilter = (kind: keyof PlayerFilter, value: string) => {
    setFilterDraft((current) => {
      const values = current[kind] as string[];
      return {
        ...current,
        [kind]: values.includes(value) ? values.filter((item) => item !== value) : [...values, value],
      } as PlayerFilter;
    });
  };

  const toggleDraftSection = (section: DataSectionKey) => {
    setViewDraft((current) => ({
      ...current,
      sections: current.sections.includes(section)
        ? current.sections.filter((item) => item !== section)
        : [...current.sections, section],
    }));
  };

  const applyFilter = () => {
    setPlayerFilter(filterDraft);
    setExplorerDialog(null);
  };

  const applyView = () => {
    setTeamSort(viewDraft.teamSort);
    setSectionsToExpand(viewDraft.sections);
    const visibleTeamCodes = displayedTeams.map((team) => team.code);
    setOpenTeams((current) => [...new Set([...current, ...visibleTeamCodes])]);
    setOpenSectionsByTeam((current) => ({
      ...current,
      ...Object.fromEntries(visibleTeamCodes.map((code) => [code, viewDraft.sections])),
    }));
    setExplorerDialog(null);
  };

  const resetExplorer = () => {
    setPlayerQuery("");
    setPlayerMatchIndex(0);
    setPlayerFilter({ roles: [], contracts: [] });
    setFilterDraft({ roles: [], contracts: [] });
    setExplorerDialog(null);
  };

  const movePlayerMatch = (direction: -1 | 1) => {
    if (!playerMatches.length) return;
    setPlayerMatchIndex((current) => (current + direction + playerMatches.length) % playerMatches.length);
  };

  const toggleMobileExplorer = () => {
    const opening = !mobileExplorerOpen;
    setMobileExplorerOpen(opening);
    if (!opening) return;
    window.requestAnimationFrame(() => {
      const explorer = explorerRef.current;
      if (!explorer) return;
      const toolbarHeight = mobileToolbarRef.current?.offsetHeight ?? 0;
      const destination = explorer.getBoundingClientRect().top + window.scrollY - 74 - toolbarHeight;
      window.scrollTo({ top: Math.max(0, destination), behavior: "smooth" });
    });
  };

  return (
    <>
      <div className={`team-accordion-mobile-toolbar ${mobileExplorerOpen ? "is-explorer-open" : ""}`} ref={mobileToolbarRef}>
        <button type="button" onClick={toggleRosterOnly} aria-label={rosterOnlyExpanded ? "Minimizza roster" : "Espandi roster"}>
          <span>{rosterOnlyExpanded ? "−" : "+"}</span>
          Roster
        </button>
        <button type="button" onClick={toggleEverything} aria-label={allExpanded ? "Minimizza tutto" : "Espandi tutto"}>
          <span>{allExpanded ? "−" : "+"}</span>
          Tutto
        </button>
        <button type="button" onClick={toggleMobileExplorer} aria-expanded={mobileExplorerOpen}>
          <span>{mobileExplorerOpen ? "−" : "+"}</span>
          Ricerca
        </button>
      </div>
      <div className={`team-explorer-sticky ${mobileExplorerOpen ? "is-mobile-explorer-open" : ""}`} ref={explorerRef}>
        <section className={`team-explorer ${mobileExplorerOpen ? "is-mobile-open" : "is-mobile-closed"}`}>
          <div className="team-explorer-bar">
            <label className="team-player-search">
              <span className="team-player-search-control">
                <input value={playerQuery} onChange={(event) => {
                  setPlayerQuery(event.target.value);
                  setPlayerMatchIndex(0);
                }} placeholder="Cerca giocatore..." aria-label="Cerca giocatore" />
                {playerQuery && <>
                  <small aria-live="polite">{playerMatches.length ? `${currentPlayerMatchIndex + 1}/${playerMatches.length}` : "0 risultati"}</small>
                  <button className="team-player-search-nav" type="button" onClick={() => movePlayerMatch(-1)} disabled={!playerMatches.length} aria-label="Risultato precedente">‹</button>
                  <button className="team-player-search-nav" type="button" onClick={() => movePlayerMatch(1)} disabled={!playerMatches.length} aria-label="Risultato successivo">›</button>
                  <button className="team-player-search-clear" type="button" onClick={() => {
                    setPlayerQuery("");
                    setPlayerMatchIndex(0);
                  }} aria-label="Cancella ricerca">×</button>
                </>}
              </span>
            </label>
            <button className={`team-explorer-action ${hasPlayerFilter ? "is-active" : ""}`} type="button" onClick={() => {
              setFilterDraft(playerFilter);
              setExplorerDialog("filter");
            }}><span className="team-explorer-label-desktop">Filtra giocatori</span><span className="team-explorer-label-mobile">Filtra</span></button>
            <button className={`team-explorer-action ${teamSort !== "name" || sectionsToExpand.length !== 1 || !sectionsToExpand.includes("roster") ? "is-active" : ""}`} type="button" onClick={() => {
              setViewDraft({ teamSort, sections: sectionsToExpand });
              setExplorerDialog("view");
            }}><span className="team-explorer-label-desktop">Ordine e visualizzazione</span><span className="team-explorer-label-mobile">Ordine / vista</span></button>
            <button className="team-explorer-reset" type="button" onClick={resetExplorer}><span className="team-explorer-label-desktop">Azzera filtri</span><span className="team-explorer-label-mobile">Azzera</span></button>
          </div>
        </section>
        <div className="team-accordion-toolbar" ref={toolbarRef}>
        <button type="button" onClick={toggleRosterOnly} aria-label={rosterOnlyExpanded ? "Minimizza roster" : "Espandi roster"}>
          <span>{rosterOnlyExpanded ? "−" : "+"}</span>
          <span className="team-toolbar-desktop-label">{rosterOnlyExpanded ? "Minimizza roster" : "Espandi roster"}</span>
          <span className="team-toolbar-mobile-label">Roster</span>
        </button>
        <button type="button" onClick={toggleEverything} aria-label={allExpanded ? "Minimizza tutto" : "Espandi tutto"}>
          <span>{allExpanded ? "−" : "+"}</span>
          <span className="team-toolbar-desktop-label">{allExpanded ? "Minimizza tutto" : "Espandi tutto"}</span>
          <span className="team-toolbar-mobile-label">Tutto</span>
        </button>
        <button className="team-toolbar-mobile-action" type="button" onClick={() => setMobileExplorerOpen((current) => !current)} aria-expanded={mobileExplorerOpen}>
          <span>{mobileExplorerOpen ? "−" : "+"}</span>
          <span>Ricerca</span>
        </button>
        </div>
      </div>
      {explorerDialog && (
        <div className="team-explorer-dialog-backdrop" role="presentation" onMouseDown={() => setExplorerDialog(null)}>
          <section className="team-explorer-dialog" role="dialog" aria-modal="true" aria-labelledby={`team-explorer-${explorerDialog}-title`} onMouseDown={(event) => event.stopPropagation()}>
            {explorerDialog === "filter" ? <>
              <header><span>Ricerca e visualizzazione</span><strong id="team-explorer-filter-title">Filtra giocatori</strong></header>
              <div className="team-explorer-dialog-body">
                <fieldset className="team-explorer-fieldset">
                  <legend>Ruolo</legend>
                  <div className="team-explorer-checks">
                    {playerRoles.map((role) => <label key={role}><input type="checkbox" checked={filterDraft.roles.includes(role)} onChange={() => toggleDraftPlayerFilter("roles", role)} /> {role}</label>)}
                  </div>
                </fieldset>
                <fieldset className="team-explorer-fieldset">
                  <legend>Contratto</legend>
                  <div className="team-explorer-checks">
                    {availableContractOptions.map((option) => <label key={option.value}><input type="checkbox" checked={filterDraft.contracts.includes(option.value)} onChange={() => toggleDraftPlayerFilter("contracts", option.value)} /> {option.label}</label>)}
                  </div>
                </fieldset>
              </div>
              <footer><button className="button secondary" type="button" onClick={() => setExplorerDialog(null)}>Annulla</button><button className="button primary" type="button" onClick={applyFilter}>Applica filtro</button></footer>
            </> : <>
              <header><span>Ricerca e visualizzazione</span><strong id="team-explorer-view-title">Ordine e visualizzazione</strong></header>
              <div className="team-explorer-dialog-body">
                <fieldset className="team-explorer-fieldset team-explorer-order-options">
                  <legend>Ordina squadre</legend>
                  {(["name", "cap_desc", "roster_space"] as TeamSort[]).map((option) => <label key={option}>
                    <input type="radio" name="team-sort" checked={viewDraft.teamSort === option} onChange={() => setViewDraft((current) => ({ ...current, teamSort: option }))} />
                    {option === "name" ? "Alfabetico" : option === "cap_desc" ? "Cap libero" : "Spazio roster"}
                  </label>)}
                </fieldset>
                <fieldset className="team-explorer-fieldset">
                  <legend>Menu da aprire</legend>
                  <div className="team-explorer-checks">
                    {dataSectionKeys.map((section) => <label key={section}><input type="checkbox" checked={viewDraft.sections.includes(section)} onChange={() => toggleDraftSection(section)} /> {sectionLabels[section]}</label>)}
                  </div>
                </fieldset>
              </div>
              <footer><button className="button secondary" type="button" onClick={() => setExplorerDialog(null)}>Annulla</button><button className="button primary" type="button" onClick={applyView}>Applica</button></footer>
            </>}
          </section>
        </div>
      )}
      <div className={`team-accordion ${mobileExplorerOpen ? "mobile-explorer-open" : ""}`} ref={accordionRef}>
      {displayedTeams.map((team, index) => {
        const expanded = openTeams.includes(team.code);
        const metrics = teamMetrics.get(team.code)!;
        const capUsage = 1000 - metrics.currentCap;
        const capScale = capScaleMaximum <= capScaleMinimum
          ? (capUsage >= capScaleMaximum ? 1 : 0)
          : Math.max(0, Math.min(1, (capUsage - capScaleMinimum) / (capScaleMaximum - capScaleMinimum)));
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
              <CapCurrent value={metrics.currentCap} scale={capScale} />
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

function matchesPlayerFilter(entry: RosterEntry, filter: PlayerFilter, capSeasonName: string) {
  const role = entry.role ?? "X";
  const roleMatches = !filter.roles.length || filter.roles.includes(role);
  const contractMatches = !filter.contracts.length || filter.contracts.some((filterKind) => matchesContractFilter(entry, filterKind, capSeasonName));
  return roleMatches && contractMatches;
}

function slotSectionFor(slot: RosterEntry["slot"]): DataSectionKey {
  if (slot === "two_way") return "two_way";
  if (slot === "g_league") return "g_league";
  if (slot === "dpe") return "dpe";
  return "roster";
}

function contractFilterOptions(capSeasonName: string): Array<{ value: ContractFilter; label: string }> {
  const nextSeasonName = followingSeasonName(capSeasonName);
  const followingSeason = followingSeasonName(capSeasonName, 2);
  return [
    { value: "current_expiry", label: contractEndYear(capSeasonName) },
    { value: "next_expiry", label: contractEndYear(nextSeasonName) },
    { value: "following_expiry", label: contractEndYear(followingSeason) },
    { value: "team_option", label: "T.O." },
    { value: "qualifying_offer", label: "Q.O." },
    { value: "pending", label: "Da assegnare" },
    { value: "extension", label: "Estendibile" },
  ];
}

function contractEndYear(seasonName: string) {
  return seasonName.match(/\/(\d{2})$/)?.[1] ?? seasonName;
}

function matchesContractFilter(entry: RosterEntry, filterKind: ContractFilter, capSeasonName: string) {
  const contract = entry.contract.trim().toUpperCase();
  if (filterKind === "current_expiry") return contract.startsWith(contractEndYear(capSeasonName));
  if (filterKind === "next_expiry") return contract.startsWith(contractEndYear(followingSeasonName(capSeasonName)));
  if (filterKind === "following_expiry") return contract.startsWith(contractEndYear(followingSeasonName(capSeasonName, 2)));
  if (filterKind === "team_option") return contract === "T.O.";
  if (filterKind === "qualifying_offer") return /\(Q\)|\((?:2X|X2)\)/.test(contract);
  if (filterKind === "extension") return /\(E\)/.test(contract);
  return contract === "PENDING";
}

function CapCurrent({ value, scale }: { value: number; scale: number }) {
  const hue = Math.round(132 - (126 * scale));
  return <span className="team-current-cap" style={{ "--cap-hue": hue } as CSSProperties}>
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
        <SummaryValue label="Ruoli" value={`${roles.G} G / ${roles.A} A / ${roles.C} C`} kind="roles" />
        <SummaryValue label={`Cap libero ${capSeasons[1]}`} value={`${capSpaces[1]}`} />
        <SummaryValue label={`Cap libero ${capSeasons[2]}`} value={`${capSpaces[2]}`} />
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

      {showQualifyingOffers && (
        <DataSection label={`Qualifying offer (${rights.length})`} expanded={openSections.includes("qualifying_offer")} onToggle={() => toggleSection("qualifying_offer")}>
          <div className="data-table qo-data-table">
            <div className="data-head"><span>Giocatore</span><span>Importo</span></div>
            {rights.map((right) => (
              <div className="data-row" key={right.playerName}><strong>{right.playerName}</strong><span className="credit-value">{right.qualifyingAmount}</span></div>
            ))}
            {!rights.length && <EmptyRow />}
          </div>
        </DataSection>
      )}
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
  const filteredEntries = playerFilter ? entries.filter((entry) => matchesPlayerFilter(entry, playerFilter, seasonName)) : entries;
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
