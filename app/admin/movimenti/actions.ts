"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { leagueMomentFromSeason, operationWindows } from "@/lib/league-moments";
import { auctionAssignmentReversalDuringAuction, buildMovementReversal, draftChoiceBelongsToSeason, movementReversalCapErrors, movementReversalSlotErrors, movementUndoMetadataFromState, movementUndoWindowError } from "@/lib/league-movements";
import { loadEditableLeagueState, normalizeState } from "@/lib/league-state";
import { movementOperationLabel } from "@/lib/movement-display";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { roleMinimumAffectedTeamCodes, roleMinimumRecoverySlotErrorForEntries, roleMinimumsWorsen } from "@/lib/role-minimums";
import { movementReversalPreview } from "@/lib/movement-reversal-preview";
import { shouldCountTeamOptions } from "@/lib/season-time";

const defaultPath = "/admin/movimenti";

export async function prepareMovementReversal(movementId: string) {
  try {
    if (!movementId) return { ok: false, reason: "Movimento non valido." } as const;
    const supabase = await createSupabaseServerClient();
    if (!supabase) return { ok: false, reason: "Supabase non configurato." } as const;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false, reason: "Sessione scaduta." } as const;
    const [movementResponse, seasonResponse] = await Promise.all([
      supabase.from("league_movements")
        .select("id,operation_type,before_state,after_state,season_name,undo_before_moment,reverted_at")
        .eq("id", movementId).maybeSingle(),
      supabase.from("seasons")
        .select("name,status,team_options_resolved,trade_deadline_passed,timeline_moment")
        .eq("is_active", true).maybeSingle(),
    ]);
    if (movementResponse.error || !movementResponse.data || movementResponse.data.reverted_at) {
      return { ok: false, reason: movementResponse.error?.message ?? "Movimento non più disponibile." } as const;
    }
    if (seasonResponse.error || !seasonResponse.data) {
      return { ok: false, reason: seasonResponse.error?.message ?? "Nessuna stagione attiva." } as const;
    }
    const movement = movementResponse.data;
    const season = seasonResponse.data;
    const currentMoment = leagueMomentFromSeason(season);
    let latestDraftChoiceId: string | null = null;
    if (movement.operation_type === "scelta_draft") {
      const latestDraft = await supabase.from("league_movements")
        .select("id,season_name,after_history")
        .eq("operation_type", "scelta_draft")
        .is("reverted_at", null)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(1);
      if (latestDraft.error) return { ok: false, reason: latestDraft.error.message } as const;
      const candidate = latestDraft.data?.[0];
      latestDraftChoiceId = candidate && draftChoiceBelongsToSeason(candidate.season_name, candidate.after_history, season.name)
        ? candidate.id : null;
    }
    const snapshotMetadata = movementUndoMetadataFromState(movement.before_state);
    const windowError = movementUndoWindowError({
      operationType: movement.operation_type,
      movementSeasonName: movement.season_name ?? snapshotMetadata.seasonName,
      undoBeforeMoment: movement.undo_before_moment ?? snapshotMetadata.undoBeforeMoment,
      currentSeasonName: season.name,
      currentMoment,
      isLatestDraftChoice: movement.id === latestDraftChoiceId,
    });
    if (windowError) return { ok: false, reason: windowError } as const;

    const current = await loadEditableLeagueState();
    const restored = buildMovementReversal(current, normalizeState(movement.before_state), normalizeState(movement.after_state));
    const isAuctionUndo = auctionAssignmentReversalDuringAuction(movement.operation_type, currentMoment);
    if (!isAuctionUndo) {
      const slotErrors = movementReversalSlotErrors(current, restored);
      if (slotErrors.length) return { ok: false, reason: `${slotErrors.join(" ")} L'annullamento ricreerebbe un conflitto di slot.` } as const;
      const capErrors = movementReversalCapErrors(current, restored, {
        seasonName: season.name,
        phase: season.status,
        teamOptionsResolved: season.team_options_resolved,
        currentMoment,
      });
      if (capErrors.length) return { ok: false, reason: `${capErrors.join(" ")} L'annullamento non rispetterebbe il salary cap.` } as const;
      const roleSlotErrors = roleMinimumAffectedTeamCodes(current.rosterEntries, restored.rosterEntries)
        .flatMap((teamCode) => {
          const error = roleMinimumRecoverySlotErrorForEntries(restored.rosterEntries.filter((entry) => entry.teamCode === teamCode), season.status, currentMoment);
          return error ? [`${teamCode}: ${error}`] : [];
        });
      if (roleSlotErrors.length) return { ok: false, reason: `${roleSlotErrors.join(" ")} L'annullamento non lascerebbe slot sufficienti per ripristinare i ruoli.` } as const;
    }
    return {
      ok: true,
      preview: movementReversalPreview({
        current,
        restored,
        seasonName: season.name,
        countTeamOptions: shouldCountTeamOptions(season.status, season.team_options_resolved),
        currentMoment,
      }),
      roleMinimumConfirmationRequired: !isAuctionUndo
        && roleMinimumsWorsen(current.rosterEntries, restored.rosterEntries, season.status, currentMoment),
    } as const;
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "Verifica dell'annullamento non riuscita." } as const;
  }
}

export async function revertMovement(formData: FormData) {
  const movementId = String(formData.get("movement_id") ?? "").trim();
  const roleMinimumConfirmed = formData.get("role_minimum_confirmed") === "true";
  const auctionAssignmentOnly = formData.get("auction_assignment_only") === "true";
  const requestedPath = String(formData.get("return_path") ?? "");
  const path = requestedPath === "/admin/asta" ? requestedPath : defaultPath;
  if (!movementId) fail(path, "Movimento non valido.");
  const supabase = await createSupabaseServerClient();
  if (!supabase) fail(path, "Supabase non configurato.");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) fail(path, "Sessione scaduta.");
  const [response, seasonResponse, draftChoicesResponse] = await Promise.all([
    supabase.from("league_movements").select("id,operation_type,summary,before_state,after_state,after_history,season_name,undo_before_moment,reverted_at").eq("id", movementId).maybeSingle(),
    supabase.from("seasons").select("name,status,team_options_resolved,trade_deadline_passed,timeline_moment").eq("is_active", true).maybeSingle(),
    supabase
      .from("league_movements")
      .select("id,season_name,after_history")
      .eq("operation_type", "scelta_draft")
      .is("reverted_at", null)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(1),
  ]);
  if (response.error || !response.data || response.data.reverted_at) fail(path, response.error?.message ?? "Movimento non disponibile.");
  if (seasonResponse.error || !seasonResponse.data) fail(path, seasonResponse.error?.message ?? "Nessuna stagione attiva.");
  if (draftChoicesResponse.error) fail(path, draftChoicesResponse.error.message);
  const season = seasonResponse.data;
  if (auctionAssignmentOnly && (response.data.operation_type !== "acquisto_asta" || !operationWindows.auction(leagueMomentFromSeason(season)))) {
    fail(path, "Questa assegnazione d’asta non è più annullabile dal pannello asta.");
  }
  const snapshotMetadata = movementUndoMetadataFromState(response.data.before_state);
  const currentMoment = leagueMomentFromSeason(seasonResponse.data);
  const latestDraftChoiceId = (draftChoicesResponse.data ?? []).find((movement) => (
    draftChoiceBelongsToSeason(movement.season_name, movement.after_history, season.name)
  ))?.id ?? null;
  const windowError = movementUndoWindowError({
    operationType: response.data.operation_type,
    movementSeasonName: response.data.season_name ?? snapshotMetadata.seasonName,
    undoBeforeMoment: response.data.undo_before_moment ?? snapshotMetadata.undoBeforeMoment,
    currentSeasonName: seasonResponse.data.name,
    currentMoment,
    isLatestDraftChoice: response.data.id === latestDraftChoiceId,
  });
  if (windowError) fail(path, windowError);
  const current = await loadEditableLeagueState();
  let restored;
  try {
    restored = buildMovementReversal(current, normalizeState(response.data.before_state), normalizeState(response.data.after_state));
  } catch (error) {
    fail(path, error instanceof Error ? error.message : "Il movimento non può essere annullato.");
  }
  const isAuctionAssignmentUndo = auctionAssignmentReversalDuringAuction(response.data.operation_type, currentMoment);
  if (!isAuctionAssignmentUndo) {
  const roleMinimumSlotErrors = roleMinimumAffectedTeamCodes(current.rosterEntries, restored.rosterEntries)
    .flatMap((teamCode) => {
      const error = roleMinimumRecoverySlotErrorForEntries(restored.rosterEntries.filter((entry) => entry.teamCode === teamCode), season.status, currentMoment);
      return error ? [`${teamCode}: ${error}`] : [];
  });
  if (roleMinimumSlotErrors.length) fail(path, roleMinimumSlotErrors.join(" "));
  if (roleMinimumsWorsen(current.rosterEntries, restored.rosterEntries, season.status, currentMoment) && !roleMinimumConfirmed) {
    fail(path, "Conferma il ripristino obbligatorio dei minimi di ruolo.");
  }
  const slotErrors = movementReversalSlotErrors(current, restored);
  if (slotErrors.length) {
    fail(path, `${slotErrors.join(" ")} L'annullamento ricreerebbe un conflitto di slot.`);
  }
  const capErrors = movementReversalCapErrors(current, restored, {
    seasonName: seasonResponse.data.name,
    phase: seasonResponse.data.status,
    teamOptionsResolved: seasonResponse.data.team_options_resolved,
    currentMoment,
  });
  if (capErrors.length) {
    fail(path, `${capErrors.join(" ")} L'annullamento non può essere registrato perché non rispetta il salary cap.`);
  }
  }
  const reverted = await supabase.rpc("revert_league_state_movement", {
    requested_movement_id: movementId,
    expected_current_state: current,
    restored_state: restored,
    requested_reversal_summary: `${movementOperationLabel(response.data.operation_type)} annullato: ${response.data.summary}`,
  });
  if (reverted.error) fail(path, reverted.error.message);
  ["/squadre", "/giocatori", "/movimenti", "/storico", "/admin", path, "/admin/draft", "/admin/storico", "/admin/asta", "/admin/contratti"].forEach((route) => revalidatePath(route));
  redirect(`${path}?reverted=1`);
}

function fail(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}
