import { describe, expect, it } from "vitest";
import { buildAutomaticHistoryArchive } from "./history-archive";
import {
  automaticallyArchivedHistoryNames,
  emptyHistoryCompetitionMap,
  type HistoryEntryContent,
} from "./history-competitions";

function contentFor(category: string): HistoryEntryContent {
  return category === "Regular season" || category === "March Madness"
    ? { kind: "ranking", positions: ["Alpha", "Beta"] }
    : { kind: "bracket", stages: [] };
}

describe("archiviazione automatica delle competizioni", () => {
  it("crea una voce per la stagione conclusa soltanto nelle sei categorie automatiche", () => {
    const history = emptyHistoryCompetitionMap();
    history.Draft = [{ season: "2026", content: { kind: "draft", rows: [] } }];
    const contents = Object.fromEntries(
      automaticallyArchivedHistoryNames.map((category) => [category, contentFor(category)]),
    );
    const result = buildAutomaticHistoryArchive(history, { season: "2026/27", contents });

    expect(Object.keys(result)).toEqual(automaticallyArchivedHistoryNames);
    for (const category of automaticallyArchivedHistoryNames) {
      expect(result[category][0].season).toBe("2026/27");
    }
    expect(history.Draft).toHaveLength(1);
    expect(history["Albo d'oro"]).toHaveLength(0);
  });

  it("sostituisce l'annata già presente senza crearne un duplicato", () => {
    const history = emptyHistoryCompetitionMap();
    for (const category of automaticallyArchivedHistoryNames) {
      history[category] = [{ season: "2026/27", content: contentFor(category) }];
    }
    const contents = Object.fromEntries(
      automaticallyArchivedHistoryNames.map((category) => [category, contentFor(category)]),
    );
    const result = buildAutomaticHistoryArchive(history, { season: "2026/27", contents });
    expect(result["Regular season"]).toHaveLength(1);
  });
});
