import {
  automaticallyArchivedHistoryNames,
  type AutomaticallyArchivedHistoryName,
  type HistoryCompetitionEntry,
  type HistoryCompetitionMap,
  type HistoryEntryContent,
} from "./history-competitions";

export type CurrentHistoryArchive = {
  season: string;
  contents: Partial<Record<AutomaticallyArchivedHistoryName, HistoryEntryContent>>;
};

export function buildAutomaticHistoryArchive(
  history: HistoryCompetitionMap,
  current: CurrentHistoryArchive,
): Record<AutomaticallyArchivedHistoryName, HistoryCompetitionEntry[]> {
  return Object.fromEntries(automaticallyArchivedHistoryNames.map((category) => {
    const content = current.contents[category];
    if (!content) throw new Error(`Contenuto attuale mancante: ${category}.`);
    const entry: HistoryCompetitionEntry = {
      season: current.season,
      content: structuredClone(content),
    };
    const existingIndex = history[category].findIndex((item) => item.season === current.season);
    const entries = existingIndex >= 0
      ? history[category].map((item, index) => index === existingIndex ? entry : item)
      : [entry, ...history[category]];
    return [category, entries];
  })) as Record<AutomaticallyArchivedHistoryName, HistoryCompetitionEntry[]>;
}
