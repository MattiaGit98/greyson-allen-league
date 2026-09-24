import type { RosterEntry } from "./league-types";
import { hasReachedMoment, type LeagueMoment } from "./league-moments";
import { seasonEndYear } from "./season-time";

export type ManagedRosterSlot = "regular" | "two_way" | "g_league";

export type SlotEligibilityEntry = Pick<
  RosterEntry,
  "contract" | "cost" | "teamOptionFinalYear" | "freeAgentSignedSeason" | "endedPreviousSeasonInGLeague" | "contractStartSeason" | "twoWayPromotionLocked" | "auctionAcquisition" | "auctionPrice"
> & {
  rookie?: boolean;
  under23?: boolean;
};

export function hasPendingAuctionContract(entry: Pick<SlotEligibilityEntry, "contract">) {
  return ["", "-", "PENDING", "DA ASSEGNARE"].includes(entry.contract.trim().toLocaleUpperCase("it-IT"));
}

export function contractIncludesTeamOption(entry: Pick<SlotEligibilityEntry, "contract" | "teamOptionFinalYear">) {
  return entry.contract.trim().toLocaleUpperCase("it-IT") === "T.O."
    || entry.teamOptionFinalYear !== undefined
    || /\((?:2X|X2)\)/i.test(entry.contract);
}

export function slotEligibility(entry: SlotEligibilityEntry, seasonName: string) {
  if (hasPendingAuctionContract(entry)) {
    const price = entry.auctionPrice ?? entry.cost;
    const teamOptionEligible = entry.rookie === true || (entry.under23 === true && price <= 15);
    const specialSlotEligible = !entry.auctionAcquisition && teamOptionEligible;
    return {
      regular: true,
      two_way: specialSlotEligible && price <= 10,
      g_league: specialSlotEligible && price <= 5,
    } satisfies Record<ManagedRosterSlot, boolean>;
  }
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
  if (hasPendingAuctionContract(entry)) {
    if (entry.auctionAcquisition) {
      return ["Un acquisto tramite Q.O. o come RFA deve restare nel roster."];
    }
    const price = entry.auctionPrice ?? entry.cost;
    if (entry.under23 && !entry.rookie && price > 15) {
      return ["Un Under 23 acquistato all'asta per più di 15 crediti non può ricevere la T.O. necessaria per questo slot."];
    }
    if (!entry.rookie && !entry.under23) {
      return ["Questo giocatore non è idoneo alla T.O. necessaria per lo slot speciale."];
    }
    if (destination === "g_league" && price > 5) return ["La G-League richiede un costo massimo di 5 crediti."];
    if (destination === "two_way" && price > 10) return ["Il Two-way richiede un costo massimo di 10 crediti."];
  }
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

export function legalPromotionDestinations(
  entry: SlotEligibilityEntry & { slot: ManagedRosterSlot },
  seasonName: string,
  moment: LeagueMoment,
) {
  return legalSlotDestinations(entry, seasonName, moment).filter((destination) => (
    destination !== entry.slot && !isSlotDemotion(entry.slot, destination)
  ));
}

export function moveRosterEntryToSlot<T extends RosterEntry>(entry: T, destination: ManagedRosterSlot): T {
  return { ...entry, slot: destination };
}
