"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { loadEditableLeagueState } from "@/lib/league-state";
import { persistLeagueMovement } from "@/lib/league-movements";
import { findTeamSlotOverflows, slotOverflowMessage } from "@/lib/roster-slot-limits";
import { legalSlotDestinations, moveRosterEntryToSlot, slotEligibilityErrors, slotMoveTimingErrors, type ManagedRosterSlot } from "@/lib/slot-eligibility";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { leagueMomentFromSeason } from "@/lib/league-moments";

const path = "/admin/slot";

export async function moveRosterSlot(formData: FormData) {
  const teamCode = clean(formData.get("team_code")).toUpperCase();
  const playerName = clean(formData.get("player_name"));
  const destination = clean(formData.get("destination")) as ManagedRosterSlot;
  if (!teamCode || !playerName || !["regular", "two_way", "g_league"].includes(destination)) {
    fail("Spostamento non valido.");
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) fail("Supabase non configurato.");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) fail("Sessione scaduta.");
  const seasonResponse = await supabase
    .from("seasons")
    .select("name,status,team_options_resolved,trade_deadline_passed,timeline_moment")
    .eq("is_active", true)
    .maybeSingle();
  if (seasonResponse.error || !seasonResponse.data) fail(seasonResponse.error?.message ?? "Nessuna stagione attiva.");

  const state = await loadEditableLeagueState();
  const entryIndex = state.rosterEntries.findIndex((entry) => (
    entry.teamCode === teamCode
    && entry.name === playerName
    && entry.state === "active"
  ));
  const entry = state.rosterEntries[entryIndex];
  if (!entry) fail("Il giocatore non appartiene più alla squadra selezionata.");
  const sourceSlot = entry.slot;
  if (sourceSlot === "dpe") fail("Per spostare un giocatore dalla DPE usa il reintegro.");
  if (sourceSlot === destination) fail("Scegli uno slot diverso da quello attuale.");

  const moment = leagueMomentFromSeason(seasonResponse.data);
  const legalDestinations = legalSlotDestinations({ ...entry, slot: sourceSlot }, seasonResponse.data.name, moment);
  if (!legalDestinations.includes(destination)) fail("Questo spostamento di slot non è consentito.");
  const timingErrors = slotMoveTimingErrors({ ...entry, slot: sourceSlot }, destination, seasonResponse.data.name, moment);
  if (timingErrors.length) fail(timingErrors.join(" "));
  const eligibilityErrors = slotEligibilityErrors(entry, destination, seasonResponse.data.name);
  if (eligibilityErrors.length) fail(eligibilityErrors.join(" "));

  const rosterEntries = state.rosterEntries.map((item, index) => index === entryIndex
    ? moveRosterEntryToSlot(item, destination)
    : item);
  const slotErrors = findTeamSlotOverflows(rosterEntries, teamCode).map(slotOverflowMessage);
  if (slotErrors.length) fail(slotErrors.join(" "));

  const nextState = { ...state, rosterEntries };
  const response = await persistLeagueMovement(
    supabase,
    state,
    nextState,
    "spostamento_slot",
    `${playerName}: ${slotLabel(sourceSlot)} → ${slotLabel(destination)}`,
  );
  if (response.error) fail(response.error.message);
  ["/squadre", "/giocatori", "/movimenti", "/admin", path, "/admin/altre-operazioni"]
    .forEach((route) => revalidatePath(route));
  redirect(`${path}?updated=${encodeURIComponent(`${playerName}: ${slotLabel(sourceSlot)} → ${slotLabel(destination)}.`)}`);
}

function slotLabel(slot: ManagedRosterSlot | "dpe") {
  if (slot === "two_way") return "Two-way";
  if (slot === "g_league") return "G-League";
  if (slot === "dpe") return "DPE";
  return "Roster";
}

function clean(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function fail(message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}
