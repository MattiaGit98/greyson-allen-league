import { describe, expect, it } from "vitest";
import { buildPublicPlayerListRows } from "./public-player-list";

describe("righe pubbliche del listone", () => {
  it("mantiene l'ordine del listone e distingue roster, Q.O. e free agent", () => {
    const rows = buildPublicPlayerListRows({
      playerList: [
        { name: "Free Agent", role: "G", realTeam: "BOS", rookie: false, under23: false },
        { name: "Giocatore a roster", role: "A", realTeam: "LAL", rookie: false, under23: false },
        { name: "Qualifying Offer", role: "C", realTeam: "MIA", rookie: true, under23: false },
      ],
      rosterEntries: [
        { name: "Giocatore a roster", role: "A", cost: 10, contract: "27", state: "active", slot: "regular", teamCode: "AAA" },
      ],
      qualifyingOfferRights: [
        { playerName: "Qualifying Offer", qualifyingAmount: 4, teamCode: "BBB" },
      ],
    });

    expect(rows.map((row) => ({
      name: row.name,
      publicOrder: row.publicOrder,
      roster: row.rosterTeamCode,
      qualifying: row.qualifyingTeamCode,
    }))).toEqual([
      { name: "Free Agent", publicOrder: 1, roster: null, qualifying: null },
      { name: "Giocatore a roster", publicOrder: null, roster: "AAA", qualifying: null },
      { name: "Qualifying Offer", publicOrder: 2, roster: null, qualifying: "BBB" },
    ]);
  });

  it("non tratta come buyout un taglio ordinario", () => {
    const rows = buildPublicPlayerListRows({
      playerList: [{ name: "Tagliato", role: "G", realTeam: "", rookie: false, under23: false }],
      rosterEntries: [
        { name: "Tagliato", cost: 3, contract: "27", state: "cut", slot: "regular", teamCode: "AAA" },
      ],
      qualifyingOfferRights: [],
    });

    expect(rows[0]).toMatchObject({ rosterTeamCode: null, buyoutApplied: false, publicOrder: 1 });
  });
});
