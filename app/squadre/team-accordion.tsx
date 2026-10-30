"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { DraftAsset, PlayerListEntry, QualifyingOfferRight, RosterEntry, TeamSummary } from "@/lib/league-types";
import { calculateCapSpace, followingSeasonName } from "@/lib/season-time";
import { entriesForDpeAdjustedCap, shouldShowDpeBadge, shouldShowDpeNoReintegrationBadge } from "@/lib/dpe-rules";
import type { LeagueMoment } from "@/lib/league-moments";
import { getRosterSlotLimits } from "@/lib/roster-slot-limits";
import { isStretchUnavailable } from "@/lib/stretch-provision";
import { highlightedDraftYear } from "@/lib/draft-positions";
import { hasVisibleFourthDraftClause, isFourthDraftPick, publicDraftCondition as draftCondition } from "@/lib/future-draft-picks";
import { sortPlayerEntries, type RosterSortKey as SortKey, type RosterSortState as SortState } from "@/lib/roster-display-sort";
import { isRookieExtensionDecisionDue } from "@/lib/team-option-contract";
import { dpeCountsForRoleMinimums } from "@/lib/role-minimums";
import { roleMinimumDeficits } from "@/lib/rules/roster";
import { shouldShowScheduledCutBadge } from "@/lib/season-end-cuts";
import { PublicPlayerList } from "@/app/giocatori/player-explorer";
import type { PublicPlayerListRow } from "@/lib/public-player-list";
import { qualifyingOfferDisplayRole } from "@/lib/qualifying-offer-role";
import { teamPlayerSearchMatches, type TeamPlayerSearchMatch } from "@/lib/team-player-search";
import { isPendingAuctionContractForDisplay } from "@/lib/roster-contract-display";
import type { RecentAuctionCall } from "@/lib/auction-call-feed";

const dataSectionKeys = ["roster", "two_way", "g_league", "dpe", "draft", "cut", "qualifying_offer"] as const;
type DataSectionKey = (typeof dataSectionKeys)[number];
type OpenSectionsByTeam = Record<string, DataSectionKey[]>;
type TeamSort = "name" | "cap_desc";
type ExplorerDialog = "search" | "order" | "view" | null;

const playerSlotSectionKeys: DataSectionKey[] = ["roster", "two_way", "g_league", "dpe"];
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
  twoWaySlotLimit,
  teams,
  rosterEntries,
  draftAssets,
  finalizedDraftPositionYears,
  qualifyingOfferRights,
  playerList,
  playerListPublished,
  inSeason,
  seasonEndOverflowByTeam,
  initialTeam,
  initialPlayer,
  showQualifyingOffers,
  capSeasonName,
  countTeamOptions,
  pendingAuctionContracts,
  capScaleMaximum,
  leagueMoment,
  auctionCalls,
  recentAuctionCalls,
  showAuctionCallPanels,
}: {
  twoWaySlotLimit?: number;
  teams: TeamSummary[];
  rosterEntries: RosterEntry[];
  draftAssets: DraftAsset[];
  finalizedDraftPositionYears: number[];
  qualifyingOfferRights: QualifyingOfferRight[];
  playerList: PlayerListEntry[];
  playerListPublished: boolean;
  inSeason: boolean;
  seasonEndOverflowByTeam: Record<string, number>;
  initialTeam?: string;
  initialPlayer?: string;
  showQualifyingOffers: boolean;
  capSeasonName: string;
  countTeamOptions: boolean;
  pendingAuctionContracts: boolean;
  capScaleMaximum: number;
  leagueMoment: LeagueMoment;
  auctionCalls: PublicPlayerListRow[];
  recentAuctionCalls: RecentAuctionCall[];
  showAuctionCallPanels: boolean;
}) {
  const initialPlayerInRoster = Boolean(initialTeam && initialPlayer && rosterEntries.some((entry) => (
    entry.teamCode === initialTeam
    && entry.state === "active"
    && normalizePlayerName(entry.name) === normalizePlayerName(initialPlayer)
  )));
  const initialPlayerWithQualifyingOffer = Boolean(
    showQualifyingOffers
    && initialTeam
    && initialPlayer
    && qualifyingOfferRights.some((right) => (
      right.teamCode === initialTeam
      && normalizePlayerName(right.playerName) === normalizePlayerName(initialPlayer)
    )),
  );
  const initialPlayerOnTeam = initialPlayerInRoster || initialPlayerWithQualifyingOffer;
  const [openTeams, setOpenTeams] = useState<string[]>(
    initialTeam && teams.some((team) => team.code === initialTeam) ? [initialTeam] : [],
  );
  const [openSectionsByTeam, setOpenSectionsByTeam] = useState<OpenSectionsByTeam>(() => (
    initialTeam && teams.some((team) => team.code === initialTeam)
      ? {
        [initialTeam]: initialPlayerInRoster
          ? [...playerSlotSectionKeys]
          : initialPlayerWithQualifyingOffer ? ["qualifying_offer"] : ["roster"],
      }
      : {}
  ));
  const [sort, setSort] = useState<SortState>({ key: "cost", direction: "desc" });
  const [explorerDialog, setExplorerDialog] = useState<ExplorerDialog>(null);
  const [explorerOpen, setExplorerOpen] = useState(false);
  const [playerSearchQuery, setPlayerSearchQuery] = useState("");
  const [teamSort, setTeamSort] = useState<TeamSort>("name");
  const [sectionsToExpand, setSectionsToExpand] = useState<DataSectionKey[]>(["roster"]);
  const [orderDraft, setOrderDraft] = useState<TeamSort>("name");
  const [viewDraft, setViewDraft] = useState<DataSectionKey[]>(["roster"]);
  const [auctionCallsOpen, setAuctionCallsOpen] = useState(false);
  const [recentAuctionCallsOpen, setRecentAuctionCallsOpen] = useState(false);
  const visibleDataSectionKeys: readonly DataSectionKey[] = showQualifyingOffers
    ? dataSectionKeys
    : dataSectionKeys.filter((section) => section !== "qualifying_offer");
  const teamRefs = useRef(new Map<string, HTMLElement>());
  const explorerRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const mobileToolbarRef = useRef<HTMLDivElement>(null);
  const accordionRef = useRef<HTMLDivElement>(null);
  const highlightedYear = highlightedDraftYear(draftAssets, finalizedDraftPositionYears);
  const displayedDraftAssets = draftAssets;
  const normalizedPlayerSearchQuery = normalizePlayerName(playerSearchQuery);
  const teamMetrics = useMemo(() => new Map(teams.map((team) => {
    const entries = rosterEntries.filter((entry) => entry.teamCode === team.code);
    const capSpaces = teamCapSpaces(entries, capSeasonName, countTeamOptions);
    return [team.code, {
      currentCap: capSpaces[0],
    }];
  })), [capSeasonName, countTeamOptions, rosterEntries, teams]);
  const capScaleMinimum = useMemo(() => {
    const capValues = [...teamMetrics.values()].map((metrics) => metrics.currentCap);
    return capValues.length ? 1000 - Math.max(...capValues) : 0;
  }, [teamMetrics]);
  const displayedTeams = useMemo(() => teams
    .slice()
    .sort((left, right) => {
      const leftMetrics = teamMetrics.get(left.code)!;
      const rightMetrics = teamMetrics.get(right.code)!;
      if (teamSort === "cap_desc") return rightMetrics.currentCap - leftMetrics.currentCap || left.name.localeCompare(right.name, "it");
      return left.name.localeCompare(right.name, "it");
    }), [teamMetrics, teamSort, teams]);
  const playerSearchMatches = useMemo(() => {
    return teamPlayerSearchMatches({
      query: normalizedPlayerSearchQuery,
      rosterEntries,
      qualifyingOfferRights,
      includeQualifyingOffers: showQualifyingOffers,
    });
  }, [normalizedPlayerSearchQuery, qualifyingOfferRights, rosterEntries, showQualifyingOffers]);

  useEffect(() => {
    if (!initialTeam || !initialPlayerOnTeam) return;
    const frame = window.requestAnimationFrame(() => {
      teamRefs.current.get(initialTeam)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [initialPlayerOnTeam, initialTeam]);

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
    && teams.every((team) => visibleDataSectionKeys.every((section) => openSectionsByTeam[team.code]?.includes(section)));
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
      teams.map((team) => [team.code, [...visibleDataSectionKeys]]),
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

  const toggleDraftSection = (section: DataSectionKey) => {
    setViewDraft((current) => current.includes(section)
      ? current.filter((item) => item !== section)
      : [...current, section]);
  };

  const applyOrder = () => {
    setTeamSort(orderDraft);
    setExplorerDialog(null);
  };

  const applyView = () => {
    const selectedSections = viewDraft.filter((section) => visibleDataSectionKeys.includes(section));
    setSectionsToExpand(selectedSections);
    const visibleTeamCodes = displayedTeams.map((team) => team.code);
    setOpenTeams((current) => [...new Set([...current, ...visibleTeamCodes])]);
    setOpenSectionsByTeam((current) => ({
      ...current,
      ...Object.fromEntries(visibleTeamCodes.map((code) => [code, selectedSections])),
    }));
    setExplorerDialog(null);
  };

  const openPlayerSearch = () => {
    setPlayerSearchQuery("");
    setExplorerDialog("search");
  };

  const focusPlayerTeam = (entry: TeamPlayerSearchMatch) => {
    setExplorerDialog(null);
    setOpenTeams((current) => current.includes(entry.teamCode) ? current : [...current, entry.teamCode]);
    setOpenSectionsByTeam((current) => ({
      ...current,
      [entry.teamCode]: entry.section === "qualifying_offer" ? ["qualifying_offer"] : [...playerSlotSectionKeys],
    }));
    window.requestAnimationFrame(() => teamRefs.current.get(entry.teamCode)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const toggleExplorer = () => {
    const opening = !explorerOpen;
    setExplorerOpen(opening);
    if (!opening || !window.matchMedia("(max-width: 850px)").matches) return;
    window.requestAnimationFrame(() => {
      const explorer = explorerRef.current;
      if (!explorer) return;
      const toolbarHeight = mobileToolbarRef.current?.offsetHeight ?? 0;
      const headerHeight = document.querySelector<HTMLElement>(".site-header")?.offsetHeight ?? 74;
      const destination = explorer.getBoundingClientRect().top + window.scrollY - headerHeight - toolbarHeight;
      window.scrollTo({ top: Math.max(0, destination), behavior: "smooth" });
    });
  };

  return (
    <>
      <div className={`team-accordion-mobile-toolbar ${explorerOpen ? "is-explorer-open" : ""}`} ref={mobileToolbarRef}>
        <button type="button" onClick={toggleRosterOnly} aria-label={rosterOnlyExpanded ? "Minimizza roster" : "Espandi roster"}>
          <span>{rosterOnlyExpanded ? "−" : "+"}</span>
          {rosterOnlyExpanded ? "Min. roster" : "Esp. roster"}
        </button>
        <button type="button" onClick={toggleEverything} aria-label={allExpanded ? "Minimizza tutto" : "Espandi tutto"}>
          <span>{allExpanded ? "−" : "+"}</span>
          {allExpanded ? "Min. tutto" : "Esp. tutto"}
        </button>
        <button type="button" onClick={toggleExplorer} aria-expanded={explorerOpen}>
          <span>{explorerOpen ? "−" : "+"}</span>
          {explorerOpen ? "Chiudi cerca" : "Apri cerca"}
        </button>
      </div>
      <div className={`team-explorer-sticky ${explorerOpen ? "is-explorer-open" : ""}`} ref={explorerRef}>
        <section className={`team-explorer ${explorerOpen ? "is-explorer-open" : "is-explorer-closed"}`}>
          <div className="team-explorer-bar">
            <button className="team-explorer-action" type="button" onClick={openPlayerSearch}>Cerca</button>
            <button className="team-explorer-action" type="button" onClick={() => {
              setOrderDraft(teamSort);
              setExplorerDialog("order");
            }}>Ordina</button>
            <button className="team-explorer-action" type="button" onClick={() => {
              setViewDraft(sectionsToExpand);
              setExplorerDialog("view");
            }}>Apri sezioni</button>
          </div>
        </section>
        <div className={`team-accordion-toolbar ${explorerOpen ? "is-explorer-open" : ""}`} ref={toolbarRef}>
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
        <button className="team-toolbar-explorer-action" type="button" onClick={toggleExplorer} aria-expanded={explorerOpen}>
          <span>{explorerOpen ? "−" : "+"}</span>
          <span>{explorerOpen ? "Chiudi ricerca" : "Apri ricerca"}</span>
        </button>
        </div>
      </div>
      {explorerDialog && (
        <div className="team-explorer-dialog-backdrop" role="presentation" onMouseDown={() => setExplorerDialog(null)}>
          <section className={`team-explorer-dialog ${explorerDialog === "search" ? "team-player-search-dialog" : ""}`} role="dialog" aria-modal="true" aria-labelledby={`team-explorer-${explorerDialog}-title`} onMouseDown={(event) => event.stopPropagation()}>
            {explorerDialog === "search" ? <>
              <header><span>Squadre</span><strong id="team-explorer-search-title">Cerca giocatore</strong></header>
              <div className="team-explorer-dialog-body team-player-search-dialog-body">
                <label className="team-player-search-dialog-input"><span>Nome giocatore</span><input autoFocus value={playerSearchQuery} onChange={(event) => setPlayerSearchQuery(event.target.value)} placeholder="Almeno 3 caratteri..." /></label>
                <div className="team-player-search-results" aria-live="polite">
                  {normalizedPlayerSearchQuery.length < 3 ? <p>Scrivi almeno 3 caratteri.</p>
                    : playerSearchMatches.length ? playerSearchMatches.map((entry) => <button type="button" key={`${entry.teamCode}-${entry.name}-${entry.section}`} onClick={() => focusPlayerTeam(entry)}>
                      <strong>{entry.name}</strong><span className="team-player-search-result-meta"><small>{entry.teamCode}</small><small>{entry.slotLabel}</small></span><i aria-hidden="true">›</i>
                    </button>) : <p>Nessun giocatore o Q.O. corrisponde alla ricerca.</p>}
                </div>
              </div>
              <footer><button className="button secondary" type="button" onClick={() => setExplorerDialog(null)}>Chiudi</button></footer>
            </> : explorerDialog === "order" ? <>
              <header><span>Squadre</span><strong id="team-explorer-order-title">Ordina squadre</strong></header>
              <div className="team-explorer-dialog-body">
                <fieldset className="team-explorer-fieldset team-explorer-order-options">
                  {(["name", "cap_desc"] as TeamSort[]).map((option) => <label key={option}>
                    <input type="radio" name="team-sort" checked={orderDraft === option} onChange={() => setOrderDraft(option)} />
                    {option === "name" ? "Alfabetico" : "Cap libero"}
                  </label>)}
                </fieldset>
              </div>
              <footer><button className="button secondary" type="button" onClick={() => setExplorerDialog(null)}>Annulla</button><button className="button primary" type="button" onClick={applyOrder}>Applica ordine</button></footer>
            </> : <>
              <header><span>Squadre</span><strong id="team-explorer-view-title">Visualizza menu</strong></header>
              <div className="team-explorer-dialog-body">
                <fieldset className="team-explorer-fieldset">
                  <div className="team-explorer-checks">
                    {visibleDataSectionKeys.map((section) => <label key={section}><input type="checkbox" checked={viewDraft.includes(section)} onChange={() => toggleDraftSection(section)} /> {sectionLabels[section]}</label>)}
                  </div>
                </fieldset>
              </div>
              <footer><button className="button secondary" type="button" onClick={() => setExplorerDialog(null)}>Annulla</button><button className="button primary" type="button" onClick={applyView}>Applica</button></footer>
            </>}
          </section>
        </div>
      )}
      <div className={`team-accordion ${explorerOpen ? "explorer-open" : ""}`} ref={accordionRef}>
      {showAuctionCallPanels && (
        <article className={`team-accordion-item recent-auction-calls-item ${recentAuctionCallsOpen ? "open" : ""}`}>
          <button
            className="team-accordion-trigger auction-calls-trigger"
            type="button"
            aria-expanded={recentAuctionCallsOpen}
            onClick={() => setRecentAuctionCallsOpen((current) => !current)}
          >
            <span className="team-accordion-identity">
              <strong>Ultime 10 chiamate</strong>
            </span>
            <i aria-hidden="true">{recentAuctionCallsOpen ? "−" : "+"}</i>
          </button>
          {recentAuctionCallsOpen && recentAuctionCalls.length > 0 && (
            <div className="auction-calls-content">
              <div className="data-table recent-auction-calls-table">
                <div className="data-head"><span>Giocatore</span><span>Ruolo</span><span>Costo</span><span>Squadra</span></div>
                {recentAuctionCalls.map((call) => (
                  <div className="data-row" key={call.id}>
                    <strong>{call.playerName}</strong>
                    <span><i className={`mini-role mini-role-${call.role.toLowerCase()}`}>{call.role}</i></span>
                    <strong className="credit-value">{call.cost}</strong>
                    <strong className="auction-call-team">{call.teamCode}</strong>
                  </div>
                ))}
              </div>
            </div>
          )}
        </article>
      )}
      {showAuctionCallPanels && auctionCalls.length > 0 && (
        <article className={`team-accordion-item auction-calls-item ${auctionCallsOpen ? "open" : ""}`}>
          <button
            className="team-accordion-trigger auction-calls-trigger"
            type="button"
            aria-expanded={auctionCallsOpen}
            onClick={() => setAuctionCallsOpen((current) => !current)}
          >
            <span className="team-accordion-identity">
              <strong>Prossime 30 chiamate</strong>
            </span>
            <i aria-hidden="true">{auctionCallsOpen ? "−" : "+"}</i>
          </button>
          {auctionCallsOpen && (
            <div className="auction-calls-content">
              <PublicPlayerList rows={auctionCalls} showOrder showRealTeam showEligibility />
            </div>
          )}
        </article>
      )}
      {displayedTeams.map((team, index) => {
        const expanded = openTeams.includes(team.code);
        const metrics = teamMetrics.get(team.code)!;
        const capUsage = 1000 - metrics.currentCap;
        const capScale = capScaleMaximum <= capScaleMinimum
          ? (capUsage >= capScaleMaximum ? 1 : 0)
          : Math.max(0, Math.min(1, (capUsage - capScaleMinimum) / (capScaleMaximum - capScaleMinimum)));
        return (
          <article
            className={`team-accordion-item ${expanded ? "open" : ""}`}
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
              <b className={`team-code-badge team-hue-${index % 7}`} aria-label={`Sigla ${team.code}`}>{team.code}</b>
              <b className={`team-code-rail team-hue-${index % 7}`} aria-label={`Sigla ${team.code}`}>
                {[...team.code].map((letter, index) => <span aria-hidden="true" key={`${letter}-${index}`}>{letter}</span>)}
              </b>
              <span className="team-accordion-identity">
                <strong>{team.name}</strong>
                <small>{team.owner}</small>
              </span>
              <CapCurrent value={metrics.currentCap} scale={capScale} />
              <i aria-hidden="true">{expanded ? "−" : "+"}</i>
            </button>
            {expanded && (
              <TeamDetails
                twoWaySlotLimit={twoWaySlotLimit}
                entries={rosterEntries.filter((entry) => entry.teamCode === team.code)}
                assets={displayedDraftAssets.filter((asset) => asset.teamCode === team.code)}
                allDraftAssets={draftAssets}
                rights={qualifyingOfferRights.filter((right) => right.teamCode === team.code)}
                playerList={playerList}
                playerListPublished={playerListPublished}
                inSeason={inSeason}
                futureDpeRosterOverflow={seasonEndOverflowByTeam[team.code] ?? 0}
                duringAuction={showAuctionCallPanels}
                highlightedDraftYear={highlightedYear}
                showQualifyingOffers={showQualifyingOffers}
                capSeasonName={capSeasonName}
                countTeamOptions={countTeamOptions}
                pendingAuctionContracts={pendingAuctionContracts}
                leagueMoment={leagueMoment}
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

function teamCapSpaces(entries: RosterEntry[], capSeasonName: string, countTeamOptions: boolean) {
  const capSeasons = [capSeasonName, followingSeasonName(capSeasonName), followingSeasonName(capSeasonName, 2)];
  return capSeasons.map((seasonName, index) => calculateCapSpace({
    entries: entriesForDpeAdjustedCap(entries, index),
    seasonName,
    optionSeasonName: capSeasonName,
    countTeamOptions,
  }));
}

function CapCurrent({ value, scale }: { value: number; scale: number }) {
  const hue = Math.round(132 - (126 * scale));
  return <span className="team-current-cap" style={{ "--cap-hue": hue } as CSSProperties}>
    <small>Cap libero</small>
    <strong>{value}</strong>
  </span>;
}

function TeamDetails({
  twoWaySlotLimit,
  entries,
  assets,
  allDraftAssets,
  rights,
  playerList,
  playerListPublished,
  inSeason,
  futureDpeRosterOverflow,
  duringAuction,
  showQualifyingOffers,
  capSeasonName,
  countTeamOptions,
  pendingAuctionContracts,
  leagueMoment,
  highlightedDraftYear,
  sort,
  changeSort,
  openSections,
  toggleSection,
}: {
  twoWaySlotLimit?: number;
  entries: RosterEntry[];
  assets: DraftAsset[];
  allDraftAssets: DraftAsset[];
  rights: QualifyingOfferRight[];
  playerList: PlayerListEntry[];
  playerListPublished: boolean;
  inSeason: boolean;
  futureDpeRosterOverflow: number;
  duringAuction: boolean;
  showQualifyingOffers: boolean;
  capSeasonName: string;
  countTeamOptions: boolean;
  pendingAuctionContracts: boolean;
  leagueMoment: LeagueMoment;
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
  const sortedAssets = assets
    .filter((asset) => !isFourthDraftPick(asset, allDraftAssets) || hasVisibleFourthDraftClause(asset))
    .sort(compareDraftAssets);
  const eligibleAssetCount = sortedAssets.filter((asset) => !isFourthDraftPick(asset, allDraftAssets)).length;
  const officialRoles = new Map(playerList.map((player) => [normalizePlayerName(player.name), player.role]));
  const roles = active
    .filter((entry) => entry.slot !== "dpe" || dpeCountsForRoleMinimums(leagueMoment))
    .reduce((counts, entry) => {
      const role = officialRoles.get(normalizePlayerName(entry.name));
      if (role === "G" || role === "A" || role === "C") counts[role] += 1;
      return counts;
    }, { G: 0, A: 0, C: 0 });
  const missingRoles = roleMinimumDeficits(roles);
  const roleMinimumMissing = missingRoles.G > 0 || missingRoles.A > 0 || missingRoles.C > 0;
  const capSeasons = [capSeasonName, followingSeasonName(capSeasonName), followingSeasonName(capSeasonName, 2)];
  const capSpaces = teamCapSpaces(entries, capSeasonName, countTeamOptions);
  return (
    <div className="team-accordion-content">
      {playerListPublished && ((duringAuction && !roleMinimumMissing) || ((duringAuction || inSeason) && roleMinimumMissing)) && (
        <div className={`auction-role-status ${roleMinimumMissing ? "incomplete" : "complete"}`}>
          {roleMinimumMissing
            ? <>Da acquistare: {[missingRoles.G ? `${missingRoles.G} G` : "", missingRoles.A ? `${missingRoles.A} A` : "", missingRoles.C ? `${missingRoles.C} C` : ""].filter(Boolean).join(" - ")}</>
            : <>Minimo giocatori raggiunto</>}
        </div>
      )}
      {dpe.length > 0 && futureDpeRosterOverflow > 0 && (
        <div className="team-future-slot-status">
          DPE: {futureDpeRosterOverflow} slot Roster da liberare
        </div>
      )}
      <div className="team-summary-strip">
        <SummaryValue label="Ruoli" value={`${roles.G} G / ${roles.A} A / ${roles.C} C`} kind="roles" />
        <SummaryValue label={`Cap libero ${capSeasons[1]}`} shortLabel={`Cap ${capSeasons[1].slice(2)}`} value={`${capSpaces[1]}`} />
        <SummaryValue label={`Cap libero ${capSeasons[2]}`} shortLabel={`Cap ${capSeasons[2].slice(2)}`} value={`${capSpaces[2]}`} />
      </div>

      <DataSection tone="roster" label={`Roster (${regular.length}/15)`} expanded={openSections.includes("roster")} onToggle={() => toggleSection("roster")}>
        <SimplePlayerTable entries={regular} seasonName={capSeasonName} leagueMoment={leagueMoment} playerList={playerList} pendingAuctionContracts={pendingAuctionContracts} sort={sort} onSort={changeSort} />
      </DataSection>

      <DataSection tone="two_way" label={`Two-way (${twoWay.length}/${getRosterSlotLimits({ twoWaySlotLimit }).two_way})`} expanded={openSections.includes("two_way")} onToggle={() => toggleSection("two_way")}>
        <SimplePlayerTable entries={twoWay} seasonName={capSeasonName} leagueMoment={leagueMoment} playerList={playerList} pendingAuctionContracts={pendingAuctionContracts} sort={sort} onSort={changeSort} />
      </DataSection>

      <DataSection tone="g_league" label={`G-League (${gLeague.length}/3)`} expanded={openSections.includes("g_league")} onToggle={() => toggleSection("g_league")}>
        <SimplePlayerTable entries={gLeague} seasonName={capSeasonName} leagueMoment={leagueMoment} playerList={playerList} pendingAuctionContracts={pendingAuctionContracts} sort={sort} onSort={changeSort} />
      </DataSection>

      <DataSection tone="dpe" label={`Disabled player exception (${dpe.length})`} expanded={openSections.includes("dpe")} onToggle={() => toggleSection("dpe")}>
        <SimplePlayerTable entries={dpe} seasonName={capSeasonName} leagueMoment={leagueMoment} playerList={playerList} pendingAuctionContracts={pendingAuctionContracts} />
      </DataSection>

      <DataSection tone="draft" label={`Scelte (${eligibleAssetCount})`} expanded={openSections.includes("draft")} onToggle={() => toggleSection("draft")}>
        {sortedAssets.length > 0 && <div className="data-table draft-data-table">
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
        </div>}
      </DataSection>

      <DataSection tone="cut" label={`Tagliati (${cut.length})`} expanded={openSections.includes("cut")} onToggle={() => toggleSection("cut")}>
        <SimplePlayerTable entries={cut} seasonName={capSeasonName} leagueMoment={leagueMoment} playerList={playerList} pendingAuctionContracts={pendingAuctionContracts} cutPlayers />
      </DataSection>

      {showQualifyingOffers && (
        <DataSection tone="qualifying_offer" label={`Qualifying offer (${rights.length})`} expanded={openSections.includes("qualifying_offer")} onToggle={() => toggleSection("qualifying_offer")}>
          {rights.length > 0 && <div className="data-table qo-data-table">
            <div className="data-head"><span>Giocatore</span><span>Ruolo</span><span>Importo</span></div>
            {rights.map((right) => {
              const role = qualifyingOfferDisplayRole(right, playerList, playerListPublished);
              return (
                <div className="data-row" key={right.playerName}>
                  <strong>{right.playerName}</strong>
                  <span><i className={`mini-role mini-role-${role.toLowerCase()}`}>{role}</i></span>
                  <strong className="credit-value">{right.qualifyingAmount}</strong>
                </div>
              );
            })}
          </div>}
        </DataSection>
      )}
    </div>
  );
}

function SummaryValue({ label, shortLabel, value, kind }: { label: string; shortLabel?: string; value: string; kind?: "roles" }) {
  return <div className={`summary-value ${kind ?? ""}`}><span><em className="summary-label-full">{label}</em><em className="summary-label-short">{shortLabel ?? label}</em></span><strong>{value}</strong></div>;
}

function DataSection({
  tone,
  label,
  expanded,
  onToggle,
  children,
}: {
  tone: DataSectionKey;
  label: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className={`accordion-data-section section-${tone} ${expanded ? "open" : ""}`}>
      <button className="accordion-data-section-trigger" type="button" aria-expanded={expanded} onClick={onToggle}>
        <span>{label}</span>
        <i aria-hidden="true">{expanded ? "−" : "+"}</i>
      </button>
      {expanded && children}
    </section>
  );
}

/*
function SortButton({ label, sortKey, sort, onClick }: { label: string; sortKey: SortKey; sort: SortState; onClick: (key: SortKey) => void }) {
  const active = sort.key === sortKey;
  return <button type="button" onClick={() => onClick(sortKey)}>{label}{active ? (sort.direction === "asc" ? " ↑" : " ↓") : ""}</button>;
}

*/
function RosterSortButton({ label, sortKey, sort, onClick }: { label: string; sortKey: SortKey; sort: SortState; onClick: (key: SortKey) => void }) {
  const active = sort.key === sortKey;
  return <button type="button" onClick={() => onClick(sortKey)}><span>{label}</span>{active && <i className="sort-direction" aria-hidden="true">{sort.direction === "asc" ? "↑" : "↓"}</i>}</button>;
}

function SimplePlayerTable({
  entries,
  seasonName,
  leagueMoment,
  playerList,
  pendingAuctionContracts,
  cutPlayers = false,
  sort,
  onSort,
}: {
  entries: RosterEntry[];
  seasonName: string;
  leagueMoment: LeagueMoment;
  playerList: PlayerListEntry[];
  pendingAuctionContracts: boolean;
  cutPlayers?: boolean;
  sort?: SortState;
  onSort?: (key: SortKey) => void;
}) {
  if (!entries.length) return null;
  const sortedEntries = sort
    ? sortPlayerEntries(entries, seasonName, sort)
    : [...entries].sort((left, right) => (
      right.cost - left.cost
      || left.name.localeCompare(right.name, "it")
    ));
  return (
    <div className={`data-table roster-data-table ${cutPlayers ? "cut-player-table" : ""}`}>
      <div className="data-head">
        {sort && onSort && !cutPlayers ? <>
          <RosterSortButton label="Giocatore" sortKey="name" sort={sort} onClick={onSort} />
          <RosterSortButton label="Ruolo" sortKey="role" sort={sort} onClick={onSort} />
          <RosterSortButton label="Scadenza" sortKey="contract" sort={sort} onClick={onSort} />
          <RosterSortButton label="Costo" sortKey="cost" sort={sort} onClick={onSort} />
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
        leagueMoment={leagueMoment}
        player={playerList.find((item) => normalizePlayerName(item.name) === normalizePlayerName(entry.name))}
        pendingAuctionContract={pendingAuctionContracts && isPendingAuctionContractForDisplay(entry, seasonName)}
        cutPlayer={cutPlayers}
        key={`${entry.name}-${entry.state}`}
      />)}
    </div>
  );
}

function PlayerDataRow({
  entry,
  seasonName,
  leagueMoment,
  player,
  pendingAuctionContract,
  cutPlayer = false,
  highlighted = false,
}: {
  entry: RosterEntry;
  seasonName: string;
  leagueMoment: LeagueMoment;
  player?: PlayerListEntry;
  pendingAuctionContract: boolean;
  cutPlayer?: boolean;
  highlighted?: boolean;
}) {
  return (
    <div className={`data-row ${pendingAuctionContract ? "pending-auction-contract" : ""} ${highlighted ? "player-search-match" : ""}`}>
      <strong className="roster-player-identity">
        <span>{entry.name}</span>
        {shouldShowDpeNoReintegrationBadge(entry, leagueMoment) && (
          <i className="player-flag roster-no-reintegration-flag" aria-label="Reintegro anticipato non consentito">NO R.</i>
        )}
        {shouldShowDpeBadge(entry, seasonName, leagueMoment) && (
          <i
            className="player-flag roster-dpe-flag"
            aria-label="Reintegrato automaticamente dalla DPE a fine stagione"
          >DPE</i>
        )}
        {entry.state === "active" && entry.playoffTeamOptionUsedSeason && (
          <i className="player-flag roster-playoff-flag" aria-label="Utilizzato nei playoff">PLAYOFF</i>
        )}
        {shouldShowScheduledCutBadge(entry, seasonName, leagueMoment) && (
          <i
            className="player-flag roster-scheduled-cut-flag"
            aria-label="Taglio programmato"
          >T.P.</i>
        )}
      </strong>
      <span>{cutPlayer
        ? isStretchUnavailable(entry) ? <i className="stretch-status applied">X</i> : "—"
        : entry.role ? <i className={`mini-role mini-role-${entry.role.toLowerCase()}`}>{entry.role}</i> : "X"}</span>
      <span><ContractDisplay
        value={entry.contract}
        pendingAuctionContract={pendingAuctionContract}
        teamOptionEligible={Boolean(
          entry.auctionAcquisition !== "restricted_free_agent"
          && (player?.rookie || (player?.under23 && (entry.auctionPrice ?? entry.cost) <= 15)),
        )}
        seasonName={seasonName}
      /></span>
      <span><strong className="credit-value">{entry.cost}</strong></span>
    </div>
  );
}

function normalizePlayerName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("it-IT");
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

function ContractDisplay({
  value,
  pendingAuctionContract,
  teamOptionEligible,
  seasonName,
}: {
  value: string;
  pendingAuctionContract: boolean;
  teamOptionEligible: boolean;
  seasonName: string;
}) {
  if (pendingAuctionContract) {
    const pendingMarkers = [
      ...(teamOptionEligible ? [{ label: "T.O.", kind: "pending-option" }] : []),
    ];
    return <span className="contract-group">
      <i className="contract-value contract-pending" aria-label="Contratto da assegnare">?</i>
      {pendingMarkers.map((marker) => <i
        className={`contract-marker contract-marker-${marker.kind}`}
        key={marker.kind}
        aria-label={marker.kind === "pending-option" ? "Idoneo alla team option" : undefined}
      >{marker.label}</i>)}
    </span>;
  }
  if (!value) return <i className="contract-value">—</i>;
  if (value === "T.O.") return <i className="contract-value contract-team-option">T.O.</i>;
  if (isRookieExtensionDecisionDue({ contract: value }, seasonName)) {
    return <i className="contract-value contract-team-option contract-rookie-extension">R.E.</i>;
  }
  const year = value.match(/\d{2}/)?.[0] ?? value;
  const expiryTone = contractExpiryTone(year, seasonName);
  const markers = [
    ...(value.includes("(E)") ? [{ label: "EXT", kind: "ext" }] : []),
    ...(value.includes("(Q)") ? [{ label: "→ Q.O.", kind: "qo" }] : []),
    ...(value.includes("+ R.E.") ? [{ label: "+ R.E.", kind: "re" }] : []),
    ...(value.includes("+ T.O.") ? [{ label: "+ T.O.", kind: "team-option" }] : []),
  ];
  return (
    <span className="contract-group">
      <i className={`contract-value contract-expiry contract-expiry-${expiryTone}`}>{year}</i>
      {markers.map((marker) => <i
        className={`contract-marker contract-marker-${marker.kind}`}
        key={marker.kind}
        aria-label={marker.kind === "re" ? "Rookie extension applicabile dopo la stagione indicata" : undefined}
      >{marker.label}</i>)}
    </span>
  );
}

function contractExpiryTone(year: string, seasonName: string) {
  const contractYear = Number(year);
  const currentYear = Number(seasonName.match(/\/(\d{2})$/)?.[1]);
  if (!Number.isFinite(contractYear) || !Number.isFinite(currentYear)) return "later";
  const distance = (contractYear - currentYear + 100) % 100;
  return distance === 0 ? "current" : distance === 1 ? "next" : "later";
}
