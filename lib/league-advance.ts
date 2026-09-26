import type { PlayerListEntry, QualifyingOfferRight, RosterEntry } from "@/lib/league-types";
import { advanceSeasonName, seasonEndYear } from "./season-time";
import { isRookieExtensionContract } from "./team-option-contract";
import {
  applyPlayoffTeamOptionPromotion,
  requiresPlayoffTeamOptionPromotion,
} from "./two-way-promotions";
import { orderPlayerListByRole } from "./player-list-order";

export type LeagueAdvanceInput = {
  seasonName: string;
  rosterEntries: RosterEntry[];
  qualifyingOfferRights: QualifyingOfferRight[];
  playerList: PlayerListEntry[];
};

export function calculateLeagueAdvance(input: LeagueAdvanceInput) {
  const expiringYear = seasonEndYear(input.seasonName);
  if (expiringYear === null) throw new Error("Annata non valida.");
  const nextSeasonName = advanceSeasonName(input.seasonName);
  const roles = new Map<string, RosterEntry["role"]>();
  input.rosterEntries.forEach((entry) => roles.set(entry.name, entry.role));

  // Restano valide le Q.O. gia previste dai contratti esistenti. Per il
  // percorso T.O./R.E. il diritto nasce invece dalla decisione esplicita di
  // non applicare la rookie extension.
  const generatedRights: QualifyingOfferRight[] = input.rosterEntries
    .filter((entry) => entry.state === "active" && contractExpiryYear(entry.contract, expiringYear) === expiringYear && entry.contract.includes("(Q)"))
    .map((entry) => ({
      playerName: entry.name,
      qualifyingAmount: entry.cost,
      teamCode: entry.teamCode,
    }));

  const retainedBeforeDpeReintegration = input.rosterEntries
    .filter((entry) => {
      const expiry = contractExpiryYear(entry.contract, expiringYear);
      if (expiry === expiringYear) {
        return entry.state === "active" && isRookieExtensionContract(entry);
      }
      // Una T.O. tagliata termina comunque con la stagione.
      if (entry.state === "cut" && entry.contract.trim().toLocaleUpperCase("it-IT") === "T.O.") return false;
      return true;
    })
    .map((entry) => ({
      ...entry,
      endedPreviousSeasonInGLeague: entry.state === "active" && entry.slot === "g_league",
      twoWayPromotionLocked: false,
      dpeAppliedSeasons: entry.state === "active" && entry.slot === "dpe"
        ? [input.seasonName]
        : entry.dpeAppliedSeasons?.includes(input.seasonName) ? [input.seasonName] : undefined,
    }));

  const promotedPlayoffTeamOptionPlayers = retainedBeforeDpeReintegration
    .filter((entry) => requiresPlayoffTeamOptionPromotion(entry, nextSeasonName))
    .map((entry) => ({ playerName: entry.name, teamCode: entry.teamCode }));
  const retainedAfterPlayoffPromotions = retainedBeforeDpeReintegration
    .map((entry) => applyPlayoffTeamOptionPromotion(entry, nextSeasonName));
  const reintegratedDpePlayers = retainedAfterPlayoffPromotions
    .filter((entry) => entry.state === "active" && entry.slot === "dpe")
    .map((entry) => ({ playerName: entry.name, teamCode: entry.teamCode }));
  const retainedEntries = retainedAfterPlayoffPromotions.map((entry) => (
    entry.state === "active" && entry.slot === "dpe"
      ? { ...entry, slot: "regular" as const }
      : entry
  ));

  const qualifyingOfferRights = uniqueRights(generatedRights);
  const existingPlayers = new Map(input.playerList.map((player) => [normalizePlayerName(player.name), player]));
  const rosterOrQualifyingNames = [
    ...retainedEntries.filter((entry) => entry.state === "active").map((entry) => entry.name),
    ...qualifyingOfferRights.map((right) => right.playerName),
  ];
  const playerList = input.playerList.map((player) => ({ ...player, realTeam: "" }));
  const knownNames = new Set(playerList.map((player) => normalizePlayerName(player.name)));
  for (const name of rosterOrQualifyingNames) {
    const normalizedName = normalizePlayerName(name);
    if (knownNames.has(normalizedName)) continue;
    const role = roles.get(name) ?? existingPlayers.get(normalizedName)?.role;
    if (!role) continue;
    playerList.push({
      name,
      role,
      realTeam: "",
      rookie: existingPlayers.get(normalizedName)?.rookie ?? false,
      under23: existingPlayers.get(normalizedName)?.under23 ?? false,
    });
    knownNames.add(normalizedName);
  }

  return {
    nextSeasonName,
    expiringYear,
    rosterEntries: retainedEntries,
    qualifyingOfferRights,
    playerList: orderPlayerListByRole(playerList),
    expiredContracts: input.rosterEntries.length - retainedEntries.length,
    generatedQualifyingOffers: generatedRights.length,
    pendingRookieExtensions: retainedEntries.filter((entry) => entry.state === "active" && isRookieExtensionContract(entry)).length,
    promotedPlayoffTeamOptionPlayers,
    reintegratedDpePlayers,
  };
}

function contractExpiryYear(contract: string, referenceYear: number) {
  const shortYear = contract.match(/\d{2}/)?.[0];
  if (!shortYear) return null;
  return Math.floor(referenceYear / 100) * 100 + Number(shortYear);
}

function uniqueRights(rights: QualifyingOfferRight[]) {
  const unique = new Map<string, QualifyingOfferRight>();
  rights.forEach((right) => unique.set(right.playerName, right));
  return [...unique.values()];
}

function normalizePlayerName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("it-IT");
}
