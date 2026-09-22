import { describe, expect, it } from "vitest";
import type { RosterEntry } from "./league-types";
import {
  applyTeamOptionFinalYearDoubling,
  applyStandardContractCut,
  destinationAfterTeamOptionExercise,
  exercisePlayoffTeamOption,
  isUnresolvedTeamOption,
  markExercisedTeamOption,
  qualifyingOfferForDeclinedTeamOption,
  teamOptionCutAdjustment,
} from "./team-option-contract";

const option: RosterEntry = {
  name: "T.O.",
  cost: 5,
  contract: "28 (2X)",
  state: "active",
  slot: "regular",
  teamCode: "AAA",
};

describe("garanzia dell'ultimo anno della team option", () => {
  it("considera da risolvere solo le T.O. dell'anno precedente, fino alla relativa scadenza", () => {
    const unresolved = { ...option, contract: "T.O." };
    expect(isUnresolvedTeamOption(unresolved, "offseason_start")).toBe(true);
    expect(isUnresolvedTeamOption(unresolved, "team_option_deadline")).toBe(false);
    expect(isUnresolvedTeamOption(unresolved, "auction_start")).toBe(false);
  });

  it("conserva costo base e ultimo anno quando la T.O. viene esercitata", () => {
    expect(markExercisedTeamOption(option, 2028)).toMatchObject({ teamOptionBaseCost: 5, teamOptionFinalYear: 2028 });
  });

  it("raddoppia il costo conservando l'origine ex T.O.", () => {
    expect(applyTeamOptionFinalYearDoubling(option, 2028)).toMatchObject({
      cost: 10,
      contract: "28 (Q)",
      teamOptionBaseCost: 5,
      teamOptionFinalYear: 2028,
    });
  });

  it("annulla il raddoppio se il taglio precede l'asta dell'ultimo anno", () => {
    const doubled = applyTeamOptionFinalYearDoubling(option, 2028);
    expect(teamOptionCutAdjustment(doubled, 2028, "team_option_deadline")).toMatchObject({
      adjusted: true,
      entry: { cost: 5, contract: "28" },
    });
  });

  it("non annulla il raddoppio dall'inizio dell'asta dell'ultimo anno", () => {
    const doubled = applyTeamOptionFinalYearDoubling(option, 2028);
    expect(teamOptionCutAdjustment(doubled, 2028, "auction_start").adjusted).toBe(false);
  });

  it("non annulla il raddoppio dopo la conclusione dell'asta dell'ultimo anno", () => {
    const doubled = applyTeamOptionFinalYearDoubling(option, 2028);
    expect(teamOptionCutAdjustment(doubled, 2028, "auction_completed").adjusted).toBe(false);
  });

  it("applica la garanzia ridotta anche a un taglio contestuale", () => {
    const doubled = applyTeamOptionFinalYearDoubling(option, 2028);
    expect(applyStandardContractCut(doubled, 2028, "team_option_deadline")).toMatchObject({
      state: "cut",
      slot: "regular",
      cost: 5,
      contract: "28",
    });
  });

  it("lo annulla anche dopo un'asta precedente, se quella antecedente all'ultimo anno deve ancora arrivare", () => {
    expect(teamOptionCutAdjustment(option, 2027, "auction_completed")).toMatchObject({
      adjusted: true,
      entry: { cost: 5, contract: "28" },
    });
  });
});

describe("risoluzione della team option", () => {
  it("assegna al proprietario la Q.O. al prezzo della T.O. non esercitata", () => {
    const unresolvedOption: RosterEntry = { ...option, contract: "T.O." };
    expect(qualifyingOfferForDeclinedTeamOption(unresolvedOption)).toEqual({
      playerName: "T.O.",
      qualifyingAmount: 5,
      teamCode: "AAA",
    });
  });
});

describe("destinazione immediata dopo l'esercizio della T.O.", () => {
  it("richiede la scelta Two-way/roster per la G-League e promuove i Two-way", () => {
    expect(destinationAfterTeamOptionExercise("g_league", "two_way")).toBe("two_way");
    expect(destinationAfterTeamOptionExercise("g_league", "regular")).toBe("regular");
    expect(destinationAfterTeamOptionExercise("two_way", "two_way")).toBe("regular");
    expect(destinationAfterTeamOptionExercise("regular", "two_way")).toBe("regular");
  });

  it("l'esercizio playoff conserva lo slot e prepara contratto e promozione per l'annata successiva", () => {
    expect(exercisePlayoffTeamOption({ ...option, contract: "T.O.", slot: "g_league" }, "2026/27")).toMatchObject({
      slot: "g_league",
      contract: "29 (2X)",
      teamOptionBaseCost: 5,
      teamOptionFinalYear: 2029,
      playoffTeamOptionPromotionSeason: "2027/28",
    });
  });
});
