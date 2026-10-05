import { describe, expect, it } from "vitest";
import type { RosterEntry } from "./league-types";
import {
  applyRookieExtension,
  applyStandardContractCut,
  annualTeamOptionContract,
  annualTeamOptionExpiryYear,
  destinationAfterTeamOptionExercise,
  exerciseOrdinaryTeamOption,
  exercisePlayoffTeamOption,
  isRookieExtensionDecisionDue,
  isUnresolvedTeamOption,
  qualifyingOfferForDeclinedRookieExtension,
} from "./team-option-contract";

const option: RosterEntry = {
  name: "Rookie",
  cost: 5,
  contract: "T.O.",
  role: "G",
  state: "active",
  slot: "regular",
  teamCode: "AAA",
};

describe("contratti da rookie", () => {
  it("considera da risolvere le T.O. e soltanto le R.E. giunte alla propria offseason", () => {
    expect(isUnresolvedTeamOption(option, "offseason_start", "2026/27")).toBe(true);
    expect(isUnresolvedTeamOption(option, "team_option_deadline", "2026/27")).toBe(false);
    expect(isRookieExtensionDecisionDue({ contract: "26 + R.E." }, "2026/27")).toBe(true);
    expect(isRookieExtensionDecisionDue({ contract: "27 + R.E." }, "2026/27")).toBe(false);
    expect(isUnresolvedTeamOption({ contract: "26 + R.E." }, "offseason_start", "2026/27")).toBe(true);
  });

  it("distingue l'annuale con T.O. dalla T.O. pura da risolvere", () => {
    expect(annualTeamOptionContract(2027)).toBe("27 + T.O.");
    expect(annualTeamOptionExpiryYear("27 + T.O.", 2027)).toBe(2027);
    expect(isUnresolvedTeamOption({ contract: "27 + T.O." }, "offseason_start", "2026/27")).toBe(false);
  });

  it("esercita la T.O. per il secondo anno allo stesso prezzo e prepara la R.E.", () => {
    expect(exerciseOrdinaryTeamOption(option, "2026/27")).toMatchObject({
      cost: 5,
      contract: "27 + R.E.",
      slot: "regular",
    });
  });

  it("applica la R.E. per il terzo anno, raddoppia e forza il Roster", () => {
    expect(applyRookieExtension({ ...option, contract: "26 + R.E.", slot: "two_way" }, "2026/27")).toMatchObject({
      cost: 10,
      contract: "27",
      slot: "regular",
    });
  });

  it("crea la Q.O. al prezzo precedente solo quando la R.E. non viene applicata", () => {
    expect(qualifyingOfferForDeclinedRookieExtension(option)).toEqual({
      playerName: "Rookie",
      qualifyingAmount: 5,
      teamCode: "AAA",
      role: "G",
    });
  });

  it("non applica più rettifiche speciali al costo quando il giocatore viene tagliato", () => {
    const extension = { ...option, contract: "27 + R.E.", scheduledSeasonEndCut: "2026/27" };
    const cut = applyStandardContractCut(extension, 2027, "offseason_start");
    expect(cut).toMatchObject({
      state: "cut",
      slot: "regular",
      cost: 5,
      contract: "27",
    });
    expect(cut.scheduledSeasonEndCut).toBeUndefined();
  });

  it("rimuove tutte le possibilità future senza accorciare la durata garantita", () => {
    expect(applyStandardContractCut({ ...option, contract: "27 + T.O." }, 2027, "auction_start").contract).toBe("27");
    expect(applyStandardContractCut({ ...option, contract: "28 (E)" }, 2027, "auction_start").contract).toBe("28");
    expect(applyStandardContractCut({ ...option, contract: "29 (Q)" }, 2027, "auction_start").contract).toBe("29");
    expect(applyStandardContractCut({ ...option, contract: "29" }, 2027, "auction_start").contract).toBe("29");
    expect(applyStandardContractCut({ ...option, contract: "PENDING" }, 2027, "auction_start").contract).toBe("27");
  });
});

describe("destinazioni dei contratti da rookie", () => {
  it("promuove la T.O. dalla G-League di uno slot scelto e dal Two-way al Roster", () => {
    expect(destinationAfterTeamOptionExercise("g_league", "two_way")).toBe("two_way");
    expect(destinationAfterTeamOptionExercise("g_league", "regular")).toBe("regular");
    expect(destinationAfterTeamOptionExercise("two_way", "two_way")).toBe("regular");
    expect(destinationAfterTeamOptionExercise("regular", "two_way")).toBe("regular");
  });

  it("l'esercizio playoff prepara il secondo anno con R.E. e la promozione della prossima offseason", () => {
    expect(exercisePlayoffTeamOption({ ...option, contract: "27 + T.O.", slot: "g_league" }, "2026/27")).toMatchObject({
      slot: "g_league",
      contract: "28 + R.E.",
      playoffTeamOptionPromotionSeason: "2027/28",
    });
  });
});
