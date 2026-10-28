import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { buildAuctionEmergencyWorkbook } from "./auction-emergency-workbook";
import { emptyLeagueState } from "./league-state";

describe("Excel di emergenza asta", () => {
  it("esporta cap corrente, slot richiesti, tagliati, Q.O. e stato del listone senza dati superflui", async () => {
    const state = emptyLeagueState();
    state.playerListStatus = "published";
    state.teams = [{
      code: "ABC", name: "Squadra Alfa", owner: "Proprietario riservato", slug: "alfa",
      credits: 0, cost: 0, players: 0, cutPlayers: 0, qualifyingOffers: 0, draftAssets: 0,
      nextSeasonCredits: 0, followingSeasonCredits: 0,
    }];
    state.playerList = [
      { name: "Giocatore roster", role: "G", realTeam: "Boston", rookie: false, under23: false },
      { name: "Giocatore QO", role: "A", realTeam: "Chicago", rookie: false, under23: false },
      { name: "Giocatore libero", role: "C", realTeam: "Miami", rookie: true, under23: false },
      { name: "Giocatore buyout", role: "G", realTeam: "Miami", rookie: false, under23: false },
      { name: "Tagliato", role: "C", realTeam: "LA", rookie: false, under23: false },
    ];
    state.rosterEntries = [
      { name: "Giocatore roster", role: "G", cost: 10, contract: "27", state: "active", slot: "regular", teamCode: "ABC" },
      { name: "Giocatore two-way", role: "A", cost: 2, contract: "27", state: "active", slot: "two_way", teamCode: "ABC" },
      { name: "Giocatore G-League", role: "C", cost: 1, contract: "27", state: "active", slot: "g_league", teamCode: "ABC" },
      { name: "Giocatore DPE", role: "G", cost: 5, contract: "27", state: "active", slot: "dpe", teamCode: "ABC" },
      { name: "Tagliato", role: "A", cost: 4, contract: "27", state: "cut", slot: "regular", teamCode: "ABC" },
      { name: "Giocatore buyout", role: "G", cost: 3, contract: "27", state: "cut", slot: "regular", teamCode: "ABC", buyoutApplied: true },
    ];
    state.qualifyingOfferRights = [{ playerName: "Giocatore QO", role: "C", qualifyingAmount: 7, teamCode: "ABC" }];

    const workbook = buildAuctionEmergencyWorkbook({
      state, seasonName: "2026/27", exportedAt: new Date("2026-10-06T08:00:00Z"), countTeamOptions: true,
    });
    const loaded = new ExcelJS.Workbook();
    await loaded.xlsx.load(await workbook.xlsx.writeBuffer() as unknown as Parameters<typeof loaded.xlsx.load>[0]);
    expect(loaded.worksheets.map((sheet) => sheet.name)).toEqual(["Squadre", "Listone"]);

    const teams = rows(loaded.getWorksheet("Squadre")!);
    const teamsSheet = loaded.getWorksheet("Squadre")!;
    expect(teamsSheet.getCell("A5").value).toBe("Roster");
    expect(teamsSheet.getCell("A21").value).toBe("Two-way");
    expect(teamsSheet.getCell("A24").value).toBe("G-League");
    expect(teamsSheet.getCell("A28").value).toBe("Tagliati");
    expect(teamsSheet.getCell("A36").value).toBe("Q.O.");
    for (const row of [7, 20, 23, 26, 27, 31, 35]) {
      expect(teamsSheet.getRow(row).getCell(1).value).toBeNull();
      expect(teamsSheet.getRow(row).getCell(1).border?.bottom).toBeDefined();
    }
    expect(teams).toContainEqual(["Squadra Alfa", "Cap libero: 975", "Ruoli: 1 G - 1 A - 1 C"]);
    expect(teams).toContainEqual(["Giocatore roster", "G", 10]);
    expect(teams).toContainEqual(["Giocatore two-way", "A", 2]);
    expect(teams).toContainEqual(["Giocatore G-League", "C", 1]);
    expect(teams).toContainEqual(["Tagliato", "A", 4]);
    expect(teams).toContainEqual(["Giocatore QO", "A", 7]);
    expect(JSON.stringify(teams)).not.toContain("Giocatore DPE");
    expect(JSON.stringify(teams)).not.toContain("Proprietario riservato");
    expect(JSON.stringify(teams)).not.toContain("ABC");
    expect(JSON.stringify(teams)).not.toContain("Boston");

    const list = rows(loaded.getWorksheet("Listone")!);
    expect(list).toContainEqual(["Giocatore roster", "G", ""]);
    expect(list).toContainEqual(["Giocatore QO", "A", "Q.O. · Squadra Alfa"]);
    expect(list).toContainEqual(["Giocatore libero", "C", "FA"]);
    expect(list).toContainEqual(["Giocatore buyout", "G", "FA"]);
  });

  it("non tronca uno slot che contiene più giocatori delle righe di riferimento", () => {
    const state = emptyLeagueState();
    state.teams = [{
      code: "ABC", name: "Squadra Alfa", owner: "", slug: "alfa",
      credits: 0, cost: 0, players: 0, cutPlayers: 0, qualifyingOffers: 0, draftAssets: 0,
      nextSeasonCredits: 0, followingSeasonCredits: 0,
    }];
    state.rosterEntries = Array.from({ length: 16 }, (_, index) => ({
      name: `Giocatore ${index + 1}`, role: "G" as const, cost: 1, contract: "27",
      state: "active" as const, slot: "regular" as const, teamCode: "ABC",
    }));
    const workbook = buildAuctionEmergencyWorkbook({
      state, seasonName: "2026/27", exportedAt: new Date("2026-10-06T08:00:00Z"), countTeamOptions: true,
    });
    const sheet = workbook.getWorksheet("Squadre")!;
    expect(sheet.getCell("A21").value).toBe("Giocatore 16");
    expect(sheet.getCell("A22").value).toBe("Two-way");
  });
});

function rows(sheet: ExcelJS.Worksheet) {
  const result: Array<Array<string | number>> = [];
  sheet.eachRow((row) => {
    result.push([1, 2, 3].map((index) => {
      const value = row.getCell(index).value;
      return typeof value === "number" ? value : String(value ?? "");
    }));
  });
  return result;
}
