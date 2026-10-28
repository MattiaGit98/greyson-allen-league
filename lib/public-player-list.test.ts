import { describe, expect, it } from "vitest";
import { buildPublicPlayerListRows, publicPlayerStatus } from "./public-player-list";

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
      contract: row.rosterContract,
      qualifying: row.qualifyingTeamCode,
    }))).toEqual([
      { name: "Free Agent", publicOrder: 1, roster: null, contract: null, qualifying: null },
      { name: "Giocatore a roster", publicOrder: null, roster: "AAA", contract: "27", qualifying: null },
      { name: "Qualifying Offer", publicOrder: 2, roster: null, contract: null, qualifying: "BBB" },
    ]);
  });

  it("non collega un tagliato al free agent omonimo", () => {
    const rows = buildPublicPlayerListRows({
      playerList: [{ name: "Tagliato", role: "G", realTeam: "", rookie: false, under23: false }],
      rosterEntries: [
        { name: "Tagliato", cost: 3, contract: "27", state: "cut", slot: "regular", teamCode: "AAA" },
      ],
      qualifyingOfferRights: [],
    });

    expect(rows[0]).toMatchObject({ rosterTeamCode: null, publicOrder: 1 });
    expect(rows[0]).not.toHaveProperty("buyoutApplied");
    expect(publicPlayerStatus(rows[0], "2026/27", true)).toBe("fa");
  });

  it("mantiene la prima corrispondenza normalizzata senza riportare il vecchio buyout", () => {
    const rows = buildPublicPlayerListRows({
      playerList: [
        { name: "Primo Giocatore", role: "G", realTeam: "", rookie: false, under23: false },
        { name: "Secondo Giocatore", role: "A", realTeam: "", rookie: false, under23: false },
      ],
      rosterEntries: [
        { name: " primo  giocatore ", role: "G", cost: 1, contract: "27", state: "active", slot: "regular", teamCode: "AAA" },
        { name: "Primo Giocatore", role: "G", cost: 2, contract: "28", state: "active", slot: "regular", teamCode: "BBB" },
        { name: "Secondo Giocatore", role: "A", cost: 3, contract: "27", state: "cut", slot: "regular", teamCode: "CCC", buyoutApplied: true },
      ],
      qualifyingOfferRights: [
        { playerName: "secondo giocatore", qualifyingAmount: 1, teamCode: "DDD" },
        { playerName: "Secondo Giocatore", qualifyingAmount: 2, teamCode: "EEE" },
      ],
    });

    expect(rows[0]).toMatchObject({ rosterTeamCode: "AAA", rosterContract: "27", qualifyingTeamCode: null });
    expect(rows[1]).toMatchObject({ rosterTeamCode: null, qualifyingTeamCode: "DDD" });
    expect(rows[1]).not.toHaveProperty("buyoutApplied");
  });

  it("distingue i contratti in scadenza, non in scadenza e da assegnare dopo l'asta", () => {
    const row = buildPublicPlayerListRows({
      playerList: [{ name: "Giocatore", role: "G", realTeam: "", rookie: false, under23: false }],
      rosterEntries: [{ name: "Giocatore", role: "G", cost: 1, contract: "27", state: "active", slot: "regular", teamCode: "AAA" }],
      qualifyingOfferRights: [],
    })[0];

    expect(publicPlayerStatus(row, "2026/27", false)).toBe("roster");
    for (const contract of ["27", "27 (Q)"]) {
      expect(publicPlayerStatus({ ...row, rosterContract: contract }, "2026/27", true)).toBe("expiring");
    }
    for (const contract of ["28", "27 + T.O.", "27 + R.E.", "27 (E)"]) {
      expect(publicPlayerStatus({ ...row, rosterContract: contract }, "2026/27", true)).toBe("not_expiring");
    }
    expect(publicPlayerStatus({ ...row, rosterContract: "PENDING" }, "2026/27", true)).toBe("pending");
    expect(publicPlayerStatus({ ...row, rosterContract: "28 (Q)" }, "2027/28", true)).toBe("expiring");
    expect(publicPlayerStatus({ ...row, rosterTeamCode: null, rosterContract: null }, "2026/27", true)).toBe("fa");
    expect(publicPlayerStatus({ ...row, rosterTeamCode: null, rosterContract: null, qualifyingTeamCode: "AAA" }, "2026/27", false)).toBe("qo");
  });
});
