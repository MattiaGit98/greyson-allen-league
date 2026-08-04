import { cache } from "react";
import { createSupabaseServerClient } from "./supabase/server";
import type { PostAuctionContractDraft } from "./post-auction-contracts";

const contractKinds = new Set(["annual", "biennial", "triennial", "team_option"]);
const contractSlots = new Set(["regular", "two_way", "g_league"]);

export const loadPostAuctionContractDrafts = cache(async function loadPostAuctionContractDrafts(
  seasonName: string,
): Promise<PostAuctionContractDraft[]> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) throw new Error("Supabase non configurato: bozze dei contratti non disponibili.");
  const response = await supabase
    .from("post_auction_contract_drafts")
    .select("season_name,team_code,player_name,contract_kind,slot")
    .eq("season_name", seasonName)
    .order("team_code")
    .order("player_name");
  if (response.error) throw new Error(`Bozze dei contratti non disponibili: ${response.error.message}`);
  return (response.data ?? []).map((row) => {
    if (!contractKinds.has(row.contract_kind) || !contractSlots.has(row.slot)) {
      throw new Error(`Bozza del contratto non valida: ${row.player_name}.`);
    }
    return {
      seasonName: row.season_name,
      teamCode: row.team_code,
      playerName: row.player_name,
      contractKind: row.contract_kind as PostAuctionContractDraft["contractKind"],
      slot: row.slot as PostAuctionContractDraft["slot"],
    };
  });
});

export function contractDraftRows(drafts: PostAuctionContractDraft[]) {
  return [...drafts]
    .sort((left, right) => left.teamCode.localeCompare(right.teamCode, "it") || left.playerName.localeCompare(right.playerName, "it"))
    .map((draft) => ({
      team_code: draft.teamCode,
      player_name: draft.playerName,
      contract_kind: draft.contractKind,
      slot: draft.slot,
    }));
}
