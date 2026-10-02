import type { PlayerListEntry, QualifyingOfferRight, RosterEntry } from "@/lib/league-types";
import { advanceSeasonName, seasonEndYear } from "./season-time";
import { isAnnualTeamOptionContract, isRookieExtensionContract } from "./team-option-contract";
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
  const plan = buildSeasonEndCutPlan(input);
  const scheduledKeys = new Set(plan.validScheduledCuts.map((player) => rosterEntryKey(player)));
  const preparedEntries = input.rosterEntries.map((entry) => {
    const scheduled = entry.scheduledSeasonEndCut === input.seasonName && scheduledKeys.has(rosterEntryKey(entry));
    return {
      ...entry,
      scheduledSeasonEndCut: undefined,
      ...(scheduled ? { state: "cut" as const, slot: "regular" as const } : {}),
    };
  });
  const advance = calculateLeagueAdvanceCore({ ...input, rosterEntries: preparedEntries });
  const remainingOverflowByTeam = regularRosterOverflowByTeam(advance.rosterEntries);
  return {
    ...advance,
    scheduledCutPlayers: plan.validScheduledCuts.map((entry) => ({ playerName: entry.name, teamCode: entry.teamCode })),
    invalidScheduledCutPlayers: plan.invalidScheduledCuts.map((entry) => ({ playerName: entry.name, teamCode: entry.teamCode })),
    excessiveScheduledCutsByTeam: plan.excessiveScheduledCutsByTeam,
    remainingOverflowByTeam,
  };
}

export function buildSeasonEndCutPlan(input: LeagueAdvanceInput) {
  const rosterEntries = input.rosterEntries.map((entry) => ({ ...entry, scheduledSeasonEndCut: undefined }));
  const baseline = calculateLeagueAdvanceCore({ ...input, rosterEntries });
  const projectedRegularKeys = new Set(baseline.rosterEntries
    .filter((entry) => entry.state === "active" && entry.slot === "regular")
    .map(rosterEntryKey));
  const scheduledCuts = input.rosterEntries.filter((entry) => Boolean(entry.scheduledSeasonEndCut));
  const validScheduledCuts = scheduledCuts.filter((entry) => (
    entry.scheduledSeasonEndCut === input.seasonName
    && entry.state === "active"
    && projectedRegularKeys.has(rosterEntryKey(entry))
  ));
  const invalidScheduledCuts = scheduledCuts.filter((entry) => !validScheduledCuts.includes(entry));
  const projectedRegularSlotsByTeam = regularRosterCountByTeam(baseline.rosterEntries);
  const overflowBeforeScheduledCuts = regularRosterOverflowByTeam(baseline.rosterEntries);
  const validCounts = countByTeam(validScheduledCuts);
  const excessiveScheduledCutsByTeam = Object.entries(validCounts).flatMap(([teamCode, count]) => {
    const excess = Math.max(0, count - (overflowBeforeScheduledCuts[teamCode] ?? 0));
    return excess ? [{ teamCode, excess }] : [];
  });
  const remainingOverflowByTeam: Record<string, number> = Object.fromEntries(Object.entries(overflowBeforeScheduledCuts)
    .map(([teamCode, overflow]) => [teamCode, Math.max(0, overflow - (validCounts[teamCode] ?? 0))])
    .filter((entry): entry is [string, number] => Number(entry[1]) > 0));

  return {
    projectedRegularKeys: [...projectedRegularKeys],
    projectedRegularSlotsByTeam,
    projectedRegularSlotsAfterScheduledCutsByTeam: Object.fromEntries(Object.entries(projectedRegularSlotsByTeam)
      .map(([teamCode, count]) => [teamCode, count - (validCounts[teamCode] ?? 0)])),
    validScheduledCuts,
    invalidScheduledCuts,
    overflowBeforeScheduledCuts,
    remainingOverflowByTeam,
    excessiveScheduledCutsByTeam,
  };
}

function calculateLeagueAdvanceCore(input: LeagueAdvanceInput) {
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
        return entry.state === "active" && (isRookieExtensionContract(entry) || isAnnualTeamOptionContract(entry));
      }
      // Una T.O. tagliata termina comunque con la stagione.
      if (entry.state === "cut" && entry.contract.trim().toLocaleUpperCase("it-IT") === "T.O.") return false;
      return true;
    })
    .map((entry) => ({
      ...entry,
      contract: isAnnualTeamOptionContract(entry) ? "T.O." : entry.contract,
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

export function rosterEntryKey(entry: Pick<RosterEntry, "teamCode" | "name">) {
  return `${entry.teamCode}\u0000${normalizePlayerName(entry.name)}`;
}

function regularRosterOverflowByTeam(entries: RosterEntry[]): Record<string, number> {
  const counts = regularRosterCountByTeam(entries);
  return Object.fromEntries(Object.entries(counts)
    .map(([teamCode, count]) => [teamCode, Math.max(0, count - 15)])
    .filter((entry): entry is [string, number] => Number(entry[1]) > 0));
}

function regularRosterCountByTeam(entries: RosterEntry[]) {
  return entries
    .filter((entry) => entry.state === "active" && entry.slot === "regular")
    .reduce<Record<string, number>>((result, entry) => {
      result[entry.teamCode] = (result[entry.teamCode] ?? 0) + 1;
      return result;
    }, {});
}

function countByTeam(entries: RosterEntry[]) {
  return entries.reduce<Record<string, number>>((result, entry) => {
    result[entry.teamCode] = (result[entry.teamCode] ?? 0) + 1;
    return result;
  }, {});
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
