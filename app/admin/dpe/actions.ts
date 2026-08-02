"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { RosterEntry } from "@/lib/league-types";
import { persistLeagueMovement } from "@/lib/league-movements";
import { loadEditableLeagueState } from "@/lib/league-state";
import { calculateCapSpace, followingSeasonName } from "@/lib/season-time";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { leagueMomentFromSeason, operationWindows } from "@/lib/league-moments";
import { capOverrideRequested, capOverrideSummary, requireCapOverride, salaryCapWarningsForSpaces } from "@/lib/cap-override";
import { entriesForDpeAdjustedCap } from "@/lib/dpe-rules";

const path = "/admin/altre-operazioni";

export async function applyDpeOperation(formData: FormData) {
  const forceCap = capOverrideRequested(formData);
  const teamCode = String(formData.get("team_code") ?? "").trim().toUpperCase();
  const playerName = String(formData.get("player_name") ?? "").trim();
  const operation = String(formData.get("dpe_operation") ?? "");
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
  if (operation === "dpe_activate" && !operationWindows.dpeActivation(leagueMoment)) fail("La DPE è disponibile dall'inizio dell'offseason alla trade deadline, ma non durante l'asta.");
  if (operation === "dpe_reintegrate" && !operationWindows.dpeReintegration(leagueMoment)) fail("Il reintegro anticipato è disponibile dalla consegna dei contratti al termine della free agency.");

  const state = await loadEditableLeagueState();
  const entryIndex = state.rosterEntries.findIndex((entry) => (
    entry.teamCode === teamCode
    && entry.name === playerName
    && entry.state === "active"
  ));
  const entry = state.rosterEntries[entryIndex];
  if (!entry) fail("Il giocatore non appartiene più al roster selezionato.");
  const teamActive = state.rosterEntries.filter((item) => item.teamCode === teamCode && item.state === "active");
  if (operation === "dpe_activate") {
    if (entry.slot === "dpe") fail("Il giocatore è già nella DPE.");
    if (teamActive.some((item) => item.slot === "dpe")) fail("Lo slot DPE è già occupato.");
  } else {
    if (entry.slot !== "dpe") fail("Il giocatore non è nella DPE.");
    if (teamActive.filter((item) => item.slot === "regular").length >= 15) fail("Per il reintegro serve uno slot roster libero.");
  }

  const rosterEntries: RosterEntry[] = state.rosterEntries.map((item, index) => index === entryIndex
    ? { ...item, slot: operation === "dpe_activate" ? "dpe" : "regular" }
    : item);
  const seasonName = season.data.name;
  const beforeSpaces = capSpaces(state.rosterEntries, teamCode, seasonName, season.data.status, season.data.team_options_resolved);
  const spaces = capSpaces(rosterEntries, teamCode, seasonName, season.data.status, season.data.team_options_resolved);
  const capWarnings = salaryCapWarningsForSpaces({
    before: beforeSpaces,
    after: spaces,
    seasonNames: [0, 1, 2].map((distance) => followingSeasonName(seasonName, distance)),
    phase: season.data.status,
  });
  requireCapOverride(capWarnings, forceCap, fail);
  const nextState = { ...state, rosterEntries };
  const label = operation === "dpe_activate" ? "Esercizio DPE" : "Reintegro anticipato dalla DPE";
  const response = await persistLeagueMovement(supabase, state, nextState, operation, capOverrideSummary(`${label}: ${playerName}`, capWarnings, forceCap));
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
