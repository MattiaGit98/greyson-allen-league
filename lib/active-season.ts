import { cache } from "react";
import type { LeaguePhase } from "@/lib/league-types";
import { isLeagueMoment } from "@/lib/league-moments";
import { seasonEndYear } from "@/lib/season-time";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const activeSeasonSelection = "id,name,status,team_options_resolved,trade_deadline_passed,timeline_moment,phase_dates";

export type ActiveSeason = {
  id: string;
  name: string;
  status: LeaguePhase;
  team_options_resolved: boolean;
  trade_deadline_passed: boolean;
  timeline_moment: string | null;
  phase_dates: unknown;
};

export const loadActiveSeason = cache(async function loadActiveSeason() {
  const supabase = await createSupabaseServerClient();
  const response = supabase
    ? await supabase
      .from("seasons")
      .select(activeSeasonSelection)
      .eq("is_active", true)
      .maybeSingle()
    : null;

  return {
    supabase,
    season: (response?.data as ActiveSeason | null) ?? null,
    error: response?.error ?? (response?.data ? null : !supabase ? new Error("Supabase non configurato.") : new Error("Nessuna stagione attiva trovata.")),
    configured: Boolean(supabase && response?.data && !response.error),
  };
});

export async function requireActiveSeason() {
  const result = await loadActiveSeason();
  if (!result.season || !result.supabase) throw result.error;
  if (seasonEndYear(result.season.name) === null) {
    throw new Error(`L'annata attiva salvata in Supabase non è valida: ${result.season.name}.`);
  }
  if (!isLeagueMoment(result.season.timeline_moment)) {
    throw new Error("Il momento della lega salvato in Supabase non è valido.");
  }
  return { ...result, supabase: result.supabase, season: result.season };
}
