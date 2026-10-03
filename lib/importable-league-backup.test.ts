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
      phase_dates: { team_option_deadline: "2026-09-30" },
    },
    teamRecords: [],
    leagueState: emptyLeagueState(),
    calendar: [{ event: "Asta", date: "Da definire" }],
    competitions: defaultCompetitionMap(0),
    history: emptyHistoryCompetitionMap(),
    contractDrafts: [],
    movements: [],
  };
}

describe("backup importabile della lega", () => {
  it("accetta un backup completo prodotto dal sistema", () => {
    const backup = createImportableBackupDocument(payload(), "2026-08-02T12:00:00.000Z");
    const parsed = parseImportableLeagueBackup(JSON.parse(JSON.stringify(backup)));

    expect(parsed.payload.activeSeason.name).toBe("2026/27");
    expect(parsed.payload.activeSeason.phase_dates).toEqual({ team_option_deadline: "2026-09-30" });
    expect(parsed.payload.calendar).toEqual([{ event: "Asta", date: "Da definire" }]);
  });

  it("rifiuta una fase non supportata", () => {
    const source = payload();
    source.activeSeason = {
      ...source.activeSeason,
      timeline_moment: "legacy_phase" as never,
      team_options_resolved: true,
    };
    const backup = createImportableBackupDocument(source, "2026-08-02T12:00:00.000Z");

    expect(() => parseImportableLeagueBackup(JSON.parse(JSON.stringify(backup))))
      .toThrow(/fase o annata/i);
  });

  it("rifiuta un file alterato dopo il download", () => {
    const backup = createImportableBackupDocument(payload(), "2026-08-02T12:00:00.000Z");
    backup.payload.activeSeason.name = "2027/28";

    expect(() => parseImportableLeagueBackup(backup)).toThrow(/integrità/i);
  });

  it("rifiuta i backup del formato precedente", () => {
    const current = payload();
    const legacyBackup = {
      format: "greyson-allen-league-importable-backup",
      formatVersion: 1,
      schemaVersion: "202608090022",
      exportedAt: "2026-08-02T12:00:00.000Z",
      checksum: "non-rilevante",
      payload: current,
    };

    expect(() => parseImportableLeagueBackup(legacyBackup)).toThrow(/versione/i);
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
      season_name: "2026/27",
      undo_before_moment: "team_option_deadline",
      reverts_movement_id: null,
      created_at: "2026-08-02T12:00:00.000Z",
      reverted_at: null,
    }];
    const backup = createImportableBackupDocument(source, "2026-08-02T12:00:00.000Z");

    expect(parseImportableLeagueBackup(JSON.parse(JSON.stringify(backup))).payload.movements[0])
      .toMatchObject({
        before_state: { rosterEntries: [] },
        after_state: { rosterEntries: [{ name: "Rookie" }] },
        history_category: "Draft",
        after_history: [{ season: "2026/27" }],
        season_name: "2026/27",
        undo_before_moment: "team_option_deadline",
        reverts_movement_id: null,
      });
  });

  it("conserva bozze private dei contratti e anagrafica fisica delle squadre", () => {
    const source = payload();
    source.leagueState.teams = [{
      code: "AAA", name: "Alpha", owner: "Mario", slug: "alpha", credits: 1000,
      cost: 0, players: 0, cutPlayers: 0, qualifyingOffers: 0, draftAssets: 0,
      nextSeasonCredits: 1000, followingSeasonCredits: 1000,
    }];
    source.teamRecords = [{
      id: "8d45ba5f-fbe1-4d42-b5ef-744eb0a27ace",
      code: "AAA",
      name: "Alpha",
      slug: "alpha",
      owner_name: "Mario",
      logo_url: null,
      active: true,
    }];
    source.contractDrafts = [{
      season_name: "2026/27",
      team_code: "AAA",
      player_name: "Rookie",
      contract_kind: "team_option",
      slot: "g_league",
    }];
    const parsed = parseImportableLeagueBackup(JSON.parse(JSON.stringify(createImportableBackupDocument(source))));

    expect(parsed.payload.teamRecords[0]).toMatchObject({ code: "AAA", owner_name: "Mario" });
    expect(parsed.payload.contractDrafts[0]).toMatchObject({ player_name: "Rookie", slot: "g_league" });
  });

  it("rifiuta un normale export JSON non ripristinabile", () => {
    expect(() => parseImportableLeagueBackup({ format: "greyson-allen-league-backup" }))
      .toThrow(/non è un backup importabile/i);
  });
});
