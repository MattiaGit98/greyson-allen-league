"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { leagueMomentFromSeason } from "@/lib/league-moments";
import { buildMovementReversal, movementReversalSlotErrors, movementUndoMetadataFromState, movementUndoWindowError } from "@/lib/league-movements";
import { loadEditableLeagueState, normalizeState } from "@/lib/league-state";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const path = "/admin/movimenti";

export async function revertMovement(formData: FormData) {
  const movementId = String(formData.get("movement_id") ?? "").trim();
  if (!movementId) fail("Movimento non valido.");
  const supabase = await createSupabaseServerClient();
  if (!supabase) fail("Supabase non configurato.");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) fail("Sessione scaduta.");
  const [response, seasonResponse] = await Promise.all([
    supabase.from("league_movements").select("id,operation_type,before_state,after_state,season_name,undo_before_moment,reverted_at").eq("id", movementId).maybeSingle(),
    supabase.from("seasons").select("name,status,team_options_resolved,trade_deadline_passed,timeline_moment").eq("is_active", true).maybeSingle(),
  ]);
  if (response.error || !response.data || response.data.reverted_at) fail(response.error?.message ?? "Movimento non disponibile.");
  if (seasonResponse.error || !seasonResponse.data) fail(seasonResponse.error?.message ?? "Nessuna stagione attiva.");
  const snapshotMetadata = movementUndoMetadataFromState(response.data.before_state);
  const windowError = movementUndoWindowError({
    operationType: response.data.operation_type,
    movementSeasonName: response.data.season_name ?? snapshotMetadata.seasonName,
    undoBeforeMoment: response.data.undo_before_moment ?? snapshotMetadata.undoBeforeMoment,
    currentSeasonName: seasonResponse.data.name,
    currentMoment: leagueMomentFromSeason(seasonResponse.data),
  });
  if (windowError) fail(windowError);
  const current = await loadEditableLeagueState();
  let restored;
  try {
    restored = buildMovementReversal(current, normalizeState(response.data.before_state), normalizeState(response.data.after_state));
  } catch (error) {
    fail(error instanceof Error ? error.message : "Il movimento non può essere annullato.");
  }
  const slotErrors = movementReversalSlotErrors(current, restored);
  if (slotErrors.length) {
    fail(`${slotErrors.join(" ")} L'annullamento ricreerebbe un conflitto di slot.`);
  }
  const reverted = await supabase.rpc("revert_league_state_movement", {
    requested_movement_id: movementId,
    expected_current_state: current,
    restored_state: restored,
  });
  if (reverted.error) fail(reverted.error.message);
  ["/squadre", "/giocatori", "/movimenti", "/storico", "/admin", path, "/admin/draft", "/admin/storico", "/admin/asta", "/admin/contratti"].forEach((route) => revalidatePath(route));
  redirect(`${path}?reverted=1`);
}

function fail(message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}
