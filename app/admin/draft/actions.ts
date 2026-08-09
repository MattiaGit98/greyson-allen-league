"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { buildDraftAssignment, draftSlotLabel, type DraftDestinationSlot } from "@/lib/draft-assignment";
import { nextDraftYear } from "@/lib/draft-positions";
import { loadHistoryCompetitionState } from "@/lib/history-competition-store";
import { loadEditableLeagueState } from "@/lib/league-state";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { leagueMomentFromSeason, operationWindows } from "@/lib/league-moments";

const draftPath = "/admin/draft";

export async function assignDraftPlayer(formData: FormData) {
  const pickIndex = Number(formData.get("pick_index"));
  const requestedDraftYear = Number(formData.get("draft_year"));
  const playerName = String(formData.get("player_name") ?? "").trim();
  const destinationSlot = String(formData.get("destination_slot") ?? "") as DraftDestinationSlot;
  if (!Number.isInteger(pickIndex) || !Number.isInteger(requestedDraftYear) || !playerName || !["regular", "two_way", "g_league", "immediate_cut", "immediate_release"].includes(destinationSlot)) {
    fail("Scelta o giocatore non validi.");
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) fail("Supabase non configurato.");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) fail("Sessione scaduta.");
  const season = await supabase.from("seasons").select("name,status,team_options_resolved,trade_deadline_passed,timeline_moment").eq("is_active", true).maybeSingle();
  if (season.error || !season.data) fail(season.error?.message ?? "Nessuna stagione attiva.");
  if (!operationWindows.draft(leagueMomentFromSeason(season.data))) fail("Il Draft non è aperto in questo momento della lega.");
  const activeDraftYear = Number(season.data.name.slice(0, 4));
  if (requestedDraftYear !== activeDraftYear) {
    fail(`Il Draft ${requestedDraftYear} è soltanto in anteprima: l'annata attiva prevede il Draft ${activeDraftYear}.`);
  }

  const [state, history] = await Promise.all([
    loadEditableLeagueState(),
    loadHistoryCompetitionState(),
  ]);
  if (state.playerListStatus !== "published") fail("Pubblica prima il listone ufficiale.");
  const currentDraftYear = nextDraftYear(state.draftAssets);
  if (currentDraftYear === null || currentDraftYear !== requestedDraftYear) {
    fail("La scelta non appartiene al prossimo draft. Aggiorna la pagina e riprova.");
  }
  if (!(state.finalizedDraftPositionYears ?? []).includes(requestedDraftYear)) {
    fail(`Completa prima l'ordine ufficiale del Draft ${requestedDraftYear}.`);
  }

  let assignment: ReturnType<typeof buildDraftAssignment>;
  try {
    assignment = buildDraftAssignment({
      state,
      historyEntries: history.competitions.Draft,
      draftYear: currentDraftYear,
      pickIndex,
      requestedPlayerName: playerName,
      destinationSlot,
    });
  } catch (error) {
    fail(error instanceof Error ? error.message : "Dati del draft non validi.");
  }

  const response = await supabase.rpc("apply_league_state_and_history_movement", {
    expected_before_state: state,
    next_state: assignment.state,
    history_category: "Draft",
    expected_before_history: history.competitions.Draft,
    next_history: assignment.historyEntries,
    movement_type: "scelta_draft",
    movement_summary: assignment.slot === "immediate_cut"
      ? `${assignment.playerName}: scelto al Draft ${requestedDraftYear} da ${assignment.teamCode} e tagliato immediatamente`
      : assignment.slot === "immediate_release"
        ? `${assignment.playerName}: scelto al Draft ${requestedDraftYear} da ${assignment.teamCode} e rilasciato immediatamente`
        : `${assignment.playerName}: scelto al Draft ${requestedDraftYear} da ${assignment.teamCode} nello slot ${draftSlotLabel(assignment.slot)}`,
  });
  if (response.error) fail(response.error.message);

  [
    "/squadre",
    "/giocatori",
    "/storico",
    "/admin",
    "/admin/draft",
    "/admin/storico",
    "/admin/contratti",
    "/admin/posizioni-draft",
    "/admin/scambi",
    "/movimenti",
    "/admin/movimenti",
  ].forEach((path) => revalidatePath(path));

  const completion = assignment.draftCompleted
    ? `Draft completato: aggiunte ${assignment.futurePicksAdded} scelte per il ${assignment.futureDraftYear}.`
    : `Completate ${assignment.assignedPickCount}/${assignment.expectedPickCount} scelte.`;
  redirect(`${draftPath}?assigned=${encodeURIComponent(`${assignment.playerName} assegnato a ${assignment.teamCode} nello slot ${draftSlotLabel(assignment.slot)}. ${completion}`)}`);
}

function fail(message: string): never {
  redirect(`${draftPath}?error=${encodeURIComponent(message)}`);
}
