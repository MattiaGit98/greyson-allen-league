"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { persistLeagueMovement } from "@/lib/league-movements";
import { loadEditableLeagueState } from "@/lib/league-state";
import { calculateCapSpace, followingSeasonName, previousSeasonName, seasonEndYear } from "@/lib/season-time";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { leagueMomentFromSeason, operationWindows } from "@/lib/league-moments";
import { capOverrideRequested, capOverrideSummary, requireCapOverride } from "@/lib/cap-override";
import { destinationAfterTeamOptionExercise, exercisePlayoffTeamOption, markExercisedTeamOption } from "@/lib/team-option-contract";

type Decision = { playerName: string; decision: "exercise" | "decline"; destination: "regular" | "two_way" };
const path = "/admin/team-option";

export async function saveTeamOptionDecisions(formData: FormData) {
  const forceCap = capOverrideRequested(formData);
  const teamCode = String(formData.get("team_code") ?? "").trim().toUpperCase();
  let decisions: Decision[];
  try {
    decisions = parseDecisions(formData.get("decisions_json"));
  } catch (error) {
    fail(error instanceof Error ? error.message : "Decisioni non valide.");
  }
  if (!teamCode || !decisions.length) fail("Seleziona almeno una team option.");
  const supabase = await createSupabaseServerClient();
  if (!supabase) fail("Supabase non configurato.");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) fail("Sessione scaduta.");
  const season = await supabase.from("seasons").select("name,status,team_options_resolved,trade_deadline_passed,timeline_moment").eq("is_active", true).maybeSingle();
  if (season.error || !season.data) fail(season.error?.message ?? "Nessuna stagione attiva.");
  if (!operationWindows.teamOption(leagueMomentFromSeason(season.data))) {
    fail("Le T.O. si possono risolvere soltanto in Offseason — prima delle T.O.");
  }
  const activeSeasonName = season.data.name;
  const endYear = seasonEndYear(activeSeasonName);
  if (!endYear) fail("Annata non valida.");
  const state = await loadEditableLeagueState();
  const byName = new Map(decisions.map((decision) => [decision.playerName, decision]));
  const handled = new Set<string>();
  const rosterEntries = state.rosterEntries.flatMap((entry) => {
    const decision = entry.teamCode === teamCode ? byName.get(entry.name) : undefined;
    if (!decision) return [entry];
    if (entry.state !== "active" || entry.contract !== "T.O.") fail(`${entry.name} non è più una team option da risolvere.`);
    handled.add(entry.name);
    if (decision.decision === "decline") return [];
    const destination = destinationAfterTeamOptionExercise(entry.slot, decision.destination);
    return [markExercisedTeamOption({
      ...entry,
      slot: destination,
      contract: `${String(endYear + 1).slice(-2)} (2X)`,
      contractStartSeason: entry.contractStartSeason ?? previousSeasonName(activeSeasonName),
    }, endYear + 1)];
  });
  if (handled.size !== decisions.length) fail("Una o più team option non appartengono alla squadra selezionata.");
  const active = rosterEntries.filter((entry) => entry.teamCode === teamCode && entry.state === "active");
  const limits = { regular: 15, two_way: 2, g_league: 3, dpe: 1 } as const;
  for (const slot of Object.keys(limits) as (keyof typeof limits)[]) {
    const count = active.filter((entry) => entry.slot === slot).length;
    if (count > limits[slot]) fail(`Le decisioni superano il limite dello slot ${slot}.`);
  }
  const capWarnings: string[] = [];
  for (const distance of [0, 1, 2]) {
    const targetSeason = followingSeasonName(season.data.name, distance);
    const space = calculateCapSpace({
      entries: rosterEntries.filter((entry) => entry.teamCode === teamCode && (distance !== 0 || entry.state !== "active" || entry.slot !== "dpe")),
      seasonName: targetSeason,
      optionSeasonName: season.data.name,
      countTeamOptions: false,
    });
    if (space < 0) capWarnings.push(`Le decisioni porterebbero il cap ${targetSeason} oltre 1000 crediti (cap libero ${space}).`);
  }
  requireCapOverride(capWarnings, forceCap, fail);
  const nextState = { ...state, rosterEntries };
  const response = await persistLeagueMovement(supabase, state, nextState, "team_option", capOverrideSummary(`${decisions.length} team option risolte per ${teamCode}`, capWarnings, forceCap));
  if (response.error) fail(response.error.message);
  ["/squadre", "/giocatori", "/movimenti", "/admin", path, "/admin/impostazioni"].forEach((route) => revalidatePath(route));
  redirect(`${path}?updated=${decisions.length}`);
}

export async function exercisePlayoffTeamOptions(formData: FormData) {
  const forceCap = capOverrideRequested(formData);
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
  const season = await supabase.from("seasons").select("name,status,team_options_resolved,trade_deadline_passed,timeline_moment").eq("is_active", true).maybeSingle();
  if (season.error || !season.data) fail(season.error?.message ?? "Nessuna stagione attiva.");
  if (!operationWindows.playoffTeamOption(leagueMomentFromSeason(season.data))) {
    fail("L'esercizio anticipato per utilizzo nei playoff è disponibile dopo il termine della free agency.");
  }
  const activeSeasonName = season.data.name;

  const selected = new Set(playerNames);
  const state = await loadEditableLeagueState();
  const handled = new Set<string>();
  const rosterEntries = state.rosterEntries.map((entry) => {
    if (entry.teamCode !== teamCode || !selected.has(entry.name)) return entry;
    if (entry.state !== "active" || entry.slot !== "g_league" || entry.contract !== "T.O.") {
      fail(`${entry.name} non è più una T.O. attiva in G-League.`);
    }
    handled.add(entry.name);
    return exercisePlayoffTeamOption({
      ...entry,
      contractStartSeason: entry.contractStartSeason ?? activeSeasonName,
    }, activeSeasonName);
  });
  if (handled.size !== selected.size) fail("Una o più team option non appartengono alla squadra selezionata.");

  const capWarnings = [0, 1, 2].flatMap((distance) => {
    const targetSeason = followingSeasonName(activeSeasonName, distance);
    const space = calculateCapSpace({
      entries: rosterEntries.filter((entry) => entry.teamCode === teamCode && (distance !== 0 || entry.state !== "active" || entry.slot !== "dpe")),
      seasonName: targetSeason,
      optionSeasonName: activeSeasonName,
      countTeamOptions: true,
    });
    return space < 0 ? [`L'esercizio anticipato porterebbe il cap ${targetSeason} oltre 1000 crediti (cap libero ${space}).`] : [];
  });
  requireCapOverride(capWarnings, forceCap, fail);

  const response = await persistLeagueMovement(
    supabase,
    state,
    { ...state, rosterEntries },
    "team_option_playoff",
    capOverrideSummary(`${playerNames.length} team option esercitate per utilizzo nei playoff da ${teamCode}`, capWarnings, forceCap),
  );
  if (response.error) fail(response.error.message);
  ["/squadre", "/giocatori", "/movimenti", "/admin", path, "/admin/impostazioni"].forEach((route) => revalidatePath(route));
  redirect(`${path}?playoff_updated=${playerNames.length}`);
}

function parseDecisions(value: FormDataEntryValue | null): Decision[] {
  const parsed = JSON.parse(String(value ?? "[]")) as unknown;
  if (!Array.isArray(parsed)) throw new Error("Decisioni non valide.");
  return parsed.map((value) => {
    const row = value as Partial<Decision>;
    const playerName = String(row?.playerName ?? "").trim();
    if (!playerName || !["exercise", "decline"].includes(String(row?.decision)) || !["regular", "two_way"].includes(String(row?.destination))) {
      throw new Error("Decisione non valida.");
    }
    return { playerName, decision: row.decision as Decision["decision"], destination: row.destination as Decision["destination"] };
  });
}

function parsePlayerNames(value: FormDataEntryValue | null) {
  const parsed = JSON.parse(String(value ?? "[]")) as unknown;
  if (!Array.isArray(parsed)) throw new Error("Selezione non valida.");
  const names = parsed.map((item) => String(item ?? "").trim()).filter(Boolean);
  if (new Set(names).size !== names.length) throw new Error("Un giocatore compare più di una volta.");
  return names;
}

function fail(message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}
