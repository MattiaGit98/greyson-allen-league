export const competitionNames = [
  "Girone coppa",
  "Tabellone coppa",
  "Regular season",
  "Playoff",
  "Conference League",
  "All Star Game",
  "March Madness",
] as const;

export type CompetitionName = (typeof competitionNames)[number];
export type CompetitionTeam = { code: string; name: string };
export type RankingContent = { kind: "ranking"; positions: Array<string | null> };
export type CupTeamResult = { wins: Array<0 | 1 | null>; scores: string[] };
export type CupGroupContent = {
  kind: "cup_group";
  rounds: number;
  results: Record<string, CupTeamResult>;
};
export type BracketTeamSlot = {
  teamCode: string | null;
  score: string;
  homeAdvantage: boolean;
};
export type BracketMatchContent = { teams: [BracketTeamSlot, BracketTeamSlot] };
export type BracketStageContent = { name: string; matches: BracketMatchContent[] };
export type BracketContent = { kind: "bracket"; stages: BracketStageContent[] };
export type CompetitionContent = RankingContent | CupGroupContent | BracketContent;
export type CompetitionContentMap = Record<CompetitionName, CompetitionContent>;

export const bracketUnknownTeamCode = "X";

export const bracketCompetitionNames = new Set<CompetitionName>([
  "Tabellone coppa",
  "Playoff",
  "Conference League",
  "All Star Game",
]);

const defaultStages: Record<string, Array<[string, number]>> = {
  "Tabellone coppa": [["Quarti di finale", 4], ["Semifinali", 2], ["Finale", 1]],
  Playoff: [["Play-in", 3], ["Quarti di finale", 4], ["Semifinali", 2], ["Finale", 1]],
  "Conference League": [["Qualificazioni", 3], ["Quarti di finale", 4], ["Semifinali", 2], ["Finale", 1]],
  "All Star Game": [["Quarti di finale", 4], ["Semifinali", 2], ["Finale", 1]],
};

export function emptyBracketSlot(): BracketTeamSlot {
  return { teamCode: null, score: "", homeAdvantage: false };
}

export function emptyBracketMatch(): BracketMatchContent {
  return { teams: [emptyBracketSlot(), emptyBracketSlot()] };
}

export function defaultCompetitionContent(name: CompetitionName, teamCount = 14): CompetitionContent {
  if (name === "Girone coppa") return { kind: "cup_group", rounds: 5, results: {} };
  if (bracketCompetitionNames.has(name)) {
    return {
      kind: "bracket",
      stages: (defaultStages[name] ?? [["Turno", 1]]).map(([stageName, matches]) => ({
        name: stageName,
        matches: Array.from({ length: matches }, emptyBracketMatch),
      })),
    };
  }
  return { kind: "ranking", positions: Array.from({ length: teamCount }, () => null) };
}

export function defaultCompetitionMap(teamCount = 14): CompetitionContentMap {
  return Object.fromEntries(
    competitionNames.map((name) => [name, defaultCompetitionContent(name, teamCount)]),
  ) as CompetitionContentMap;
}

export function normalizeCompetitionContent(
  name: CompetitionName,
  input: unknown,
  validTeamCodes: string[],
): CompetitionContent | null {
  const value = asRecord(input);
  if (!value) return null;
  const validCodes = new Set(validTeamCodes);

  if (name === "Girone coppa") {
    if (value.kind !== "cup_group") return null;
    const rounds = clampInteger(value.rounds, 1, 10, 5);
    const sourceResults = asRecord(value.results) ?? {};
    const results: Record<string, CupTeamResult> = {};
    for (const code of validTeamCodes) {
      const source = asRecord(sourceResults[code]);
      const rawWins = Array.isArray(source?.wins) ? source.wins : [];
      const rawScores = Array.isArray(source?.scores) ? source.scores : [];
      results[code] = {
        wins: Array.from({ length: rounds }, (_, index) => normalizeWin(rawWins[index])),
        scores: Array.from({ length: rounds }, (_, index) => cleanText(rawScores[index], 30)),
      };
    }
    return { kind: "cup_group", rounds, results };
  }

  if (bracketCompetitionNames.has(name)) {
    if (value.kind !== "bracket" || !Array.isArray(value.stages)) return null;
    const validBracketCodes = new Set([...validTeamCodes, bracketUnknownTeamCode]);
    const stages = value.stages.slice(0, 12).map((rawStage) => {
      const stage = asRecord(rawStage);
      const matches = Array.isArray(stage?.matches) ? stage.matches.slice(0, 20) : [];
      return {
        name: cleanText(stage?.name, 80) || "Turno",
        matches: matches.map((rawMatch): BracketMatchContent => {
          const match = asRecord(rawMatch);
          const slots = Array.isArray(match?.teams) ? match.teams : [];
          return {
            teams: [0, 1].map((index): BracketTeamSlot => {
              const slot = asRecord(slots[index]);
              const code = cleanText(slot?.teamCode, 20);
              return {
                teamCode: validBracketCodes.has(code) ? code : null,
                score: cleanText(slot?.score, 30),
                homeAdvantage: slot?.homeAdvantage === true,
              };
            }) as [BracketTeamSlot, BracketTeamSlot],
          };
        }),
      };
    });
    return { kind: "bracket", stages };
  }

  if (value.kind !== "ranking" || !Array.isArray(value.positions)) return null;
  const seen = new Set<string>();
  const positions = value.positions.slice(0, Math.max(validTeamCodes.length, 1)).map((item) => {
    const code = cleanText(item, 20);
    if (!validCodes.has(code) || seen.has(code)) return null;
    seen.add(code);
    return code;
  });
  while (positions.length < validTeamCodes.length) positions.push(null);
  return { kind: "ranking", positions };
}

export function cupTeamResult(content: CupGroupContent, code: string): CupTeamResult {
  const result = content.results[code];
  return {
    wins: Array.from({ length: content.rounds }, (_, index) => result?.wins[index] ?? null),
    scores: Array.from({ length: content.rounds }, (_, index) => result?.scores[index] ?? ""),
  };
}

export function cupTotals(result: CupTeamResult) {
  return {
    wins: result.wins.reduce<number>((total, value) => total + (value ?? 0), 0),
    score: result.scores.reduce((total, value) => total + parseCompetitionNumber(value), 0),
  };
}

export function sortedCupTeams(content: CupGroupContent, teams: CompetitionTeam[]) {
  return teams.map((team) => {
    const result = cupTeamResult(content, team.code);
    return { team, result, totals: cupTotals(result) };
  }).sort((left, right) =>
    right.totals.wins - left.totals.wins
    || right.totals.score - left.totals.score
    || left.team.name.localeCompare(right.team.name, "it"),
  );
}

export function formatCompetitionNumber(value: number) {
  return new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2 }).format(value);
}

function parseCompetitionNumber(input: string) {
  const value = input.trim();
  if (!value) return 0;
  const normalized = value.includes(",") ? value.replace(/\./g, "").replace(",", ".") : value;
  return Number(normalized) || 0;
}

function normalizeWin(value: unknown): 0 | 1 | null {
  if (value === 0 || value === "0") return 0;
  if (value === 1 || value === "1") return 1;
  return null;
}

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function clampInteger(value: unknown, minimum: number, maximum: number, fallback: number) {
  const number = Number(value);
  if (!Number.isInteger(number)) return fallback;
  return Math.min(maximum, Math.max(minimum, number));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}
