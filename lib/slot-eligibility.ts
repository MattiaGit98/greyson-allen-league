import type { RosterEntry } from "./league-types";
import { hasReachedMoment, type LeagueMoment } from "./league-moments";
import { seasonEndYear } from "./season-time";

export type ManagedRosterSlot = "regular" | "two_way" | "g_league";

export type SlotEligibilityEntry = Pick<
  RosterEntry,
  "contract" | "cost" | "teamOptionFinalYear" | "freeAgentSignedSeason" | "endedPreviousSeasonInGLeague" | "contractStartSeason" | "twoWayPromotionLocked"
>;

export function contractIncludesTeamOption(entry: Pick<SlotEligibilityEntry, "contract" | "teamOptionFinalYear">) {
  return entry.contract.trim().toLocaleUpperCase("it-IT") === "T.O."
    || entry.teamOptionFinalYear !== undefined
    || /\((?:2X|X2)\)/i.test(entry.contract);
}

export function slotEligibility(entry: SlotEligibilityEntry, seasonName: string) {
  const teamOption = contractIncludesTeamOption(entry);
  return {
    regular: true,
    two_way: entry.cost <= 10 && (
      teamOption
      || entry.freeAgentSignedSeason === seasonName
      || entry.endedPreviousSeasonInGLeague === true
    ),
    g_league: entry.cost <= 5 && teamOption,
  } satisfies Record<ManagedRosterSlot, boolean>;
}

export function slotEligibilityErrors(entry: SlotEligibilityEntry, destination: ManagedRosterSlot, seasonName: string) {
  const eligibility = slotEligibility(entry, seasonName);
  if (eligibility[destination]) return [];
  if (destination === "g_league") {
    return ["La G-League richiede un contratto con T.O. e un costo massimo di 5 crediti."];
  }
  return ["Il Two-way richiede un costo massimo di 10 crediti e almeno una categoria ammessa: T.O., free agent della stagione corrente o giocatore che ha concluso la stagione precedente in G-League."];
}

export function isSlotDemotion(source: ManagedRosterSlot, destination: ManagedRosterSlot) {
  const rank: Record<ManagedRosterSlot, number> = { regular: 2, two_way: 1, g_league: 0 };
  return rank[destination] < rank[source];
}

export function isSecondContractYear(entry: SlotEligibilityEntry, seasonName: string) {
  const currentStartYear = Number(seasonName.slice(0, 4));
  const contractStartYear = Number(entry.contractStartSeason?.slice(0, 4));
  if (Number.isInteger(currentStartYear) && Number.isInteger(contractStartYear) && contractStartYear > 0) {
    return currentStartYear === contractStartYear + 1;
  }
  const currentEndYear = seasonEndYear(seasonName);
  return currentEndYear !== null && entry.teamOptionFinalYear === currentEndYear + 1;
}

export function slotMoveTimingErrors(
  entry: SlotEligibilityEntry & { slot: ManagedRosterSlot },
  destination: ManagedRosterSlot,
  seasonName: string,
  moment: LeagueMoment,
) {
  if (!isSlotDemotion(entry.slot, destination)) return [];
  if (entry.twoWayPromotionLocked) {
    return ["Il giocatore è stato promosso obbligatoriamente dai Two-way e non può tornare in uno slot inferiore durante questa annata."];
  }
  if (isSecondContractYear(entry, seasonName)) {
    return ["Per un giocatore al secondo anno non è consentito lo spostamento verso uno slot inferiore."];
  }
  if (!hasReachedMoment(moment, "team_option_deadline") || hasReachedMoment(moment, "contract_delivery")) {
    return ["Gli spostamenti verso uno slot inferiore sono consentiti soltanto dall'inizio del Draft alla consegna dei contratti."];
  }
  return [];
}

export function legalSlotDestinations(
  entry: SlotEligibilityEntry & { slot: ManagedRosterSlot },
  seasonName: string,
  moment: LeagueMoment,
) {
  return (["regular", "two_way", "g_league"] as ManagedRosterSlot[]).filter((destination) => (
    destination === entry.slot
    || (
      slotEligibilityErrors(entry, destination, seasonName).length === 0
      && slotMoveTimingErrors(entry, destination, seasonName, moment).length === 0
    )
  ));
}

export function moveRosterEntryToSlot<T extends RosterEntry>(entry: T, destination: ManagedRosterSlot): T {
  return { ...entry, slot: destination };
}
