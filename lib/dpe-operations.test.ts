import { describe, expect, it } from "vitest";
import type { RosterEntry } from "./league-types";
import { applyDpeActivationWithOptionalCut } from "./dpe-operations";
import { entriesForDpeAdjustedCap } from "./dpe-rules";
import { calculateCapSpace } from "./season-time";

const target: RosterEntry = {
  name: "Nuovo infortunato",
  cost: 20,
  contract: "28 (E)",
  role: "G",
  state: "active",
  slot: "regular",
  teamCode: "AAA",
};
const incumbent: RosterEntry = {
  name: "Vecchia DPE",
  cost: 15,
  contract: "28 + T.O.",
  role: "A",
  state: "active",
  slot: "dpe",
  teamCode: "AAA",
  dpeAppliedSeasons: ["2025/26"],
};

describe("sostituzione contestuale nello slot DPE", () => {
  it("permette la stretch contestuale solo se l'occupante ha un annuale o un pending", () => {
    const annualIncumbent = { ...incumbent, contract: "27", cost: 11 };
    const result = applyDpeActivationWithOptionalCut({
      rosterEntries: [target, annualIncumbent],
      teamCode: "AAA",
      playerName: target.name,
      expectedCutPlayerName: annualIncumbent.name,
      cutStretchYears: 3,
      seasonName: "2026/27",
      currentSeasonEndYear: 2027,
      leagueMoment: "auction_completed",
    });
    expect(result.rosterEntries[1]).toMatchObject({ state: "cut", cost: 4, contract: "29", stretchProvisionApplied: true });
    expect(() => applyDpeActivationWithOptionalCut({
      rosterEntries: [target, incumbent],
      teamCode: "AAA",
      playerName: target.name,
      expectedCutPlayerName: incumbent.name,
      cutStretchYears: 2,
      seasonName: "2026/27",
      currentSeasonEndYear: 2027,
      leagueMoment: "auction_completed",
    })).toThrow("stretch provision non consentita");
  });
  it("taglia l'occupante e inserisce il nuovo giocatore in un unico stato finale", () => {
    const result = applyDpeActivationWithOptionalCut({
      rosterEntries: [target, incumbent],
      teamCode: "AAA",
      playerName: target.name,
      expectedCutPlayerName: incumbent.name,
      seasonName: "2026/27",
      currentSeasonEndYear: 2027,
      leagueMoment: "auction_completed",
    });

    expect(result.cutPlayer?.name).toBe(incumbent.name);
    expect(result.rosterEntries.find((entry) => entry.name === target.name)).toMatchObject({
      state: "active",
      slot: "dpe",
      dpeAppliedSeasons: ["2026/27"],
    });
    expect(result.rosterEntries.find((entry) => entry.name === incumbent.name)).toMatchObject({
      state: "cut",
      slot: "regular",
      contract: "28",
    });
  });

  it("rifiuta la sostituzione se manca la conferma nominativa", () => {
    expect(() => applyDpeActivationWithOptionalCut({
      rosterEntries: [target, incumbent],
      teamCode: "AAA",
      playerName: target.name,
      seasonName: "2026/27",
      currentSeasonEndYear: 2027,
      leagueMoment: "auction_completed",
    })).toThrow(`confermare il taglio contestuale di ${incumbent.name}`);
  });

  it("rifiuta una conferma diventata obsoleta se lo slot DPE è cambiato", () => {
    expect(() => applyDpeActivationWithOptionalCut({
      rosterEntries: [target],
      teamCode: "AAA",
      playerName: target.name,
      expectedCutPlayerName: incumbent.name,
      seasonName: "2026/27",
      currentSeasonEndYear: 2027,
      leagueMoment: "auction_completed",
    })).toThrow("Lo slot DPE è cambiato");
  });

  it("calcola il cap soltanto sul risultato combinato delle due operazioni", () => {
    const rosterEntries = [target, incumbent];
    const result = applyDpeActivationWithOptionalCut({
      rosterEntries,
      teamCode: "AAA",
      playerName: target.name,
      expectedCutPlayerName: incumbent.name,
      seasonName: "2026/27",
      currentSeasonEndYear: 2027,
      leagueMoment: "auction_completed",
    });
    const capSpace = (entries: RosterEntry[]) => calculateCapSpace({
      entries: entriesForDpeAdjustedCap(entries, 0),
      seasonName: "2026/27",
      optionSeasonName: "2026/27",
      countTeamOptions: true,
    });

    expect(capSpace(rosterEntries)).toBe(980);
    expect(capSpace(result.rosterEntries)).toBe(985);
  });
});
