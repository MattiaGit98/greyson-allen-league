import { describe, expect, it } from "vitest";
import { qualifyingOfferDisplayRole } from "./qualifying-offer-role";

const playerList = [
  { name: "Giocatore", role: "C" as const, realTeam: "NBA", rookie: false, under23: false },
];

describe("ruolo mostrato per le qualifying offer", () => {
  it("prima della pubblicazione usa il ruolo storico salvato con la Q.O.", () => {
    expect(qualifyingOfferDisplayRole({
      playerName: "Giocatore",
      qualifyingAmount: 3,
      teamCode: "AAA",
      role: "A",
    }, playerList, false)).toBe("A");
  });

  it("dopo la pubblicazione usa il ruolo del nuovo listone", () => {
    expect(qualifyingOfferDisplayRole({
      playerName: "Giocatore",
      qualifyingAmount: 3,
      teamCode: "AAA",
      role: "A",
    }, playerList, true)).toBe("C");
  });

  it("mantiene compatibili le Q.O. esistenti prive del ruolo salvato", () => {
    expect(qualifyingOfferDisplayRole({
      playerName: "Giocatore",
      qualifyingAmount: 3,
      teamCode: "AAA",
    }, playerList, false)).toBe("C");
  });
});
