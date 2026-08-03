import { describe, expect, it } from "vitest";
import type { DraftAsset } from "./league-types";
import {
  applyCompleteDraftOrder,
  highlightedDraftYear,
  nextDraftYear,
  validateDraftOrderDraftStructure,
  validateDraftOrderProgress,
  yearsWithDefinedDraftPositions,
} from "./draft-positions";

const picks: DraftAsset[] = [
  { label: "Scelta", round: "1° giro", year: 2027, originOrOverall: "AAA", teamCode: "AAA" },
  { label: "Scelta", round: "1° giro", year: 2027, originOrOverall: "BBB", teamCode: "BBB" },
  { label: "Scelta", round: "1° giro", year: 2028, originOrOverall: "AAA", teamCode: "AAA" },
];

describe("posizioni draft", () => {
  it("non evidenzia il prossimo draft finché nessuna posizione è definita", () => {
    expect(highlightedDraftYear(picks)).toBeNull();
    expect(highlightedDraftYear(picks, [2027])).toBe(2027);
  });

  it("evidenzia tutto l'anno quando le posizioni sono state applicate", () => {
    const positioned = picks.map((pick, index) => pick.year === 2027
      ? { ...pick, originOrOverall: index + 1 }
      : pick);
    expect(yearsWithDefinedDraftPositions(positioned)).toEqual([2027]);
    expect(highlightedDraftYear(positioned)).toBe(2027);
  });

  it("accetta un ordine parziale senza applicare ancora le clausole", () => {
    const teamCodes = ["AAA", "BBB", "CCC"];
    const partial = Array.from({ length: 30 }, (_, index) => ({
      position: index + 1,
      originTeamCode: index < 2 ? teamCodes[index] : "",
      isBonus: false,
    }));
    expect(() => validateDraftOrderProgress(partial, teamCodes)).not.toThrow();
    partial[2].originTeamCode = "AAA";
    expect(() => validateDraftOrderProgress(partial, teamCodes)).toThrow("compare più volte");
  });

  it("salva una bozza intermedia anche con controlli finali ancora non rispettati", () => {
    const assignments = [
      { position: 1, originTeamCode: "AAA", isBonus: false, round: "1° giro" as const },
      { position: 2, originTeamCode: "AAA", isBonus: false, round: "1° giro" as const },
      { position: 3, originTeamCode: "BBB", isBonus: true, round: "2° giro" as const },
      { position: 4, originTeamCode: "CCC", isBonus: true, round: "2° giro" as const },
    ];
    expect(() => validateDraftOrderDraftStructure(assignments, ["AAA", "BBB", "CCC"], 2027)).not.toThrow();
    expect(() => validateDraftOrderProgress(assignments, ["AAA", "BBB", "CCC"], 2027)).toThrow();
  });

  it("crea le due scelte bonus e applica automaticamente uno swap", () => {
    const teamCodes = ["AAA", "BBB", "CCC", "DDD", "EEE", "FFF", "GGG", "HHH", "III", "JJJ", "KKK", "LLL", "MMM", "NNN"];
    const assets: DraftAsset[] = [
      ...teamCodes.flatMap((teamCode) => ([
      {
        label: teamCode === "AAA" ? "Diritto di swap con BBB" : teamCode === "BBB" ? "Soggetta a dir swap con AAA" : "Scelta",
        round: "1° giro",
        year: 2027,
        originOrOverall: teamCode,
        teamCode,
      },
      { label: "Scelta", round: "2° giro", year: 2027, originOrOverall: teamCode, teamCode },
      ])),
      { label: "Scelta bonus preesistente", round: "1° giro", year: 2027, originOrOverall: 99, originTeamCode: "DDD", teamCode: "DDD", isBonus: true },
    ];
    const firstRoundOrder = ["BBB", "AAA", ...teamCodes.slice(2)];
    const assignments = [
      ...firstRoundOrder.map((originTeamCode, index) => ({ position: index + 1, originTeamCode, isBonus: false })),
      { position: 15, originTeamCode: "AAA", isBonus: true },
      ...teamCodes.map((originTeamCode, index) => ({ position: index + 16, originTeamCode, isBonus: false })),
      { position: 30, originTeamCode: "BBB", isBonus: true },
    ];

    const result = applyCompleteDraftOrder(assets, 2027, assignments, teamCodes);
    const aaaPick = result.draftAssets.find((asset) => asset.year === 2027 && asset.originTeamCode === "AAA" && asset.round === "1° giro" && !asset.isBonus);
    const bbbPick = result.draftAssets.find((asset) => asset.year === 2027 && asset.originTeamCode === "BBB" && asset.round === "1° giro" && !asset.isBonus);

    expect(result.draftAssets.filter((asset) => asset.year === 2027)).toHaveLength(30);
    expect(result.draftAssets.filter((asset) => asset.year === 2027 && asset.isBonus)).toHaveLength(2);
    expect(result.draftAssets.find((asset) => asset.year === 2027 && asset.isBonus && asset.round === "1° giro")).toMatchObject({
      originOrOverall: 15,
      originTeamCode: "AAA",
      teamCode: "AAA",
    });
    expect(result.resolvedClauses).toBe(1);
    expect(result.ownershipChanges).toBe(1);
    expect(aaaPick).toMatchObject({ originOrOverall: 2, teamCode: "BBB", label: "Scelta" });
    expect(bbbPick).toMatchObject({ originOrOverall: 1, teamCode: "AAA", label: "Scelta" });
  });

  it("gestisce il Draft 2026 da 28 scelte e individua poi l'annata successiva", () => {
    const teamCodes = ["AAA", "BBB", "CCC", "DDD", "EEE", "FFF", "GGG", "HHH", "III", "JJJ", "KKK", "LLL", "MMM", "NNN"];
    const assets: DraftAsset[] = teamCodes.flatMap((teamCode) => ([
      { label: "Scelta", round: "1° giro", year: 2026, originOrOverall: teamCode, teamCode: teamCode === "AAA" ? "BBB" : teamCode },
      { label: "Scelta", round: "2° giro", year: 2026, originOrOverall: teamCode, teamCode },
    ]));
    const assignments = [
      ...teamCodes.map((originTeamCode, index) => ({ position: index + 1, originTeamCode, isBonus: false })),
      ...teamCodes.map((originTeamCode, index) => ({ position: index + 15, originTeamCode, isBonus: false })),
    ];

    const result = applyCompleteDraftOrder(assets, 2026, assignments, teamCodes);
    expect(result.draftAssets.filter((asset) => asset.year === 2026)).toHaveLength(28);
    expect(result.draftAssets.find((asset) => asset.year === 2026 && asset.round === "1° giro" && asset.originTeamCode === "AAA")).toMatchObject({
      originOrOverall: 1,
      teamCode: "BBB",
      isBonus: false,
    });
    expect(result.draftAssets.find((asset) => asset.originOrOverall === 15)?.round).toBe("2° giro");
    expect(nextDraftYear([...result.draftAssets, { ...assets[0], year: 2027 }])).toBe(2026);
    expect(nextDraftYear(result.draftAssets.filter((asset) => asset.year !== 2026).concat({ ...assets[0], year: 2027 }))).toBe(2027);
    expect(() => applyCompleteDraftOrder(
      assets.map((asset) => ({ ...asset, year: 2027 })),
      2027,
      assignments,
      teamCodes,
    )).toThrow(/30 totali/i);
  });

  it("mantiene 15 righe nel primo giro futuro anche durante una compilazione parziale", () => {
    const teamCodes = ["AAA", "BBB", "CCC", "DDD", "EEE", "FFF", "GGG", "HHH", "III", "JJJ", "KKK", "LLL", "MMM", "NNN"];
    const partial = Array.from({ length: 28 }, (_, index) => ({
      position: index + 1,
      originTeamCode: index === 0 || index === 14 ? "AAA" : "",
      isBonus: false,
    }));
    expect(() => validateDraftOrderProgress(partial, teamCodes, 2027)).toThrow(/AAA.*più volte/i);
  });

  it("mantiene distinti i due giri quando una riga del primo viene rimossa", () => {
    const teamCodes = ["AAA", "BBB", "CCC"];
    const partial = [
      { position: 1, originTeamCode: "AAA", isBonus: false, round: "1° giro" as const },
      { position: 2, originTeamCode: "BBB", isBonus: false, round: "1° giro" as const },
      { position: 3, originTeamCode: "AAA", isBonus: false, round: "2° giro" as const },
      { position: 4, originTeamCode: "BBB", isBonus: false, round: "2° giro" as const },
    ];
    expect(() => validateDraftOrderProgress(partial, teamCodes, 2027)).not.toThrow();
  });

  it("applica una protezione e la ricalcola se l'ordine viene corretto", () => {
    const teamCodes = ["AAA", "BBB", "CCC", "DDD", "EEE", "FFF", "GGG", "HHH", "III", "JJJ", "KKK", "LLL", "MMM", "NNN"];
    const assets: DraftAsset[] = [
      ...teamCodes.flatMap((teamCode) => ([
        {
          label: teamCode === "CCC" ? "Protetta top 5, 1a 2028 CCC" : "Scelta",
          round: "1° giro",
          year: 2027,
          originOrOverall: teamCode,
          teamCode: teamCode === "CCC" ? "DDD" : teamCode,
        },
        { label: "Scelta", round: "2° giro", year: 2027, originOrOverall: teamCode, teamCode },
      ])),
      { label: "C.p. se 1a 2027 CCC in top 5", round: "1° giro", year: 2028, originOrOverall: "CCC", teamCode: "CCC" },
    ];
    const assignmentsFor = (firstRound: string[]) => ([
      ...firstRound.map((originTeamCode, index) => ({ position: index + 1, originTeamCode, isBonus: false })),
      { position: 15, originTeamCode: "AAA", isBonus: true },
      ...teamCodes.map((originTeamCode, index) => ({ position: index + 16, originTeamCode, isBonus: false })),
      { position: 30, originTeamCode: "BBB", isBonus: true },
    ]);

    const triggered = applyCompleteDraftOrder(assets, 2027, assignmentsFor(["CCC", ...teamCodes.filter((code) => code !== "CCC")]), teamCodes);
    const protectedAfterTrigger = triggered.draftAssets.find((asset) => asset.year === 2027 && asset.originTeamCode === "CCC" && asset.round === "1° giro");
    const counterpartyAfterTrigger = triggered.draftAssets.find((asset) => asset.year === 2028 && asset.originOrOverall === "CCC");
    expect(protectedAfterTrigger?.teamCode).toBe("CCC");
    expect(counterpartyAfterTrigger?.teamCode).toBe("DDD");

    const correctedOrder = ["AAA", "BBB", "DDD", "EEE", "FFF", "CCC", ...teamCodes.filter((code) => !["AAA", "BBB", "CCC", "DDD", "EEE", "FFF"].includes(code))];
    const corrected = applyCompleteDraftOrder(triggered.draftAssets, 2027, assignmentsFor(correctedOrder), teamCodes);
    const protectedAfterCorrection = corrected.draftAssets.find((asset) => asset.year === 2027 && asset.originTeamCode === "CCC" && asset.round === "1° giro");
    const counterpartyAfterCorrection = corrected.draftAssets.find((asset) => asset.year === 2028 && asset.originOrOverall === "CCC");
    expect(protectedAfterCorrection?.teamCode).toBe("DDD");
    expect(counterpartyAfterCorrection?.teamCode).toBe("CCC");
  });
});
