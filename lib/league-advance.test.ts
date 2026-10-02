import { describe, expect, it } from "vitest";
import { calculateLeagueAdvance } from "./league-advance";
import type { RosterEntry } from "./league-types";

const rosterEntries: RosterEntry[] = [
  { name: "R.E. da decidere", cost: 5, contract: "27 + R.E.", role: "G", state: "active", slot: "two_way", teamCode: "AAA" },
  { name: "Scadenza Q.O.", cost: 7, contract: "27 (Q)", role: "A", state: "active", slot: "regular", teamCode: "AAA" },
  { name: "Scadenza semplice", cost: 3, contract: "27", role: "C", state: "active", slot: "regular", teamCode: "BBB" },
  { name: "Tagliato", cost: 4, contract: "27", role: "G", state: "cut", slot: "regular", teamCode: "BBB" },
  { name: "Contratto lungo", cost: 20, contract: "29", role: "A", state: "active", slot: "regular", teamCode: "BBB" },
];

function playerList(entries = rosterEntries) {
  return entries.map((entry) => ({
    name: entry.name,
    role: entry.role ?? "G" as const,
    realTeam: "NBA",
    rookie: false,
    under23: false,
  }));
}

describe("avanzamento della lega", () => {
  const result = calculateLeagueAdvance({
    seasonName: "2026/27",
    rosterEntries,
    qualifyingOfferRights: [{ playerName: "Vecchia Q.O.", qualifyingAmount: 2, teamCode: "AAA" }],
    playerList: playerList(),
  });

  it("avanza l'annata, chiude i contratti scaduti e conserva la R.E. per la decisione", () => {
    expect(result.nextSeasonName).toBe("2027/28");
    expect(result.expiredContracts).toBe(3);
    expect(result.rosterEntries.map((entry) => entry.name)).toEqual(["R.E. da decidere", "Contratto lungo"]);
    expect(result.pendingRookieExtensions).toBe(1);
    expect(result.rosterEntries[0]).toMatchObject({ slot: "two_way", cost: 5, contract: "27 + R.E." });
  });

  it("genera soltanto le Q.O. già previste dai contratti in scadenza", () => {
    expect(result.qualifyingOfferRights).toEqual([
      { playerName: "Scadenza Q.O.", qualifyingAmount: 7, teamCode: "AAA" },
    ]);
  });

  it("mantiene le Q.O. degli annuali da 1 e dei free agent pre-deadline", () => {
    const entries: RosterEntry[] = [
      { name: "Asta annuale da 1", cost: 1, contract: "27 (Q)", role: "G", state: "active", slot: "regular", teamCode: "AAA" },
      { name: "Free agent pre-deadline", cost: 27, contract: "27 (Q)", role: "A", state: "active", slot: "regular", teamCode: "BBB" },
      { name: "Free agent post-deadline", cost: 27, contract: "27", role: "C", state: "active", slot: "regular", teamCode: "CCC" },
    ];
    const advanced = calculateLeagueAdvance({ seasonName: "2026/27", rosterEntries: entries, qualifyingOfferRights: [], playerList: playerList(entries) });
    expect(advanced.qualifyingOfferRights).toEqual([
      { playerName: "Asta annuale da 1", qualifyingAmount: 1, teamCode: "AAA" },
      { playerName: "Free agent pre-deadline", qualifyingAmount: 27, teamCode: "BBB" },
    ]);
  });

  it("non attribuisce automaticamente la Q.O. alla R.E. ancora da decidere", () => {
    expect(result.qualifyingOfferRights.some((right) => right.playerName === "R.E. da decidere")).toBe(false);
  });

  it("porta l'annuale con T.O. alla decisione estiva senza generare una Q.O.", () => {
    const entries: RosterEntry[] = [
      { name: "Opzione futura", cost: 4, contract: "27 + T.O.", role: "G", state: "active", slot: "regular", teamCode: "AAA" },
    ];
    const advanced = calculateLeagueAdvance({ seasonName: "2026/27", rosterEntries: entries, qualifyingOfferRights: [], playerList: playerList(entries) });
    expect(advanced.rosterEntries).toEqual([expect.objectContaining({ name: "Opzione futura", contract: "T.O." })]);
    expect(advanced.qualifyingOfferRights).toEqual([]);
  });

  it("chiude a fine stagione T.O. e R.E. già tagliate", () => {
    const entries: RosterEntry[] = [
      { name: "T.O. tagliata", cost: 4, contract: "27 + T.O.", role: "G", state: "cut", slot: "regular", teamCode: "AAA" },
      { name: "R.E. tagliata", cost: 4, contract: "27 + R.E.", role: "A", state: "cut", slot: "regular", teamCode: "AAA" },
    ];
    const advanced = calculateLeagueAdvance({ seasonName: "2026/27", rosterEntries: entries, qualifyingOfferRights: [], playerList: playerList(entries) });
    expect(advanced.rosterEntries).toEqual([]);
    expect(advanced.generatedQualifyingOffers).toBe(0);
  });

  it("conserva i rilasci gratuiti a costo zero fino alla scadenza originaria", () => {
    const entries: RosterEntry[] = [
      { name: "Rilascio ancora valido", cost: 0, contract: "28", role: "G", state: "cut", slot: "regular", teamCode: "AAA" },
      { name: "Rilascio in scadenza", cost: 0, contract: "27", role: "A", state: "cut", slot: "regular", teamCode: "AAA" },
    ];
    const advanced = calculateLeagueAdvance({ seasonName: "2026/27", rosterEntries: entries, qualifyingOfferRights: [], playerList: playerList(entries) });

    expect(advanced.rosterEntries).toEqual([
      expect.objectContaining({ name: "Rilascio ancora valido", cost: 0, contract: "28", state: "cut" }),
    ]);
  });

  it("conserva il listone provvisorio e svuota tutte le squadre NBA", () => {
    expect(result.playerList.map((player) => player.name)).toEqual(rosterEntries.map((entry) => entry.name));
    expect(result.playerList.every((player) => player.realTeam === "")).toBe(true);
  });

  it("aggiunge al listone un giocatore sotto contratto che mancava", () => {
    const advanced = calculateLeagueAdvance({
      seasonName: "2026/27",
      rosterEntries: [{ name: "Nuovo", cost: 4, contract: "28", role: "G", state: "active", slot: "regular", teamCode: "AAA" }],
      qualifyingOfferRights: [],
      playerList: [{ name: "Presente", role: "A", realTeam: "BOS", rookie: false, under23: false }],
    });
    expect(advanced.playerList.map((player) => player.name)).toEqual(["Presente", "Nuovo"]);
  });

  it("reintegra negli slot roster le DPE ancora sotto contratto", () => {
    const entries: RosterEntry[] = [
      { name: "DPE lunga", cost: 4, contract: "28", role: "G", state: "active", slot: "dpe", teamCode: "AAA" },
      { name: "DPE in scadenza", cost: 4, contract: "27", role: "A", state: "active", slot: "dpe", teamCode: "AAA" },
    ];
    const advanced = calculateLeagueAdvance({ seasonName: "2026/27", rosterEntries: entries, qualifyingOfferRights: [], playerList: playerList(entries) });
    expect(advanced.rosterEntries).toEqual([
      expect.objectContaining({ name: "DPE lunga", slot: "regular", dpeAppliedSeasons: ["2026/27"] }),
    ]);
    expect(advanced.reintegratedDpePlayers).toEqual([{ playerName: "DPE lunga", teamCode: "AAA" }]);
  });

  it("non promuove automaticamente i Two-way in attesa della R.E.", () => {
    const entries: RosterEntry[] = [
      { name: "Secondo anno", cost: 4, contract: "27 + R.E.", contractStartSeason: "2025/26", role: "G", state: "active", slot: "two_way", teamCode: "AAA" },
    ];
    const advanced = calculateLeagueAdvance({ seasonName: "2026/27", rosterEntries: entries, qualifyingOfferRights: [], playerList: playerList(entries) });
    expect(advanced.rosterEntries[0]).toMatchObject({ slot: "two_way", contract: "27 + R.E." });
  });

  it("promuove nel Roster la T.O. esercitata per utilizzo nei playoff", () => {
    const entries: RosterEntry[] = [
      { name: "T.O. playoff", cost: 4, contract: "28 + R.E.", role: "G", state: "active", slot: "g_league", teamCode: "AAA", playoffTeamOptionPromotionSeason: "2027/28" },
    ];
    const advanced = calculateLeagueAdvance({ seasonName: "2026/27", rosterEntries: entries, qualifyingOfferRights: [], playerList: playerList(entries) });
    expect(advanced.rosterEntries[0]).toMatchObject({ slot: "regular", twoWayPromotionLocked: true });
    expect(advanced.promotedPlayoffTeamOptionPlayers).toEqual([{ playerName: "T.O. playoff", teamCode: "AAA" }]);
  });

  it("esegue a Fine stagione il taglio programmato di un giocatore nel roster", () => {
    const entries: RosterEntry[] = [
      ...Array.from({ length: 15 }, (_, index) => ({
        name: `Roster ${index}`, cost: 4, contract: "28", role: "G" as const,
        state: "active" as const, slot: "regular" as const, teamCode: "AAA",
        ...(index === 0 ? { scheduledSeasonEndCut: "2026/27" } : {}),
      })),
      { name: "DPE lunga", cost: 4, contract: "28", role: "A", state: "active", slot: "dpe", teamCode: "AAA" },
    ];
    const advanced = calculateLeagueAdvance({ seasonName: "2026/27", rosterEntries: entries, qualifyingOfferRights: [], playerList: playerList(entries) });
    expect(advanced.scheduledCutPlayers).toEqual([{ playerName: "Roster 0", teamCode: "AAA" }]);
    expect(advanced.rosterEntries.find((entry) => entry.name === "Roster 0")).toMatchObject({ state: "cut", slot: "regular" });
    expect(advanced.rosterEntries.find((entry) => entry.name === "DPE lunga")).toMatchObject({ state: "active", slot: "regular" });
    expect(advanced.remainingOverflowByTeam).toEqual({});
    expect(advanced.rosterEntries.every((entry) => entry.scheduledSeasonEndCut === undefined)).toBe(true);
  });

  it("può programmare il taglio della stessa DPE che altrimenti verrebbe reintegrata", () => {
    const entries: RosterEntry[] = [
      ...Array.from({ length: 15 }, (_, index) => ({ name: `Roster ${index}`, cost: 4, contract: "28", role: "G" as const, state: "active" as const, slot: "regular" as const, teamCode: "AAA" })),
      { name: "DPE da tagliare", cost: 4, contract: "28", role: "A", state: "active", slot: "dpe", teamCode: "AAA", scheduledSeasonEndCut: "2026/27" },
    ];
    const advanced = calculateLeagueAdvance({ seasonName: "2026/27", rosterEntries: entries, qualifyingOfferRights: [], playerList: playerList(entries) });
    expect(advanced.scheduledCutPlayers).toEqual([{ playerName: "DPE da tagliare", teamCode: "AAA" }]);
    expect(advanced.reintegratedDpePlayers).toEqual([]);
    expect(advanced.rosterEntries.find((entry) => entry.name === "DPE da tagliare")).toMatchObject({ state: "cut", slot: "regular" });
  });

  it("include tra i tagli programmabili la T.O. G-League destinata alla promozione playoff", () => {
    const entries: RosterEntry[] = [
      ...Array.from({ length: 15 }, (_, index) => ({ name: `Roster ${index}`, cost: 4, contract: "28", role: "G" as const, state: "active" as const, slot: "regular" as const, teamCode: "AAA" })),
      { name: "T.O. playoff", cost: 4, contract: "28 + R.E.", role: "A", state: "active", slot: "g_league", teamCode: "AAA", playoffTeamOptionPromotionSeason: "2027/28", scheduledSeasonEndCut: "2026/27" },
    ];
    const advanced = calculateLeagueAdvance({ seasonName: "2026/27", rosterEntries: entries, qualifyingOfferRights: [], playerList: playerList(entries) });
    expect(advanced.scheduledCutPlayers).toEqual([{ playerName: "T.O. playoff", teamCode: "AAA" }]);
    expect(advanced.promotedPlayoffTeamOptionPlayers).toEqual([]);
    expect(advanced.rosterEntries.find((entry) => entry.name === "T.O. playoff")).toMatchObject({ state: "cut", slot: "regular" });
  });

  it("segnala programmazioni inutili o eccedenti invece di eseguirle silenziosamente", () => {
    const entries: RosterEntry[] = [
      ...Array.from({ length: 15 }, (_, index) => ({
        name: `Roster ${index}`, cost: 4, contract: index === 0 ? "27" : "28", role: "G" as const,
        state: "active" as const, slot: "regular" as const, teamCode: "AAA",
        ...(index < 2 ? { scheduledSeasonEndCut: "2026/27" } : {}),
      })),
      { name: "DPE lunga", cost: 4, contract: "28", role: "A", state: "active", slot: "dpe", teamCode: "AAA" },
    ];
    const advanced = calculateLeagueAdvance({ seasonName: "2026/27", rosterEntries: entries, qualifyingOfferRights: [], playerList: playerList(entries) });
    expect(advanced.invalidScheduledCutPlayers).toEqual([{ playerName: "Roster 0", teamCode: "AAA" }]);
    expect(advanced.excessiveScheduledCutsByTeam).toEqual([{ teamCode: "AAA", excess: 1 }]);
    expect(advanced.remainingOverflowByTeam).toEqual({});

    const excessive = calculateLeagueAdvance({
      seasonName: "2026/27",
      rosterEntries: entries.map((entry) => entry.name === "Roster 0" ? { ...entry, contract: "28" } : entry),
      qualifyingOfferRights: [],
      playerList: playerList(entries),
    });
    expect(excessive.excessiveScheduledCutsByTeam).toEqual([{ teamCode: "AAA", excess: 1 }]);
  });
});
