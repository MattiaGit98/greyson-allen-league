"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireActiveSeason } from "@/lib/active-season";
import { capOverrideRequested, capOverrideSummary, requireCapOverride, salaryCapWarningsForSpaces } from "@/lib/cap-override";
import { entriesForDpeAdjustedCap } from "@/lib/dpe-rules";
import { loadEditableLeagueState } from "@/lib/league-state";
import { persistLeagueMovements, type LeagueMovementDraft } from "@/lib/league-movements";
import type { RosterEntry } from "@/lib/league-types";
import { applyRosterCorrections, type RosterAdditionInput, type RosterCorrectionInput } from "@/lib/roster-corrections";
import { calculateCapSpace, followingSeasonName, shouldCountTeamOptions } from "@/lib/season-time";
import { leagueMomentFromSeason } from "@/lib/league-moments";

const path = "/admin/rettifiche-roster";

export async function saveRosterCorrections(formData: FormData) {
  const teamCode = clean(formData.get("team_code")).toLocaleUpperCase("it-IT");
  const forceCap = capOverrideRequested(formData);
  let corrections: RosterCorrectionInput[];
  let addition: RosterAdditionInput | null;
  try {
    corrections = parseCorrections(formData.get("corrections_json"));
    addition = parseAddition(formData.get("addition_json"));
  } catch (error) {
    fail(error instanceof Error ? error.message : "Rettifiche non valide.");
  }
  if (!teamCode) fail("Seleziona una squadra.");

  const activeSeason = await requireActiveSeason();
  const { data: { user } } = await activeSeason.supabase.auth.getUser();
  if (!user) fail("Sessione scaduta.");
  const state = await loadEditableLeagueState();
  let applied;
  try {
    applied = applyRosterCorrections({
      state,
      teamCode,
      seasonName: activeSeason.season.name,
      corrections,
      addition,
    });
  } catch (error) {
    fail(error instanceof Error ? error.message : "Rettifiche non valide.");
  }

  const seasonNames = [0, 1, 2].map((distance) => followingSeasonName(activeSeason.season.name, distance));
  const countTeamOptions = shouldCountTeamOptions(
    activeSeason.season.status,
    activeSeason.season.team_options_resolved,
  );
  const spacesBefore = capSpaces(state.rosterEntries, teamCode, seasonNames, activeSeason.season.name, countTeamOptions);
  const spacesAfter = capSpaces(applied.state.rosterEntries, teamCode, seasonNames, activeSeason.season.name, countTeamOptions);
  const capWarnings = salaryCapWarningsForSpaces({
    before: spacesBefore,
    after: spacesAfter,
    seasonNames,
    phase: activeSeason.season.status,
    currentMoment: leagueMomentFromSeason(activeSeason.season),
  });
  requireCapOverride(capWarnings, forceCap, fail);

  let movementState = state;
  const movements: LeagueMovementDraft[] = applied.changes.map((change) => {
    const before = movementState;
    const targetIndex = before.rosterEntries.findIndex((entry) => sameRosterEntry(entry, change.before));
    if (targetIndex < 0) fail(`${change.before.name} è stato modificato durante il salvataggio. Ricarica la pagina e riprova.`);
    const rosterEntries = change.after
      ? before.rosterEntries.map((entry, index) => index === targetIndex ? change.after as RosterEntry : entry)
      : before.rosterEntries.filter((_, index) => index !== targetIndex);
    const after = { ...before, rosterEntries };
    movementState = after;
    return {
      before,
      after,
      operationType: change.after ? "rettifica_roster_contratto" : "rettifica_roster_rimozione",
      summary: capOverrideSummary(correctionSummary(change.before, change.after), capWarnings, forceCap),
    };
  });
  if (applied.addition) {
    const before = movementState;
    const after = { ...before, rosterEntries: [...before.rosterEntries, applied.addition] };
    movementState = after;
    movements.push({
      before,
      after,
      operationType: "rettifica_roster_aggiunta",
      summary: capOverrideSummary(`${applied.addition.name}: aggiunto da ${teamCode} nello slot ${slotLabel(applied.addition.slot)}`, capWarnings, forceCap),
    });
  }

  const response = await persistLeagueMovements(activeSeason.supabase, state, movementState, movements);
  if (response.error) fail(response.error.message);
  [
    "/squadre",
    "/giocatori",
    "/movimenti",
    "/admin",
    "/admin/movimenti",
    "/admin/altre-operazioni",
    "/admin/impostazioni",
    path,
  ].forEach((route) => revalidatePath(route));
  redirect(`${path}?updated=${applied.changes.length + Number(Boolean(applied.addition))}`);
}

function parseAddition(value: FormDataEntryValue | null): RosterAdditionInput | null {
  const parsed = JSON.parse(String(value ?? "null")) as unknown;
  if (parsed === null) return null;
  if (!parsed || typeof parsed !== "object") throw new Error("Nuova aggiunta non valida.");
  const row = parsed as Partial<RosterAdditionInput>;
  const playerName = String(row.playerName ?? "").trim();
  const cost = Number(row.cost);
  const contract = String(row.contract ?? "").trim();
  const slot = String(row.slot ?? "") as RosterAdditionInput["slot"];
  if (!playerName || !Number.isSafeInteger(cost) || cost < 0 || !contract || !["regular", "two_way", "g_league", "dpe"].includes(slot)) {
    throw new Error("Completa giocatore, scadenza, costo e slot della nuova aggiunta.");
  }
  return { playerName, cost, contract, slot };
}

function parseCorrections(value: FormDataEntryValue | null): RosterCorrectionInput[] {
  const parsed = JSON.parse(String(value ?? "[]")) as unknown;
  if (!Array.isArray(parsed) || parsed.length > 100) throw new Error("Rettifiche non valide.");
  return parsed.map((item) => {
    if (!item || typeof item !== "object") throw new Error("Rettifica non valida.");
    const row = item as Partial<RosterCorrectionInput>;
    const sourceIndex = Number(row.sourceIndex);
    const playerName = String(row.playerName ?? "").trim();
    const cost = Number(row.cost);
    const contract = String(row.contract ?? "").trim();
    if (!Number.isInteger(sourceIndex) || sourceIndex < 0 || !playerName || typeof row.remove !== "boolean") {
      throw new Error("Rettifica non valida.");
    }
    return { sourceIndex, playerName, cost, contract, remove: row.remove };
  });
}

function capSpaces(
  entries: RosterEntry[],
  teamCode: string,
  seasonNames: string[],
  optionSeasonName: string,
  countTeamOptions: boolean,
) {
  const teamEntries = entries.filter((entry) => entry.teamCode === teamCode);
  return seasonNames.map((seasonName, distance) => calculateCapSpace({
    entries: entriesForDpeAdjustedCap(teamEntries, distance),
    seasonName,
    optionSeasonName,
    countTeamOptions,
  }));
}

function sameRosterEntry(left: RosterEntry, right: RosterEntry) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function correctionSummary(before: RosterEntry, after: RosterEntry | null) {
  const placement = before.state === "cut" ? "Tagliati" : slotLabel(before.slot);
  if (!after) {
    return `${before.name} (${before.teamCode}, ${placement}): rimosso; costo ${before.cost}; scadenza ${before.contract}`;
  }
  const details = [
    ...(before.cost !== after.cost ? [`costo ${before.cost} → ${after.cost}`] : []),
    ...(before.contract !== after.contract ? [`scadenza ${before.contract} → ${after.contract}`] : []),
  ];
  return `${before.name} (${before.teamCode}, ${placement}): ${details.join("; ")}`;
}

function slotLabel(slot: RosterEntry["slot"]) {
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
