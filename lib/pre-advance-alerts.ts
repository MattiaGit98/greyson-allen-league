import { buildRoleMinimumAlerts } from "./admin-alerts";
import { calculateLeagueAdvance } from "./league-advance";
import type { EditableLeagueState } from "./league-state";
import {
  hasReachedMoment,
  leagueMomentLabels,
  nextLeagueTransition,
  teamOptionsAreResolved,
  type LeagueMoment,
  type LeagueTransition,
} from "./league-moments";
import { calculateCapSpace, followingSeasonName } from "./season-time";
import { slotEligibilityErrors } from "./slot-eligibility";
import {
  applyPostAuctionContractDrafts,
  missingPostAuctionContractDrafts,
  type PostAuctionContractDraft,
} from "./post-auction-contracts";
import { isAnnualTeamOptionContract, isRookieExtensionDecisionDue } from "./team-option-contract";

export type PreAdvanceAlertTone = "blocker" | "warning" | "info";

export type PreAdvanceAlert = {
  id: string;
  tone: PreAdvanceAlertTone;
  title: string;
  message: string;
  items?: string[];
  article?: string;
  href?: string;
  actionLabel?: string;
};

export type PreAdvanceChecklist = {
  transition: LeagueTransition;
  transitionLabel: string;
  alerts: PreAdvanceAlert[];
  blockerCount: number;
};

const pendingContractValues = new Set(["", "-", "PENDING", "DA ASSEGNARE"]);

export function buildPreAdvanceChecklist(input: {
  currentMoment: LeagueMoment;
  seasonName: string;
  state: EditableLeagueState;
  currentHistorySeason?: string | null;
  contractDrafts?: PostAuctionContractDraft[];
}): PreAdvanceChecklist {
  const { currentMoment, seasonName, state } = input;
  const contractDrafts = input.contractDrafts ?? [];
  const transition = nextLeagueTransition(currentMoment);
  const alerts: PreAdvanceAlert[] = [];
  const add = (alert: PreAdvanceAlert) => {
    if (!alerts.some((item) => item.id === alert.id)) alerts.push(alert);
  };

  addStructuralAlerts(add, currentMoment, seasonName, state);

  if (transition === "team_option_deadline") {
    const pendingOptions = state.rosterEntries.filter((entry) => isPendingRookieContract(entry, seasonName));
    if (pendingOptions.length) {
      add({
        id: "pending-team-options",
        tone: "blocker",
        title: `${pendingOptions.length} contratti da rookie da risolvere`,
        message: "Ogni T.O. e ogni R.E. in scadenza deve avere una decisione esplicita prima di poter avanzare.",
        items: groupPlayerEntries(pendingOptions),
        article: "Art. 7(b-c)",
        href: "/admin/team-option",
        actionLabel: "Gestisci i contratti da rookie",
      });
    }

    if (state.playerListStatus !== "published") {
      add({
        id: "official-list-upcoming-draft",
        tone: "info",
        title: "Listone ufficiale non ancora pubblicato",
        message: "Dopo la scadenza delle T.O. il Draft sarà accessibile, ma può svolgersi soltanto dopo l’uscita del listone Dunkest.",
        article: "Art. 4(a); Art. 6(a)",
        href: "/admin/listone",
        actionLabel: "Vai al listone",
      });
    }
  }

  if (transition === "auction_start") {
    addDraftPreparationAlerts(add, seasonName, state);
    const draftYear = seasonStartYear(seasonName);
    const remainingPicks = draftYear === null ? [] : state.draftAssets.filter((asset) => asset.year === draftYear);
    if (remainingPicks.length) {
      add({
        id: "draft-required-before-auction",
        tone: "blocker",
        title: `Draft ${draftYear} non completato`,
        message: `Restano ${remainingPicks.length} scelte da assegnare prima di poter iniziare l’asta.`,
        article: "Art. 6(a)",
        href: "/admin/draft",
        actionLabel: "Completa il draft",
      });
    }
  }

  if (transition === "auction_completed") {
    if (state.playerListStatus !== "published") {
      add({
        id: "official-list-required",
        tone: "blocker",
        title: "Listone ufficiale non pubblicato",
        message: "Il Draft e l’asta richiedono il listone Dunkest ufficiale.",
        article: "Art. 4(a); Art. 6(a)",
        href: "/admin/listone",
        actionLabel: "Pubblica il listone",
      });
    }

    const draftYear = seasonStartYear(seasonName);
    const remainingPicks = draftYear === null ? [] : state.draftAssets.filter((asset) => asset.year === draftYear);
    if (remainingPicks.length) {
      add({
        id: "draft-not-completed",
        tone: "blocker",
        title: `Draft ${draftYear} non completato`,
        message: `Restano ${remainingPicks.length} scelte da assegnare prima di poter considerare conclusa l’asta.`,
        article: "Art. 6(a)",
        href: "/admin/draft",
        actionLabel: "Continua il draft",
      });
    }

    const incompleteRosters = state.teams.flatMap((team) => {
      const regular = state.rosterEntries.filter((entry) => (
        entry.teamCode === team.code && entry.state === "active" && entry.slot === "regular"
      )).length;
      return regular < 13 ? [`${team.code}: ${regular}/13 slot roster occupati`] : [];
    });
    if (incompleteRosters.length) {
      add({
        id: "auction-rosters-incomplete",
        tone: "blocker",
        title: `${incompleteRosters.length} squadre sotto il minimo d’asta`,
        message: "Per concludere l’asta ogni squadra deve avere almeno i 13 giocatori obbligatori negli slot roster.",
        items: incompleteRosters,
        article: "Art. 4(c)",
        href: "/admin/asta",
        actionLabel: "Completa i roster",
      });
    }

    addRoleMinimumAlert(add, state, "/admin/asta", "Controlla i ruoli prima di iniziare la stagione", "blocker");
  }

  if (transition === "contract_delivery") {
    if (state.playerListStatus !== "published") {
      add({
        id: "official-list-contract-delivery",
        tone: "blocker",
        title: "Listone ufficiale non pubblicato",
        message: "La free agency può aprirsi soltanto con il listone Dunkest ufficiale disponibile.",
        article: "Art. 5(a-b)",
        href: "/admin/listone",
        actionLabel: "Pubblica il listone",
      });
    }
    const pendingContracts = missingPostAuctionContractDrafts(state, contractDrafts, seasonName);
    if (pendingContracts.length) {
      add({
        id: "pending-contracts",
        tone: "blocker",
        title: `${pendingContracts.length} contratti ancora da assegnare`,
        message: "Tutti i giocatori acquistati all’ultima asta devono avere una bozza completa prima della consegna.",
        items: groupPlayerEntries(pendingContracts),
        article: "Art. 3(b-c)",
        href: "/admin/contratti",
        actionLabel: "Assegna i contratti",
      });
    }

    let deliveryState = state;
    try {
      deliveryState = applyPostAuctionContractDrafts({
        state,
        drafts: contractDrafts,
        seasonName,
        requireComplete: false,
      });
    } catch (error) {
      add({
        id: "invalid-contract-drafts",
        tone: "blocker",
        title: "Bozze dei contratti non valide",
        message: error instanceof Error ? error.message : "Correggi le bozze prima di avanzare.",
        href: "/admin/contratti",
        actionLabel: "Correggi le bozze",
      });
    }

    const invalidSpecialSlots = deliveryState.rosterEntries.filter((entry) => (
      entry.state === "active"
      && (entry.slot === "two_way" || entry.slot === "g_league")
      && slotEligibilityErrors(entry, entry.slot, seasonName).length > 0
    ));
    if (invalidSpecialSlots.length) {
      add({
        id: "invalid-special-slot-contracts",
        tone: "blocker",
        title: `${invalidSpecialSlots.length} giocatori non idonei negli slot speciali`,
        message: "Alla consegna dei contratti, Two-way e G-League devono rispettare categorie e soglie previste.",
        items: groupPlayerEntries(invalidSpecialSlots),
        article: "Art. 7(a); Art. 11(a-e)",
        href: "/admin/contratti",
        actionLabel: "Correggi contratti e slot",
      });
    }

    const freeOneCreditOptions = deliveryState.rosterEntries.filter((entry) => (
      entry.state === "active" && isAnnualTeamOptionContract(entry) && entry.cost === 1
    ));
    if (freeOneCreditOptions.length) {
      add({
        id: "one-credit-options-guarantee",
        tone: "info",
        title: `${freeOneCreditOptions.length} T.O. da 1 credito stanno per diventare garantite`,
        message: "Dopo la consegna dei contratti non potranno più essere rimosse senza peso sul cap in base a questa eccezione.",
        items: groupPlayerEntries(freeOneCreditOptions),
        article: "Art. 10(g)",
        href: "/admin/altre-operazioni",
        actionLabel: "Controlla i giocatori",
      });
    }

    addRoleMinimumAlert(add, deliveryState, "/admin/contratti", "Controlla i minimi di ruolo");
    add({
      id: "special-slot-window-closing",
      tone: "info",
      title: "Si chiude la finestra speciale per gli spostamenti di slot",
      message: "Dopo la consegna non sarà più possibile retrocedere liberamente dal roster a Two-way/G-League o da Two-way a G-League.",
      article: "Art. 11(c-e, j)",
      href: "/admin/slot",
      actionLabel: "Controlla gli slot",
    });
  }

  if (transition === "trade_deadline") {
    addRoleMinimumAlert(add, state, "/admin/free-agent", "Controlla i minimi di ruolo");
    add({
      id: "trade-deadline-closures",
      tone: "info",
      title: "Il prossimo avanzamento chiude scambi e nuove DPE",
      message: "Dopo la trade deadline si chiudono anche i rilasci gratuiti per squalifica o cause giudiziarie; i nuovi free agent avranno un annuale senza Q.O.",
      article: "Art. 5(e-f); Art. 10(d); Art. 12(a); Art. 13(a)",
      href: "/admin/scambi",
      actionLabel: "Controlla gli scambi",
    });
  }

  if (transition === "buyout_end") {
    addRoleMinimumAlert(add, state, "/admin/free-agent", "Controlla i minimi di ruolo");
    add({
      id: "buyout-window-closing",
      tone: "info",
      title: "Sta per terminare la finestra dei buyout",
      message: "Dopo il prossimo avanzamento non sarà più possibile applicare nuovi buyout.",
      article: "Art. 10(e); Art. 9(g)",
      href: "/admin/altre-operazioni",
      actionLabel: "Controlla i buyout",
    });
  }

  if (transition === "free_agency_end") {
    addRoleMinimumAlert(add, state, "/admin/free-agent", "Controlla i minimi di ruolo");
    add({
      id: "free-agency-closures",
      tone: "info",
      title: "Stanno per chiudersi free agency e operazioni collegate",
      message: "Termineranno free agency, rilasci gratuiti e possibilità di reintegro anticipato dalla DPE.",
      article: "Art. 5(a); Art. 10(c, f); Art. 12(d)",
      href: "/admin/free-agent",
      actionLabel: "Controlla la free agency",
    });
  }

  if (transition === "season_end") {
    addRoleMinimumAlert(add, state, "/admin/free-agent", "Controlla i minimi di ruolo fino al termine della stagione");
    const playoffOptionCandidates = state.rosterEntries.filter((entry) => (
      entry.state === "active"
      && entry.slot === "g_league"
      && isAnnualTeamOptionContract(entry)
      && !entry.playoffTeamOptionPromotionSeason
    ));
    if (playoffOptionCandidates.length) {
      add({
        id: "playoff-team-option-verification",
        tone: "warning",
        title: `${playoffOptionCandidates.length} T.O. in G-League da verificare prima della fine della stagione`,
        message: "Se uno di questi giocatori è stato utilizzato attivamente nei playoff, la T.O. va esercitata prima dell'avanzamento.",
        items: groupPlayerEntries(playoffOptionCandidates),
        href: "/admin/team-option",
        actionLabel: "Controlla le team option playoff",
      });
    }
    if (input.currentHistorySeason && input.currentHistorySeason !== seasonName) {
      add({
        id: "history-season-mismatch",
        tone: "blocker",
        title: "Classifiche pronte per l’archivio riferite a un’altra annata",
        message: `I dati correnti indicano ${input.currentHistorySeason}, mentre la stagione attiva è ${seasonName}.`,
        article: "Art. 1",
        href: "/admin/contenuti",
        actionLabel: "Controlla classifiche e tabelloni",
      });
    }

    try {
      const advance = calculateLeagueAdvance({
        seasonName,
        rosterEntries: state.rosterEntries,
        qualifyingOfferRights: state.qualifyingOfferRights,
        playerList: state.playerList,
      });
      const rosterMoveIssues = state.teams.flatMap((team) => {
        const playoffOptionPlayers = advance.promotedPlayoffTeamOptionPlayers
          .filter((player) => player.teamCode === team.code)
          .map((player) => `${player.playerName} (T.O. playoff)`);
        const dpePlayers = advance.reintegratedDpePlayers
          .filter((player) => player.teamCode === team.code)
          .map((player) => `${player.playerName} (DPE)`);
        const players = [...playoffOptionPlayers, ...dpePlayers];
        if (!players.length) return [];
        const regularUsed = advance.rosterEntries.filter((entry) => (
          entry.teamCode === team.code && entry.state === "active" && entry.slot === "regular"
        )).length;
        const overflow = Math.max(0, regularUsed - 15);
        return overflow ? [{ teamCode: team.code, players, overflow }] : [];
      });
      if (rosterMoveIssues.length) {
        const totalShortfall = rosterMoveIssues.reduce((total, issue) => total + issue.overflow, 0);
        add({
          id: "blocked-offseason-roster-moves",
          tone: "blocker",
          title: `${totalShortfall} slot roster mancanti all’inizio dell’offseason`,
          message: "All’inizio dell’offseason vengono promosse le T.O. esercitate per utilizzo nei playoff e vengono reintegrate le DPE.",
          items: rosterMoveIssues.map((issue) => (
            `${issue.teamCode}: ${issue.players.join(", ")} · ${issue.overflow} slot mancanti`
          )),
          article: "Art. 11(i, k); Art. 12(c)",
          href: "/admin/altre-operazioni",
          actionLabel: "Libera gli slot necessari",
        });
      } else {
        if (advance.promotedPlayoffTeamOptionPlayers.length) {
          add({
            id: "playoff-team-option-promotions",
            tone: "info",
            title: `${advance.promotedPlayoffTeamOptionPlayers.length} promozioni T.O. playoff all’inizio dell’offseason`,
            message: "I giocatori saranno spostati automaticamente dalla G-League agli slot roster con il prossimo avanzamento.",
            items: advance.promotedPlayoffTeamOptionPlayers.map((player) => `${player.teamCode}: ${player.playerName}`),
            article: "Art. 11(k)",
          });
        }
        if (advance.reintegratedDpePlayers.length) {
          add({
            id: "dpe-reintegrations",
            tone: "info",
            title: `${advance.reintegratedDpePlayers.length} reintegri DPE al termine della stagione`,
            message: "Questi giocatori saranno spostati automaticamente negli slot roster con il prossimo avanzamento.",
            items: advance.reintegratedDpePlayers.map((player) => `${player.teamCode}: ${player.playerName}`),
            article: "Art. 12(c)",
          });
        }
      }
    } catch (error) {
      add({
        id: "season-advance-data-error",
        tone: "blocker",
        title: "Dati contrattuali non validi per la chiusura della stagione",
        message: error instanceof Error ? error.message : "Controlla annata e contratti.",
        href: "/admin/importa-dati",
        actionLabel: "Ripristina un backup valido",
      });
    }
  }

  return {
    transition,
    transitionLabel: leagueMomentLabels[transition],
    alerts,
    blockerCount: alerts.filter((alert) => alert.tone === "blocker").length,
  };
}

function addDraftPreparationAlerts(
  add: (alert: PreAdvanceAlert) => void,
  seasonName: string,
  state: EditableLeagueState,
) {
  if (state.playerListStatus !== "published") {
    add({
      id: "official-list-draft",
      tone: "blocker",
      title: "Listone ufficiale non ancora pubblicato",
      message: "Senza il listone Dunkest non è possibile iniziare l’asta.",
      article: "Art. 4(a); Art. 6(a)",
      href: "/admin/listone",
      actionLabel: "Vai al listone",
    });
  }
  const draftYear = seasonStartYear(seasonName);
  const orderFinalized = draftYear !== null && (state.finalizedDraftPositionYears ?? []).includes(draftYear);
  if (!orderFinalized) {
    add({
      id: "draft-positions-incomplete",
      tone: "blocker",
      title: `Ordine del Draft ${draftYear} non definitivo`,
      message: "Completa e salva definitivamente l’ordine prima di iniziare l’asta.",
      article: "Art. 6(b-c); Art. 14",
      href: "/admin/posizioni-draft",
      actionLabel: "Completa le posizioni",
    });
  }
}

function addStructuralAlerts(
  add: (alert: PreAdvanceAlert) => void,
  currentMoment: LeagueMoment,
  seasonName: string,
  state: EditableLeagueState,
) {
  const limits = { regular: 15, two_way: 2, g_league: 3, dpe: 1 } as const;
  const overflows = state.teams.flatMap((team) => {
    const active = state.rosterEntries.filter((entry) => entry.teamCode === team.code && entry.state === "active");
    return (Object.keys(limits) as (keyof typeof limits)[]).flatMap((slot) => {
      const count = active.filter((entry) => entry.slot === slot).length;
      return count > limits[slot] ? [`${team.code}: ${slotLabel(slot)} ${count}/${limits[slot]}`] : [];
    });
  });
  if (overflows.length) {
    add({
      id: "slot-overflows",
      tone: "blocker",
      title: "Limiti degli slot superati",
      message: "La situazione dei roster deve essere regolare prima di avanzare.",
      items: overflows,
      article: "Art. 2(a)",
      href: "/admin/altre-operazioni",
      actionLabel: "Sistema i roster",
    });
  }

  const futureCapIssues = state.teams.flatMap((team) => {
    const entries = state.rosterEntries.filter((entry) => entry.teamCode === team.code);
    return [1, 2].flatMap((distance) => {
      const targetSeason = followingSeasonName(seasonName, distance);
      const space = calculateCapSpace({
        entries,
        seasonName: targetSeason,
        optionSeasonName: seasonName,
        countTeamOptions: teamOptionsAreResolved(currentMoment),
      });
      return space < 0 ? [`${team.code}: cap libero ${targetSeason} = ${space}`] : [];
    });
  });
  if (futureCapIssues.length) {
    add({
      id: "future-cap-overflow",
      tone: "warning",
      title: "Salary cap futuro oltre 1000 crediti",
      message: "Il regolamento non ammette eccezioni; l’avanzamento resta confermabile come forzatura amministrativa.",
      items: futureCapIssues,
      article: "Art. 9(e-f)",
      href: "/admin/altre-operazioni",
      actionLabel: "Riduci il cap",
    });
  }

  const currentCapIssues = state.teams.flatMap((team) => {
    const entries = state.rosterEntries.filter((entry) => (
      entry.teamCode === team.code
      && (!hasReachedMoment(currentMoment, "auction_completed") || entry.state !== "active" || entry.slot !== "dpe")
    ));
    const space = calculateCapSpace({
      entries,
      seasonName,
      optionSeasonName: seasonName,
      countTeamOptions: teamOptionsAreResolved(currentMoment),
    });
    return space < 0 ? [{ teamCode: team.code, space, cost: 1000 - space }] : [];
  });
  if (currentMoment === "offseason_start" && currentCapIssues.length) {
    add({
      id: "strict-offseason-cap",
      tone: "warning",
      title: "Salary cap corrente oltre 1000 crediti",
      message: "Fino all’inizio dell’asta il limite è 1000; l’avanzamento resta confermabile come forzatura amministrativa.",
      items: currentCapIssues.map((issue) => `${issue.teamCode}: ${issue.cost} crediti · cap libero ${issue.space}`),
      article: "Art. 9(a)",
      href: "/admin/altre-operazioni",
      actionLabel: "Riduci il cap",
    });
  } else if ((currentMoment === "team_option_deadline" || currentMoment === "auction_start") && currentCapIssues.length) {
    add({
      id: "draft-window-cap",
      tone: "warning",
      title: "Squadre oltre 1000 crediti",
      message: "Il superamento dovuto al Draft è ammesso, ma finché permane non sono consentite altre operazioni che aumentino ulteriormente il cap; durante l’asta gli acquisti sono limitati a 1 credito.",
      items: currentCapIssues.map((issue) => `${issue.teamCode}: ${issue.cost} crediti · cap libero ${issue.space}`),
      article: "Art. 9(b-c)",
    });
  } else if (hasReachedMoment(currentMoment, "auction_completed")) {
    const overSeasonLimit = currentCapIssues.filter((issue) => issue.cost > 1100);
    if (overSeasonLimit.length) {
      add({
        id: "season-cap-over-1100",
        tone: "warning",
        title: "Squadre oltre 1100 crediti durante la stagione",
        message: hasReachedMoment(currentMoment, "free_agency_reopening")
          ? "Non devono rientrare immediatamente se erano già oltre soglia alla riapertura della free agency, ma non possono aumentare ulteriormente il cap."
          : "Non devono rientrare immediatamente se il superamento deriva dalla fine dell’asta, ma non possono aumentare ulteriormente il cap.",
        items: overSeasonLimit.map((issue) => `${issue.teamCode}: ${issue.cost} crediti`),
        article: hasReachedMoment(currentMoment, "free_agency_reopening") ? "Art. 9(d)" : "Art. 9(c)",
      });
    }
  }

  if (hasReachedMoment(currentMoment, "auction_completed") && state.qualifyingOfferRights.length) {
    add({
      id: "qualifying-offers-after-auction",
      tone: "blocker",
      title: `${state.qualifyingOfferRights.length} Q.O. rimaste dopo l’asta`,
      message: "I diritti avrebbero dovuto essere risolti durante l’asta.",
      items: groupRights(state.qualifyingOfferRights),
      article: "Art. 8(b-e)",
      href: "/admin/importa-dati",
      actionLabel: "Ripristina un backup precedente",
    });
  }

  if (hasReachedMoment(currentMoment, "contract_delivery")) {
    const staleContracts = state.rosterEntries.filter((entry) => isPendingContract(entry.contract));
    if (staleContracts.length) {
      add({
        id: "contracts-after-delivery",
        tone: "blocker",
        title: `${staleContracts.length} contratti non assegnati dopo la consegna`,
        message: "La stagione non può proseguire con contratti dell’asta ancora incompleti.",
        items: groupPlayerEntries(staleContracts),
        article: "Art. 3(b-c)",
        href: "/admin/importa-dati",
        actionLabel: "Ripristina un backup precedente",
      });
    }
  }
}

function addRoleMinimumAlert(
  add: (alert: PreAdvanceAlert) => void,
  state: EditableLeagueState,
  href: string,
  actionLabel: string,
  tone: PreAdvanceAlertTone = "warning",
) {
  const teams = buildRoleMinimumAlerts(state);
  if (!teams.length) return;
  add({
    id: "role-minimums",
    tone,
    title: `${teams.length} squadre richiedono l’assegnazione regolamentare di un free agent`,
    message: "Non viene eseguita automaticamente: va assegnato casualmente un free agent fino al termine della stagione, a 1 credito e indipendentemente dal cap; se necessario va liberato uno slot. Ruolo X e DPE non contano.",
    items: teams.map((team) => `${team.teamCode}: ${[
      team.missing.G ? `G ${team.counts.G}/5` : "",
      team.missing.A ? `A ${team.counts.A}/5` : "",
      team.missing.C ? `C ${team.counts.C}/3` : "",
    ].filter(Boolean).join(" · ")}`),
    article: "Art. 2(b-c)",
    href,
    actionLabel,
  });
}

function isPendingRookieContract(entry: EditableLeagueState["rosterEntries"][number], seasonName: string) {
  return entry.state === "active" && (
    entry.contract.trim().toLocaleUpperCase("it-IT") === "T.O."
    || isRookieExtensionDecisionDue(entry, seasonName)
  );
}

function isPendingContract(contract: string) {
  return pendingContractValues.has(contract.trim().toLocaleUpperCase("it-IT"));
}

function groupPlayerEntries(entries: EditableLeagueState["rosterEntries"]) {
  const byTeam = new Map<string, string[]>();
  entries.forEach((entry) => byTeam.set(entry.teamCode, [...(byTeam.get(entry.teamCode) ?? []), entry.name]));
  return [...byTeam.entries()]
    .sort(([left], [right]) => left.localeCompare(right, "it"))
    .map(([teamCode, players]) => `${teamCode}: ${players.join(", ")}`);
}

function groupRights(rights: EditableLeagueState["qualifyingOfferRights"]) {
  const byTeam = new Map<string, string[]>();
  rights.forEach((right) => byTeam.set(right.teamCode, [...(byTeam.get(right.teamCode) ?? []), right.playerName]));
  return [...byTeam.entries()]
    .sort(([left], [right]) => left.localeCompare(right, "it"))
    .map(([teamCode, players]) => `${teamCode}: ${players.join(", ")}`);
}

function seasonStartYear(seasonName: string) {
  const match = seasonName.match(/^(\d{4})\/\d{2}$/);
  return match ? Number(match[1]) : null;
}

function slotLabel(slot: "regular" | "two_way" | "g_league" | "dpe") {
  if (slot === "regular") return "Roster";
  if (slot === "two_way") return "Two-way";
  if (slot === "g_league") return "G-League";
  return "DPE";
}
