import { describe, expect, it } from "vitest";
import type { RosterEntry } from "./league-types";
import { entriesForDpeAdjustedCap } from "./dpe-rules";
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
