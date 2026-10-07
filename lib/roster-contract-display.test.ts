import { describe, expect, it } from "vitest";
import type { RosterEntry } from "./league-types";
import { isPendingAuctionContractForDisplay } from "./roster-contract-display";

const auctionPlayer: RosterEntry = {
  name: "Giocatore",
  cost: 7,
  contract: "PENDING",
  role: "G",
  state: "active",
  slot: "regular",
  teamCode: "AAA",
  auctionPrice: 7,
  contractStartSeason: "2026/27",
};

describe("scadenza mostrata nei roster", () => {
  it("mostra il contratto da assegnare solo finché è realmente pendente", () => {
    expect(isPendingAuctionContractForDisplay(auctionPlayer, "2026/27")).toBe(true);
    expect(isPendingAuctionContractForDisplay({ ...auctionPlayer, contract: "27" }, "2026/27")).toBe(false);
    expect(isPendingAuctionContractForDisplay({ ...auctionPlayer, contract: "27", state: "cut" }, "2026/27")).toBe(false);
    expect(isPendingAuctionContractForDisplay({ ...auctionPlayer, state: "cut" }, "2026/27")).toBe(false);
  });

  it("non scambia per pendente una Q.O. accettata o un acquisto di un'altra stagione", () => {
    expect(isPendingAuctionContractForDisplay({ ...auctionPlayer, contract: "27", auctionAcquisition: "qualifying_offer" }, "2026/27")).toBe(false);
    expect(isPendingAuctionContractForDisplay(auctionPlayer, "2027/28")).toBe(false);
  });
});
