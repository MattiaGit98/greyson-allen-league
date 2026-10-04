import type { AuctionAcquisitionKind, RosterEntry } from "./league-types";
import type { LeagueMoment } from "./league-moments";
import { assignedAuctionContract } from "./rules/contracts";
import {
  slotEligibilityErrors,
  slotMoveTimingErrors,
  type ManagedRosterSlot,
  type SlotEligibilityEntry,
} from "./slot-eligibility";

export type AuctionSlot = "regular" | "two_way" | "g_league";
export type AuctionSlotCounts = Record<AuctionSlot, number>;
export type QualifyingAuctionOutcome = "normal" | AuctionAcquisitionKind;
export type PostAuctionContractKind = "annual" | "biennial" | "triennial" | "team_option";

export const auctionSlotLimits: AuctionSlotCounts = {
  regular: 15,
  two_way: 2,
  g_league: 3,
};

export function auctionContractAtPurchase({
  price,
  acquisition,
  currentSeasonEndYear,
}: {
  price: number;
  acquisition?: AuctionAcquisitionKind;
  currentSeasonEndYear: number;
}) {
  if (acquisition === "qualifying_offer") {
    return assignedAuctionContract(price, "annual", currentSeasonEndYear);
  }
  return {
    cost: price,
    contract: "PENDING",
    auctionPrice: price,
    originalContractYears: undefined,
  } as const;
}
export function acquisitionKindForOutcome(outcome: QualifyingAuctionOutcome): AuctionAcquisitionKind | undefined {
  return outcome === "qualifying_offer" || outcome === "restricted_free_agent" ? outcome : undefined;
}

export function allowedPostAuctionContracts(acquisition?: AuctionAcquisitionKind): PostAuctionContractKind[] {
  if (acquisition === "qualifying_offer") return ["annual"];
  if (acquisition === "restricted_free_agent") return ["annual", "biennial", "triennial"];
  return ["annual", "biennial", "triennial", "team_option"];
}

export function auctionAcquisitionLabel(acquisition?: AuctionAcquisitionKind) {
  if (acquisition === "qualifying_offer") return "Q.O. accettata";
  if (acquisition === "restricted_free_agent") return "Restricted free agent";
  return "Asta normale";
}

export function isPostAuctionContractAssignmentCandidate(
  entry: Pick<RosterEntry, "contract" | "auctionPrice" | "contractStartSeason"> & {
    auctionAcquisition?: RosterEntry["auctionAcquisition"];
  },
  activeSeasonName: string,
) {
  if (entry.auctionAcquisition === "qualifying_offer") return false;
  const normalized = entry.contract.trim().toLocaleUpperCase("it-IT");
  if (["", "-", "PENDING", "DA ASSEGNARE"].includes(normalized)) return true;
  return entry.auctionPrice !== undefined && entry.contractStartSeason === activeSeasonName;
}

export function qualifyingAuctionErrors({
  hasQualifyingRight,
  outcome,
  rightTeamCode,
  rightAmount,
  teamCode,
  price,
  slot,
}: {
  hasQualifyingRight: boolean;
  outcome: string;
  rightTeamCode?: string;
  rightAmount?: number;
  teamCode: string;
  price: number;
  slot: AuctionSlot;
}) {
  if (!hasQualifyingRight) return outcome === "normal" ? [] : ["Il giocatore non possiede un diritto di Q.O."];
  if (!(["normal", "qualifying_offer", "restricted_free_agent"] as string[]).includes(outcome)) {
    return ["Specifica l'esito della qualifying offer."];
  }
  const errors: string[] = [];
  if ((outcome === "qualifying_offer" || outcome === "restricted_free_agent") && slot !== "regular") {
    errors.push("Un acquisto tramite Q.O. o come RFA deve essere inserito nel roster.");
  }
  if (outcome === "qualifying_offer" || outcome === "restricted_free_agent") {
    if (teamCode !== rightTeamCode) errors.push("L’acquisto tramite Q.O. o come restricted free agent spetta alla squadra che detiene il diritto.");
  }
  if (outcome === "qualifying_offer") {
    if (price !== rightAmount) errors.push("Il prezzo della Q.O. accettata deve coincidere con il suo importo.");
  }
  if (outcome === "restricted_free_agent" && rightAmount !== undefined && price <= rightAmount) {
    errors.push("L'offerta finale per un restricted free agent deve superare l'importo della Q.O. rifiutata.");
  }
  return errors;
}

export function auctionDestinationErrors({
  slot,
  price,
  rookie,
  under23,
}: {
  slot: AuctionSlot;
  price: number;
  rookie: boolean;
  under23: boolean;
}) {
  const errors: string[] = [];
  if (!Number.isInteger(price) || price < 1) errors.push("Il prezzo deve essere un numero intero di almeno 1 credito.");
  if (slot === "regular") return errors;
  if (!rookie && !(under23 && price <= 15)) errors.push("La T.O. è disponibile soltanto per rookie o Under 23 acquistati per non più di 15 crediti.");
  if (slot === "two_way" && price > 10) errors.push("Il Two-way è disponibile fino a 10 crediti.");
  if (slot === "g_league" && price > 5) errors.push("La G-League è disponibile fino a 5 crediti.");
  return errors;
}

export function legalAuctionContextualDestinations({
  entry,
  rookie,
  under23,
  seasonName,
  moment,
}: {
  entry: SlotEligibilityEntry & Pick<RosterEntry, "slot" | "auctionPrice" | "contractStartSeason">;
  rookie: boolean;
  under23: boolean;
  seasonName: string;
  moment: LeagueMoment;
}) {
  if (entry.slot === "dpe") return [];
  const source = entry.slot as ManagedRosterSlot;
  const pendingAuctionContract = isPostAuctionContractAssignmentCandidate(entry, seasonName);
  return (["regular", "two_way", "g_league"] as AuctionSlot[]).filter((destination) => {
    if (destination === source) return false;
    if (entry.auctionAcquisition && destination !== "regular") return false;
    if (slotMoveTimingErrors({ ...entry, slot: source }, destination, seasonName, moment).length) return false;
    if (pendingAuctionContract) {
      return auctionDestinationErrors({ slot: destination, price: entry.auctionPrice ?? entry.cost, rookie, under23 }).length === 0;
    }
    return slotEligibilityErrors(entry, destination, seasonName).length === 0;
  });
}
