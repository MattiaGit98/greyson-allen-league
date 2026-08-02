import { describe, expect, it } from "vitest";
import { calculateLeagueAdvance } from "./league-advance";
import { calculateCapSpace } from "./season-time";
import type { RosterEntry } from "./league-types";

const rosterEntries: RosterEntry[] = [
  { name: "Ex T.O.", cost: 5, contract: "28 (2X)", role: "G", state: "active", slot: "regular", teamCode: "AAA" },
  { name: "Scadenza Q.O.", cost: 7, contract: "27 (Q)", role: "A", state: "active", slot: "regular", teamCode: "AAA" },
  { name: "Scadenza semplice", cost: 3, contract: "27", role: "C", state: "active", slot: "regular", teamCode: "BBB" },
  { name: "Tagliato", cost: 4, contract: "27", role: "G", state: "cut", slot: "regular", teamCode: "BBB" },
  { name: "Contratto lungo", cost: 20, contract: "29", role: "A", state: "active", slot: "regular", teamCode: "BBB" },
];

describe("avanzamento della lega", () => {
  const result = calculateLeagueAdvance({
    seasonName: "2026/27",
    rosterEntries,
    qualifyingOfferRights: [{ playerName: "Vecchia Q.O.", qualifyingAmount: 2, teamCode: "AAA" }],
    playerList: rosterEntries.map((entry) => ({
      name: entry.name,
      role: entry.role ?? "G",
      realTeam: "NBA",
      rookie: false,
      under23: false,
    })),
  });

  it("avanza l'annata e chiude tutti i contratti dell'anno terminato", () => {
    expect(result.nextSeasonName).toBe("2027/28");
    expect(result.expiredContracts).toBe(3);
    expect(result.rosterEntries.map((entry) => entry.name)).toEqual(["Ex T.O.", "Contratto lungo"]);
  });

  it("trasferisce alla Q.O. soltanto le scadenze già abilitate", () => {
    expect(result.qualifyingOfferRights).toEqual([
      { playerName: "Scadenza Q.O.", qualifyingAmount: 7, teamCode: "AAA" },
    ]);
  });

  it("rende effettivo il raddoppio e attribuisce la Q.O. futura", () => {
    const option = result.rosterEntries.find((entry) => entry.name === "Ex T.O.");
    expect(option).toMatchObject({ cost: 10, contract: "28 (Q)", teamOptionBaseCost: 5, teamOptionFinalYear: 2028 });
    expect(calculateCapSpace({
      entries: [rosterEntries[0]],
      seasonName: "2027/28",
      optionSeasonName: "2026/27",
      countTeamOptions: true,
    })).toBe(990);
    expect(calculateCapSpace({
      entries: option ? [option] : [],
      seasonName: "2027/28",
      optionSeasonName: "2027/28",
      countTeamOptions: true,
    })).toBe(990);
  });

  it("non raddoppia una ex T.O. giÃ  tagliata prima dell'asta", () => {
    const cutResult = calculateLeagueAdvance({
      seasonName: "2026/27",
      rosterEntries: [
        { name: "Ex T.O. tagliata", cost: 5, contract: "28 (2X)", role: "G", state: "cut", slot: "regular", teamCode: "AAA" },
      ],
      qualifyingOfferRights: [],
      playerList: [{ name: "Ex T.O. tagliata", role: "G", realTeam: "", rookie: false, under23: false }],
    });
    expect(cutResult.rosterEntries[0]).toMatchObject({
      cost: 5,
      contract: "28",
      teamOptionBaseCost: 5,
      teamOptionFinalYear: 2028,
    });
  });

  it("chiude a fine stagione una T.O. non esercitata gia tagliata", () => {
    const cutResult = calculateLeagueAdvance({
      seasonName: "2026/27",
      rosterEntries: [
        { name: "T.O. tagliata", cost: 4, contract: "T.O.", role: "G", state: "cut", slot: "regular", teamCode: "AAA" },
      ],
      qualifyingOfferRights: [],
      playerList: [{ name: "T.O. tagliata", role: "G", realTeam: "", rookie: false, under23: true }],
    });
    expect(cutResult.rosterEntries).toEqual([]);
    expect(cutResult.expiredContracts).toBe(1);
  });

  it("ricostruisce il listone senza squadra NBA e senza vecchi free agent", () => {
    expect(result.playerList.map((player) => player.name)).toEqual(["Ex T.O.", "Scadenza Q.O.", "Contratto lungo"]);
    expect(result.playerList.every((player) => player.realTeam === "")).toBe(true);
    expect(result.playerList.some((player) => player.name === "Vecchia Q.O.")).toBe(false);
  });

  it("reintegra negli slot roster le DPE ancora sotto contratto", () => {
    const dpeResult = calculateLeagueAdvance({
      seasonName: "2026/27",
      rosterEntries: [
        { name: "DPE lunga", cost: 4, contract: "28", role: "G", state: "active", slot: "dpe", teamCode: "AAA" },
        { name: "DPE in scadenza", cost: 4, contract: "27", role: "A", state: "active", slot: "dpe", teamCode: "AAA" },
      ],
      qualifyingOfferRights: [],
      playerList: [
        { name: "DPE lunga", role: "G", realTeam: "", rookie: false, under23: false },
        { name: "DPE in scadenza", role: "A", realTeam: "", rookie: false, under23: false },
      ],
    });
    expect(dpeResult.rosterEntries).toEqual([
      expect.objectContaining({ name: "DPE lunga", slot: "regular" }),
    ]);
    expect(dpeResult.reintegratedDpePlayers).toEqual([{ playerName: "DPE lunga", teamCode: "AAA" }]);
  });

  it("ricorda chi ha concluso la stagione precedente in G-League", () => {
    const historyResult = calculateLeagueAdvance({
      seasonName: "2026/27",
      rosterEntries: [
        { name: "Dalla G-League", cost: 4, contract: "28", role: "G", state: "active", slot: "g_league", teamCode: "AAA", playoffTeamOptionPromotionSeason: "2027/28" },
        { name: "Dal roster", cost: 4, contract: "28", role: "A", state: "active", slot: "regular", teamCode: "AAA", endedPreviousSeasonInGLeague: true, twoWayPromotionLocked: true },
      ],
      qualifyingOfferRights: [],
      playerList: [
        { name: "Dalla G-League", role: "G", realTeam: "", rookie: false, under23: false },
        { name: "Dal roster", role: "A", realTeam: "", rookie: false, under23: false },
      ],
    });
    expect(historyResult.rosterEntries).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "Dalla G-League", endedPreviousSeasonInGLeague: true, playoffTeamOptionPromotionSeason: "2027/28" }),
      expect.objectContaining({ name: "Dal roster", endedPreviousSeasonInGLeague: false, twoWayPromotionLocked: false }),
    ]));
  });
});
