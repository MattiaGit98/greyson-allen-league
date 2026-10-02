"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { buildSeasonEndCutPlan, rosterEntryKey } from "@/lib/league-advance";
import { loadEditableLeagueState } from "@/lib/league-state";
import { persistLeagueMovement } from "@/lib/league-movements";
import { leagueMomentFromSeason, operationWindows } from "@/lib/league-moments";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const path = "/admin/altre-operazioni";

export async function applyScheduledSeasonEndCut(formData: FormData) {
  const teamCode = String(formData.get("team_code") ?? "").trim().toUpperCase();
  const playerName = String(formData.get("player_name") ?? "").trim();
  const operation = String(formData.get("scheduled_cut_operation") ?? "");
  if (!teamCode || !playerName || !["schedule", "cancel"].includes(operation)) fail("Operazione non valida.");

  const supabase = await createSupabaseServerClient();
  if (!supabase) fail("Supabase non configurato.");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) fail("Sessione scaduta.");
  const seasonResponse = await supabase
    .from("seasons")
    .select("name,timeline_moment")
    .eq("is_active", true)
    .maybeSingle();
  if (seasonResponse.error || !seasonResponse.data) fail(seasonResponse.error?.message ?? "Nessuna stagione attiva.");
  const season = seasonResponse.data;
  const moment = leagueMomentFromSeason(season);
  if (!operationWindows.scheduledCut(moment)) {
    fail("I tagli programmati sono disponibili soltanto dalla Riapertura free agency alla Fine stagione.");
  }

  const state = await loadEditableLeagueState();
  const entryIndex = state.rosterEntries.findIndex((entry) => (
    entry.teamCode === teamCode && entry.name === playerName
  ));
  const entry = state.rosterEntries[entryIndex];
  if (!entry) fail("Il giocatore non appartiene alla squadra selezionata.");

  if (operation === "schedule") {
    if (entry.state !== "active") fail("Puoi programmare il taglio soltanto per un giocatore attivo.");
    if (entry.scheduledSeasonEndCut) fail("Per questo giocatore esiste già un taglio programmato.");
    const plan = buildSeasonEndCutPlan({
      seasonName: season.name,
      rosterEntries: state.rosterEntries,
      qualifyingOfferRights: state.qualifyingOfferRights,
      playerList: state.playerList,
    });
    if ((plan.remainingOverflowByTeam[teamCode] ?? 0) <= 0) {
      fail("La squadra non ha altri slot roster futuri da liberare.");
    }
    if (!plan.projectedRegularKeys.includes(rosterEntryKey(entry))) {
      fail("Il taglio di questo giocatore non ridurrebbe gli slot roster occupati nella prossima offseason.");
    }
  } else if (!entry.scheduledSeasonEndCut) {
    fail("Per questo giocatore non risulta un taglio programmato.");
  }

  const rosterEntries = state.rosterEntries.map((item, index) => index === entryIndex
    ? { ...item, scheduledSeasonEndCut: operation === "schedule" ? season.name : undefined }
    : item);
  const nextState = { ...state, rosterEntries };
  const isSchedule = operation === "schedule";
  const response = await persistLeagueMovement(
    supabase,
    state,
    nextState,
    isSchedule ? "taglio_programmato" : "annulla_taglio_programmato",
    isSchedule
      ? `Taglio programmato a Fine stagione: ${playerName} (${teamCode})`
      : `Taglio programmato annullato: ${playerName} (${teamCode})`,
  );
  if (response.error) fail(response.error.message);
  ["/", "/squadre", "/movimenti", "/admin", "/admin/movimenti", path, "/admin/impostazioni"]
    .forEach((route) => revalidatePath(route));
  redirect(`${path}?updated=${encodeURIComponent(isSchedule
    ? `Taglio programmato per ${playerName}.`
    : `Taglio programmato annullato per ${playerName}.`)}`);
}

function fail(message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}
