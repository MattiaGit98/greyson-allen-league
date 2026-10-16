import { describe, expect, it } from "vitest";
import { emptyLeagueState, type EditableLeagueState } from "./league-state";
import { applyRosterCorrections, normalizeRosterCorrectionContract, rosterCorrectionContractOptions } from "./roster-corrections";

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
    expect(normalizeRosterCorrectionContract("27 + t.o.")).toBe("27 + T.O.");
    expect(normalizeRosterCorrectionContract("da assegnare")).toBe("PENDING");
    expect(normalizeRosterCorrectionContract("2028")).toBeNull();
    expect(normalizeRosterCorrectionContract("28 + Q.O.")).toBeNull();
    expect(normalizeRosterCorrectionContract("28 (EXT)")).toBeNull();
  });

  it("propone T.O., R.E. corrente e quattro contratti per ciascuno dei tre anni", () => {
    expect(rosterCorrectionContractOptions("2026/27", "offseason_start")).toEqual([
      { value: "T.O.", label: "T.O." },
      { value: "26 + R.E.", label: "R.E." },
      { value: "27", label: "27" },
      { value: "27 + T.O.", label: "27 + T.O." },
      { value: "27 + R.E.", label: "27 + R.E." },
      { value: "27 (Q)", label: "27 → Q.O." },
      { value: "27 (E)", label: "27 EXT" },
      { value: "28", label: "28" },
      { value: "28 + T.O.", label: "28 + T.O." },
      { value: "28 + R.E.", label: "28 + R.E." },
      { value: "28 (Q)", label: "28 → Q.O." },
      { value: "28 (E)", label: "28 EXT" },
      { value: "29", label: "29" },
      { value: "29 + T.O.", label: "29 + T.O." },
      { value: "29 + R.E.", label: "29 + R.E." },
      { value: "29 (Q)", label: "29 → Q.O." },
      { value: "29 (E)", label: "29 EXT" },
    ]);
  });

  it("propone R.E. pura soltanto prima della scadenza T.O. e R.E.", () => {
    expect(rosterCorrectionContractOptions("2026/27", "offseason_start").map((option) => option.value))
      .toContain("26 + R.E.");
    expect(rosterCorrectionContractOptions("2026/27", "team_option_deadline").map((option) => option.value))
      .not.toContain("26 + R.E.");
    expect(rosterCorrectionContractOptions("2026/27", "team_option_deadline").map((option) => option.value))
      .toContain("27 + R.E.");
  });

  it("propone la T.O. pura soltanto nella finestra delle decisioni", () => {
    expect(rosterCorrectionContractOptions("2026/27", "offseason_start").map((option) => option.value)).toContain("T.O.");
    expect(rosterCorrectionContractOptions("2026/27", "team_option_deadline").map((option) => option.value)).not.toContain("T.O.");
    expect(rosterCorrectionContractOptions("2026/27", "team_option_deadline").map((option) => option.value)).toContain("27 + T.O.");
  });

  it("dall'Inizio asta non propone più l'estensione dell'anno corrente", () => {
    const options = rosterCorrectionContractOptions("2026/27", "auction_start").map((option) => option.value);
    expect(options).not.toContain("27 (E)");
    expect(options).toContain("28 (E)");
    expect(options).toContain("29 (E)");
  });

  it("dall'Inizio asta impedisce di assegnare l'estensione dell'anno corrente", () => {
    expect(() => applyRosterCorrections({
      state: state(), teamCode: "AAA", seasonName: "2026/27", leagueMoment: "auction_start",
      corrections: [{ sourceIndex: 0, playerName: "Attivo", cost: 20, contract: "27 (E)", remove: false }],
    })).toThrow("scadenze previste per l'annata attiva");
  });

  it("impedisce di assegnare R.E. pura dopo la relativa scadenza", () => {
    expect(() => applyRosterCorrections({
      state: state(), teamCode: "AAA", seasonName: "2026/27", leagueMoment: "team_option_deadline",
      corrections: [{ sourceIndex: 0, playerName: "Attivo", cost: 20, contract: "26 + R.E.", remove: false }],
    })).toThrow("scadenze previste per l'annata attiva");
    expect(() => applyRosterCorrections({
      state: state(), teamCode: "AAA", seasonName: "2026/27", leagueMoment: "team_option_deadline", corrections: [],
      addition: { playerName: "Libero", cost: 3, contract: "26 + R.E.", slot: "regular" },
    })).toThrow("scadenze previste per l'annata attiva");
  });

  it("consente dopo la scadenza di rettificare il costo senza riassegnare una R.E. pura già presente", () => {
    const current = state();
    current.rosterEntries[0] = { ...current.rosterEntries[0], contract: "26 + R.E." };
    const result = applyRosterCorrections({
      state: current, teamCode: "AAA", seasonName: "2026/27", leagueMoment: "team_option_deadline",
      corrections: [{ sourceIndex: 0, playerName: "Attivo", cost: 21, contract: "26 + R.E.", remove: false }],
    });
    expect(result.state.rosterEntries[0]).toMatchObject({ cost: 21, contract: "26 + R.E." });
  });

  it("modifica costo e scadenza e chiude il percorso della rookie extension", () => {
    const result = applyRosterCorrections({
      state: state(), teamCode: "AAA", seasonName: "2026/27", leagueMoment: "offseason_start",
      corrections: [{ sourceIndex: 0, playerName: "Attivo", cost: 25, contract: "29 (E)", remove: false }],
    });
    expect(result.state.rosterEntries[0]).toMatchObject({ cost: 25, contract: "29 (E)", originalContractYears: 3 });
    expect(result.state.rosterEntries[0].teamOptionBaseCost).toBeUndefined();
    expect(result.state.rosterEntries[0].teamOptionFinalYear).toBeUndefined();
  });

  it("rimuove anche un contratto tagliato", () => {
    const result = applyRosterCorrections({
      state: state(), teamCode: "AAA", seasonName: "2026/27", leagueMoment: "offseason_start",
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
      state: current, teamCode: "AAA", seasonName: "2026/27", leagueMoment: "offseason_start",
      corrections: [{ sourceIndex: 0, playerName: "Attivo", cost: 42, contract: "27 (Q)", remove: false }],
    });
    expect(result.state.rosterEntries[0]).toMatchObject({
      cost: 42, contract: "27 (Q)", teamOptionBaseCost: 20, teamOptionFinalYear: 2027,
    });
  });

  it("blocca scadenze non riconosciute", () => {
    expect(() => applyRosterCorrections({
      state: state(), teamCode: "AAA", seasonName: "2026/27", leagueMoment: "offseason_start",
      corrections: [{ sourceIndex: 0, playerName: "Attivo", cost: 20, contract: "2029", remove: false }],
    })).toThrow("scadenza non riconosciuta");
  });

  it("blocca una nuova scadenza valida come formato ma fuori dai tre anni disponibili", () => {
    expect(() => applyRosterCorrections({
      state: state(), teamCode: "AAA", seasonName: "2026/27", leagueMoment: "offseason_start",
      corrections: [{ sourceIndex: 0, playerName: "Attivo", cost: 20, contract: "30", remove: false }],
    })).toThrow("scadenze previste per l'annata attiva");
  });

  it("non permette di trasformare un contratto pubblicato in PENDING", () => {
    expect(() => applyRosterCorrections({
      state: state(), teamCode: "AAA", seasonName: "2026/27", leagueMoment: "offseason_start",
      corrections: [{ sourceIndex: 0, playerName: "Attivo", cost: 20, contract: "PENDING", remove: false }],
    })).toThrow("PENDING può restare soltanto");
  });

  it("non permette di modificare dalle rettifiche un contratto ancora da assegnare", () => {
    const current = state();
    current.rosterEntries[0] = { ...current.rosterEntries[0], contract: "PENDING" };
    expect(() => applyRosterCorrections({
      state: current, teamCode: "AAA", seasonName: "2026/27", leagueMoment: "offseason_start",
      corrections: [{ sourceIndex: 0, playerName: "Attivo", cost: 20, contract: "27", remove: false }],
    })).toThrow("contratto da assegnare non può essere modificato");
  });

  it("può aggiungere come attivo un giocatore già tagliato lasciando intatto il vecchio addebito", () => {
    const result = applyRosterCorrections({
      state: state(), teamCode: "AAA", seasonName: "2026/27", leagueMoment: "offseason_start", corrections: [],
      addition: { playerName: "Tagliato", cost: 3, contract: "27", slot: "g_league" },
    });
    expect(result.state.rosterEntries.filter((entry) => entry.name === "Tagliato")).toEqual([
      expect.objectContaining({ state: "cut", cost: 8 }),
      expect.objectContaining({ state: "active", slot: "g_league", cost: 3 }),
    ]);
  });

  it("esclude dalle aggiunte chi è attivo o ha una qualifying offer", () => {
    expect(() => applyRosterCorrections({
      state: state(), teamCode: "AAA", seasonName: "2026/27", leagueMoment: "offseason_start", corrections: [],
      addition: { playerName: "Attivo", cost: 3, contract: "27", slot: "regular" },
    })).toThrow("già attivo");
    const withQualifyingOffer = state();
    withQualifyingOffer.qualifyingOfferRights = [{ playerName: "Libero", qualifyingAmount: 4, teamCode: "AAA" }];
    expect(() => applyRosterCorrections({
      state: withQualifyingOffer, teamCode: "AAA", seasonName: "2026/27", leagueMoment: "offseason_start", corrections: [],
      addition: { playerName: "Libero", cost: 3, contract: "27", slot: "regular" },
    })).toThrow("qualifying offer");
  });
});
