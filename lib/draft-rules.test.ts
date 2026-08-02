import { describe, expect, it } from "vitest";
import { compareDraftPicks, draftOverallPosition, draftPrice } from "./draft-rules";

describe("regole del draft", () => {
  it("applica i prezzi dell'articolo 7(f)", () => {
    expect(draftPrice(1, "1° giro")).toBe(25);
    expect(draftPrice(11, "1° giro")).toBe(6);
    expect(draftPrice(15, "1° giro")).toBe(2);
    expect(draftPrice(15, "2° giro")).toBe(1);
    expect(draftPrice(30, "2° giro")).toBe(1);
  });

  it("mette le scelte senza posizione prima di quelle numerate nello stesso giro", () => {
    const picks = [
      { round: "1° giro", originOrOverall: 7 },
      { round: "1° giro", originOrOverall: "CSS" },
      { round: "1° giro", originOrOverall: 2 },
      { round: "1° giro", originOrOverall: "CCH" },
    ].sort(compareDraftPicks);
    expect(picks.map((pick) => pick.originOrOverall)).toEqual(["CCH", "CSS", 2, 7]);
  });

  it("accetta soltanto posizioni complessive da 1 a 30", () => {
    expect(draftOverallPosition("18")).toBe(18);
    expect(draftOverallPosition("CSS")).toBeNull();
    expect(draftOverallPosition(31)).toBeNull();
  });
});
