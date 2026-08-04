import { describe, expect, it } from "vitest";
import { compareDraftPicks, draftOverallPosition } from "./draft-rules";

describe("regole del draft", () => {
  it("mette le scelte senza posizione prima di quelle numerate nello stesso giro", () => {
    const picks = [
      { round: "1° giro", originOrOverall: 7 },
      { round: "1° giro", originOrOverall: "CSS" },
      { round: "1° giro", originOrOverall: 2 },
      { round: "1° giro", originOrOverall: "CCH" },
    ].sort(compareDraftPicks);
    expect(picks.map((pick) => pick.originOrOverall)).toEqual(["CCH", "CSS", 2, 7]);
  });

  it("accetta qualsiasi posizione complessiva positiva", () => {
    expect(draftOverallPosition("18")).toBe(18);
    expect(draftOverallPosition(31)).toBe(31);
    expect(draftOverallPosition("CSS")).toBeNull();
    expect(draftOverallPosition(0)).toBeNull();
  });
});
