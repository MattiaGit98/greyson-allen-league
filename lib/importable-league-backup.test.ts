import { describe, expect, it } from "vitest";
import { defaultCompetitionMap } from "./competitions";
import { emptyHistoryCompetitionMap } from "./history-competitions";
import {
  createImportableBackupDocument,
  parseImportableLeagueBackup,
  type ImportableLeaguePayload,
} from "./importable-league-backup";
import { emptyLeagueState } from "./league-state";

function payload(): ImportableLeaguePayload {
  return {
    activeSeason: {
      name: "2026/27",
      status: "offseason",
      timeline_moment: "offseason_start",
      team_options_resolved: false,
      trade_deadline_passed: false,
    },
    leagueState: emptyLeagueState(),
    calendar: [{ event: "Asta", date: "Da definire" }],
    competitions: defaultCompetitionMap(0),
    history: emptyHistoryCompetitionMap(),
    movements: [],
  };
}

describe("backup importabile della lega", () => {
  it("accetta un backup completo prodotto dal sistema", () => {
    const backup = createImportableBackupDocument(payload(), "2026-08-02T12:00:00.000Z");
    const parsed = parseImportableLeagueBackup(JSON.parse(JSON.stringify(backup)));

    expect(parsed.payload.activeSeason.name).toBe("2026/27");
    expect(parsed.payload.calendar).toEqual([{ event: "Asta", date: "Da definire" }]);
  });

  it("rifiuta un file alterato dopo il download", () => {
    const backup = createImportableBackupDocument(payload(), "2026-08-02T12:00:00.000Z");
    backup.payload.activeSeason.name = "2027/28";

    expect(() => parseImportableLeagueBackup(backup)).toThrow(/integrità/i);
  });

  it("conserva i dati che collegano un movimento allo storico", () => {
    const source = payload();
    source.movements = [{
      id: "8d45ba5f-fbe1-4d42-b5ef-744eb0a27ace",
      operation_type: "draft_assignment",
      summary: "Scelta assegnata",
      before_state: { rosterEntries: [] },
      after_state: { rosterEntries: [{ name: "Rookie" }] },
      history_category: "Draft",
      before_history: [],
      after_history: [{ season: "2026/27" }],
      created_at: "2026-08-02T12:00:00.000Z",
      reverted_at: null,
    }];
    const backup = createImportableBackupDocument(source, "2026-08-02T12:00:00.000Z");

    expect(parseImportableLeagueBackup(JSON.parse(JSON.stringify(backup))).payload.movements[0])
      .toMatchObject({ history_category: "Draft", after_history: [{ season: "2026/27" }] });
  });

  it("rifiuta un normale export JSON non ripristinabile", () => {
    expect(() => parseImportableLeagueBackup({ format: "greyson-allen-league-backup" }))
      .toThrow(/non è un backup importabile/i);
  });
});
