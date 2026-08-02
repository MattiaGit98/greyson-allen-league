export const historyCompetitionNames = [
  "Albo d'oro",
  "Numero titoli",
  "Playoff",
  "Coppa",
  "All Star Game",
  "March Madness",
  "Conference League",
  "Draft",
  "Regular season",
  "Roster vincitore",
] as const;

export type HistoryCompetitionName = (typeof historyCompetitionNames)[number];

export const manuallyEditableHistoryNames = [
  "Albo d'oro",
  "Numero titoli",
  "Roster vincitore",
] as const satisfies readonly HistoryCompetitionName[];

export const automaticallyArchivedHistoryNames = [
  "Playoff",
  "Coppa",
  "All Star Game",
  "March Madness",
  "Conference League",
  "Regular season",
] as const satisfies readonly HistoryCompetitionName[];

export type AutomaticallyArchivedHistoryName = (typeof automaticallyArchivedHistoryNames)[number];
export type HistoryRankingContent = { kind: "ranking"; positions: string[] };
export type HistoryBracketSlot = { teamName: string; score: string; homeAdvantage: boolean };
export type HistoryBracketMatch = { teams: [HistoryBracketSlot, HistoryBracketSlot] };
export type HistoryBracketStage = { name: string; matches: HistoryBracketMatch[] };
export type HistoryBracketContent = { kind: "bracket"; stages: HistoryBracketStage[] };
export type HistoryDraftRow = { pick: string; team: string; player: string };
export type HistoryDraftContent = { kind: "draft"; rows: HistoryDraftRow[] };
export type HistoryWinningRosterContent = { kind: "winning_roster"; teamName: string; players: string[] };
export type HistoryHonoursRow = { season: string; team: string; owners: string };
export type HistoryHonoursContent = { kind: "honours"; rows: HistoryHonoursRow[] };
export type HistoryTitleRow = { label: string; count: string };
export type HistoryTitleCountsContent = { kind: "title_counts"; rows: HistoryTitleRow[] };
export type HistoryEntryContent =
  | HistoryRankingContent
  | HistoryBracketContent
  | HistoryDraftContent
  | HistoryWinningRosterContent
  | HistoryHonoursContent
  | HistoryTitleCountsContent;
export type HistoryCompetitionEntry = { season: string; content: HistoryEntryContent };
export type HistoryCompetitionMap = Record<HistoryCompetitionName, HistoryCompetitionEntry[]>;

export const historyBracketNames = new Set<HistoryCompetitionName>(["Playoff", "Coppa", "All Star Game", "Conference League"]);
export const historyRankingNames = new Set<HistoryCompetitionName>(["March Madness", "Regular season"]);
export const aggregateHistoryNames = new Set<HistoryCompetitionName>(["Albo d'oro", "Numero titoli"]);

export const currentCompetitionForHistory: Partial<Record<HistoryCompetitionName, string>> = {
  Playoff: "Playoff",
  Coppa: "Tabellone coppa",
  "All Star Game": "All Star Game",
  "March Madness": "March Madness",
  "Conference League": "Conference League",
  "Regular season": "Regular season",
};

const defaultBracketStages: Record<string, Array<[string, number]>> = {
  Playoff: [["Play-in", 3], ["Quarti di finale", 4], ["Semifinali", 2], ["Finale", 1]],
  Coppa: [["Quarti di finale", 4], ["Semifinali", 2], ["Finale", 1]],
  "All Star Game": [["Quarti di finale", 4], ["Semifinali", 2], ["Finale", 1]],
  "Conference League": [["Qualificazioni", 3], ["Quarti di finale", 4], ["Semifinali", 2], ["Finale", 1]],
};

export function emptyHistoryBracketSlot(): HistoryBracketSlot {
  return { teamName: "", score: "", homeAdvantage: false };
}

export function emptyHistoryBracketMatch(): HistoryBracketMatch {
  return { teams: [emptyHistoryBracketSlot(), emptyHistoryBracketSlot()] };
}

export function defaultHistoryEntryContent(name: HistoryCompetitionName): HistoryEntryContent {
  if (historyBracketNames.has(name)) {
    return {
      kind: "bracket",
      stages: (defaultBracketStages[name] ?? [["Turno", 1]]).map(([stageName, matches]) => ({
        name: stageName,
        matches: Array.from({ length: matches }, emptyHistoryBracketMatch),
      })),
    };
  }
  if (historyRankingNames.has(name)) return { kind: "ranking", positions: Array.from({ length: 14 }, () => "") };
  if (name === "Draft") {
    return { kind: "draft", rows: Array.from({ length: 30 }, (_, index) => ({ pick: String(index + 1), team: "", player: "" })) };
  }
  if (name === "Roster vincitore") {
    return { kind: "winning_roster", teamName: "", players: Array.from({ length: 13 }, () => "") };
  }
  if (name === "Albo d'oro") return { kind: "honours", rows: [] };
  return { kind: "title_counts", rows: [] };
}

export function emptyHistoryContentFromTemplate(
  name: HistoryCompetitionName,
  template?: HistoryEntryContent,
): HistoryEntryContent {
  if (!template) return defaultHistoryEntryContent(name);
  if (template.kind === "bracket") {
    return {
      kind: "bracket",
      stages: template.stages.map((stage) => ({
        name: stage.name,
        matches: stage.matches.map(emptyHistoryBracketMatch),
      })),
    };
  }
  if (template.kind === "ranking") return { kind: "ranking", positions: template.positions.map(() => "") };
  if (template.kind === "draft") return { kind: "draft", rows: template.rows.map((row, index) => ({ pick: row.pick || String(index + 1), team: "", player: "" })) };
  if (template.kind === "winning_roster") return { kind: "winning_roster", teamName: "", players: template.players.map(() => "") };
  if (template.kind === "honours") return { kind: "honours", rows: template.rows.map((row) => ({ season: row.season, team: "", owners: "" })) };
  return { kind: "title_counts", rows: template.rows.map(() => ({ label: "", count: "" })) };
}

export function isHistoryContentEmpty(content: HistoryEntryContent) {
  if (content.kind === "ranking") return content.positions.every((value) => !value.trim());
  if (content.kind === "bracket") return content.stages.every((stage) => stage.matches.every((match) => match.teams.every((team) => !team.teamName.trim() && !team.score.trim() && !team.homeAdvantage)));
  if (content.kind === "draft") return content.rows.every((row) => !row.team.trim() && !row.player.trim());
  if (content.kind === "winning_roster") return !content.teamName.trim() && content.players.every((player) => !player.trim());
  if (content.kind === "honours") return content.rows.every((row) => !row.team.trim() && !row.owners.trim());
  return content.rows.every((row) => !row.label.trim() && !row.count.trim());
}

export function emptyHistoryCompetitionMap(): HistoryCompetitionMap {
  return Object.fromEntries(historyCompetitionNames.map((name) => [name, [] as HistoryCompetitionEntry[]])) as HistoryCompetitionMap;
}

export function normalizeHistoryEntries(name: HistoryCompetitionName, input: unknown): HistoryCompetitionEntry[] | null {
  if (!Array.isArray(input)) return null;
  const entries: HistoryCompetitionEntry[] = [];
  const seen = new Set<string>();
  for (const rawEntry of input.slice(0, 100)) {
    const entry = asRecord(rawEntry);
    const season = cleanText(entry?.season, 120);
    if (!season || seen.has(season)) continue;
    const content = normalizeHistoryEntryContent(name, entry?.content);
    if (!content) return null;
    seen.add(season);
    entries.push({ season, content });
  }
  return entries;
}

export function normalizeHistoryEntryContent(name: HistoryCompetitionName, input: unknown): HistoryEntryContent | null {
  const value = asRecord(input);
  if (!value) return null;
  if (historyRankingNames.has(name)) {
    if (value.kind !== "ranking" || !Array.isArray(value.positions)) return null;
    return { kind: "ranking", positions: value.positions.slice(0, 50).map((team) => cleanText(team, 120)) };
  }
  if (historyBracketNames.has(name)) {
    if (value.kind !== "bracket" || !Array.isArray(value.stages)) return null;
    return {
      kind: "bracket",
      stages: value.stages.slice(0, 12).map((rawStage) => {
        const stage = asRecord(rawStage);
        const matches = Array.isArray(stage?.matches) ? stage.matches.slice(0, 20) : [];
        return {
          name: cleanText(stage?.name, 80) || "Turno",
          matches: matches.map((rawMatch): HistoryBracketMatch => {
            const match = asRecord(rawMatch);
            const teams = Array.isArray(match?.teams) ? match.teams : [];
            return {
              teams: [0, 1].map((index): HistoryBracketSlot => {
                const slot = asRecord(teams[index]);
                return { teamName: cleanText(slot?.teamName, 120), score: cleanText(slot?.score, 30), homeAdvantage: slot?.homeAdvantage === true };
              }) as [HistoryBracketSlot, HistoryBracketSlot],
            };
          }),
        };
      }),
    };
  }
  if (name === "Draft") {
    if (value.kind !== "draft" || !Array.isArray(value.rows)) return null;
    return { kind: "draft", rows: value.rows.slice(0, 100).map((rawRow) => {
      const row = asRecord(rawRow);
      return { pick: cleanText(row?.pick, 30), team: cleanText(row?.team, 120), player: cleanText(row?.player, 120) };
    }) };
  }
  if (name === "Roster vincitore") {
    if (value.kind !== "winning_roster" || !Array.isArray(value.players)) return null;
    return { kind: "winning_roster", teamName: cleanText(value.teamName, 120), players: value.players.slice(0, 50).map((player) => cleanText(player, 120)) };
  }
  if (name === "Albo d'oro") {
    if (value.kind !== "honours" || !Array.isArray(value.rows)) return null;
    return { kind: "honours", rows: value.rows.slice(0, 100).map((rawRow) => {
      const row = asRecord(rawRow);
      return { season: cleanText(row?.season, 30), team: cleanText(row?.team, 120), owners: cleanText(row?.owners, 180) };
    }) };
  }
  if (value.kind !== "title_counts" || !Array.isArray(value.rows)) return null;
  return { kind: "title_counts", rows: value.rows.slice(0, 100).map((rawRow) => {
    const row = asRecord(rawRow);
    return { label: cleanText(row?.label, 180), count: cleanText(row?.count, 30) };
  }) };
}

export function isHistoryCompetitionName(value: string): value is HistoryCompetitionName {
  return (historyCompetitionNames as readonly string[]).includes(value);
}

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
