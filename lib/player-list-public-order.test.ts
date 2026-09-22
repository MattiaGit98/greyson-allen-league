import { describe, expect, it } from "vitest";
import { numberPublicAvailablePlayers } from "./player-list-public-order";

describe("numerazione pubblica del listone", () => {
  const rows = [
    { name: "Libero A", rosterTeamCode: null, qualifyingTeamCode: null },
    { name: "A roster", rosterTeamCode: "AAA", qualifyingTeamCode: null },
    { name: "Q.O.", rosterTeamCode: null, qualifyingTeamCode: "BBB" },
    { name: "Libero B", rosterTeamCode: null, qualifyingTeamCode: null },
  ];

  it("numera solo free agent e qualifying offer nell'ordine del listone", () => {
    expect(numberPublicAvailablePlayers(rows).map((row) => row.publicOrder)).toEqual([1, null, 2, 3]);
  });

  it("ricalcola i numeri quando cambia la presenza nei roster", () => {
    const changed = rows.map((row) => row.name === "Libero A" ? { ...row, rosterTeamCode: "AAA" } : row);
    expect(numberPublicAvailablePlayers(changed).map((row) => row.publicOrder)).toEqual([null, null, 1, 2]);
  });
});
