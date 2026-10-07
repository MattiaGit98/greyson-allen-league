"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { persistLeagueMovements, type LeagueMovementDraft } from "@/lib/league-movements";
import { loadEditableLeagueState, type EditableLeagueState } from "@/lib/league-state";
import { calculateCapSpace, followingSeasonName, previousSeasonName } from "@/lib/season-time";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { leagueMomentFromSeason, operationWindows } from "@/lib/league-moments";
import { normalizePhaseDates, playoffTeamOptionWindowOpen, todayInRome } from "@/lib/phase-calendar";
import { capOverrideSummary, requireCapCompliance } from "@/lib/cap-override";
import { entriesForDpeAdjustedCap } from "@/lib/dpe-rules";
import {
  applyRookieExtension,
  exerciseOrdinaryTeamOption,
  recordPlayoffTeamOptionUse,
  isRookieExtensionDecisionDue,
  isAnnualTeamOptionContract,
  qualifyingOfferForDeclinedRookieExtension,
} from "@/lib/team-option-contract";

type Decision = {
  playerName: string;
  kind: "team_option" | "rookie_extension";
  decision: "exercise" | "decline";
  destination: "regular" | "two_way";
};

const path = "/admin/team-option";

export async function saveRookieContractDecisions(formData: FormData) {
  const teamCode = String(formData.get("team_code") ?? "").trim().toUpperCase();
  let decisions: Decision[];
  try {
    decisions = parseDecisions(formData.get("decisions_json"));
  } catch (error) {
    fail(error instanceof Error ? error.message : "Decisioni non valide.");
  }
  if (!teamCode || !decisions.length) fail("Seleziona almeno una decisione.");

  const supabase = await createSupabaseServerClient();
  if (!supabase) fail("Supabase non configurato.");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) fail("Sessione scaduta.");
  const season = await supabase.from("seasons").select("name,status,team_options_resolved,trade_deadline_passed,timeline_moment").eq("is_active", true).maybeSingle();
  if (season.error || !season.data) fail(season.error?.message ?? "Nessuna stagione attiva.");
  if (!operationWindows.teamOption(leagueMomentFromSeason(season.data))) {
    fail("I contratti da rookie si possono risolvere soltanto in Offseason — prima della relativa scadenza.");
  }
  const activeSeasonName = season.data.name;

  const state = await loadEditableLeagueState();
  if (!state.teams.some((team) => team.code === teamCode)) fail("Squadra non valida.");
  let nextState = state;
  try {
    for (const decision of decisions) {
      nextState = applyDecision(nextState, teamCode, activeSeasonName, decision);
    }
  } catch (error) {
    fail(error instanceof Error ? error.message : "Decisioni non valide.");
  }

  const active = nextState.rosterEntries.filter((entry) => entry.teamCode === teamCode && entry.state === "active");
  const limits = { regular: 15, two_way: 2, g_league: 3, dpe: 1 } as const;
  for (const slot of Object.keys(limits) as (keyof typeof limits)[]) {
    const count = active.filter((entry) => entry.slot === slot).length;
    if (count > limits[slot]) fail(`Le decisioni superano il limite dello slot ${slotLabel(slot)}.`);
  }

  const teamEntries = nextState.rosterEntries.filter((entry) => entry.teamCode === teamCode);
  const capWarnings = [0, 1, 2].flatMap((distance) => {
    const targetSeason = followingSeasonName(activeSeasonName, distance);
    const space = calculateCapSpace({
      entries: entriesForDpeAdjustedCap(teamEntries, distance),
      seasonName: targetSeason,
      optionSeasonName: activeSeasonName,
      countTeamOptions: false,
    });
    return space < 0 ? [`Le decisioni porterebbero il team salary ${targetSeason} oltre il salary cap di 1000 crediti (cap libero ${space}).`] : [];
  });
  requireCapCompliance(capWarnings, fail);

  let movementState = state;
  const movements: LeagueMovementDraft[] = decisions.map((decision) => {
    const before = movementState;
    const original = before.rosterEntries.find((entry) => entry.teamCode === teamCode && entry.name === decision.playerName);
    const after = applyDecision(before, teamCode, activeSeasonName, decision);
    movementState = after;
    const resolved = after.rosterEntries.find((entry) => entry.teamCode === teamCode && entry.name === decision.playerName);
    const right = after.qualifyingOfferRights.find((item) => item.playerName === decision.playerName && item.teamCode === teamCode);
    const detail = decision.kind === "team_option"
      ? decision.decision === "decline"
        ? `${decision.playerName}: T.O. lasciata scadere da ${teamCode}; contratto concluso senza Q.O.`
        : `${decision.playerName}: T.O. esercitata da ${teamCode}; slot ${slotLabel(resolved?.slot)}; ${resolved?.cost ?? original?.cost ?? 0} crediti; contratto ${resolved?.contract ?? "-"}`
      : decision.decision === "decline"
        ? `${decision.playerName}: R.E. non applicata da ${teamCode}; contratto concluso; Q.O. a ${right?.qualifyingAmount ?? original?.cost ?? 0} crediti`
        : `${decision.playerName}: R.E. applicata da ${teamCode}; promosso nel Roster; ${resolved?.cost ?? 0} crediti; scadenza ${resolved?.contract ?? "-"}`;
    return {
      before,
      after,
      operationType: decision.kind === "team_option" ? "team_option" : "rookie_extension",
      summary: capOverrideSummary(detail, capWarnings, false),
      seasonName: activeSeasonName,
      undoBeforeMoment: "team_option_deadline",
    };
  });

  const response = await persistLeagueMovements(supabase, state, nextState, movements);
  if (response.error) fail(response.error.message);
  revalidateRookieContractPages();
  redirect(`${path}?updated=${decisions.length}`);
}

export async function recordPlayoffTeamOptionUses(formData: FormData) {
  const teamCode = String(formData.get("team_code") ?? "").trim().toUpperCase();
  let playerNames: string[];
  try {
    playerNames = parsePlayerNames(formData.get("player_names_json"));
  } catch (error) {
    fail(error instanceof Error ? error.message : "Selezione non valida.");
  }
  if (!teamCode || !playerNames.length) fail("Seleziona almeno una team option utilizzata nei playoff.");

  const supabase = await createSupabaseServerClient();
  if (!supabase) fail("Supabase non configurato.");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) fail("Sessione scaduta.");
  const season = await supabase.from("seasons").select("name,status,team_options_resolved,trade_deadline_passed,timeline_moment,phase_dates").eq("is_active", true).maybeSingle();
  if (season.error || !season.data) fail(season.error?.message ?? "Nessuna stagione attiva.");
  if (!playoffTeamOptionWindowOpen(leagueMomentFromSeason(season.data), normalizePhaseDates(season.data.phase_dates), todayInRome())) {
    fail("L'utilizzo nei playoff si può registrare dall'inizio della postseason fino alla riapertura della free agency.");
  }
  const activeSeasonName = season.data.name;

  const selected = new Set(playerNames);
  const state = await loadEditableLeagueState();
  const handled = new Set<string>();
  const rosterEntries = state.rosterEntries.map((entry) => {
    if (entry.teamCode !== teamCode || !selected.has(entry.name)) return entry;
    if (entry.state !== "active" || entry.slot !== "g_league" || !isAnnualTeamOptionContract(entry) || entry.playoffTeamOptionUsedSeason) {
      fail(`${entry.name} non è più una T.O. attiva in G-League.`);
    }
    handled.add(entry.name);
    return recordPlayoffTeamOptionUse(entry, activeSeasonName);
  });
  if (handled.size !== selected.size) fail("Una o più team option non appartengono alla squadra selezionata.");

  const nextSeasonName = followingSeasonName(activeSeasonName);
  const nextSeasonCapSpace = calculateCapSpace({
    entries: entriesForDpeAdjustedCap(rosterEntries.filter((entry) => entry.teamCode === teamCode), 1),
    seasonName: nextSeasonName,
    optionSeasonName: activeSeasonName,
    countTeamOptions: true,
  });
  if (nextSeasonCapSpace < 0) {
    fail(`Utilizzo nei playoff non registrabile: contando le T.O. selezionate, il team salary ${nextSeasonName} supera il salary cap di 1000 crediti (cap libero ${nextSeasonCapSpace}).`);
  }

  const nextState = { ...state, rosterEntries };
  let movementState = state;
  const movements: LeagueMovementDraft[] = playerNames.map((playerName) => {
    const before = movementState;
    const markedEntry = rosterEntries.find((entry) => entry.teamCode === teamCode && entry.name === playerName);
    const after = {
      ...before,
      rosterEntries: before.rosterEntries.map((entry) => (
        entry.teamCode === teamCode && entry.name === playerName && markedEntry ? markedEntry : entry
      )),
    };
    movementState = after;
    return {
      before,
      after,
      operationType: "team_option_playoff",
      summary: `${playerName}: utilizzo nei playoff registrato da ${teamCode}; T.O. da esercitare nella prossima offseason con destinazione Roster`,
      seasonName: activeSeasonName,
      undoBeforeMoment: "free_agency_reopening",
    };
  });
  const response = await persistLeagueMovements(supabase, state, nextState, movements);
  if (response.error) fail(response.error.message);
  revalidateRookieContractPages();
  redirect(`${path}?playoff_updated=${playerNames.length}`);
}

function applyDecision(
  state: EditableLeagueState,
  teamCode: string,
  seasonName: string,
  decision: Decision,
): EditableLeagueState {
  const entryIndex = state.rosterEntries.findIndex((entry) => entry.teamCode === teamCode && entry.name === decision.playerName);
  const entry = state.rosterEntries[entryIndex];
  if (!entry || entry.state !== "active") throw new Error(`${decision.playerName} non appartiene più alla squadra selezionata.`);
  if (decision.kind === "team_option" && entry.contract !== "T.O.") {
    throw new Error(`${entry.name} non è più una team option da risolvere.`);
  }
  if (decision.kind === "team_option" && entry.playoffTeamOptionUsedSeason) {
    if (decision.decision === "decline") throw new Error(`${entry.name}: la T.O. va esercitata dopo l'utilizzo nei playoff; in alternativa puoi tagliare il giocatore.`);
    if (decision.destination !== "regular") throw new Error(`${entry.name}: dopo l'utilizzo nei playoff la destinazione obbligatoria è il Roster.`);
  }
  if (decision.kind === "rookie_extension" && !isRookieExtensionDecisionDue(entry, seasonName)) {
    throw new Error(`${entry.name} non ha una rookie extension da risolvere in questa offseason.`);
  }

  const rosterEntries = [...state.rosterEntries];
  if (decision.decision === "decline") rosterEntries.splice(entryIndex, 1);
  else if (decision.kind === "team_option") {
    rosterEntries[entryIndex] = exerciseOrdinaryTeamOption({
      ...entry,
      contractStartSeason: entry.contractStartSeason ?? previousSeasonName(seasonName),
    }, seasonName, decision.destination);
  } else {
    rosterEntries[entryIndex] = applyRookieExtension(entry, seasonName);
  }

  if (decision.kind !== "rookie_extension" || decision.decision !== "decline") {
    return { ...state, rosterEntries };
  }
  const normalizedName = normalizeName(entry.name);
  if (state.qualifyingOfferRights.some((right) => normalizeName(right.playerName) === normalizedName)) {
    throw new Error(`${entry.name} possiede già una qualifying offer.`);
  }
  return {
    ...state,
    rosterEntries,
    qualifyingOfferRights: [
      ...state.qualifyingOfferRights,
      qualifyingOfferForDeclinedRookieExtension(entry),
    ],
  };
}

function parseDecisions(value: FormDataEntryValue | null): Decision[] {
  const parsed = JSON.parse(String(value ?? "[]")) as unknown;
  if (!Array.isArray(parsed)) throw new Error("Decisioni non valide.");
  const names = new Set<string>();
  return parsed.map((value) => {
    const row = value as Partial<Decision>;
    const playerName = String(row?.playerName ?? "").trim();
    const kind = String(row?.kind ?? "");
    const decision = String(row?.decision ?? "");
    const destination = String(row?.destination ?? "regular");
    if (!playerName
      || !["team_option", "rookie_extension"].includes(kind)
      || !["exercise", "decline"].includes(decision)
      || !["regular", "two_way"].includes(destination)) {
      throw new Error("Decisione non valida.");
    }
    const key = normalizeName(playerName);
    if (names.has(key)) throw new Error(`${playerName} compare più di una volta.`);
    names.add(key);
    return {
      playerName,
      kind: kind as Decision["kind"],
      decision: decision as Decision["decision"],
      destination: destination as Decision["destination"],
    };
  });
}

function parsePlayerNames(value: FormDataEntryValue | null) {
  const parsed = JSON.parse(String(value ?? "[]")) as unknown;
  if (!Array.isArray(parsed)) throw new Error("Selezione non valida.");
  const names = parsed.map((item) => String(item ?? "").trim()).filter(Boolean);
  if (new Set(names.map(normalizeName)).size !== names.length) throw new Error("Un giocatore compare più di una volta.");
  return names;
}

function slotLabel(slot: string | undefined) {
  if (slot === "regular") return "Roster";
  if (slot === "two_way") return "Two-way";
  if (slot === "g_league") return "G-League";
  if (slot === "dpe") return "DPE";
  return slot ?? "-";
}

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("it-IT");
}

function revalidateRookieContractPages() {
  ["/squadre", "/giocatori", "/movimenti", "/admin", path, "/admin/impostazioni", "/admin/movimenti"].forEach((route) => revalidatePath(route));
}

function fail(message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}
