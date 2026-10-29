import { buildRoleMinimumAlerts, formatRoleMinimumMissing } from "./admin-alerts";
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
import { calculateCapSpace, followingSeasonName, seasonEndYear } from "./season-time";
import { slotEligibilityErrors } from "./slot-eligibility";
import {
  applyPostAuctionContractDrafts,
  missingPostAuctionContractDrafts,
  type PostAuctionContractDraft,
} from "./post-auction-contracts";
import { annualTeamOptionExpiryYear, isRookieExtensionDecisionDue } from "./team-option-contract";
import { freeReleaseReasonAvailability } from "./free-release";
import { rosterSlotLimits } from "./roster-slot-limits";

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

    addRoleMinimumAlert(add, state, currentMoment, "/admin/asta", "Controlla i ruoli prima di iniziare la stagione", "blocker");
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
    const pendingContractKeys = new Set(pendingContracts.map((entry) => `${entry.teamCode}\u0000${entry.name}`));
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
      && !pendingContractKeys.has(`${entry.teamCode}\u0000${entry.name}`)
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

    const listedPlayers = new Map(state.playerList.map((player) => [player.name, player]));
    const freeOneCreditOptions = state.rosterEntries.filter((entry) => {
      const listedPlayer = listedPlayers.get(entry.name);
      return entry.state === "active" && freeReleaseReasonAvailability(
        "one_credit_team_option",
        currentMoment,
        {
          ...entry,
          rookie: listedPlayer?.rookie ?? false,
          under23: listedPlayer?.under23 ?? false,
        },
        seasonName,
      ).available;
    });
    if (freeOneCreditOptions.length) {
      add({
        id: "one-credit-options-guarantee",
        tone: "info",
        title: `${freeOneCreditOptions.length} contratti da 1 credito stanno per diventare garantiti`,
        message: "Dopo la consegna dei contratti non potranno più essere rimosse senza peso sul cap in base a questa eccezione.",
        items: groupPlayerEntries(freeOneCreditOptions),
        article: "Art. 10(d)",
        href: "/admin/altre-operazioni",
        actionLabel: "Controlla i giocatori",
      });
    }

    addRoleMinimumAlert(add, deliveryState, currentMoment, "/admin/contratti", "Controlla i minimi di ruolo");
    add({
      id: "special-slot-window-closing",
      tone: "info",
      title: "Si chiude la finestra speciale per gli spostamenti di slot",
      message: "Dopo la consegna non sarà più possibile retrocedere liberamente dal roster a Two-way/G-League o da Two-way a G-League.",
      article: "Art. 11(i)",
      href: "/admin/slot",
      actionLabel: "Controlla gli slot",
    });
  }

  if (transition === "trade_deadline") {
    addRoleMinimumAlert(add, state, currentMoment, "/admin/free-agent", "Controlla i minimi di ruolo");
    add({
      id: "trade-deadline-closures",
      tone: "info",
      title: "Il prossimo avanzamento chiude gli scambi",
      message: "La DPE resta disponibile fino alla Chiusura free agency della prima fase.",
      article: "Art. 12(a); Art. 13(a)",
      href: "/admin/scambi",
      actionLabel: "Controlla gli scambi",
    });
  }

  if (transition === "buyout_end") {
    addRoleMinimumAlert(add, state, currentMoment, "/admin/free-agent", "Controlla i minimi di ruolo");
    add({
      id: "buyout-window-closing",
      tone: "info",
      title: "Sta per terminare la finestra dei buyout",
      message: "Dopo il prossimo avanzamento non sarà più possibile applicare nuovi buyout.",
      article: "Art. 10(e); Art. 9(c)",
      href: "/admin/altre-operazioni",
      actionLabel: "Controlla i buyout",
    });
  }

  if (transition === "free_agency_end") {
    addRoleMinimumAlert(add, state, currentMoment, "/admin/free-agent", "Controlla i minimi di ruolo");
    add({
      id: "free-agency-closures",
      tone: "info",
      title: "Stanno per chiudersi free agency e operazioni collegate",
      message: "Termineranno free agency, rilasci gratuiti, esercizio e reintegro anticipato della DPE.",
      article: "Art. 5(a); Art. 10(b); Art. 12(a,d)",
      href: "/admin/free-agent",
      actionLabel: "Controlla la free agency",
    });
  }

  if (transition === "free_agency_reopening") {
    const unmarkedOptions = state.rosterEntries.filter((entry) => (
      entry.state === "active" && entry.slot === "g_league"
      && annualTeamOptionExpiryYear(entry.contract, seasonEndYear(seasonName) ?? undefined) === seasonEndYear(seasonName)
      && !entry.playoffTeamOptionUsedSeason
    ));
    if (unmarkedOptions.length) add({
      id: "playoff-team-option-verification",
      tone: "warning",
      title: "Verifica gli utilizzi G-League nei playoff prima della riapertura free agency",
      message: "La segnalazione è facoltativa: registra soltanto i giocatori effettivamente utilizzati nei playoff. Dopo l'avanzamento non sarà più possibile.",
      items: groupPlayerEntries(unmarkedOptions),
      href: "/admin/team-option",
      actionLabel: "Controlla i contratti da rookie",
    });
  }

  if (transition === "season_end") {
    addRoleMinimumAlert(add, state, currentMoment, "/admin/free-agent", "Controlla i minimi di ruolo fino al termine della stagione", "blocker");
    if (input.currentHistorySeason && input.currentHistorySeason !== seasonName) {
      add({
        id: "history-season-mismatch",
        tone: "blocker",
        title: "Classifiche pronte per l’archivio riferite a un’altra annata",
        message: `I dati correnti indicano ${input.currentHistorySeason}, mentre la stagione attiva è ${seasonName}.`,
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
      if (advance.invalidScheduledCutPlayers.length) {
        add({
          id: "invalid-scheduled-season-end-cuts",
          tone: "blocker",
          title: `${advance.invalidScheduledCutPlayers.length} tagli programmati non sono più validi`,
          message: "I giocatori indicati non libererebbero più uno slot roster nella prossima offseason. Annulla la programmazione prima di avanzare.",
          items: advance.invalidScheduledCutPlayers.map((player) => `${player.teamCode}: ${player.playerName}`),
          href: "/admin/altre-operazioni",
          actionLabel: "Controlla i tagli programmati",
        });
      }
      if (advance.excessiveScheduledCutsByTeam.length) {
        add({
          id: "excessive-scheduled-season-end-cuts",
          tone: "blocker",
          title: "Sono stati programmati più tagli del necessario",
          message: "Annulla le programmazioni eccedenti: il sistema non sceglierà autonomamente quali giocatori conservare.",
          items: advance.excessiveScheduledCutsByTeam.map((issue) => `${issue.teamCode}: ${issue.excess} tagli programmati in eccesso`),
          href: "/admin/altre-operazioni",
          actionLabel: "Controlla i tagli programmati",
        });
      }
      const rosterMoveIssues = state.teams.flatMap((team) => {
        const dpePlayers = advance.reintegratedDpePlayers
          .filter((player) => player.teamCode === team.code)
          .map((player) => `${player.playerName} (DPE)`);
        const players = dpePlayers;
        const overflow = advance.remainingOverflowByTeam[team.code] ?? 0;
        return overflow ? [{ teamCode: team.code, players, overflow }] : [];
      });
      if (rosterMoveIssues.length) {
        const totalShortfall = rosterMoveIssues.reduce((total, issue) => total + issue.overflow, 0);
        add({
          id: "blocked-offseason-roster-moves",
          tone: "blocker",
          title: `${totalShortfall} slot roster mancanti all’inizio dell’offseason`,
          message: "All’inizio dell’offseason vengono reintegrate le DPE negli slot Roster.",
          items: rosterMoveIssues.map((issue) => (
            `${issue.teamCode}: ${issue.players.length ? `${issue.players.join(", ")} · ` : ""}${issue.overflow} slot mancanti`
          )),
          article: "Art. 12(c)",
          href: "/admin/altre-operazioni",
          actionLabel: "Libera gli slot necessari",
        });
      } else {
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
      if (
        advance.scheduledCutPlayers.length
        && !advance.invalidScheduledCutPlayers.length
        && !advance.excessiveScheduledCutsByTeam.length
      ) {
        add({
          id: "scheduled-season-end-cuts",
          tone: "info",
          title: `${advance.scheduledCutPlayers.length} tagli programmati saranno eseguiti a Fine stagione`,
          message: "I giocatori restano attivi fino all’avanzamento; il taglio sarà applicato automaticamente prima dei reintegri DPE.",
          items: advance.scheduledCutPlayers.map((player) => `${player.teamCode}: ${player.playerName}`),
          href: "/admin/altre-operazioni",
          actionLabel: "Controlla i tagli programmati",
        });
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
  const limits = rosterSlotLimits;
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
      tone: "blocker",
      title: "Team salary futuro oltre 1000 crediti",
      message: "Il regolamento non ammette eccezioni: riduci il team salary futuro prima di avanzare.",
      items: futureCapIssues,
      article: "Art. 9(d)",
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
      title: "Team salary corrente oltre 1000 crediti",
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
      article: "Art. 9(a-b)",
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
  currentMoment: LeagueMoment,
  href: string,
  actionLabel: string,
  tone: PreAdvanceAlertTone = "warning",
) {
  const teams = buildRoleMinimumAlerts(state, currentMoment);
  if (!teams.length) return;
  const duringAuction = currentMoment === "auction_start";
  add({
    id: "role-minimums",
    tone,
    title: duringAuction
      ? `${teams.length} ${teams.length === 1 ? "squadra non completa" : "squadre non complete"}`
      : `${teams.length} ${teams.length === 1 ? "squadra con carenze di ruolo" : "squadre con carenze di ruolo"}`,
    message: duringAuction
      ? "L’asta può terminare soltanto quando ogni squadra raggiunge 5 G, 5 A e 3 C."
      : `Le carenze di ruolo devono essere colmate con l’assegnazione regolamentare di free agent${hasReachedMoment(currentMoment, "free_agency_reopening") ? "; dalla Riapertura free agency la DPE concorre al conteggio" : ""}.`,
    items: teams.map((team) => `${team.teamCode}: ${formatRoleMinimumMissing(team)}`),
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
