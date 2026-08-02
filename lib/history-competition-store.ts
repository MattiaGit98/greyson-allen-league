import { loadCompetitionState } from "@/lib/competition-store";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { BracketContent, CompetitionName, RankingContent } from "@/lib/competitions";
import {
  automaticallyArchivedHistoryNames,
  currentCompetitionForHistory,
  emptyHistoryCompetitionMap,
  isHistoryCompetitionName,
  normalizeHistoryEntries,
  type AutomaticallyArchivedHistoryName,
  type HistoryBracketContent,
  type HistoryEntryContent,
  type HistoryRankingContent,
} from "@/lib/history-competitions";

export async function loadHistoryCompetitionState() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) throw new Error("Supabase non configurato: impossibile caricare lo storico.");
  const response = await supabase
    .from("history_competition_content")
    .select("category,entries");
  if (response.error) throw new Error(`Storico non disponibile: ${response.error.message}`);

  const competitions = emptyHistoryCompetitionMap();
  for (const row of response.data ?? []) {
    if (!isHistoryCompetitionName(row.category)) continue;
    const normalized = normalizeHistoryEntries(row.category, row.entries);
    if (normalized) competitions[row.category] = normalized;
  }
  return { competitions, configured: true };
}

export async function loadCurrentHistoryImports() {
  const { competitions, teams, season } = await loadCompetitionState();
  const teamByCode = new Map(teams.map((team) => [team.code, team.name]));
  const contents: Partial<Record<AutomaticallyArchivedHistoryName, HistoryEntryContent>> = {};

  for (const name of automaticallyArchivedHistoryNames) {
    const mappedName = currentCompetitionForHistory[name];
    if (!mappedName) continue;
    const source = competitions[mappedName as CompetitionName];
    if (source.kind === "ranking") {
      contents[name] = currentRankingToHistory(source, teamByCode);
    } else if (source.kind === "bracket") {
      contents[name] = currentBracketToHistory(source, teamByCode);
    }
  }
  return { season: season.name, contents };
}

function currentRankingToHistory(
  source: RankingContent,
  teamByCode: Map<string, string>,
): HistoryRankingContent {
  return {
    kind: "ranking",
    positions: source.positions.map((code) => code ? teamByCode.get(code) ?? code : ""),
  };
}

function currentBracketToHistory(
  source: BracketContent,
  teamByCode: Map<string, string>,
): HistoryBracketContent {
  return {
    kind: "bracket",
    stages: source.stages.map((stage) => ({
      name: stage.name,
      matches: stage.matches.map((match) => ({
        teams: match.teams.map((slot) => ({
          teamName: slot.teamCode ? teamByCode.get(slot.teamCode) ?? slot.teamCode : "",
          score: slot.score,
          homeAdvantage: slot.homeAdvantage,
        })) as HistoryBracketContent["stages"][number]["matches"][number]["teams"],
      })),
    })),
  };
}
