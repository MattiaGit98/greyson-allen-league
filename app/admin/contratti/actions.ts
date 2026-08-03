"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { allowedPostAuctionContracts, isPostAuctionContractAssignmentCandidate, type PostAuctionContractKind } from "@/lib/auction-management";
import { loadEditableLeagueState } from "@/lib/league-state";
import { persistLeagueMovements, type LeagueMovementDraft } from "@/lib/league-movements";
import { calculateCapSpace, followingSeasonName, seasonEndYear } from "@/lib/season-time";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { leagueMomentFromSeason, operationWindows } from "@/lib/league-moments";
import { capOverrideRequested, capOverrideSummary, requireCapOverride } from "@/lib/cap-override";
import { assignedAuctionContract } from "@/lib/rules/contracts";

type ContractKind = PostAuctionContractKind;
type ContractSlot = "regular" | "two_way" | "g_league";
type Assignment = { playerName: string; contract: ContractKind; slot: ContractSlot };
const path = "/admin/contratti";

export async function assignPostAuctionContracts(formData: FormData) {
  const forceCap = capOverrideRequested(formData);
  const teamCode = clean(formData.get("team_code")).toUpperCase();
  let assignments: Assignment[];
  try {
    assignments = parseAssignments(formData.get("assignments_json"));
  } catch (error) {
    fail(error instanceof Error ? error.message : "Assegnazioni non valide.");
  }
  if (!teamCode || !assignments.length) fail("Seleziona almeno un contratto da assegnare.");

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
  if (!operationWindows.contractAssignment(leagueMomentFromSeason(seasonResponse.data))) {
    fail("I contratti dell'asta si assegnano in Offseason — dopo le T.O.");
  }
  const activeSeasonName = seasonResponse.data.name;

  const state = await loadEditableLeagueState();
  const playersByName = new Map(state.playerList.map((player) => [player.name, player]));
  const assignmentByName = new Map(assignments.map((assignment) => [assignment.playerName, assignment]));
  const endYear = seasonEndYear(activeSeasonName);
  if (!endYear) fail("Annata non valida.");

  const rosterEntries = state.rosterEntries.map((entry) => {
    const assignment = assignmentByName.get(entry.name);
    if (!assignment || entry.teamCode !== teamCode) return entry;
    const contractKind = assignment.contract;
    if (!isPostAuctionContractAssignmentCandidate(entry, activeSeasonName)) {
      fail(`${entry.name} non ha più un contratto da assegnare.`);
    }
    const listPlayer = playersByName.get(entry.name);
    if (!listPlayer) fail(`${entry.name} non è presente nel listone.`);
    const destinationRequiresTeamOption = assignment.slot === "two_way" || assignment.slot === "g_league";
    if (entry.state === "cut" && assignment.slot !== "regular") {
      fail(`${entry.name}: un giocatore già tagliato deve restare fuori dagli slot attivi.`);
    }
    const teamOptionEligible = listPlayer.rookie || (listPlayer.under23 && entry.cost <= 15);
    if (!allowedPostAuctionContracts(entry.auctionAcquisition).includes(contractKind)) {
      fail(entry.auctionAcquisition === "qualifying_offer"
        ? `${entry.name}: una Q.O. accettata richiede il contratto annuale.`
        : `${entry.name}: un restricted free agent può ricevere soltanto un contratto annuale o biennale.`);
    }
    if (entry.auctionAcquisition && assignment.slot !== "regular") {
      fail(`${entry.name}: un acquisto tramite Q.O. o come RFA deve restare nel roster.`);
    }
    if (destinationRequiresTeamOption && contractKind !== "team_option") {
      fail(`${entry.name}: negli slot speciali è selezionabile soltanto la T.O.`);
    }
    if (contractKind === "team_option" && !teamOptionEligible) {
      fail(`${entry.name} non rispetta i requisiti per la T.O.`);
    }
    if (assignment.slot === "two_way" && entry.cost > 10) fail(`${entry.name}: il Two-way richiede un costo massimo di 10.`);
    if (assignment.slot === "g_league" && entry.cost > 5) fail(`${entry.name}: la G-League richiede un costo massimo di 5.`);
    const terms = assignedAuctionContract(entry.auctionPrice ?? entry.cost, contractKind, endYear);
    return {
      ...entry,
      ...terms,
      slot: assignment.slot,
      contractStartSeason: entry.contractStartSeason ?? activeSeasonName,
    };
  });

  for (const assignment of assignments) {
    const matches = state.rosterEntries.filter((entry) => (
      entry.teamCode === teamCode
      && entry.name === assignment.playerName
    ));
    if (matches.length !== 1) fail(`${assignment.playerName} non appartiene più in modo univoco alla squadra selezionata.`);
    if (!isPostAuctionContractAssignmentCandidate(matches[0], activeSeasonName)) fail(`${assignment.playerName} non ha più un contratto da assegnare.`);
  }

  const teamEntries = rosterEntries.filter((entry) => entry.teamCode === teamCode);
  const activeEntries = teamEntries.filter((entry) => entry.state === "active");
  const slotLimits = { regular: 15, two_way: 2, g_league: 3 } as const;
  for (const slot of Object.keys(slotLimits) as ContractSlot[]) {
    const count = activeEntries.filter((entry) => entry.slot === slot).length;
    if (count > slotLimits[slot]) fail(`Lo slot ${slot} è pieno (${count}/${slotLimits[slot]}).`);
  }
  const capWarnings = [1, 2].flatMap((distance) => {
    const targetSeason = followingSeasonName(activeSeasonName, distance);
    const space = calculateCapSpace({
      entries: teamEntries.filter((entry) => distance !== 0 || entry.state !== "active" || entry.slot !== "dpe"),
      seasonName: targetSeason,
      optionSeasonName: activeSeasonName,
      countTeamOptions: true,
    });
    return space < 0 ? [`I contratti porterebbero il cap ${targetSeason} oltre 1000 crediti (cap libero ${space}).`] : [];
  });
  requireCapOverride(capWarnings, forceCap, fail);

  const nextState = { ...state, rosterEntries };
  let movementState = state;
  const movements: LeagueMovementDraft[] = assignments.map((assignment) => {
    const before = movementState;
    const oldEntry = before.rosterEntries.find((entry) => entry.teamCode === teamCode && entry.name === assignment.playerName);
    const assignedEntry = rosterEntries.find((entry) => entry.teamCode === teamCode && entry.name === assignment.playerName);
    const after = {
      ...before,
      rosterEntries: before.rosterEntries.map((entry) => (
        entry.teamCode === teamCode && entry.name === assignment.playerName && assignedEntry ? assignedEntry : entry
      )),
    };
    movementState = after;
    const priceDetail = oldEntry && assignedEntry && oldEntry.cost !== assignedEntry.cost
      ? `; prezzo ${oldEntry.cost} → ${assignedEntry.cost} crediti`
      : `; prezzo ${assignedEntry?.cost ?? oldEntry?.cost ?? 0} crediti`;
    return {
      before,
      after,
      operationType: "assegnazione_contratti",
      summary: capOverrideSummary(`${assignment.playerName}: ${contractLabel(assignment.contract)} assegnato da ${teamCode}${priceDetail}; scadenza ${assignedEntry?.contract ?? "-"}; slot ${slotLabel(assignment.slot)}`, capWarnings, forceCap),
      seasonName: activeSeasonName,
    };
  });
  const response = await persistLeagueMovements(supabase, state, nextState, movements);
  if (response.error) fail(response.error.message);
  ["/squadre", "/giocatori", "/movimenti", "/admin", path, "/admin/asta"].forEach((route) => revalidatePath(route));
  redirect(`${path}?updated=${assignments.length}`);
}

function parseAssignments(value: FormDataEntryValue | null): Assignment[] {
  const parsed = JSON.parse(String(value ?? "[]")) as unknown;
  if (!Array.isArray(parsed)) throw new Error("Assegnazioni non valide.");
  const names = new Set<string>();
  return parsed.map((value) => {
    if (!value || typeof value !== "object") throw new Error("Assegnazione non valida.");
    const row = value as Partial<Assignment>;
    const playerName = String(row.playerName ?? "").trim();
    if (!playerName || !["annual", "biennial", "triennial", "team_option"].includes(String(row.contract)) || !["regular", "two_way", "g_league"].includes(String(row.slot))) {
      throw new Error("Assegnazione non valida.");
    }
    if (names.has(playerName)) throw new Error(`${playerName} compare più di una volta.`);
    names.add(playerName);
    return { playerName, contract: row.contract as ContractKind, slot: row.slot as ContractSlot };
  });
}

function clean(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function contractLabel(contract: ContractKind) {
  if (contract === "annual") return "Contratto annuale";
  if (contract === "biennial") return "Contratto biennale";
  if (contract === "triennial") return "Contratto triennale";
  return "Team option";
}

function slotLabel(slot: ContractSlot) {
  if (slot === "regular") return "Roster";
  if (slot === "two_way") return "Two-way";
  return "G-League";
}

function fail(message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}
