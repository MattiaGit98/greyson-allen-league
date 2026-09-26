import { describe, expect, it } from "vitest";
import { emptyLeagueState, type EditableLeagueState } from "./league-state";
import { applyRosterCorrections, normalizeRosterCorrectionContract } from "./roster-corrections";

function state(): EditableLeagueState {
  return {
    ...emptyLeagueState(),
    teams: [{
      code: "AAA", name: "Alpha", owner: "A", credits: 0, cost: 0, players: 1, cutPlayers: 1,
      qualifyingOffers: 0, draftAssets: 0, nextSeasonCredits: 0, followingSeasonCredits: 0, slug: "alpha",
    }],
    rosterEntries: [
      { name: "Attivo", role: "G", cost: 20, contract: "27 + R.E.", state: "active", slot: "regular", teamCode: "AAA" },
      { name: "Tagliato", role: "A", cost: 8, contract: "27", state: "cut", slot: "regular", teamCode: "AAA" },
    ],
    playerList: [
      { name: "Attivo", role: "G", realTeam: "ROM", rookie: false, under23: false },
      { name: "Tagliato", role: "A", realTeam: "MIL", rookie: false, under23: false },
      { name: "Libero", role: "C", realTeam: "NAP", rookie: false, under23: false },
    ],
  };
}

describe("rettifiche roster", () => {
  it("riconosce soltanto le notazioni contrattuali previste", () => {
    expect(normalizeRosterCorrectionContract(" 28 (q) ")).toBe("28 (Q)");
    expect(normalizeRosterCorrectionContract("T.O.")).toBe("T.O.");
    expect(normalizeRosterCorrectionContract("27 + r.e.")).toBe("27 + R.E.");
    expect(normalizeRosterCorrectionContract("da assegnare")).toBe("PENDING");
    expect(normalizeRosterCorrectionContract("2028")).toBeNull();
    expect(normalizeRosterCorrectionContract("28 + Q.O.")).toBeNull();
    expect(normalizeRosterCorrectionContract("28 (EXT)")).toBeNull();
  });

  it("modifica costo e scadenza e chiude il percorso della rookie extension", () => {
    const result = applyRosterCorrections({
      state: state(), teamCode: "AAA", seasonName: "2026/27",
      corrections: [{ sourceIndex: 0, playerName: "Attivo", cost: 25, contract: "29 (E)", remove: false }],
    });
    expect(result.state.rosterEntries[0]).toMatchObject({ cost: 25, contract: "29 (E)", originalContractYears: 3 });
    expect(result.state.rosterEntries[0].teamOptionBaseCost).toBeUndefined();
    expect(result.state.rosterEntries[0].teamOptionFinalYear).toBeUndefined();
  });

  it("rimuove anche un contratto tagliato", () => {
    const result = applyRosterCorrections({
      state: state(), teamCode: "AAA", seasonName: "2026/27",
      corrections: [{ sourceIndex: 1, playerName: "Tagliato", cost: 8, contract: "27", remove: true }],
    });
    expect(result.state.rosterEntries.map((entry) => entry.name)).toEqual(["Attivo"]);
    expect(result.changes[0].after).toBeNull();
  });

  it("conserva lo storico della team option quando si rettifica il costo del suo anno finale", () => {
    const current = state();
    current.rosterEntries[0] = {
      ...current.rosterEntries[0], cost: 40, contract: "27 (Q)", teamOptionBaseCost: 20, teamOptionFinalYear: 2027,
    };
    const result = applyRosterCorrections({
      state: current, teamCode: "AAA", seasonName: "2026/27",
      corrections: [{ sourceIndex: 0, playerName: "Attivo", cost: 42, contract: "27 (Q)", remove: false }],
    });
    expect(result.state.rosterEntries[0]).toMatchObject({
      cost: 42, contract: "27 (Q)", teamOptionBaseCost: 20, teamOptionFinalYear: 2027,
    });
  });

  it("blocca scadenze non riconosciute", () => {
    expect(() => applyRosterCorrections({
      state: state(), teamCode: "AAA", seasonName: "2026/27",
      corrections: [{ sourceIndex: 0, playerName: "Attivo", cost: 20, contract: "2029", remove: false }],
    })).toThrow("scadenza non riconosciuta");
  });

  it("non permette di trasformare un contratto pubblicato in PENDING", () => {
    expect(() => applyRosterCorrections({
      state: state(), teamCode: "AAA", seasonName: "2026/27",
      corrections: [{ sourceIndex: 0, playerName: "Attivo", cost: 20, contract: "PENDING", remove: false }],
    })).toThrow("PENDING può restare soltanto");
  });

  it("può aggiungere come attivo un giocatore già tagliato lasciando intatto il vecchio addebito", () => {
    const result = applyRosterCorrections({
      state: state(), teamCode: "AAA", seasonName: "2026/27", corrections: [],
      addition: { playerName: "Tagliato", cost: 3, contract: "27", slot: "g_league" },
    });
    expect(result.state.rosterEntries.filter((entry) => entry.name === "Tagliato")).toEqual([
      expect.objectContaining({ state: "cut", cost: 8 }),
      expect.objectContaining({ state: "active", slot: "g_league", cost: 3 }),
    ]);
  });

  it("esclude dalle aggiunte chi è attivo o ha una qualifying offer", () => {
    expect(() => applyRosterCorrections({
      state: state(), teamCode: "AAA", seasonName: "2026/27", corrections: [],
      addition: { playerName: "Attivo", cost: 3, contract: "27", slot: "regular" },
    })).toThrow("già attivo");
    const withQualifyingOffer = state();
    withQualifyingOffer.qualifyingOfferRights = [{ playerName: "Libero", qualifyingAmount: 4, teamCode: "AAA" }];
    expect(() => applyRosterCorrections({
      state: withQualifyingOffer, teamCode: "AAA", seasonName: "2026/27", corrections: [],
      addition: { playerName: "Libero", cost: 3, contract: "27", slot: "regular" },
    })).toThrow("qualifying offer");
  });
});
