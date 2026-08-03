"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  applyCompleteDraftOrder,
  defaultDraftPositionCount,
  nextDraftYear,
  validateDraftOrderDraftStructure,
  yearsWithDefinedDraftPositions,
  type DraftOrderAssignment,
} from "@/lib/draft-positions";
import { loadEditableLeagueState } from "@/lib/league-state";
import { persistLeagueMovement } from "@/lib/league-movements";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const returnPath = "/admin/posizioni-draft";

export async function saveDraftPositionDraft(formData: FormData) {
  return saveDraftPositions(formData, false);
}

export async function finalizeDraftPositions(formData: FormData) {
  return saveDraftPositions(formData, true);
}

async function saveDraftPositions(formData: FormData, finalize: boolean) {
  const draftYear = Number(formData.get("draft_year"));
  if (!Number.isInteger(draftYear)) fail("Anno del draft non valido.");
  const assignments = parseAssignments(formData.get("positions_json"));

  const supabase = await createSupabaseServerClient();
  if (!supabase) fail("Supabase non configurato.");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) fail("Sessione scaduta.");
  const state = await loadEditableLeagueState();
  if (nextDraftYear(state.draftAssets) !== draftYear) {
    fail("Il pannello è avanzato a un altro draft. Aggiorna la pagina e riprova.");
  }
  if ((state.finalizedDraftPositionYears ?? []).includes(draftYear)) {
    fail(`L'ordine del Draft ${draftYear} è definitivo e non può più essere modificato.`);
  }

  const teamCodes = state.teams.map((team) => team.code);
  try {
    validateDraftOrderDraftStructure(assignments, teamCodes, draftYear);
  } catch (error) {
    fail(error instanceof Error ? error.message : "Posizioni non valide.");
  }
  const definedPositions = assignments.filter((assignment) => assignment.originTeamCode).length;
  const expectedPositionCount = defaultDraftPositionCount(draftYear, teamCodes.length);
  const isComplete = definedPositions === expectedPositionCount && assignments.length === expectedPositionCount;
  if (finalize && !isComplete) {
    fail(`Completa tutte le ${expectedPositionCount} posizioni prima del salvataggio finale.`);
  }
  let draftAssets = state.draftAssets;
  let resolvedClauses = 0;
  let ownershipChanges = 0;
  if (finalize) {
    try {
      const result = applyCompleteDraftOrder(state.draftAssets, draftYear, assignments, teamCodes);
      draftAssets = result.draftAssets;
      resolvedClauses = result.resolvedClauses;
      ownershipChanges = result.ownershipChanges;
    } catch (error) {
      fail(error instanceof Error ? error.message : "Posizioni non valide.");
    }
  }
  const draftOrders = [
    ...(state.draftOrders ?? []).filter((assignment) => assignment.year !== draftYear),
    ...assignments.map((assignment) => ({ ...assignment, year: draftYear })),
  ];
  const draftPositionYears = finalize
    ? [...new Set([...yearsWithDefinedDraftPositions(draftAssets), draftYear])].sort((left, right) => left - right)
    : yearsWithDefinedDraftPositions(state.draftAssets);
  const finalizedDraftPositionYears = finalize
    ? [...new Set([...(state.finalizedDraftPositionYears ?? []), draftYear])].sort((left, right) => left - right)
    : state.finalizedDraftPositionYears ?? [];
  const nextState = { ...state, draftAssets, draftOrders, draftPositionYears, finalizedDraftPositionYears };
  const response = finalize
    ? await persistLeagueMovement(
      supabase,
      state,
      nextState,
      "ordine_draft_finale",
      `Ordine definitivo Draft ${draftYear}: ${assignments.length} posizioni, ${assignments.filter((assignment) => assignment.isBonus).length} scelte bonus; ${resolvedClauses} clausole risolte, ${ownershipChanges} cambi di proprietà`,
    )
    : await supabase.rpc("replace_league_state", { state_payload: nextState });
  if (response.error) fail(response.error.message);
  ["/squadre", "/movimenti", "/admin", "/admin/draft", "/admin/movimenti", returnPath]
    .forEach((path) => revalidatePath(path));
  const clauseDetail = resolvedClauses
    ? ` Risolte ${resolvedClauses} clausole; ${ownershipChanges} hanno modificato il proprietario delle scelte.`
    : "";
  const message = finalize
    ? `Ordine del Draft ${draftYear} completato.${clauseDetail}`
    : `Bozza del Draft ${draftYear} salvata: ${definedPositions}/${expectedPositionCount} posizioni compilate.`;
  redirect(`${returnPath}?updated=${encodeURIComponent(message)}`);
}

function parseAssignments(value: FormDataEntryValue | null): DraftOrderAssignment[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(String(value ?? "[]"));
  } catch {
    fail("Dati delle posizioni non validi.");
  }
  if (!Array.isArray(parsed) || parsed.length < 1 || parsed.length > 30) fail("Dati delle posizioni non validi.");
  return parsed.map((item) => {
    if (!item || typeof item !== "object") fail("Posizione non valida.");
    const row = item as Record<string, unknown>;
    const position = Number(row.position);
    const originTeamCode = String(row.originTeamCode ?? "").trim().toUpperCase();
    const isBonus = row.isBonus === true;
    const round = String(row.round ?? "");
    if (!Number.isInteger(position)) fail("Posizione non valida.");
    if (round !== "1° giro" && round !== "2° giro") fail("Giro non valido.");
    return { position, originTeamCode, isBonus, round };
  });
}

function fail(message: string): never {
  redirect(`${returnPath}?error=${encodeURIComponent(message)}`);
}
