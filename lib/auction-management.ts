import type { AuctionAcquisitionKind, RosterEntry } from "./league-types";

export type AuctionSlot = "regular" | "two_way" | "g_league";
export type AuctionRosterSlot = AuctionSlot | "dpe";
export type AuctionSlotCounts = Record<AuctionSlot, number>;
export type QualifyingAuctionOutcome = "normal" | AuctionAcquisitionKind;
export type PostAuctionContractKind = "annual" | "biennial" | "triennial" | "team_option";

export const auctionSlotLimits: AuctionSlotCounts = {
  regular: 15,
  two_way: 2,
  g_league: 3,
};

export function auctionContractForSlot(slot: AuctionSlot, acquisition?: AuctionAcquisitionKind) {
  if (acquisition) return "PENDING";
  return slot === "regular" ? "PENDING" : "T.O.";
}

export function acquisitionKindForOutcome(outcome: QualifyingAuctionOutcome): AuctionAcquisitionKind | undefined {
  return outcome === "qualifying_offer" || outcome === "restricted_free_agent" ? outcome : undefined;
}

export function allowedPostAuctionContracts(acquisition?: AuctionAcquisitionKind): PostAuctionContractKind[] {
  if (acquisition === "qualifying_offer") return ["annual"];
  if (acquisition === "restricted_free_agent") return ["annual", "biennial"];
  return ["annual", "biennial", "triennial", "team_option"];
}

export function auctionAcquisitionLabel(acquisition?: AuctionAcquisitionKind) {
  if (acquisition === "qualifying_offer") return "Q.O. accettata";
  if (acquisition === "restricted_free_agent") return "Restricted free agent";
  return "Asta normale";
}

export function isPostAuctionContractAssignmentCandidate(
  entry: Pick<RosterEntry, "contract" | "auctionPrice" | "contractStartSeason">,
  activeSeasonName: string,
) {
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
  if (!rookie && !under23) errors.push("La T.O. è disponibile soltanto per rookie e Under 23 idonei.");
  if (slot === "two_way" && price > 10) errors.push("Il Two-way è disponibile fino a 10 crediti.");
  if (slot === "g_league" && price > 5) errors.push("La G-League è disponibile fino a 5 crediti.");
  return errors;
}

export function auctionSlotCountsAfterMove({
  counts,
  fromSlot,
  toSlot,
  hasExchange,
}: {
  counts: AuctionSlotCounts;
  fromSlot: AuctionRosterSlot;
  toSlot: AuctionSlot;
  hasExchange: boolean;
}) {
  const after = { ...counts };
  if (fromSlot !== "dpe") after[fromSlot] -= 1;
  after[toSlot] += 1;
  if (hasExchange && fromSlot !== "dpe") {
    after[toSlot] -= 1;
    after[fromSlot] += 1;
  }
  return after;
}

export function auctionSlotCapacityErrors(counts: AuctionSlotCounts) {
  return (Object.keys(auctionSlotLimits) as AuctionSlot[])
    .filter((slot) => counts[slot] > auctionSlotLimits[slot])
    .map((slot) => `Lo slot ${auctionSlotLabel(slot)} è pieno (${counts[slot]}/${auctionSlotLimits[slot]}). Seleziona un giocatore con cui scambiare lo slot.`);
}

export function auctionSlotLabel(slot: AuctionRosterSlot) {
  if (slot === "two_way") return "Two-way";
  if (slot === "g_league") return "G-League";
  if (slot === "dpe") return "DPE";
  return "Roster";
}
