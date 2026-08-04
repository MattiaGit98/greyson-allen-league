import { describe, expect, it } from "vitest";
import {
  defaultCompetitionMap,
  normalizeCompetitionContent,
  sortedCupTeams,
  type CompetitionTeam,
  type CupGroupContent,
} from "./competitions";

const teams: CompetitionTeam[] = [
  { code: "AAA", name: "Alfa" },
  { code: "BBB", name: "Beta" },
  { code: "CCC", name: "Gamma" },
];

describe("gestione classifiche", () => {
  it("dimensiona le classifiche usando il numero corrente di squadre", () => {
    const competitions = defaultCompetitionMap(teams.length);
    expect(competitions["Regular season"]).toEqual({ kind: "ranking", positions: [null, null, null] });
    expect(competitions["March Madness"]).toEqual({ kind: "ranking", positions: [null, null, null] });
  });

  it("ordina il girone prima per vittorie e poi per punteggio totale", () => {
    const content: CupGroupContent = {
      kind: "cup_group",
      rounds: 2,
      results: {
        AAA: { wins: [1, 0], scores: ["100,5", "90"] },
        BBB: { wins: [1, 0], scores: ["110", "100"] },
        CCC: { wins: [1, 1], scores: ["80", "80"] },
      },
    };

    expect(sortedCupTeams(content, teams).map((row) => row.team.code)).toEqual(["CCC", "BBB", "AAA"]);
  });

  it("ammette posizioni vuote ma non duplica una squadra", () => {
    const content = normalizeCompetitionContent(
      "Regular season",
      { kind: "ranking", positions: ["AAA", "", "AAA"] },
      teams.map((team) => team.code),
    );
    expect(content).toEqual({ kind: "ranking", positions: ["AAA", null, null] });
  });

  it("accetta soltanto 0, 1 o vuoto come risultato di giornata", () => {
    const content = normalizeCompetitionContent(
      "Girone coppa",
      {
        kind: "cup_group",
        rounds: 3,
        results: { AAA: { wins: [1, 0, 2], scores: ["10", "20", "30"] } },
      },
      teams.map((team) => team.code),
    );
    expect(content?.kind === "cup_group" ? content.results.AAA?.wins : null).toEqual([1, 0, null]);
  });

  it("ammette X come squadra nei tabelloni", () => {
    const content = normalizeCompetitionContent(
      "Playoff",
      {
        kind: "bracket",
        stages: [{
          name: "Finale",
          matches: [{
            teams: [
              { teamCode: "X", score: "", homeAdvantage: false },
              { teamCode: "AAA", score: "", homeAdvantage: false },
            ],
          }],
        }],
      },
      teams.map((team) => team.code),
    );

    expect(content?.kind === "bracket" ? content.stages[0]?.matches[0]?.teams[0]?.teamCode : null).toBe("X");
  });
});
