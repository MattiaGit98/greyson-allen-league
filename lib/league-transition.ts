import type { EditableLeagueState } from "./league-state";
import { calculateLeagueAdvance } from "./league-advance";
import {
  leagueMomentLabels,
  nextLeagueTransition,
  type LeagueMoment,
  type LeagueTransition,
} from "./league-moments";
import { buildPreAdvanceChecklist, type PreAdvanceAlert } from "./pre-advance-alerts";
import {
  missingPostAuctionContractDrafts,
  postAuctionContractCandidates,
  type PostAuctionContractDraft,
} from "./post-auction-contracts";
import { isRookieExtensionDecisionDue } from "./team-option-contract";
import { seasonEndYear } from "./season-time";

export type LeagueTransitionPreview = {
  transition: LeagueTransition;
  label: string;
  automaticActions: string[];
  newPossibilities: string[];
  closedPossibilities: string[];
  warnings: string[];
  errors: string[];
};

export function buildLeagueTransitionPreview(input: {
  currentMoment: LeagueMoment;
  seasonName: string;
  state: EditableLeagueState;
  currentHistorySeason?: string | null;
  contractDrafts?: PostAuctionContractDraft[];
}): LeagueTransitionPreview {
  const transition = nextLeagueTransition(input.currentMoment);
  const preview: LeagueTransitionPreview = {
    transition,
    label: leagueMomentLabels[transition],
    automaticActions: [],
    newPossibilities: [],
    closedPossibilities: [],
    warnings: [],
    errors: [],
  };

  if (transition === "team_option_deadline") {
    preview.newPossibilities.push("Il Draft diventa accessibile quando sono pronti anche il listone ufficiale e l’ordine definitivo.");
    preview.newPossibilities.push("Si aprono le causali generali di rilascio gratuito previste dal regolamento.");
    preview.newPossibilities.push("Si apre la finestra speciale per spostare verso Two-way e G-League i giocatori al primo anno che rispettano i requisiti.");
    preview.closedPossibilities.push("Non sarà più possibile risolvere team option e rookie extension in scadenza.");
  }

  if (transition === "auction_start") {
    const expiredExtensionMarkers = countCurrentSeasonExtensionMarkers(input.state, input.seasonName);
    if (expiredExtensionMarkers) {
      preview.automaticActions.push(`${expiredExtensionMarkers} possibilità di estensione non esercitate saranno rimosse dai contratti in scadenza.`);
    }
    preview.newPossibilities.push("Si apre il pannello asta.");
    preview.closedPossibilities.push("Si sospende l'esercizio della DPE per tutta la durata dell'asta.");
    preview.closedPossibilities.push("Si sospendono gli scambi fino al termine dell’asta.");
    preview.closedPossibilities.push("Si chiude il Draft.");
    preview.closedPossibilities.push("Si chiudono le estensioni contrattuali.");
    preview.closedPossibilities.push("Si chiudono i rilasci gratuiti per chi ha disputato meno della metà delle partite NBA.");
  }

  if (transition === "auction_completed") {
    if (input.state.qualifyingOfferRights.length) {
      preview.automaticActions.push(`${input.state.qualifyingOfferRights.length} qualifying offer non estese decadranno.`);
    }
    preview.automaticActions.push("La macro-fase passerà da Offseason a Stagione.");
    preview.automaticActions.push("Per il cap corrente si applicherà la soglia prevista durante la stagione.");
    preview.newPossibilities.push("Si apre l’assegnazione dei contratti acquistati all’asta.");
    preview.newPossibilities.push("Riapre l'esercizio della DPE fino alla trade deadline.");
    preview.newPossibilities.push("Riaprono gli scambi fino alla trade deadline.");
    preview.closedPossibilities.push("Si chiude l’asta.");
  }

  if (transition === "contract_delivery") {
    const contractDrafts = input.contractDrafts ?? [];
    const assignedContracts = postAuctionContractCandidates(input.state, input.seasonName).length
      - missingPostAuctionContractDrafts(input.state, contractDrafts, input.seasonName).length;
    preview.automaticActions.push(`${assignedContracts} contratti in bozza saranno pubblicati insieme.`);
    preview.newPossibilities.push("Si apre la free agency.");
    preview.newPossibilities.push("Si apre il reintegro anticipato dalla DPE per i giocatori tornati in campo.");
    preview.closedPossibilities.push("Si chiudono l’assegnazione dei contratti e la finestra speciale per gli spostamenti verso Two-way e G-League.");
  }

  if (transition === "trade_deadline") {
    preview.newPossibilities.push("Si apre la finestra per i buyout.");
    preview.newPossibilities.push("I free agent soggetti a buyout stagionale possono essere firmati soltanto dalle prime sei squadre.");
    preview.closedPossibilities.push("Si chiudono gli scambi e l’esercizio della DPE.");
    preview.closedPossibilities.push("Si chiude la causale di rilascio gratuito legata a squalifiche o cause giudiziarie.");
    preview.automaticActions.push("I nuovi free agent avranno un contratto annuale senza Q.O.");
  }

  if (transition === "buyout_end") preview.closedPossibilities.push("Non sarà più possibile applicare il buyout.");

  if (transition === "free_agency_end") {
    preview.closedPossibilities.push("Si chiudono free agency e rilasci gratuiti.");
    preview.closedPossibilities.push("Si chiude la possibilità di reintegro anticipato dalla DPE.");
    preview.newPossibilities.push("Si apre l'esercizio anticipato delle T.O. in G-League utilizzate nei playoff.");
  }

  if (transition === "free_agency_reopening") {
    preview.newPossibilities.push("Riapre la free agency per la March Madness e resta disponibile fino alla fine della stagione.");
  }

  if (transition === "season_end") {
    try {
      const advance = calculateLeagueAdvance({
        seasonName: input.seasonName,
        rosterEntries: input.state.rosterEntries,
        qualifyingOfferRights: input.state.qualifyingOfferRights,
        playerList: input.state.playerList,
      });
      preview.automaticActions.push(`${advance.expiredContracts} contratti in scadenza saranno rimossi.`);
      preview.automaticActions.push(`${advance.generatedQualifyingOffers} diritti di Q.O. saranno generati.`);
      preview.automaticActions.push(`${advance.pendingRookieExtensions} contratti resteranno in attesa della decisione sulla rookie extension.`);
      preview.automaticActions.push(`${advance.promotedPlayoffTeamOptionPlayers.length} T.O. esercitate per utilizzo nei playoff saranno promosse negli slot roster.`);
      preview.automaticActions.push(`${advance.reintegratedDpePlayers.length} giocatori in DPE saranno reintegrati negli slot roster.`);
      preview.automaticActions.push(`Il listone attuale diventerà provvisorio: manterrà ${advance.playerList.length} giocatori, ma le squadre NBA saranno azzerate.`);
      preview.automaticActions.push("Classifiche e tabelloni correnti saranno importati nello storico.");
      preview.automaticActions.push(`L’annata passerà automaticamente a ${advance.nextSeasonName}.`);
    } catch (error) {
      preview.errors.push(error instanceof Error ? error.message : "I dati della stagione non sono validi.");
    }
    preview.newPossibilities.push("La nuova annata ripartirà da Inizio offseason.");
    preview.closedPossibilities.push("La stagione corrente sarà conclusa.");
    preview.closedPossibilities.push("Si chiude la free agency riaperta per la March Madness.");
    preview.closedPossibilities.push("Si chiude l'esercizio anticipato delle T.O. per utilizzo nei playoff.");
  }

  const checklist = buildPreAdvanceChecklist(input);
  checklist.alerts.forEach((alert) => {
    const message = formatChecklistAlert(alert);
    if (alert.tone === "blocker" && !preview.errors.includes(message)) preview.errors.push(message);
    if (alert.tone === "warning" && !preview.warnings.includes(message)) preview.warnings.push(message);
  });

  if (!preview.automaticActions.length) preview.automaticActions.push("Nessuna modifica automatica a roster, contratti o listone.");
  preview.warnings.push("Prima dell’operazione sarà scaricato il backup ripristinabile; sarà inoltre creato un punto di ripristino interno.");
  return preview;
}

export function applyTeamOptionDeadline(state: EditableLeagueState, seasonName: string) {
  return {
    ...state,
    rosterEntries: state.rosterEntries.filter((entry) => !(
      entry.state === "active"
      && (entry.contract === "T.O." || isRookieExtensionDecisionDue(entry, seasonName))
    )),
  };
}

export function closeCurrentSeasonExtensionWindow(state: EditableLeagueState, seasonName: string) {
  const currentEndYear = seasonEndYear(seasonName);
  if (currentEndYear === null) throw new Error("Annata non valida.");
  const expiringContract = `${String(currentEndYear).slice(-2)} (E)`;
  const finalizedContract = String(currentEndYear).slice(-2);
  return {
    ...state,
    rosterEntries: state.rosterEntries.map((entry) => (
      entry.contract.trim().toLocaleUpperCase("it-IT") === expiringContract
        ? { ...entry, contract: finalizedContract }
        : entry
    )),
  };
}

function countCurrentSeasonExtensionMarkers(state: EditableLeagueState, seasonName: string) {
  const updated = closeCurrentSeasonExtensionWindow(state, seasonName);
  return updated.rosterEntries.reduce((count, entry, index) => (
    count + Number(entry.contract !== state.rosterEntries[index]?.contract)
  ), 0);
}

function formatChecklistAlert(alert: PreAdvanceAlert) {
  const visibleItems = alert.items?.slice(0, 5) ?? [];
  const remaining = (alert.items?.length ?? 0) - visibleItems.length;
  return `${alert.title}: ${alert.message}${visibleItems.length ? ` ${visibleItems.join("; ")}.` : ""}${remaining > 0 ? ` Altri ${remaining}.` : ""}`;
}
