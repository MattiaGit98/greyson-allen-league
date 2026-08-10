"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { persistLeagueMovement } from "@/lib/league-movements";
import { loadEditableLeagueState } from "@/lib/league-state";
import { calculateCapSpace, followingSeasonName, previousSeasonName, seasonEndYear } from "@/lib/season-time";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasReachedMoment, leagueMomentFromSeason, operationWindows } from "@/lib/league-moments";
import { requireCapCompliance } from "@/lib/cap-override";

const defaultPath = "/admin/altre-operazioni";

export async function applyContractExtension(formData: FormData) {
  const path = defaultPath;
  const teamCode = String(formData.get("team_code") ?? "").trim().toUpperCase();
  const playerName = String(formData.get("player_name") ?? "").trim();
  const confirmed = formData.get("requirements_confirmed") === "true";
  if (!teamCode || !playerName) fail(path, "Seleziona un contratto da estendere.");
  if (!confirmed) fail(path, "Conferma i requisiti regolamentari dell'estensione.");
  const supabase = await createSupabaseServerClient();
  if (!supabase) fail(path, "Supabase non configurato.");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) fail(path, "Sessione scaduta.");
  const season = await supabase.from("seasons").select("name,status,team_options_resolved,trade_deadline_passed,timeline_moment").eq("is_active", true).maybeSingle();
  if (season.error || !season.data) fail(path, season.error?.message ?? "Nessuna stagione attiva.");
  const activeSeasonName = season.data.name;
  const leagueMoment = leagueMomentFromSeason(season.data);
  const windowOpen = operationWindows.extensions(leagueMoment);
  if (!windowOpen) fail(path, "Le estensioni sono disponibili in offseason oppure durante la stagione dopo la deadline.");
  const endYear = seasonEndYear(season.data.name);
  if (!endYear) fail(path, "Annata non valida.");
  const state = await loadEditableLeagueState();
  const index = state.rosterEntries.findIndex((entry) => (
    entry.teamCode === teamCode
    && entry.name === playerName
    && entry.state === "active"
  ));
  const entry = state.rosterEntries[index];
  const expiry = entry?.contract.match(/\d{2}/)?.[0];
  const fullExpiry = expiry ? Math.floor(endYear / 100) * 100 + Number(expiry) : null;
  if (!entry || entry.state !== "active" || !entry.contract.includes("(E)") || fullExpiry !== endYear) {
    fail(path, "Il contratto non è più estendibile in questa annata.");
  }
  if (entry.auctionPrice !== undefined && entry.auctionPrice < 200) {
    fail(path, "Il prezzo originario d'asta è inferiore a 200 crediti.");
  }
  if (entry.originalContractYears !== undefined && entry.originalContractYears !== 3) {
    fail(path, "Il contratto non era originariamente triennale.");
  }
  if (entry.lastExtensionSeason === previousSeasonName(activeSeasonName)) {
    fail(path, "Il contratto è già stato esteso nella stagione precedente.");
  }
  const newCost = Math.ceil(entry.cost * 1.25);
  const rosterEntries = state.rosterEntries.map((item, itemIndex) => itemIndex === index ? {
    ...item,
    cost: newCost,
    contract: String(endYear + 1).slice(-2),
    lastExtensionSeason: activeSeasonName,
  } : item);
  const countTeamOptions = season.data.status !== "offseason" || season.data.team_options_resolved;
  const beforeSpace = calculateCapSpace({
    entries: state.rosterEntries.filter((item) => item.teamCode === teamCode && (item.state !== "active" || item.slot !== "dpe")),
    seasonName: season.data.name,
    optionSeasonName: season.data.name,
    countTeamOptions,
  });
  const capWarnings: string[] = [];
  for (const distance of [0, 1, 2]) {
    const target = followingSeasonName(season.data.name, distance);
    const space = calculateCapSpace({
      entries: rosterEntries.filter((item) => item.teamCode === teamCode && (distance !== 0 || item.state !== "active" || item.slot !== "dpe")),
      seasonName: target,
      optionSeasonName: season.data.name,
      countTeamOptions,
    });
    if (distance > 0 && space < 0) capWarnings.push(`L'estensione porterebbe il cap ${target} oltre 1000 crediti (cap libero ${space}).`);
    if (distance === 0 && season.data.status === "offseason" && !hasReachedMoment(leagueMoment, "auction_start") && space < 0 && space < beforeSpace) capWarnings.push(`L'estensione porterebbe il cap ${target} oltre 1000 crediti (cap libero ${space}).`);
    if (distance === 0 && season.data.status === "regular_season" && (space < -100 || (beforeSpace < -100 && space < beforeSpace))) {
      capWarnings.push(`L'estensione non rispetta il limite del cap durante la stagione (cap libero ${space}).`);
    }
  }
  requireCapCompliance(capWarnings, (message) => fail(path, message));
  const nextState = { ...state, rosterEntries };
  const response = await persistLeagueMovement(supabase, state, nextState, "estensione_contrattuale", `${playerName}: estensione esercitata da ${teamCode}; costo ${entry.cost} → ${newCost} crediti; scadenza ${String(endYear + 1).slice(-2)}`);
  if (response.error) fail(path, response.error.message);
  ["/squadre", "/giocatori", "/movimenti", "/admin", "/admin/altre-operazioni", path].forEach((route) => revalidatePath(route));
  redirect(`${path}?updated=${encodeURIComponent(`Estensione registrata: ${playerName}.`)}`);
}

function fail(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}
