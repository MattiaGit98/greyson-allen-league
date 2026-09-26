"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { DraftAsset, PlayerListEntry, QualifyingOfferRight, RosterEntry, TeamSummary } from "@/lib/league-types";
import { calculateCapSpace, contractCostForSeason, followingSeasonName } from "@/lib/season-time";
import { entriesForDpeAdjustedCap, shouldShowDpeBadge } from "@/lib/dpe-rules";
import type { LeagueMoment } from "@/lib/league-moments";
import { isStretchUnavailable } from "@/lib/stretch-provision";
import { highlightedDraftYear } from "@/lib/draft-positions";
import { isFourthDraftPick } from "@/lib/future-draft-picks";
import { sortPlayerEntries, type RosterSortKey as SortKey, type RosterSortState as SortState } from "@/lib/roster-display-sort";

const dataSectionKeys = ["roster", "two_way", "g_league", "dpe", "draft", "cut", "qualifying_offer"] as const;
type DataSectionKey = (typeof dataSectionKeys)[number];
type OpenSectionsByTeam = Record<string, DataSectionKey[]>;
type TeamSort = "name" | "cap_desc" | "roster_space";
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
  teams,
  rosterEntries,
  draftAssets,
  finalizedDraftPositionYears,
  qualifyingOfferRights,
  playerList,
  playerListPublished,
  inSeason,
  initialTeam,
  initialPlayer,
  showQualifyingOffers,
  capSeasonName,
  countTeamOptions,
  pendingAuctionContracts,
  capScaleMaximum,
  leagueMoment,
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
  initialPlayer?: string;
  showQualifyingOffers: boolean;
  capSeasonName: string;
  countTeamOptions: boolean;
  pendingAuctionContracts: boolean;
  capScaleMaximum: number;
  leagueMoment: LeagueMoment;
}) {
  const initialPlayerOnTeam = Boolean(initialTeam && initialPlayer && rosterEntries.some((entry) => (
    entry.teamCode === initialTeam
    && entry.state === "active"
    && normalizePlayerName(entry.name) === normalizePlayerName(initialPlayer)
  )));
  const [openTeams, setOpenTeams] = useState<string[]>(
    initialTeam && teams.some((team) => team.code === initialTeam) ? [initialTeam] : [],
  );
  const [openSectionsByTeam, setOpenSectionsByTeam] = useState<OpenSectionsByTeam>(() => (
    initialTeam && teams.some((team) => team.code === initialTeam)
      ? { [initialTeam]: initialPlayerOnTeam ? [...playerSlotSectionKeys] : ["roster"] }
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
    const active = entries.filter((entry) => entry.state === "active");
    return [team.code, {
      currentCap: capSpaces[0],
      rosterSpace: 15 - active.filter((entry) => entry.slot === "regular").length,
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
      if (teamSort === "roster_space") return rightMetrics.rosterSpace - leftMetrics.rosterSpace || left.name.localeCompare(right.name, "it");
      return left.name.localeCompare(right.name, "it");
    }), [teamMetrics, teamSort, teams]);
  const playerSearchMatches = useMemo(() => {
    if (normalizedPlayerSearchQuery.length < 3) return [];
    return rosterEntries
      .filter((entry) => entry.state === "active" && normalizePlayerName(entry.name).includes(normalizedPlayerSearchQuery))
      .slice()
      .sort((left, right) => left.name.localeCompare(right.name, "it") || left.teamCode.localeCompare(right.teamCode));
  }, [normalizedPlayerSearchQuery, rosterEntries]);

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
    setSectionsToExpand(viewDraft);
    const visibleTeamCodes = displayedTeams.map((team) => team.code);
    setOpenTeams((current) => [...new Set([...current, ...visibleTeamCodes])]);
    setOpenSectionsByTeam((current) => ({
      ...current,
      ...Object.fromEntries(visibleTeamCodes.map((code) => [code, viewDraft])),
    }));
    setExplorerDialog(null);
  };

  const openPlayerSearch = () => {
    setPlayerSearchQuery("");
    setExplorerDialog("search");
  };

  const focusPlayerTeam = (entry: RosterEntry) => {
    setExplorerDialog(null);
    setOpenTeams((current) => current.includes(entry.teamCode) ? current : [...current, entry.teamCode]);
    setOpenSectionsByTeam((current) => ({ ...current, [entry.teamCode]: [...playerSlotSectionKeys] }));
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
                    : playerSearchMatches.length ? playerSearchMatches.map((entry) => <button type="button" key={`${entry.teamCode}-${entry.name}-${entry.slot}`} onClick={() => focusPlayerTeam(entry)}>
                      <strong>{entry.name}</strong><span className="team-player-search-result-meta"><small>{entry.teamCode}</small><small>{slotLabel(entry.slot)}</small></span><i aria-hidden="true">›</i>
                    </button>) : <p>Nessun giocatore assegnato corrisponde alla ricerca.</p>}
                </div>
              </div>
              <footer><button className="button secondary" type="button" onClick={() => setExplorerDialog(null)}>Chiudi</button></footer>
            </> : explorerDialog === "order" ? <>
              <header><span>Squadre</span><strong id="team-explorer-order-title">Ordina squadre</strong></header>
              <div className="team-explorer-dialog-body">
                <fieldset className="team-explorer-fieldset team-explorer-order-options">
                  {(["name", "cap_desc", "roster_space"] as TeamSort[]).map((option) => <label key={option}>
                    <input type="radio" name="team-sort" checked={orderDraft === option} onChange={() => setOrderDraft(option)} />
                    {option === "name" ? "Alfabetico" : option === "cap_desc" ? "Cap libero" : "Spazio roster"}
                  </label>)}
                </fieldset>
              </div>
              <footer><button className="button secondary" type="button" onClick={() => setExplorerDialog(null)}>Annulla</button><button className="button primary" type="button" onClick={applyOrder}>Applica ordine</button></footer>
            </> : <>
              <header><span>Squadre</span><strong id="team-explorer-view-title">Visualizza menu</strong></header>
              <div className="team-explorer-dialog-body">
                <fieldset className="team-explorer-fieldset">
                  <div className="team-explorer-checks">
                    {dataSectionKeys.map((section) => <label key={section}><input type="checkbox" checked={viewDraft.includes(section)} onChange={() => toggleDraftSection(section)} /> {sectionLabels[section]}</label>)}
                  </div>
                </fieldset>
              </div>
              <footer><button className="button secondary" type="button" onClick={() => setExplorerDialog(null)}>Annulla</button><button className="button primary" type="button" onClick={applyView}>Applica</button></footer>
            </>}
          </section>
        </div>
      )}
      <div className={`team-accordion ${explorerOpen ? "explorer-open" : ""}`} ref={accordionRef}>
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

function slotLabel(slot: RosterEntry["slot"]) {
  if (slot === "two_way") return "Two-way";
  if (slot === "g_league") return "G-League";
  if (slot === "dpe") return "DPE";
  return "Roster";
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
  leagueMoment,
  highlightedDraftYear,
  sort,
  changeSort,
  openSections,
  toggleSection,
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
        <SummaryValue label={`Cap libero ${capSeasons[1]}`} shortLabel={`Cap ${capSeasons[1].slice(2)}`} value={`${capSpaces[1]}`} />
        <SummaryValue label={`Cap libero ${capSeasons[2]}`} shortLabel={`Cap ${capSeasons[2].slice(2)}`} value={`${capSpaces[2]}`} />
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

      <DataSection tone="roster" label={`Roster (${regular.length}/15)`} expanded={openSections.includes("roster")} onToggle={() => toggleSection("roster")}>
        <SimplePlayerTable entries={regular} seasonName={capSeasonName} leagueMoment={leagueMoment} playerList={playerList} pendingAuctionContracts={pendingAuctionContracts} sort={sort} onSort={changeSort} />
      </DataSection>

      <DataSection tone="two_way" label={`Two-way (${twoWay.length}/2)`} expanded={openSections.includes("two_way")} onToggle={() => toggleSection("two_way")}>
        <SimplePlayerTable entries={twoWay} seasonName={capSeasonName} leagueMoment={leagueMoment} playerList={playerList} pendingAuctionContracts={pendingAuctionContracts} sort={sort} onSort={changeSort} />
      </DataSection>

      <DataSection tone="g_league" label={`G-League (${gLeague.length}/3)`} expanded={openSections.includes("g_league")} onToggle={() => toggleSection("g_league")}>
        <SimplePlayerTable entries={gLeague} seasonName={capSeasonName} leagueMoment={leagueMoment} playerList={playerList} pendingAuctionContracts={pendingAuctionContracts} sort={sort} onSort={changeSort} />
      </DataSection>

      <DataSection tone="dpe" label={`Disabled player exception (${dpe.length}/1)`} expanded={openSections.includes("dpe")} onToggle={() => toggleSection("dpe")}>
        <SimplePlayerTable entries={dpe} seasonName={capSeasonName} leagueMoment={leagueMoment} playerList={playerList} pendingAuctionContracts={pendingAuctionContracts} />
      </DataSection>

      <DataSection tone="draft" label={`Scelte (${eligibleAssetCount})`} expanded={openSections.includes("draft")} onToggle={() => toggleSection("draft")}>
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

      <DataSection tone="cut" label={`Tagliati (${cut.length})`} expanded={openSections.includes("cut")} onToggle={() => toggleSection("cut")}>
        <SimplePlayerTable entries={cut} seasonName={capSeasonName} leagueMoment={leagueMoment} playerList={playerList} pendingAuctionContracts={pendingAuctionContracts} cutPlayers />
      </DataSection>

      {showQualifyingOffers && (
        <DataSection tone="qualifying_offer" label={`Qualifying offer (${rights.length})`} expanded={openSections.includes("qualifying_offer")} onToggle={() => toggleSection("qualifying_offer")}>
          <div className="data-table qo-data-table">
            <div className="data-head"><span>Giocatore</span><span>Importo</span></div>
            {rights.map((right) => (
              <div className="data-row" key={right.playerName}><strong>{right.playerName}</strong><strong className="credit-value">{right.qualifyingAmount}</strong></div>
            ))}
            {!rights.length && <EmptyRow />}
          </div>
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
        pendingAuctionContract={pendingAuctionContracts && isPendingAuctionContract(entry, seasonName)}
        cutPlayer={cutPlayers}
        key={`${entry.name}-${entry.state}`}
      />)}
      {!sortedEntries.length && <EmptyRow />}
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
        {shouldShowDpeBadge(entry, seasonName, leagueMoment) && (
          <i
            className="player-flag roster-dpe-flag"
            title="DPE esercitata: il rilascio per meno della metà delle partite resta bloccato fino all’Inizio asta successivo."
          >DPE</i>
        )}
      </strong>
      <span>{cutPlayer
        ? isStretchUnavailable(entry) ? <i className="stretch-status applied">X</i> : "—"
        : entry.role ? <i className={`mini-role mini-role-${entry.role.toLowerCase()}`}>{entry.role}</i> : "X"}</span>
      <span><ContractDisplay
        value={entry.contract}
        auctionAcquisition={entry.auctionAcquisition}
        pendingAuctionContract={pendingAuctionContract}
        teamOptionEligible={Boolean(player?.rookie || (player?.under23 && (entry.auctionPrice ?? entry.cost) <= 15))}
        seasonName={seasonName}
      /></span>
      <span><strong className="credit-value">{contractCostForSeason(entry, seasonName)}</strong></span>
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
  pendingAuctionContract,
  teamOptionEligible,
  seasonName,
}: Pick<RosterEntry, "auctionAcquisition"> & {
  value: string;
  pendingAuctionContract: boolean;
  teamOptionEligible: boolean;
  seasonName: string;
}) {
  if (pendingAuctionContract) {
    const pendingMarkers = [
      ...(auctionAcquisition === "restricted_free_agent" ? [{ label: "RFA", kind: "rfa" }] : []),
      ...(auctionAcquisition === "qualifying_offer" ? [{ label: "Q.O.", kind: "acquisition-qo" }] : []),
      ...(teamOptionEligible ? [{ label: "T.O.", kind: "pending-option" }] : []),
    ];
    return <span className="contract-group">
      <i className="contract-value contract-pending" title="Contratto da assegnare">?</i>
      {pendingMarkers.map((marker) => <i
        className={`contract-marker contract-marker-${marker.kind}`}
        key={marker.kind}
        title={marker.kind === "pending-option" ? "Idoneo alla team option" : undefined}
      >{marker.label}</i>)}
    </span>;
  }
  if (!value) return <i className="contract-value">—</i>;
  if (value === "T.O.") return <i className="contract-value contract-team-option">T.O.</i>;
  const year = value.match(/\d{2}/)?.[0] ?? value;
  const expiryTone = contractExpiryTone(year, seasonName);
  const markers = [
    ...(value.includes("(E)") ? [{ label: "+ EXT", kind: "ext" }] : []),
    ...(value.includes("(Q)") ? [{ label: "+ Q.O.", kind: "qo" }] : []),
    ...(value.includes("+ R.E.") ? [{ label: "+ R.E.", kind: "re" }] : []),
    ...(auctionAcquisition === "qualifying_offer" ? [{ label: "ACQ. Q.O.", kind: "acquisition-qo" }] : []),
    ...(auctionAcquisition === "restricted_free_agent" ? [{ label: "RFA", kind: "rfa" }] : []),
  ];
  return (
    <span className="contract-group">
      <i className={`contract-value contract-expiry contract-expiry-${expiryTone}`}>{year}</i>
      {markers.map((marker) => <i
        className={`contract-marker contract-marker-${marker.kind}`}
        key={marker.kind}
        title={marker.kind === "re"
          ? "Rookie extension applicabile dopo la stagione indicata"
          : marker.kind === "acquisition-qo"
            ? "Acquistato tramite Q.O. accettata"
            : marker.kind === "rfa" ? "Acquistato come restricted free agent" : undefined}
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
