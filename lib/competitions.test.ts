import { describe, expect, it } from "vitest";
import {
  defaultCompetitionMap,
  cupGroupValidationErrors,
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

describe("controlli delle giornate del girone coppa", () => {
  const codes = ["AAA", "BBB", "CCC", "DDD"];
  function group(wins: Array<0 | 1 | null>, scores: string[] = wins.map(() => "100")): CupGroupContent {
    return { kind: "cup_group", rounds: 1, results: Object.fromEntries(codes.map((code, index) => [code, { wins: [wins[index]], scores: [scores[index]] }])) };
  }

  it.each([1, 5, 10])("accetta %i giornate tutte vuote, anche senza righe già salvate", (rounds) => {
    expect(cupGroupValidationErrors({ kind: "cup_group", rounds, results: {} }, codes)).toEqual([]);
    expect(cupGroupValidationErrors({ kind: "cup_group", rounds, results: { AAA: { wins: [], scores: [" "] } } }, codes)).toEqual([]);
  });

  it("accetta giornate complete bilanciate senza modificare dati, totali o ordinamento", () => {
    const content = group([1, 0, 1, 0], ["100,5", "90", "0", "80"]);
    const before = structuredClone(content);
    expect(cupGroupValidationErrors(content, codes)).toEqual([]);
    expect(content).toEqual(before);
    expect(sortedCupTeams(content, codes.map((code) => ({ code, name: code }))).map((row) => row.team.code)).toEqual(["AAA", "CCC", "BBB", "DDD"]);
  });

  it("blocca una giornata parziale anche se le sole righe presenti sono bilanciate", () => {
    const content = group([1, 0, null, null], ["100", "90", "", ""]);
    expect(cupGroupValidationErrors(content, codes)).toEqual([expect.stringContaining("G1: giornata incompleta (2/4")]);
  });

  it.each([
    [[1, 0, 1, 0], ["100", "100", "", "100"]],
    [[1, 0, null, 0], ["100", "100", "100", "100"]],
    [[null, null, null, null], ["100", "100", "100", "100"]],
    [[1, 0, 1, 0], ["", "", "", ""]],
  ] as const)("richiede sia W/L sia punteggio per tutte le squadre (%j)", (wins, scores) => {
    expect(cupGroupValidationErrors(group([...wins], [...scores]), codes)).toEqual([expect.stringContaining("giornata incompleta")]);
  });

  it("riconosce L=0 come risultato compilato e non come cella vuota", () => {
    expect(cupGroupValidationErrors(group([0, 0, 0, 0]), codes)).toEqual([expect.stringContaining("vittorie 0, sconfitte 4")]);
  });

  it.each(([[1, 1, 1, 0], [1, 1, 1, 1], [0, 0, 1, 0]] as Array<Array<0 | 1>>).map((wins) => ({ wins })))("blocca vittorie e sconfitte sbilanciate: $wins", ({ wins }) => {
    expect(cupGroupValidationErrors(group(wins), codes)).toEqual([expect.stringContaining("Il numero di vittorie deve essere uguale")]);
  });

  it("controlla ogni giornata indipendentemente, senza obbligare a compilare quelle precedenti", () => {
    const content: CupGroupContent = { kind: "cup_group", rounds: 3, results: {
      AAA: { wins: [null, 1, 0], scores: ["", "100", "90"] },
      BBB: { wins: [null, 0, 1], scores: ["", "90", "100"] },
      CCC: { wins: [null, 1, null], scores: ["", "100", ""] },
      DDD: { wins: [null, 0, null], scores: ["", "90", ""] },
    } };
    expect(cupGroupValidationErrors(content, codes)).toEqual([expect.stringContaining("G3: giornata incompleta")]);
    expect(cupGroupValidationErrors({ ...content, rounds: 2 }, codes)).toEqual([]);
  });

  it("non dimentica squadre attive senza una riga salvata", () => {
    const content = group([1, 0, 1, 0]);
    delete content.results.DDD;
    expect(cupGroupValidationErrors(content, codes)).toEqual([expect.stringContaining("3/4 squadre complete")]);
  });

  it("considera soltanto le squadre correnti indicate dal chiamante", () => {
    const content = group([1, 0, null, null], ["100", "100", "", ""]);
    expect(cupGroupValidationErrors(content, ["AAA", "BBB"])).toEqual([]);
  });

  it("non inventa pareggi o riposi per rendere bilanciato un numero dispari di risultati", () => {
    const content = group([1, 0, 1, null]);
    expect(cupGroupValidationErrors(content, codes.slice(0, 3))).toEqual([expect.stringContaining("vittorie 2, sconfitte 1")]);
  });
});
