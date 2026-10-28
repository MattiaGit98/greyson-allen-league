import { loadEditableLeagueState } from "@/lib/league-state";
import { requireActiveSeason } from "@/lib/active-season";
import {
  competitionNames,
  defaultCompetitionMap,
  normalizeCompetitionContent,
  type CompetitionName,
  type CompetitionTeam,
} from "@/lib/competitions";

export async function loadCompetitionState() {
  const [teams, activeSeason] = await Promise.all([
    loadCompetitionTeams(),
    requireActiveSeason(),
  ]);
  const response = await activeSeason.supabase
    .from("competition_content")
    .select("competition_name,content")
    .eq("season_id", activeSeason.season.id);
  if (response.error) throw new Error(`Classifiche e tabelloni non disponibili: ${response.error.message}`);

  const competitions = defaultCompetitionMap(teams.length);
  for (const row of response.data ?? []) {
    if (!isCompetitionName(row.competition_name)) continue;
    const normalized = normalizeCompetitionContent(
      row.competition_name,
      row.content,
      teams.map((team) => team.code),
    );
    if (normalized) competitions[row.competition_name] = normalized;
  }
  return { teams, competitions, season: activeSeason.season };
}

export async function loadCompetitionTeams(): Promise<CompetitionTeam[]> {
  const state = await loadEditableLeagueState();
  return state.teams.map((team) => ({ code: team.code, name: team.name }));
}

function isCompetitionName(value: string): value is CompetitionName {
  return (competitionNames as readonly string[]).includes(value);
}
