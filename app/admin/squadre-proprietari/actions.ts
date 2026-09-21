"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { loadEditableLeagueState, type EditableLeagueState } from "@/lib/league-state";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { renameTeamIdentity, replaceTeamCodeInContent } from "@/lib/team-identity";

export type TeamIdentitySaveState = { message?: string; error?: string };

export async function saveTeamIdentity(
  _previousState: TeamIdentitySaveState,
  formData: FormData,
): Promise<TeamIdentitySaveState> {
  const originalCode = String(formData.get("original_code") ?? "").trim().toUpperCase();
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  const name = String(formData.get("name") ?? "").trim();
  const owner = String(formData.get("owner") ?? "").trim();
  if (!/^[A-Z]{3}$/.test(code)) return { error: "La sigla deve contenere esattamente tre lettere." };
  if (!name || name.length > 100) return { error: "Inserisci un nome squadra valido." };
  if (!owner || owner.length > 200) return { error: "Inserisci almeno un proprietario." };

  const state = await loadEditableLeagueState();
  if (!state.teams.some((team) => team.code === originalCode)) return { error: "Squadra non valida." };
  if (state.teams.some((team) => team.code !== originalCode && team.code === code)) {
    return { error: "Questa sigla è già utilizzata." };
  }
  if (state.teams.some((team) => team.code !== originalCode && team.name.toLocaleLowerCase("it") === name.toLocaleLowerCase("it"))) {
    return { error: "Questo nome squadra è già utilizzato." };
  }

  const nextState = renameTeamIdentity(state, originalCode, code, name, owner);
  const saved = await persistLeagueState(nextState, "Squadra aggiornata.");
  if (saved.error) return saved;
  const syncError = await synchronizeTeamIdentity(originalCode, code, name, owner);
  revalidatePath("/", "layout");
  if (syncError) redirect(`/admin/squadre-proprietari?error=${encodeURIComponent(`La squadra è stata aggiornata nello stato della lega, ma non tutti i dati collegati sono stati sincronizzati: ${syncError}`)}`);
  redirect(`/admin/squadre-proprietari?updated=${encodeURIComponent(saved.message ?? "Squadra aggiornata.")}`);
}

async function persistLeagueState(state: EditableLeagueState, message: string): Promise<TeamIdentitySaveState> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { error: "Supabase non configurato." };
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sessione scaduta." };
  const response = await supabase.rpc("replace_league_state", { state_payload: state });
  if (response.error) return { error: response.error.message };

  return { message };
}

async function synchronizeTeamIdentity(originalCode: string, code: string, name: string, owner: string): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return "Supabase non configurato.";
  const teamUpdate = await supabase
    .from("teams")
    .update({ code, name, owner_name: owner, slug: code.toLocaleLowerCase("it") })
    .eq("code", originalCode)
    .select("id");
  if (teamUpdate.error) return teamUpdate.error.message;
  if (teamUpdate.data?.length !== 1) return "Squadra non trovata nella tabella delle competizioni.";

  if (originalCode === code) return null;
  const content = await supabase.from("competition_content").select("season_id,competition_name,content");
  if (content.error) return content.error.message;
  for (const row of content.data ?? []) {
    const replaced = replaceTeamCodeInContent(row.content, originalCode, code);
    if (JSON.stringify(replaced) === JSON.stringify(row.content)) continue;
    const result = await supabase
      .from("competition_content")
      .update({ content: replaced })
      .eq("season_id", row.season_id)
      .eq("competition_name", row.competition_name);
    if (result.error) return result.error.message;
  }
  return null;
}
