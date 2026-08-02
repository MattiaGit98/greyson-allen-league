import type { EditableLeagueState } from "./league-state";
import { calculateLeagueAdvance } from "./league-advance";
import {
  leagueMomentLabels,
  nextLeagueTransition,
  type LeagueMoment,
  type LeagueTransition,
} from "./league-moments";
import { buildPreAdvanceChecklist, type PreAdvanceAlert } from "./pre-advance-alerts";
import { applyMandatoryTwoWayPromotion, buildTwoWayPromotionReport } from "./two-way-promotions";

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
    const withoutExpiredOptions = {
      ...input.state,
      rosterEntries: input.state.rosterEntries.filter((entry) => !(entry.state === "active" && entry.contract === "T.O.")),
    };
    const promotionReport = buildTwoWayPromotionReport(withoutExpiredOptions.teams, withoutExpiredOptions.rosterEntries, input.seasonName);
    preview.automaticActions.push(`${promotionReport.totalPlayers} giocatori soggetti a promozione obbligatoria saranno spostati nel roster.`);
    preview.newPossibilities.push("Si apre il Draft.");
    preview.newPossibilities.push("Si apre la finestra speciale per spostare verso Two-way e G-League i giocatori al primo anno che rispettano i requisiti.");
    preview.closedPossibilities.push("Non sarà più possibile esercitare le team option.");
  }

  if (transition === "free_releases_start") {
    preview.newPossibilities.push("Si apre la finestra dei rilasci gratuiti prevista prima dell’asta.");
    preview.closedPossibilities.push("Si sospende l'esercizio della DPE per tutta la durata dell'asta.");
  }

  if (transition === "auction_completed") {
    preview.automaticActions.push("La macro-fase passerà da Offseason a Stagione.");
    preview.automaticActions.push("Per il cap corrente si applicherà la soglia prevista durante la stagione.");
    preview.newPossibilities.push("Si apre l’assegnazione dei contratti acquistati all’asta.");
    preview.newPossibilities.push("Riapre l'esercizio della DPE fino alla trade deadline.");
    preview.closedPossibilities.push("Si chiudono asta, draft ed estensioni contrattuali dell’offseason.");
  }

  if (transition === "contract_delivery") {
    preview.newPossibilities.push("Si apre la free agency.");
    preview.newPossibilities.push("Si apre il reintegro anticipato dalla DPE per i giocatori tornati in campo.");
    preview.closedPossibilities.push("Si chiudono l’assegnazione dei contratti e la finestra speciale per gli spostamenti verso Two-way e G-League.");
  }

  if (transition === "trade_deadline") {
    preview.newPossibilities.push("Si apre la finestra per buyout ed estensioni delle squadre ammesse.");
    preview.newPossibilities.push("Per le ultime tre squadre l’offerta massima sui free agent diventa 1 credito.");
    preview.closedPossibilities.push("Si chiudono gli scambi e l’esercizio della DPE.");
    preview.closedPossibilities.push("Si chiude la causale di rilascio gratuito legata a squalifiche o cause giudiziarie.");
    preview.automaticActions.push("I nuovi free agent avranno un contratto annuale senza Q.O.");
  }

  if (transition === "buyout_end") preview.closedPossibilities.push("Non sarà più possibile applicare il buyout.");

  if (transition === "free_agency_end") {
    preview.closedPossibilities.push("Si chiudono free agency, rilasci gratuiti ed estensioni in-season.");
    preview.closedPossibilities.push("Si chiude la possibilità di reintegro anticipato dalla DPE.");
    preview.newPossibilities.push("Si apre l'esercizio anticipato delle T.O. in G-League utilizzate nei playoff.");
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
      preview.automaticActions.push(`${advance.doubledTeamOptions} ex T.O. saranno raddoppiate e marcate + Q.O.`);
      preview.automaticActions.push(`${advance.reintegratedDpePlayers.length} giocatori in DPE saranno reintegrati negli slot roster.`);
      preview.automaticActions.push(`Il listone sarà ricreato con ${advance.playerList.length} giocatori sotto contratto o con Q.O.`);
      preview.automaticActions.push("Classifiche e tabelloni correnti saranno importati nello storico.");
      preview.automaticActions.push(`L’annata passerà automaticamente a ${advance.nextSeasonName}.`);
    } catch (error) {
      preview.errors.push(error instanceof Error ? error.message : "I dati della stagione non sono validi.");
    }
    preview.newPossibilities.push("La nuova annata ripartirà da Inizio offseason.");
    preview.closedPossibilities.push("La stagione corrente sarà conclusa.");
    preview.closedPossibilities.push("Si chiude l'esercizio anticipato delle T.O. per utilizzo nei playoff.");
  }

  const checklist = buildPreAdvanceChecklist(input);
  checklist.alerts.forEach((alert) => {
    const message = formatChecklistAlert(alert);
    if (alert.tone === "blocker" && !preview.errors.includes(message)) preview.errors.push(message);
    if (alert.tone === "warning" && !preview.warnings.includes(message)) preview.warnings.push(message);
  });

  if (!preview.automaticActions.length) preview.automaticActions.push("Nessuna modifica automatica a roster, contratti o listone.");
  preview.warnings.push("Prima dell’operazione saranno scaricati il backup ripristinabile e il backup Excel; sarà inoltre creato un punto di ripristino interno.");
  return preview;
}

export function applyTeamOptionDeadline(state: EditableLeagueState, seasonName: string) {
  const withoutExpiredOptions = {
    ...state,
    rosterEntries: state.rosterEntries.filter((entry) => !(entry.state === "active" && entry.contract === "T.O.")),
  };
  return {
    ...withoutExpiredOptions,
    rosterEntries: withoutExpiredOptions.rosterEntries.map((entry) => applyMandatoryTwoWayPromotion(entry, seasonName)),
  };
}

function formatChecklistAlert(alert: PreAdvanceAlert) {
  const visibleItems = alert.items?.slice(0, 5) ?? [];
  const remaining = (alert.items?.length ?? 0) - visibleItems.length;
  return `${alert.title}: ${alert.message}${visibleItems.length ? ` ${visibleItems.join("; ")}.` : ""}${remaining > 0 ? ` Altri ${remaining}.` : ""}`;
}
