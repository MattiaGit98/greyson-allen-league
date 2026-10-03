"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  applyCompleteDraftOrder,
  nextDraftYear,
  validateDraftOrderDraftStructure,
  type DraftOrderAssignment,
} from "@/lib/draft-positions";
import { initializeDraftHistory } from "@/lib/draft-history";
import { loadHistoryCompetitionState } from "@/lib/history-competition-store";
import { loadEditableLeagueState } from "@/lib/league-state";
import { replaceLeagueStateIfUnchanged } from "@/lib/league-state-persistence";
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
  const [state, history] = await Promise.all([
    loadEditableLeagueState(),
    loadHistoryCompetitionState(),
  ]);
  if (nextDraftYear(state.draftAssets) !== draftYear) {
    fail("Il pannello è avanzato a un altro draft. Aggiorna la pagina e riprova.");
  }
  if ((state.finalizedDraftPositionYears ?? []).includes(draftYear)) {
    fail(`L'ordine del Draft ${draftYear} è definitivo e non può più essere modificato.`);
  }

  const teamCodes = state.teams.map((team) => team.code);
  try {
    validateDraftOrderDraftStructure(assignments, teamCodes);
  } catch (error) {
    fail(error instanceof Error ? error.message : "Posizioni non valide.");
  }
  const definedPositions = assignments.filter((assignment) => assignment.originTeamCode).length;
  const definedCosts = assignments.filter((assignment) => Number.isInteger(assignment.cost) && Number(assignment.cost) > 0).length;
  const minimumPositionCount = teamCodes.length * 2;
  const isComplete = assignments.length >= minimumPositionCount
    && definedPositions === assignments.length
    && definedCosts === assignments.length;
  if (finalize && !isComplete) {
    fail(`Inserisci almeno ${teamCodes.length} scelte per giro e completa squadra e costo di ogni riga prima del salvataggio finale.`);
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
  const finalizedDraftPositionYears = finalize
    ? [...new Set([...(state.finalizedDraftPositionYears ?? []), draftYear])].sort((left, right) => left - right)
    : state.finalizedDraftPositionYears ?? [];
  const nextState = { ...state, draftAssets, draftOrders, finalizedDraftPositionYears };
  let response;
  if (finalize) {
    let nextHistory;
    try {
      nextHistory = initializeDraftHistory(history.competitions.Draft, draftYear, draftAssets);
    } catch (error) {
      fail(error instanceof Error ? error.message : "Storico Draft non valido.");
    }
    response = await supabase.rpc("apply_league_state_and_history_movement", {
      expected_before_state: state,
      next_state: nextState,
      history_category: "Draft",
      expected_before_history: history.competitions.Draft,
      next_history: nextHistory,
      movement_type: "ordine_draft_finale",
      movement_summary: `Ordine definitivo Draft ${draftYear}: ${assignments.length} posizioni e ${assignments.filter((assignment) => assignment.isBonus).length} scelte bonus`,
    });
  } else {
    response = await replaceLeagueStateIfUnchanged(
      supabase,
      state,
      nextState,
      `Salvataggio della bozza delle posizioni Draft ${draftYear}`,
    );
  }
  if (response.error) fail(response.error.message);
  ["/squadre", "/storico", "/movimenti", "/admin", "/admin/draft", "/admin/storico", "/admin/movimenti", returnPath]
    .forEach((path) => revalidatePath(path));
  const clauseDetail = resolvedClauses
    ? ` Risolte ${resolvedClauses} clausole; ${ownershipChanges} hanno modificato il proprietario delle scelte.`
    : "";
  const message = finalize
    ? `Ordine del Draft ${draftYear} completato.${clauseDetail}`
    : `Bozza del Draft ${draftYear} salvata: ${assignments.length} righe, ${definedPositions}/${assignments.length} squadre e ${definedCosts}/${assignments.length} costi compilati.`;
  redirect(`${returnPath}?updated=${encodeURIComponent(message)}`);
}

function parseAssignments(value: FormDataEntryValue | null): DraftOrderAssignment[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(String(value ?? "[]"));
  } catch {
    fail("Dati delle posizioni non validi.");
  }
  if (!Array.isArray(parsed) || parsed.length < 1) fail("Dati delle posizioni non validi.");
  return parsed.map((item) => {
    if (!item || typeof item !== "object") fail("Posizione non valida.");
    const row = item as Record<string, unknown>;
    const position = Number(row.position);
    const originTeamCode = String(row.originTeamCode ?? "").trim().toUpperCase();
    const isBonus = row.isBonus === true;
    const round = String(row.round ?? "");
    const cost = row.cost === null || row.cost === "" || row.cost === undefined ? null : Number(row.cost);
    if (!Number.isInteger(position)) fail("Posizione non valida.");
    if (round !== "1° giro" && round !== "2° giro") fail("Giro non valido.");
    if (cost !== null && (!Number.isInteger(cost) || cost < 1)) fail("Costo non valido.");
    return { position, originTeamCode, isBonus, round, cost };
  });
}

function fail(message: string): never {
  redirect(`${returnPath}?error=${encodeURIComponent(message)}`);
}
