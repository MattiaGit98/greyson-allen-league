import { cache } from "react";
import {
  type DraftAsset,
  type PlayerListEntry,
  type QualifyingOfferRight,
  type RosterEntry,
  type TeamSummary,
} from "@/lib/league-types";
import { createSupabaseServerClient } from "./supabase/server";
import { yearsWithDefinedDraftPositions, type SavedDraftOrderAssignment } from "./draft-positions";

export type EditableLeagueState = {
  teams: TeamSummary[];
  rosterEntries: RosterEntry[];
  draftAssets: DraftAsset[];
  qualifyingOfferRights: QualifyingOfferRight[];
  playerList: PlayerListEntry[];
  playerListStatus: "offseason" | "published";
  draftPositionYears?: number[];
  draftOrders?: SavedDraftOrderAssignment[];
};

export const loadEditableLeagueState = cache(async function loadEditableLeagueState(): Promise<EditableLeagueState> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) throw new Error("Supabase non configurato: impossibile caricare lo stato corrente della lega.");

  const response = await supabase
    .from("league_state_overrides")
    .select("payload")
    .eq("state_key", "current")
    .maybeSingle();
  if (response.error) throw new Error(`Stato corrente della lega non disponibile: ${response.error.message}`);
  if (!response.data?.payload) throw new Error("Stato corrente della lega non inizializzato in Supabase.");

  const payload = response.data.payload as Partial<EditableLeagueState>;
  if (
    !Array.isArray(payload.teams)
    || !Array.isArray(payload.rosterEntries)
    || !Array.isArray(payload.draftAssets)
    || !Array.isArray(payload.qualifyingOfferRights)
    || !Array.isArray(payload.playerList)
  ) {
    throw new Error("Lo stato corrente salvato in Supabase è incompleto.");
  }

  return normalizeState(response.data.payload);
});

export function normalizeState(value: unknown, fallback = emptyLeagueState()): EditableLeagueState {
  if (!value || typeof value !== "object") return fallback;
  const input = value as Partial<EditableLeagueState>;
  const rosterEntries = Array.isArray(input.rosterEntries) ? input.rosterEntries : fallback.rosterEntries;
  const draftAssets = Array.isArray(input.draftAssets) ? input.draftAssets : fallback.draftAssets;
  const qualifyingOfferRights = Array.isArray(input.qualifyingOfferRights)
    ? input.qualifyingOfferRights
    : fallback.qualifyingOfferRights;
  const teams = (Array.isArray(input.teams) ? input.teams : fallback.teams)
    .map((team) => ({
      ...team,
      players: rosterEntries.filter((entry) => entry.teamCode === team.code && entry.state === "active").length,
      cutPlayers: rosterEntries.filter((entry) => entry.teamCode === team.code && entry.state === "cut").length,
      qualifyingOffers: qualifyingOfferRights.filter((right) => right.teamCode === team.code).length,
      draftAssets: draftAssets.filter((asset) => asset.teamCode === team.code).length,
    }))
    .sort((left, right) => left.name.localeCompare(right.name, "it"));

  return {
    teams,
    rosterEntries,
    draftAssets,
    qualifyingOfferRights,
    playerList: Array.isArray(input.playerList) ? input.playerList : fallback.playerList,
    playerListStatus: input.playerListStatus === "published" ? "published" : "offseason",
    draftPositionYears: Array.isArray(input.draftPositionYears)
      ? input.draftPositionYears.filter((year): year is number => Number.isInteger(year))
      : yearsWithDefinedDraftPositions(draftAssets),
    draftOrders: Array.isArray(input.draftOrders)
      ? input.draftOrders.filter((row): row is SavedDraftOrderAssignment => (
        Boolean(row)
        && Number.isInteger(row.year)
        && Number.isInteger(row.position)
        && typeof row.originTeamCode === "string"
        && typeof row.isBonus === "boolean"
        && (row.round === undefined || row.round === "1° giro" || row.round === "2° giro")
      ))
      : [],
  };
}

export function emptyLeagueState(): EditableLeagueState {
  return {
    teams: [],
    rosterEntries: [],
    draftAssets: [],
    qualifyingOfferRights: [],
    playerList: [],
    playerListStatus: "offseason",
    draftPositionYears: [],
    draftOrders: [],
  };
}
