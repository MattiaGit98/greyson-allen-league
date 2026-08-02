import { describe, expect, it } from "vitest";
import { inferLegacyDraftOrigins } from "./draft-order-bootstrap";
import type { HistoryCompetitionEntry } from "./history-competitions";

describe("inizializzazione ordine draft storico", () => {
  it("ricava secondo giro e non partecipanti alla lottery dai risultati archiviati", () => {
    const teams = Array.from({ length: 14 }, (_, index) => ({ code: `T${index + 1}`, name: `Team ${index + 1}` }));
    const regularSeasonEntries: HistoryCompetitionEntry[] = [{
      season: "25/26",
      content: { kind: "ranking", positions: teams.map((team) => team.name) },
    }];
    const playoffEntries: HistoryCompetitionEntry[] = [{
      season: "25/26",
      content: {
        kind: "bracket",
        stages: [{
          name: "Semifinali",
          matches: [
            { teams: [{ teamName: "Team 1", score: "", homeAdvantage: false }, { teamName: "Team 2", score: "", homeAdvantage: false }] },
            { teams: [{ teamName: "Team 3", score: "", homeAdvantage: false }, { teamName: "Team 4", score: "", homeAdvantage: false }] },
          ],
        }],
      },
    }];
    const origins = inferLegacyDraftOrigins({
      draftYear: 2026,
      positionCount: 28,
      teams,
      draftAssets: [],
      regularSeasonEntries,
      playoffEntries,
    });

    expect(origins.get(11)).toBe("T4");
    expect(origins.get(14)).toBe("T1");
    expect(origins.get(15)).toBe("T14");
    expect(origins.get(28)).toBe("T1");
  });
});
