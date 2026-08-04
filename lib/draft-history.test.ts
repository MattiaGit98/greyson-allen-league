import { describe, expect, it } from "vitest";
import { initializeDraftHistory, synchronizeUnassignedDraftOwners } from "./draft-history";
import type { DraftAsset } from "./league-types";

const picks: DraftAsset[] = [
  { label: "Scelta", round: "1° giro", year: 2030, originOrOverall: 1, originTeamCode: "AAA", teamCode: "AAA", draftCost: 5 },
  { label: "Scelta", round: "1° giro", year: 2030, originOrOverall: 2, originTeamCode: "BBB", teamCode: "BBB", draftCost: 4 },
];

describe("sincronizzazione storico Draft", () => {
  it("crea lo storico appena l'ordine diventa ufficiale", () => {
    const entries = initializeDraftHistory([], 2030, picks);
    expect(entries[0]).toMatchObject({
      season: "2030",
      content: { kind: "draft", rows: [
        { pick: "1", team: "AAA", player: "" },
        { pick: "2", team: "BBB", player: "" },
      ] },
    });
  });

  it("aggiorna soltanto il proprietario delle scelte non ancora usate", () => {
    const entries = [{
      season: "2030",
      content: { kind: "draft" as const, rows: [
        { pick: "1", team: "AAA", player: "Giocatore scelto" },
        { pick: "2", team: "BBB", player: "" },
      ] },
    }];
    const moved = picks.map((pick) => ({ ...pick, teamCode: "CCC" }));
    const result = synchronizeUnassignedDraftOwners(entries, moved, [2030]);
    expect(result.changed).toBe(true);
    expect(result.entries[0].content).toMatchObject({ kind: "draft", rows: [
      { pick: "1", team: "AAA", player: "Giocatore scelto" },
      { pick: "2", team: "CCC", player: "" },
    ] });
  });
});
