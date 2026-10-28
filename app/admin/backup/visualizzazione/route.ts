import { loadHistoryCompetitionState } from "@/lib/history-competition-store";
import { loadEditableLeagueState } from "@/lib/league-state";
import { shouldCountTeamOptions } from "@/lib/season-time";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { renderStaticLeagueHtml } from "@/lib/static-league-html";
import { requireActiveSeason } from "@/lib/active-season";
import { backupFileTimestamp } from "@/lib/backup-file";
import { leagueMomentFromSeason } from "@/lib/league-moments";

export const dynamic = "force-dynamic";

const phaseLabels: Record<string, string> = {
  offseason: "Offseason",
  auction: "Asta",
  regular_season: "Stagione",
};

export async function GET() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return textError("Supabase non configurato.", 503);

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return textError("Sessione scaduta.", 401);
  const membership = await supabase
    .from("admin_users")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();
  if (membership.error || !membership.data) return textError("Account non autorizzato.", 403);

  try {
    const [activeSeason, historyState, leagueState] = await Promise.all([
      requireActiveSeason(),
      loadHistoryCompetitionState(),
      loadEditableLeagueState(),
    ]);
    const phase = activeSeason.season.status;
    const seasonName = activeSeason.season.name;
    const exportedAt = new Date();
    const html = renderStaticLeagueHtml({
      exportedAt,
      seasonName,
      phaseName: phaseLabels[phase] ?? "Offseason",
      leagueMoment: leagueMomentFromSeason(activeSeason.season),
      countTeamOptions: shouldCountTeamOptions(phase, activeSeason.season.team_options_resolved),
      teams: leagueState.teams,
      rosterEntries: leagueState.rosterEntries,
      draftAssets: leagueState.draftAssets,
      qualifyingOfferRights: leagueState.qualifyingOfferRights,
      history: historyState.competitions,
    });
    const filename = `greyson-allen-league_visualizzazione_${backupFileTimestamp(exportedAt)}.html`;
    return new Response(html, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Type": "text/html; charset=utf-8",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore sconosciuto";
    return textError(`Esportazione HTML non riuscita: ${message}`, 500);
  }
}

function textError(message: string, status: number) {
  return new Response(message, {
    status,
    headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" },
  });
}
