import { describe, expect, it } from "vitest";
import {
  countTradeEligibleDraftAssets,
  fourthDraftVirtualPicks,
  materializeFourthDraftPicks,
  publicDraftCondition,
  teamDraftCondition,
} from "./future-draft-picks";
import type { DraftAsset, TeamSummary } from "./league-types";

const teams: TeamSummary[] = [{
  code: "AAA", name: "Alpha", owner: "A", credits: 0, cost: 0, players: 0,
  cutPlayers: 0, qualifyingOffers: 0, draftAssets: 0, nextSeasonCredits: 0,
  followingSeasonCredits: 0, slug: "aaa",
}];

const assets: DraftAsset[] = [2027, 2028, 2029].flatMap((year) => [
  { label: "Scelta", year, round: "1° giro", originOrOverall: "AAA", originTeamCode: "AAA", teamCode: "AAA" },
  { label: "Scelta", year, round: "2° giro", originOrOverall: "AAA", originTeamCode: "AAA", teamCode: "AAA" },
]);

describe("dicitura delle contropartite nella pagina squadre", () => {
  it.each([
    ["C.p. se 1a 2027 CSS in top 5", "Include protezione top 5 su 1ª scelta 2027 CSS"],
    ["Contropartita se la 1ª scelta 2027 CSS rientra in top 3", "Include protezione top 3 su 1ª scelta 2027 CSS"],
    ["Contropartita se la 2ª scelta 2029 CSS rientra in top 13", "Include protezione top 13 su 2ª scelta 2029 CSS"],
  ])("traduce %s senza modificare il dato salvato", (label, expected) => {
    const asset = { ...assets[0], label };
    expect(teamDraftCondition(asset)).toBe(expected);
    expect(asset.label).toBe(label);
  });

  it("usa i metadati della clausola quando disponibili", () => {
    expect(teamDraftCondition({ ...assets[0], label: "Scelta", clauseResolution: {
      agreementId: "fixture", role: "protection_counterparty", subjectYear: 2028, subjectRound: "2° giro",
      subjectOriginTeamCode: "BBB", counterpartYear: 2029, counterpartOriginTeamCode: "AAA", threshold: 7, originalOwnerTeamCode: "AAA",
    } })).toBe("Include protezione top 7 su 2ª scelta 2028 BBB");
  });

  it.each(["Scelta", "Diritto di swap con BBB", "Soggetta a dir swap con BBB", "Protetta top 5, 1a 2029 BBB"])("non cambia le altre diciture: %s", (label) => {
    expect(teamDraftCondition({ ...assets[0], label })).toBe(publicDraftCondition(label));
  });
});

describe("scelte del quarto draft", () => {
  it("le mostra come non scambiabili senza contarle tra le scelte disponibili", () => {
    const virtual = fourthDraftVirtualPicks(assets, teams);

    expect(virtual).toHaveLength(2);
    expect(virtual.map((pick) => pick.year)).toEqual([2030, 2030]);
    expect(countTradeEligibleDraftAssets([...assets, ...virtual], "AAA")).toBe(6);
  });

  it("materializza solo la scelta del quarto draft usata come contropartita", () => {
    const virtual = fourthDraftVirtualPicks(assets, teams);
    const materialized = materializeFourthDraftPicks(assets, teams, [virtual[0]!.id]);

    expect(materialized).toHaveLength(7);
    expect(materialized.find((pick) => pick.year === 2030 && pick.round === "1° giro")).toMatchObject({ teamCode: "AAA" });
  });

  it("sposta in avanti le due scelte rosse una volta concluso il draft corrente", () => {
    const afterDraft = assets.filter((pick) => pick.year !== 2027);

    expect(fourthDraftVirtualPicks(afterDraft, teams).map((pick) => pick.year)).toEqual([2031, 2031]);
  });
});
