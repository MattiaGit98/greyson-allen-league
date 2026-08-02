"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { buildMovementReversal } from "@/lib/league-movements";
import { loadEditableLeagueState, normalizeState } from "@/lib/league-state";
import { changedSlotTeamCodes, findAllSlotOverflows, slotOverflowMessage } from "@/lib/roster-slot-limits";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const path = "/admin/movimenti";

export async function revertMovement(formData: FormData) {
  const movementId = String(formData.get("movement_id") ?? "").trim();
  if (!movementId) fail("Movimento non valido.");
  const supabase = await createSupabaseServerClient();
  if (!supabase) fail("Supabase non configurato.");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) fail("Sessione scaduta.");
  const response = await supabase.from("league_movements").select("id,before_state,after_state,reverted_at").eq("id", movementId).maybeSingle();
  if (response.error || !response.data || response.data.reverted_at) fail(response.error?.message ?? "Movimento non disponibile.");
  const current = await loadEditableLeagueState();
  let restored;
  try {
    restored = buildMovementReversal(current, normalizeState(response.data.before_state), normalizeState(response.data.after_state));
  } catch (error) {
    fail(error instanceof Error ? error.message : "Il movimento non può essere annullato.");
  }
  const affectedTeams = changedSlotTeamCodes(current.rosterEntries, restored.rosterEntries);
  const slotErrors = findAllSlotOverflows(restored.rosterEntries, affectedTeams).map(slotOverflowMessage);
  if (slotErrors.length) {
    fail(`${slotErrors.join(" ")} L'annullamento ricreerebbe un conflitto di slot.`);
  }
  const reverted = await supabase.rpc("revert_league_state_movement", {
    requested_movement_id: movementId,
    expected_current_state: current,
    restored_state: restored,
  });
  if (reverted.error) fail(reverted.error.message);
  ["/squadre", "/giocatori", "/movimenti", "/storico", "/admin", path, "/admin/draft", "/admin/storico", "/admin/rettifiche", "/admin/asta", "/admin/contratti"].forEach((route) => revalidatePath(route));
  redirect(`${path}?reverted=1`);
}

function fail(message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}
