import { describe, expect, it } from "vitest";
import type { DraftAsset } from "./league-types";
import {
  applyCompleteDraftOrder,
  highlightedDraftYear,
  validateDraftOrderDraftStructure,
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
    expect(highlightedDraftYear(positioned)).toBeNull();
    expect(highlightedDraftYear(positioned, [2027])).toBe(2027);
  });

  it("accetta una bozza parziale con giri espliciti", () => {
    const teamCodes = ["AAA", "BBB", "CCC"];
    const partial = [
      { position: 1, originTeamCode: "AAA", isBonus: false, round: "1° giro" as const, cost: null },
      { position: 2, originTeamCode: "", isBonus: false, round: "1° giro" as const, cost: null },
      { position: 3, originTeamCode: "AAA", isBonus: false, round: "2° giro" as const, cost: 1 },
    ];
    expect(() => validateDraftOrderDraftStructure(partial, teamCodes)).not.toThrow();
  });

  it("salva una bozza intermedia anche con controlli finali ancora non rispettati", () => {
    const assignments = [
      { position: 1, originTeamCode: "AAA", isBonus: false, round: "1° giro" as const, cost: null },
      { position: 2, originTeamCode: "AAA", isBonus: false, round: "1° giro" as const, cost: null },
      { position: 3, originTeamCode: "BBB", isBonus: true, round: "2° giro" as const, cost: 1 },
      { position: 4, originTeamCode: "CCC", isBonus: true, round: "2° giro" as const, cost: 1 },
    ];
    expect(() => validateDraftOrderDraftStructure(assignments, ["AAA", "BBB", "CCC"])).not.toThrow();
  });

  it("completa un draft senza imporre scelte bonus", () => {
    const teamCodes = ["AAA", "BBB", "CCC"];
    const assets = teamCodes.flatMap((teamCode) => ([
      { label: "Scelta", round: "1° giro", year: 2027, originOrOverall: teamCode, teamCode },
      { label: "Scelta", round: "2° giro", year: 2027, originOrOverall: teamCode, teamCode },
    ] satisfies DraftAsset[]));
    const assignments = [
      ...teamCodes.map((originTeamCode, index) => ({ position: index + 1, originTeamCode, isBonus: false, round: "1° giro" as const, cost: 5 })),
      ...teamCodes.map((originTeamCode, index) => ({ position: index + 4, originTeamCode, isBonus: false, round: "2° giro" as const, cost: 1 })),
    ];

    const result = applyCompleteDraftOrder(assets, 2027, assignments, teamCodes);

    expect(result.draftAssets.filter((asset) => asset.year === 2027)).toHaveLength(6);
    expect(result.draftAssets.some((asset) => asset.isBonus)).toBe(false);
  });

  it("accetta qualsiasi numero di bonus, anche distribuito in modo diverso tra i giri", () => {
    const teamCodes = ["AAA", "BBB", "CCC"];
    const assets = teamCodes.flatMap((teamCode) => ([
      { label: "Scelta", round: "1° giro", year: 2027, originOrOverall: teamCode, teamCode },
      { label: "Scelta", round: "2° giro", year: 2027, originOrOverall: teamCode, teamCode },
    ] satisfies DraftAsset[]));
    const assignments = [
      ...teamCodes.map((originTeamCode, index) => ({ position: index + 1, originTeamCode, isBonus: false, round: "1° giro" as const, cost: 5 })),
      { position: 4, originTeamCode: "AAA", isBonus: true, round: "1° giro" as const, cost: 2 },
      { position: 5, originTeamCode: "BBB", isBonus: true, round: "1° giro" as const, cost: 2 },
      ...teamCodes.map((originTeamCode, index) => ({ position: index + 6, originTeamCode, isBonus: false, round: "2° giro" as const, cost: 1 })),
      { position: 9, originTeamCode: "CCC", isBonus: true, round: "2° giro" as const, cost: 1 },
    ];

    const result = applyCompleteDraftOrder(assets, 2027, assignments, teamCodes);

    expect(result.draftAssets.filter((asset) => asset.year === 2027)).toHaveLength(9);
    expect(result.draftAssets.filter((asset) => asset.year === 2027 && asset.isBonus)).toHaveLength(3);
  });

  it("crea le scelte bonus indicate e applica automaticamente uno swap", () => {
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
      ...firstRoundOrder.map((originTeamCode, index) => ({ position: index + 1, originTeamCode, isBonus: false, round: "1° giro" as const, cost: 10 })),
      { position: 15, originTeamCode: "AAA", isBonus: true, round: "1° giro" as const, cost: 2 },
      ...teamCodes.map((originTeamCode, index) => ({ position: index + 16, originTeamCode, isBonus: false, round: "2° giro" as const, cost: 1 })),
      { position: 30, originTeamCode: "BBB", isBonus: true, round: "2° giro" as const, cost: 1 },
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

  it("non impone un massimo fisso alle righe di un giro", () => {
    const teamCodes = ["AAA", "BBB", "CCC"];
    const partial = Array.from({ length: 5 }, (_, index) => ({
      position: index + 1,
      originTeamCode: "",
      isBonus: index >= teamCodes.length,
      round: "1° giro" as const,
      cost: null,
    }));
    expect(() => validateDraftOrderDraftStructure(partial, teamCodes)).not.toThrow();
  });

  it("mantiene distinti i due giri quando una riga del primo viene rimossa", () => {
    const teamCodes = ["AAA", "BBB", "CCC"];
    const partial = [
      { position: 1, originTeamCode: "AAA", isBonus: false, round: "1° giro" as const, cost: null },
      { position: 2, originTeamCode: "BBB", isBonus: false, round: "1° giro" as const, cost: null },
      { position: 3, originTeamCode: "AAA", isBonus: false, round: "2° giro" as const, cost: 1 },
      { position: 4, originTeamCode: "BBB", isBonus: false, round: "2° giro" as const, cost: 1 },
    ];
    expect(() => validateDraftOrderDraftStructure(partial, teamCodes)).not.toThrow();
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
      ...firstRound.map((originTeamCode, index) => ({ position: index + 1, originTeamCode, isBonus: false, round: "1° giro" as const, cost: 10 })),
      { position: 15, originTeamCode: "AAA", isBonus: true, round: "1° giro" as const, cost: 2 },
      ...teamCodes.map((originTeamCode, index) => ({ position: index + 16, originTeamCode, isBonus: false, round: "2° giro" as const, cost: 1 })),
      { position: 30, originTeamCode: "BBB", isBonus: true, round: "2° giro" as const, cost: 1 },
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

  it("risolve una protezione usando una contropartita del secondo giro dello stesso draft", () => {
    const teamCodes = ["AAA", "BBB"];
    const agreement = {
      agreementId: "protection:2027:1° giro:AAA:2027:2° giro:AAA",
      subjectYear: 2027,
      subjectRound: "1° giro",
      subjectOriginTeamCode: "AAA",
      counterpartYear: 2027,
      counterpartRound: "2° giro",
      counterpartOriginTeamCode: "AAA",
      threshold: 1,
    };
    const assets: DraftAsset[] = [
      {
        label: "Protetta top 1; contropartita: 2ª scelta 2027 AAA",
        round: "1° giro",
        year: 2027,
        originOrOverall: "AAA",
        teamCode: "BBB",
        clauseResolution: { ...agreement, role: "protected", originalOwnerTeamCode: "BBB" },
      },
      { label: "Scelta", round: "1° giro", year: 2027, originOrOverall: "BBB", teamCode: "BBB" },
      {
        label: "Contropartita se la 1ª scelta 2027 AAA rientra in top 1",
        round: "2° giro",
        year: 2027,
        originOrOverall: "AAA",
        teamCode: "AAA",
        clauseResolution: { ...agreement, role: "protection_counterparty", originalOwnerTeamCode: "AAA" },
      },
      { label: "Scelta", round: "2° giro", year: 2027, originOrOverall: "BBB", teamCode: "BBB" },
    ];
    const assignments = [
      { position: 1, originTeamCode: "AAA", isBonus: false, round: "1° giro" as const, cost: 25 },
      { position: 2, originTeamCode: "BBB", isBonus: false, round: "1° giro" as const, cost: 21 },
      { position: 3, originTeamCode: "AAA", isBonus: false, round: "2° giro" as const, cost: 1 },
      { position: 4, originTeamCode: "BBB", isBonus: false, round: "2° giro" as const, cost: 1 },
    ];

    const result = applyCompleteDraftOrder(assets, 2027, assignments, teamCodes);
    const subject = result.draftAssets.find((asset) => asset.year === 2027 && asset.round === "1° giro" && asset.originTeamCode === "AAA");
    const counterpart = result.draftAssets.find((asset) => asset.year === 2027 && asset.round === "2° giro" && asset.originTeamCode === "AAA");

    expect(subject?.teamCode).toBe("AAA");
    expect(counterpart?.teamCode).toBe("BBB");
  });
});
