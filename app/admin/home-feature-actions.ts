"use server";

import { revalidatePath } from "next/cache";
import { competitionNames } from "@/lib/competitions";
import { loadEditableLeagueState } from "@/lib/league-state";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function saveHomepageFeatureSelection(kind: "honours" | "competition", value: string | null) {
  if (kind === "competition" && value !== null && !(competitionNames as readonly string[]).includes(value)) {
    return { error: "Contenuto non valido." };
  }
  if (kind === "honours" && value !== null && (!value.trim() || value.length > 120)) {
    return { error: "Tabella non valida." };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { error: "Supabase non configurato." };
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sessione scaduta." };
  const state = await loadEditableLeagueState();
  const nextState = kind === "honours"
    ? { ...state, homepageHonoursTable: value ?? "" }
    : { ...state, homepageCompetition: value };
  const response = await supabase.rpc("replace_league_state", { state_payload: nextState });
  if (response.error) return { error: response.error.message };

  ["/", "/admin/storico", "/admin/contenuti"].forEach((path) => revalidatePath(path));
  return { error: null };
}
