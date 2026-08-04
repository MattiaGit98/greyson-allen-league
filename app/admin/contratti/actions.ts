"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PostAuctionContractKind } from "@/lib/auction-management";
import { capOverrideRequested, requireCapOverride } from "@/lib/cap-override";
import { leagueMomentFromSeason, operationWindows } from "@/lib/league-moments";
import { loadEditableLeagueState } from "@/lib/league-state";
import {
  applyPostAuctionContractDrafts,
  type PostAuctionContractDraft,
  type PostAuctionContractSlot,
} from "@/lib/post-auction-contracts";
import { calculateCapSpace, followingSeasonName } from "@/lib/season-time";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Assignment = {
  playerName: string;
  contract: PostAuctionContractKind;
  slot: PostAuctionContractSlot;
};

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
  if (!teamCode) fail("Seleziona una squadra.");

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
    fail("Le bozze dei contratti dell'asta si compilano dal termine dell'asta fino alla consegna dei contratti.");
  }
  const activeSeasonName = seasonResponse.data.name;

  const state = await loadEditableLeagueState();
  if (!state.teams.some((team) => team.code === teamCode)) fail("Squadra non valida.");
  const contractDrafts: PostAuctionContractDraft[] = assignments.map((assignment) => ({
    seasonName: activeSeasonName,
    teamCode,
    playerName: assignment.playerName,
    contractKind: assignment.contract,
    slot: assignment.slot,
  }));
  let projectedState;
  try {
    projectedState = applyPostAuctionContractDrafts({
      state,
      drafts: contractDrafts,
      seasonName: activeSeasonName,
      requireComplete: false,
    });
  } catch (error) {
    fail(error instanceof Error ? error.message : "Bozze dei contratti non valide.");
  }

  const teamEntries = projectedState.rosterEntries.filter((entry) => entry.teamCode === teamCode);
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

  const response = await supabase.rpc("replace_post_auction_contract_drafts", {
    requested_season_name: activeSeasonName,
    requested_team_code: teamCode,
    draft_rows: contractDrafts.map((draft) => ({
      player_name: draft.playerName,
      contract_kind: draft.contractKind,
      slot: draft.slot,
    })),
  });
  if (response.error) fail(response.error.message);
  ["/admin", path, "/admin/impostazioni"].forEach((route) => revalidatePath(route));
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
    if (!playerName
      || !["annual", "biennial", "triennial", "team_option"].includes(String(row.contract))
      || !["regular", "two_way", "g_league"].includes(String(row.slot))) {
      throw new Error("Assegnazione non valida.");
    }
    if (names.has(playerName)) throw new Error(`${playerName} compare più di una volta.`);
    names.add(playerName);
    return {
      playerName,
      contract: row.contract as PostAuctionContractKind,
      slot: row.slot as PostAuctionContractSlot,
    };
  });
}

function clean(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function fail(message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}
