import { loadCompetitionState } from "./competition-store";
import { loadHistoryCompetitionState } from "./history-competition-store";
import { leagueMomentLabels } from "./league-moments";
import type { EditableLeagueState } from "./league-state";
import type { createSupabaseServerClient } from "./supabase/server";

type Supabase = NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>;

export type PhaseSeasonSnapshot = {
  id: string;
  name: string;
  status: string;
  team_options_resolved: boolean;
  trade_deadline_passed: boolean;
  timeline_moment?: string | null;
};

export async function savePhaseBackup(
  supabase: Supabase,
  season: PhaseSeasonSnapshot,
  state: EditableLeagueState,
  fromPhase: string,
  toPhase: string,
) {
  const [history, competitions] = await Promise.all([
    loadHistoryCompetitionState(),
    loadCompetitionState(),
  ]);
  return supabase.from("league_phase_backups").insert({
    season_id: season.id,
    from_phase: fromPhase,
    to_phase: toPhase,
    season_snapshot: season,
    state_snapshot: state,
    history_snapshot: history.competitions,
    competition_snapshot: competitions.competitions,
  }).select("id").single();
}

export const phaseStepLabels: Record<string, string> = {
  ...leagueMomentLabels,
};
