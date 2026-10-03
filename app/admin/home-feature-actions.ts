"use server";

import { revalidatePath } from "next/cache";
import { competitionNames, type CompetitionName } from "@/lib/competitions";
import { loadEditableLeagueState, type EditableLeagueState } from "@/lib/league-state";
import { replaceLeagueStateIfUnchanged } from "@/lib/league-state-persistence";
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
  const nextState: EditableLeagueState = kind === "honours"
    ? { ...state, homepageHonoursTable: value ?? "" }
    : { ...state, homepageCompetition: value as CompetitionName | null };
  const response = await replaceLeagueStateIfUnchanged(
    supabase,
    state,
    nextState,
    `Selezione del contenuto ${kind === "honours" ? "Albo d'oro" : "Classifiche e tabelloni"} per la homepage`,
  );
  if (response.error) return { error: response.error.message };

  ["/", "/admin/storico", "/admin/contenuti"].forEach((path) => revalidatePath(path));
  return { error: null };
}
