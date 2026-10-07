import type { RosterEntry } from "./league-types";
import { isPendingContractAssignment } from "./team-option-contract";

export function isPendingAuctionContractForDisplay(entry: RosterEntry, seasonName: string) {
  return entry.state === "active"
    && entry.auctionAcquisition !== "qualifying_offer"
    && entry.auctionPrice !== undefined
    && entry.contractStartSeason === seasonName
    && isPendingContractAssignment(entry.contract);
}
