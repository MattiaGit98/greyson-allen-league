"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { RosterEntry } from "@/lib/league-types";
import { persistLeagueMovement } from "@/lib/league-movements";
import { loadEditableLeagueState } from "@/lib/league-state";
import { calculateCapSpace, followingSeasonName } from "@/lib/season-time";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { leagueMomentFromSeason, operationWindows } from "@/lib/league-moments";
import { requireCapCompliance, salaryCapWarningsForSpaces } from "@/lib/cap-override";
import { dpeRequirementsConfirmation, entriesForDpeAdjustedCap } from "@/lib/dpe-rules";
import { isUnresolvedTeamOption } from "@/lib/team-option-contract";
import { roleMinimumRecoverySlotErrorForEntries, roleMinimumShortage } from "@/lib/role-minimums";
import { applyDpeActivation, applyEarlyDpeReintegration } from "@/lib/dpe-operations";

const path = "/admin/altre-operazioni";

export async function applyDpeOperation(formData: FormData) {
  const teamCode = String(formData.get("team_code") ?? "").trim().toUpperCase();
  const playerName = String(formData.get("player_name") ?? "").trim();
  const operation = String(formData.get("dpe_operation") ?? "");
  const confirmed = formData.get("requirements_confirmed") === "true";
  const roleMinimumConfirmed = formData.get("role_minimum_confirmed") === "true";
  if (formData.get("dpe_cut_confirmed") === "true" || formData.get("dpe_cut_player_name") || formData.get("dpe_stretch_years")) {
    fail("L'esercizio DPE non prevede più un taglio contestuale. Riapri il pannello.");
  }
  if (!teamCode || !playerName || !["dpe_activate", "dpe_reintegrate"].includes(operation)) fail("Operazione DPE non valida.");

  const supabase = await createSupabaseServerClient();
  if (!supabase) fail("Supabase non configurato.");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) fail("Sessione scaduta.");
  const season = await supabase
    .from("seasons")
    .select("name,status,team_options_resolved,trade_deadline_passed,timeline_moment")
    .eq("is_active", true)
    .maybeSingle();
  if (season.error || !season.data) fail(season.error?.message ?? "Nessuna stagione attiva.");
  const leagueMoment = leagueMomentFromSeason(season.data);
  if (operation === "dpe_activate" && !operationWindows.dpeActivation(leagueMoment)) fail("La DPE è disponibile dall'inizio dell'offseason alla Chiusura free agency della prima fase, ma non durante l'asta.");
  if (operation === "dpe_reintegrate" && !operationWindows.dpeReintegration(leagueMoment)) fail("Il reintegro anticipato è disponibile dalla Trade deadline alla Chiusura free agency della prima fase, solo per DPE esercitate prima della deadline.");
  if (operation === "dpe_activate" && !confirmed) fail(`Spunta la conferma: ${dpeRequirementsConfirmation}.`);

  const state = await loadEditableLeagueState();
  const entryIndex = state.rosterEntries.findIndex((entry) => (
    entry.teamCode === teamCode
    && entry.name === playerName
    && entry.state === "active"
  ));
  const entry = state.rosterEntries[entryIndex];
  if (!entry) fail("Il giocatore non appartiene più al roster selezionato.");
  if (isUnresolvedTeamOption(entry, leagueMoment, season.data.name)) {
    fail("Un contratto da rookie ancora da risolvere può essere gestito soltanto nel pannello Contratti da rookie.");
  }
  const teamActive = state.rosterEntries.filter((item) => item.teamCode === teamCode && item.state === "active");
  if (operation === "dpe_activate") {
    if (entry.slot === "dpe") fail("Il giocatore è già nella DPE.");
  } else {
    if (entry.slot !== "dpe") fail("Il giocatore non è nella DPE.");
    if (teamActive.filter((item) => item.slot === "regular").length >= 15) fail("Per il reintegro serve uno slot roster libero.");
  }

  const seasonName = season.data.name;
  let rosterEntries: RosterEntry[];
  try {
    const input = { rosterEntries: state.rosterEntries, teamCode, playerName, seasonName, leagueMoment };
    rosterEntries = operation === "dpe_activate" ? applyDpeActivation(input) : applyEarlyDpeReintegration(input);
  } catch (error) {
    fail(error instanceof Error ? error.message : "Operazione DPE non valida.");
  }
  const teamRosterAfter = rosterEntries.filter((item) => item.teamCode === teamCode);
  const roleMinimumSlotError = roleMinimumRecoverySlotErrorForEntries(teamRosterAfter, season.data.status, leagueMoment, state);
  if (roleMinimumSlotError) fail(roleMinimumSlotError);
  if (roleMinimumShortage(teamRosterAfter, season.data.status, leagueMoment).total > 0 && !roleMinimumConfirmed) {
    fail("Conferma il ripristino obbligatorio dei minimi di ruolo.");
  }
  const beforeSpaces = capSpaces(state.rosterEntries, teamCode, seasonName, season.data.status, season.data.team_options_resolved);
  const spaces = capSpaces(rosterEntries, teamCode, seasonName, season.data.status, season.data.team_options_resolved);
  const capWarnings = salaryCapWarningsForSpaces({
    before: beforeSpaces,
    after: spaces,
    seasonNames: [0, 1, 2].map((distance) => followingSeasonName(seasonName, distance)),
    phase: season.data.status,
    currentMoment: leagueMoment,
  });
  requireCapCompliance(capWarnings, fail);
  const nextState = {
    ...state,
    rosterEntries,
  };
  const label = operation === "dpe_activate" ? "Esercizio DPE" : "Reintegro anticipato dalla DPE";
  const sourceSlot = entry.slot === "two_way" ? "Two-way" : entry.slot === "g_league" ? "G-League" : "Roster";
  const slotDetail = operation === "dpe_activate" ? `${sourceSlot} → DPE` : "DPE → Roster";
  const response = await persistLeagueMovement(supabase, state, nextState, operation, `${playerName}: ${label.toLocaleLowerCase("it-IT")} per ${teamCode}; ${slotDetail}`);
  if (response.error) fail(response.error.message);
  ["/squadre", "/giocatori", "/movimenti", "/admin", path, "/admin/impostazioni"]
    .forEach((route) => revalidatePath(route));
  redirect(`${path}?updated=${encodeURIComponent(`${label} registrato per ${playerName}.`)}`);
}

function capSpaces(entries: RosterEntry[], teamCode: string, seasonName: string, phase: string, teamOptionsResolved: boolean) {
  const countTeamOptions = phase !== "offseason" || teamOptionsResolved;
  return [0, 1, 2].map((distance) => calculateCapSpace({
    entries: entriesForDpeAdjustedCap(entries.filter((entry) => entry.teamCode === teamCode), distance),
    seasonName: followingSeasonName(seasonName, distance),
    optionSeasonName: seasonName,
    countTeamOptions,
  }));
}

function fail(message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}
