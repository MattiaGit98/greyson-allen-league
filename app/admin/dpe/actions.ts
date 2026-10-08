"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { RosterEntry } from "@/lib/league-types";
import { persistLeagueMovement } from "@/lib/league-movements";
import { loadEditableLeagueState } from "@/lib/league-state";
import { calculateCapSpace, followingSeasonName, seasonEndYear } from "@/lib/season-time";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { leagueMomentFromSeason, operationWindows } from "@/lib/league-moments";
import { requireCapCompliance, salaryCapWarningsForSpaces } from "@/lib/cap-override";
import { entriesForDpeAdjustedCap } from "@/lib/dpe-rules";
import { isUnresolvedTeamOption } from "@/lib/team-option-contract";
import { roleMinimumRecoverySlotErrorForEntries, roleMinimumShortage } from "@/lib/role-minimums";
import { applyDpeActivationWithOptionalCut } from "@/lib/dpe-operations";

const path = "/admin/altre-operazioni";

export async function applyDpeOperation(formData: FormData) {
  const teamCode = String(formData.get("team_code") ?? "").trim().toUpperCase();
  const playerName = String(formData.get("player_name") ?? "").trim();
  const operation = String(formData.get("dpe_operation") ?? "");
  const confirmed = formData.get("requirements_confirmed") === "true";
  const roleMinimumConfirmed = formData.get("role_minimum_confirmed") === "true";
  const dpeCutConfirmed = formData.get("dpe_cut_confirmed") === "true";
  const expectedCutPlayerName = String(formData.get("dpe_cut_player_name") ?? "").trim();
  const rawStretchYears = String(formData.get("dpe_stretch_years") ?? "").trim();
  const cutStretchYears = rawStretchYears === "" ? null : Number(rawStretchYears);
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
  if (operation === "dpe_reintegrate" && !operationWindows.dpeReintegration(leagueMoment)) fail("Il reintegro anticipato è disponibile dalla trade deadline alla Chiusura free agency.");
  if (!confirmed) fail(operation === "dpe_activate"
    ? "Conferma che NBC Sports riporti la certezza o il forte rischio dell'assenza per infortunio e che sia raggiunta la soglia regolamentare."
    : "Conferma il ritorno in campo NBA entro la finestra regolamentare.");

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
  const occupiedDpe = teamActive.filter((item) => item.slot === "dpe");
  if (occupiedDpe.length > 1) fail("La squadra presenta più di un giocatore nello slot DPE: correggi prima il roster.");
  if (operation === "dpe_activate") {
    if (entry.slot === "dpe") fail("Il giocatore è già nella DPE.");
    const incumbent = occupiedDpe[0];
    if (incumbent && (!dpeCutConfirmed || expectedCutPlayerName !== incumbent.name)) {
      fail(`Per esercitare la DPE devi confermare il taglio contestuale di ${incumbent.name}.`);
    }
    if (!incumbent && (dpeCutConfirmed || expectedCutPlayerName)) {
      fail("Lo slot DPE è cambiato: aggiorna la pagina e ripeti l’operazione.");
    }
    if (cutStretchYears !== null && (cutStretchYears !== 2 && cutStretchYears !== 3 || !incumbent || !dpeCutConfirmed)) {
      fail("Stretch provision contestuale non valida per la DPE.");
    }
  } else {
    if (cutStretchYears !== null) fail("Non puoi applicare una stretch provision durante il reintegro.");
    if (entry.slot !== "dpe") fail("Il giocatore non è nella DPE.");
    if (teamActive.filter((item) => item.slot === "regular").length >= 15) fail("Per il reintegro serve uno slot roster libero.");
  }

  const seasonName = season.data.name;
  const currentSeasonEndYear = seasonEndYear(seasonName);
  if (currentSeasonEndYear === null) fail("Annata non valida.");
  let activation: ReturnType<typeof applyDpeActivationWithOptionalCut> | null = null;
  if (operation === "dpe_activate") {
    try {
      activation = applyDpeActivationWithOptionalCut({
        rosterEntries: state.rosterEntries,
        teamCode,
        playerName,
        expectedCutPlayerName: occupiedDpe[0]?.name ?? null,
        cutStretchYears: cutStretchYears as 2 | 3 | null,
        seasonName,
        currentSeasonEndYear,
        leagueMoment,
      });
    } catch (error) {
      fail(error instanceof Error ? error.message : "Taglio contestuale DPE non valido.");
    }
  }
  const rosterEntries: RosterEntry[] = activation?.rosterEntries ?? state.rosterEntries.map((item, index) => index === entryIndex
    ? {
      ...item,
      slot: "regular" as const,
      dpeAppliedSeasons: [...new Set([...(item.dpeAppliedSeasons ?? []), seasonName])],
    }
    : item);
  const teamRosterAfter = rosterEntries.filter((item) => item.teamCode === teamCode);
  const roleMinimumSlotError = roleMinimumRecoverySlotErrorForEntries(teamRosterAfter, season.data.status, leagueMoment);
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
    qualifyingOfferRights: activation?.cutPlayer
      ? state.qualifyingOfferRights.filter((right) => (
        right.teamCode !== teamCode || right.playerName !== activation.cutPlayer?.name
      ))
      : state.qualifyingOfferRights,
  };
  const label = operation === "dpe_activate" ? "Esercizio DPE" : "Reintegro anticipato dalla DPE";
  const slotDetail = operation === "dpe_activate" ? "Roster → DPE" : "DPE → Roster";
  const cutDetail = activation?.cutPlayer
    ? `; taglio contestuale di ${activation.cutPlayer.name} dalla DPE (costo ${activation.cutPlayer.cost}, contratto ${activation.cutPlayer.contract})${cutStretchYears ? ` con stretch provision in ${cutStretchYears} anni` : ""}`
    : "";
  const response = await persistLeagueMovement(supabase, state, nextState, operation, `${playerName}: ${label.toLocaleLowerCase("it-IT")} per ${teamCode}; ${slotDetail}${cutDetail}`);
  if (response.error) fail(response.error.message);
  ["/squadre", "/giocatori", "/movimenti", "/admin", path, "/admin/impostazioni"]
    .forEach((route) => revalidatePath(route));
  const successDetail = activation?.cutPlayer ? ` Taglio contestuale registrato per ${activation.cutPlayer.name}.` : "";
  redirect(`${path}?updated=${encodeURIComponent(`${label} registrato per ${playerName}.${successDetail}`)}`);
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
