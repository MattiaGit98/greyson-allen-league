import { describe, expect, it } from "vitest";
import type { RosterEntry } from "./league-types";
import { entriesForDpeAdjustedCap, inheritedDpeSeasons } from "./dpe-rules";
import { calculateCapSpace } from "./season-time";

const disabledPlayer: RosterEntry = {
  name: "Infortunato",
  cost: 100,
  contract: "28",
  role: "G",
  state: "active",
  slot: "dpe",
  teamCode: "AAA",
};

describe("impatto della disabled player exception", () => {
  it("conserva le annate DPE quando lo stesso giocatore viene rifirmato", () => {
    const entries: RosterEntry[] = [
      { ...disabledPlayer, name: "Mario Rossi", state: "cut", slot: "regular", dpeAppliedSeasons: ["2026/27"] },
      { ...disabledPlayer, name: "MARIO  ROSSI", state: "cut", slot: "regular", dpeAppliedSeasons: ["2026/27", "2027/28"] },
      { ...disabledPlayer, name: "Altro giocatore", state: "cut", slot: "regular", dpeAppliedSeasons: ["2025/26"] },
    ];
    expect(inheritedDpeSeasons(entries, "Mario Rossi")).toEqual(["2026/27", "2027/28"]);
  });

  it("esclude il contratto soltanto dalla prima stagione a concludersi", () => {
    const current = calculateCapSpace({
      entries: entriesForDpeAdjustedCap([disabledPlayer], 0),
      seasonName: "2026/27",
      optionSeasonName: "2026/27",
      countTeamOptions: true,
    });
    const future = calculateCapSpace({
      entries: entriesForDpeAdjustedCap([disabledPlayer], 1),
      seasonName: "2027/28",
      optionSeasonName: "2026/27",
      countTeamOptions: true,
    });
    expect(current).toBe(1000);
    expect(future).toBe(900);
  });
});
