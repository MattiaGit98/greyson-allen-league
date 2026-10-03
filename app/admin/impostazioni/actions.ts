"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { defaultCompetitionMap } from "@/lib/competitions";
import { buildAutomaticHistoryArchive } from "@/lib/history-archive";
import { loadCurrentHistoryImports, loadHistoryCompetitionState } from "@/lib/history-competition-store";
import { calculateLeagueAdvance } from "@/lib/league-advance";
import {
  leagueMomentLabels,
  leagueMomentFromSeason,
  macroPhaseForMoment,
  nextLeagueTransition,
  teamOptionsAreResolved,
  tradeDeadlineHasPassed,
} from "@/lib/league-moments";
import { loadEditableLeagueState, type EditableLeagueState } from "@/lib/league-state";
import { applyTeamOptionDeadline, buildLeagueTransitionPreview, closeCurrentSeasonExtensionWindow } from "@/lib/league-transition";
import { historyConfirmationForTransition } from "@/lib/phase-history-confirmation";
import { savePhaseBackup } from "@/lib/phase-backups";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { applyPostAuctionContractDrafts } from "@/lib/post-auction-contracts";
import { contractDraftRows, loadPostAuctionContractDrafts } from "@/lib/post-auction-contract-store";
import {
  datedLeagueTransitions,
  formatPhaseDate,
  isPhaseDate,
  normalizePhaseDates,
  phaseCalendarValidationErrors,
  phaseDateForTransition,
  todayInRome,
} from "@/lib/phase-calendar";

type Supabase = NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>;
const seasonSelection = "id,name,status,team_options_resolved,trade_deadline_passed,timeline_moment,phase_dates";

export async function advanceLeaguePhaseStep(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) phaseError("Supabase non configurato.");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) phaseError("Sessione scaduta.");
  const seasonResponse = await supabase.from("seasons").select(seasonSelection).eq("is_active", true).maybeSingle();
  if (seasonResponse.error || !seasonResponse.data) phaseError(seasonResponse.error?.message ?? "Nessuna stagione attiva.");
  const season = seasonResponse.data;
  const currentMoment = leagueMomentFromSeason(season);
  const transition = nextLeagueTransition(currentMoment);
  const historyConfirmation = historyConfirmationForTransition(transition);
  if (historyConfirmation && formData.get(historyConfirmation.field) !== "true") {
    phaseError(historyConfirmation.error);
  }
  const phaseDates = normalizePhaseDates(season.phase_dates);
  const transitionDate = phaseDateForTransition(phaseDates, transition);
  if (!transitionDate) {
    phaseError(`Inserisci la data di ${transition === "auction_completed" ? "Asta" : leagueMomentLabels[transition]} prima di avanzare.`);
  }
  const today = todayInRome();
  if (transitionDate > today) {
    phaseError(`Non puoi avanzare a ${transition === "auction_completed" ? "Termine asta" : leagueMomentLabels[transition]} prima del ${formatPhaseDate(transitionDate)}.`);
  }
  const [state, currentHistory, contractDrafts] = await Promise.all([
    loadEditableLeagueState(),
    loadCurrentHistoryImports(),
    loadPostAuctionContractDrafts(season.name),
  ]);
  const preview = buildLeagueTransitionPreview({
    currentMoment,
    seasonName: season.name,
    state,
    currentHistorySeason: currentHistory.season,
    contractDrafts,
  });
  if (preview.errors.length) phaseError(preview.errors.join(" "));

  const toPhase = transition === "season_end" ? "offseason_start" : transition;
  const backup = await savePhaseBackup(supabase, season, state, currentMoment, toPhase);
  if (backup.error || !backup.data) phaseError(`Backup non riuscito: ${backup.error?.message ?? "errore sconosciuto"}`);

  if (transition === "season_end") {
    const result = await performLeagueSeasonAdvance(
      supabase,
      season.id,
      season.name,
      currentMoment,
      state,
      currentHistory,
    );
    if (result.error) phaseError(result.error);
    revalidateLeaguePages();
    redirect(`/admin/impostazioni?advanced=${encodeURIComponent(result.nextSeasonName ?? "")}`);
  }

  if (transition === "contract_delivery") {
    let publishedState: EditableLeagueState;
    try {
      publishedState = applyPostAuctionContractDrafts({
        state,
        drafts: contractDrafts,
        seasonName: season.name,
        requireComplete: true,
      });
    } catch (error) {
      phaseError(error instanceof Error ? error.message : "Bozze dei contratti non valide.");
    }
    const published = await supabase.rpc("publish_post_auction_contracts", {
      expected_state_payload: state,
      published_state_payload: publishedState,
      requested_season_id: season.id,
      requested_season_name: season.name,
      expected_draft_rows: contractDraftRows(contractDrafts),
    });
    if (published.error) phaseError(published.error.message);
    revalidateLeaguePages();
    redirect(`/admin/impostazioni?stepped=${encodeURIComponent(transition)}`);
  }

  let nextState = state;
  if (transition === "team_option_deadline") nextState = applyTeamOptionDeadline(state, season.name);
  if (transition === "auction_start") nextState = closeCurrentSeasonExtensionWindow(nextState, season.name);
  if (transition === "auction_completed" && state.qualifyingOfferRights.length) {
    nextState = { ...nextState, qualifyingOfferRights: [] };
  }
  const update = await supabase.rpc("advance_league_transition", {
    expected_state_payload: state,
    next_state_payload: nextState,
    requested_season_id: season.id,
    expected_season_name: season.name,
    expected_timeline_moment: currentMoment,
    next_timeline_moment: transition,
    next_status: macroPhaseForMoment(transition),
    next_team_options_resolved: teamOptionsAreResolved(transition),
    next_trade_deadline_passed: tradeDeadlineHasPassed(transition),
  });
  if (update.error) phaseError(update.error.message);

  revalidateLeaguePages();
  redirect(`/admin/impostazioni?stepped=${encodeURIComponent(transition)}`);
}

export async function saveLeaguePhaseDates(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) calendarError("Supabase non configurato.");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) calendarError("Sessione scaduta.");
  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("phase_dates_json") ?? "{}"));
  } catch {
    calendarError("Date delle fasi non valide.");
  }
  const values = raw && typeof raw === "object" ? raw as Record<string, unknown> : null;
  if (!values) calendarError("Date delle fasi non valide.");
  if (Object.values(values).some((value) => value !== "" && !isPhaseDate(value))) {
    calendarError("Inserisci soltanto date valide.");
  }
  const phaseDates = normalizePhaseDates(Object.fromEntries(datedLeagueTransitions.map((key) => [key, values[key]])));
  const season = await supabase.from("seasons").select("id,timeline_moment,phase_dates").eq("is_active", true).maybeSingle();
  if (season.error || !season.data) calendarError(season.error?.message ?? "Nessuna stagione attiva.");
  const validationErrors = phaseCalendarValidationErrors({
    dates: phaseDates,
    previousDates: normalizePhaseDates(season.data.phase_dates),
    currentMoment: leagueMomentFromSeason(season.data),
    today: todayInRome(),
  });
  if (validationErrors.length) calendarError(validationErrors.join(" "));
  const update = await supabase.from("seasons").update({ phase_dates: phaseDates }).eq("id", season.data.id);
  if (update.error) calendarError(update.error.message);
  revalidateLeaguePages();
  redirect("/admin/calendario?dates=1");
}

async function performLeagueSeasonAdvance(
  supabase: Supabase,
  seasonId: string,
  seasonName: string,
  currentMoment: string,
  state: EditableLeagueState,
  currentHistory: Awaited<ReturnType<typeof loadCurrentHistoryImports>>,
) {
  const history = await loadHistoryCompetitionState();
  try {
    const advance = calculateLeagueAdvance({
      seasonName,
      rosterEntries: state.rosterEntries,
      qualifyingOfferRights: state.qualifyingOfferRights,
      playerList: state.playerList,
    });
    if (advance.invalidScheduledCutPlayers.length) {
      throw new Error("Esistono tagli programmati non più validi: annullali prima di avanzare.");
    }
    if (advance.excessiveScheduledCutsByTeam.length) {
      throw new Error("Sono stati programmati più tagli del necessario: annulla quelli eccedenti prima di avanzare.");
    }
    if (Object.keys(advance.remainingOverflowByTeam).length) {
      throw new Error("Restano slot roster da liberare per la prossima offseason.");
    }
    const historyPayload = buildAutomaticHistoryArchive(history.competitions, currentHistory);
    const nextState = {
      ...state,
      rosterEntries: advance.rosterEntries,
      qualifyingOfferRights: advance.qualifyingOfferRights,
      playerList: advance.playerList,
      playerListStatus: "offseason" as const,
    };
    const response = await supabase.rpc("advance_league_and_archive_competitions", {
      expected_state_payload: state,
      state_payload: nextState,
      requested_season_id: seasonId,
      expected_season_name: seasonName,
      expected_timeline_moment: currentMoment,
      next_season_name: advance.nextSeasonName,
      history_payload: historyPayload,
      competition_payload: defaultCompetitionMap(state.teams.length),
    });
    return response.error ? { error: response.error.message, nextSeasonName: null } : { error: null, nextSeasonName: advance.nextSeasonName };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Dati della stagione non validi.", nextSeasonName: null };
  }
}

function revalidateLeaguePages() {
  [
    "/", "/squadre", "/giocatori", "/calendario", "/competizioni", "/storico", "/admin", "/admin/impostazioni",
    "/admin/team-option", "/admin/asta", "/admin/contratti", "/admin/free-agent", "/admin/scambi",
    "/admin/draft", "/admin/altre-operazioni", "/admin/storico", "/admin/contenuti", "/admin/calendario",
  ].forEach((route) => revalidatePath(route));
}

function phaseError(message: string): never {
  redirect(`/admin/impostazioni?error=${encodeURIComponent(message)}`);
}

function calendarError(message: string): never {
  redirect(`/admin/calendario?error=${encodeURIComponent(message)}`);
}
