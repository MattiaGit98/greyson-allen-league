import type { PlayerListEntry, QualifyingOfferRight, RosterEntry } from "@/lib/league-types";
import { advanceSeasonName, seasonEndYear } from "./season-time";
import { applyTeamOptionFinalYearDoubling, teamOptionCutAdjustment } from "./team-option-contract";
import {
  applyPlayoffTeamOptionPromotion,
  applySecondYearTwoWayPromotion,
  requiresPlayoffTeamOptionPromotion,
  requiresSecondYearTwoWayPromotion,
} from "./two-way-promotions";

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

  const generatedRights: QualifyingOfferRight[] = input.rosterEntries
    .filter((entry) => entry.state === "active" && contractExpiryYear(entry.contract, expiringYear) === expiringYear && entry.contract.includes("(Q)"))
    .map((entry) => ({
      playerName: entry.name,
      qualifyingAmount: entry.cost,
      teamCode: entry.teamCode,
    }));

  const doublingKeys = new Set(input.rosterEntries
    .filter((entry) => entry.state === "active"
      && contractExpiryYear(entry.contract, expiringYear) === expiringYear + 1
      && /\((?:2X|X2)\)/i.test(entry.contract))
    .map((entry) => `${entry.teamCode}:${entry.name}`));

  const retainedBeforeDpeReintegration = input.rosterEntries
    .filter((entry) => {
      const expiry = contractExpiryYear(entry.contract, expiringYear);
      if (expiry === expiringYear) return false;
      // Una T.O. non esercitata non ha una scadenza numerica. Se il giocatore
      // e gia stato tagliato, il contratto termina comunque con la stagione.
      if (entry.state === "cut" && entry.contract.trim().toLocaleUpperCase("it-IT") === "T.O.") return false;
      return true;
    })
    .map((entry) => {
      const entryWithSeasonHistory = {
        ...entry,
        endedPreviousSeasonInGLeague: entry.state === "active" && entry.slot === "g_league",
        twoWayPromotionLocked: false,
      };
      const expiry = contractExpiryYear(entry.contract, expiringYear);
      const becomesFinalYearOption = expiry === expiringYear + 1
        && /\((?:2X|X2)\)/i.test(entry.contract);
      if (!becomesFinalYearOption) return entryWithSeasonHistory;
      if (entry.state === "cut") {
        return teamOptionCutAdjustment(entryWithSeasonHistory, expiringYear + 1, "offseason_start").entry;
      }
      return applyTeamOptionFinalYearDoubling(entryWithSeasonHistory, expiry);
    });
  const promotedSecondYearTwoWayPlayers = retainedBeforeDpeReintegration
    .filter((entry) => (
      requiresSecondYearTwoWayPromotion(entry, input.seasonName)
      && !requiresPlayoffTeamOptionPromotion(entry, nextSeasonName)
    ))
    .map((entry) => ({ playerName: entry.name, teamCode: entry.teamCode }));
  const promotedPlayoffTeamOptionPlayers = retainedBeforeDpeReintegration
    .filter((entry) => requiresPlayoffTeamOptionPromotion(entry, nextSeasonName))
    .map((entry) => ({ playerName: entry.name, teamCode: entry.teamCode }));
  const retainedBeforeDpeReintegrationAfterTwoWayPromotions = retainedBeforeDpeReintegration
    .map((entry) => applySecondYearTwoWayPromotion(entry, input.seasonName))
    .map((entry) => applyPlayoffTeamOptionPromotion(entry, nextSeasonName));
  const reintegratedDpePlayers = retainedBeforeDpeReintegrationAfterTwoWayPromotions
    .filter((entry) => entry.state === "active" && entry.slot === "dpe")
    .map((entry) => ({ playerName: entry.name, teamCode: entry.teamCode }));
  const retainedEntries = retainedBeforeDpeReintegrationAfterTwoWayPromotions.map((entry) => (
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
    playerList,
    expiredContracts: input.rosterEntries.length - retainedEntries.length,
    generatedQualifyingOffers: generatedRights.length,
    doubledTeamOptions: doublingKeys.size,
    promotedSecondYearTwoWayPlayers,
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
