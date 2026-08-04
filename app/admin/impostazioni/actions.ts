"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { defaultCompetitionMap } from "@/lib/competitions";
import { buildAutomaticHistoryArchive } from "@/lib/history-archive";
import { loadCurrentHistoryImports, loadHistoryCompetitionState } from "@/lib/history-competition-store";
import { calculateLeagueAdvance } from "@/lib/league-advance";
import {
  isLeagueMoment,
  leagueMomentFromSeason,
  macroPhaseForMoment,
  nextLeagueTransition,
  teamOptionsAreResolved,
  tradeDeadlineHasPassed,
} from "@/lib/league-moments";
import { loadEditableLeagueState, type EditableLeagueState } from "@/lib/league-state";
import { applyTeamOptionDeadline, buildLeagueTransitionPreview } from "@/lib/league-transition";
import { savePhaseBackup } from "@/lib/phase-backups";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { applyPostAuctionContractDrafts } from "@/lib/post-auction-contracts";
import { contractDraftRows, loadPostAuctionContractDrafts } from "@/lib/post-auction-contract-store";

type Supabase = NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>;
const seasonSelection = "id,name,status,team_options_resolved,trade_deadline_passed,timeline_moment";

export async function changeLeaguePhase(formData: FormData) {
  const requestedMoment = String(formData.get("timeline_moment") ?? "");
  const seasonName = String(formData.get("season_name") ?? "");
  if (!isLeagueMoment(requestedMoment)) redirect("/admin/impostazioni?error=momento-non-valido");
  if (!/^\d{4}\/\d{2}$/.test(seasonName)) redirect("/admin/impostazioni?error=annata-non-valida");

  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/admin/impostazioni?error=supabase-non-configurato");
  const { error } = await supabase.from("seasons").update({
    name: seasonName,
    status: macroPhaseForMoment(requestedMoment),
    timeline_moment: requestedMoment,
    team_options_resolved: teamOptionsAreResolved(requestedMoment),
    trade_deadline_passed: tradeDeadlineHasPassed(requestedMoment),
  }).eq("is_active", true);
  if (error) redirect(`/admin/impostazioni?error=${encodeURIComponent(error.message)}`);

  revalidateLeaguePages();
  redirect("/admin/impostazioni?updated=1");
}

export async function advanceLeaguePhaseStep() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) phaseError("Supabase non configurato.");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) phaseError("Sessione scaduta.");
  const seasonResponse = await supabase.from("seasons").select(seasonSelection).eq("is_active", true).maybeSingle();
  if (seasonResponse.error || !seasonResponse.data) phaseError(seasonResponse.error?.message ?? "Nessuna stagione attiva.");
  const season = seasonResponse.data;
  const currentMoment = leagueMomentFromSeason(season);
  const transition = nextLeagueTransition(currentMoment);
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
    const result = await performLeagueSeasonAdvance(supabase, season.name, state, currentHistory);
    if (result.error) {
      await supabase.rpc("restore_league_phase_backup", { requested_backup_id: backup.data.id });
      phaseError(result.error);
    }
    const momentUpdate = await supabase.from("seasons").update({
      timeline_moment: "offseason_start",
      team_options_resolved: false,
      trade_deadline_passed: false,
    }).eq("id", season.id);
    if (momentUpdate.error) phaseError(momentUpdate.error.message);
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
      await supabase.rpc("restore_league_phase_backup", { requested_backup_id: backup.data.id });
      phaseError(error instanceof Error ? error.message : "Bozze dei contratti non valide.");
    }
    const published = await supabase.rpc("publish_post_auction_contracts", {
      expected_state_payload: state,
      published_state_payload: publishedState,
      requested_season_id: season.id,
      requested_season_name: season.name,
      expected_draft_rows: contractDraftRows(contractDrafts),
    });
    if (published.error) {
      await supabase.rpc("restore_league_phase_backup", { requested_backup_id: backup.data.id });
      phaseError(published.error.message);
    }
    revalidateLeaguePages();
    redirect(`/admin/impostazioni?stepped=${encodeURIComponent(transition)}`);
  }

  let nextState = state;
  if (transition === "team_option_deadline") nextState = applyTeamOptionDeadline(state);
  if (nextState !== state) {
    const savedState = await supabase.rpc("replace_league_state", { state_payload: nextState });
    if (savedState.error) {
      await supabase.rpc("restore_league_phase_backup", { requested_backup_id: backup.data.id });
      phaseError(savedState.error.message);
    }
  }

  const update = await supabase.from("seasons").update({
    status: macroPhaseForMoment(transition),
    timeline_moment: transition,
    team_options_resolved: teamOptionsAreResolved(transition),
    trade_deadline_passed: tradeDeadlineHasPassed(transition),
  }).eq("id", season.id);
  if (update.error) {
    await supabase.rpc("restore_league_phase_backup", { requested_backup_id: backup.data.id });
    phaseError(update.error.message);
  }

  revalidateLeaguePages();
  redirect(`/admin/impostazioni?stepped=${encodeURIComponent(transition)}`);
}

export async function restoreLatestPhaseBackup(formData: FormData) {
  const backupId = String(formData.get("backup_id") ?? "").trim();
  if (!backupId) phaseError("Backup non valido.");
  const supabase = await createSupabaseServerClient();
  if (!supabase) phaseError("Supabase non configurato.");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) phaseError("Sessione scaduta.");
  const [latest, activeSeason] = await Promise.all([
    supabase.from("league_phase_backups").select("id,to_phase,season_id,season_snapshot").is("restored_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("seasons").select(seasonSelection).eq("is_active", true).maybeSingle(),
  ]);
  if (latest.error || latest.data?.id !== backupId) phaseError("Puoi ripristinare soltanto l’ultimo passaggio disponibile.");
  if (!activeSeason.data || leagueMomentFromSeason(activeSeason.data) !== latest.data.to_phase) {
    phaseError("Il momento della lega è stato rettificato manualmente: questo backup non è più ripristinabile direttamente.");
  }
  const restored = await supabase.rpc("restore_league_phase_backup", { requested_backup_id: backupId });
  if (restored.error) phaseError(restored.error.message);
  const snapshot = latest.data.season_snapshot as {
    status?: string;
    timeline_moment?: string;
    team_options_resolved?: boolean;
    trade_deadline_passed?: boolean;
  };
  const restoredMoment = leagueMomentFromSeason({
    status: snapshot.status ?? "offseason",
    timeline_moment: snapshot.timeline_moment,
    team_options_resolved: snapshot.team_options_resolved,
    trade_deadline_passed: snapshot.trade_deadline_passed,
  });
  const momentRestore = await supabase.from("seasons").update({ timeline_moment: restoredMoment }).eq("id", latest.data.season_id);
  if (momentRestore.error) phaseError(momentRestore.error.message);
  revalidateLeaguePages();
  redirect("/admin/impostazioni?restored=1");
}

// Compatibilità con il vecchio componente: la chiusura ora passa dalla stessa sequenza guidata.
export async function advanceLeagueSeason() {
  return advanceLeaguePhaseStep();
}

async function performLeagueSeasonAdvance(
  supabase: Supabase,
  seasonName: string,
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
    const historyPayload = buildAutomaticHistoryArchive(history.competitions, currentHistory);
    const nextState = {
      ...state,
      rosterEntries: advance.rosterEntries,
      qualifyingOfferRights: advance.qualifyingOfferRights,
      playerList: advance.playerList,
      playerListStatus: "offseason" as const,
    };
    const response = await supabase.rpc("advance_league_and_archive_competitions", {
      state_payload: nextState,
      expected_season_name: seasonName,
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
    "/", "/squadre", "/giocatori", "/competizioni", "/storico", "/admin", "/admin/impostazioni",
    "/admin/team-option", "/admin/asta", "/admin/contratti", "/admin/free-agent", "/admin/scambi",
    "/admin/draft", "/admin/altre-operazioni", "/admin/storico", "/admin/contenuti",
  ].forEach((route) => revalidatePath(route));
}

function phaseError(message: string): never {
  redirect(`/admin/impostazioni?error=${encodeURIComponent(message)}`);
}
