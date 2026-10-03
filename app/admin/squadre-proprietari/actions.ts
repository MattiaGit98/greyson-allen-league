"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { loadEditableLeagueState } from "@/lib/league-state";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { normalizeHistoryEntries } from "@/lib/history-competitions";
import { renameOpenDraftHistory, renameTeamIdentity, replaceTeamCodeInContent } from "@/lib/team-identity";

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
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { error: "Supabase non configurato." };
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sessione scaduta." };

  const [draftHistory, competitionContent] = await Promise.all([
    supabase.from("history_competition_content").select("entries").eq("category", "Draft").maybeSingle(),
    supabase.from("competition_content").select("season_id,competition_name,content"),
  ]);
  if (draftHistory.error) return { error: draftHistory.error.message };
  if (competitionContent.error) return { error: competitionContent.error.message };

  let expectedDraftHistory: unknown = null;
  let nextDraftHistory: unknown = null;
  if (draftHistory.data) {
    const entries = normalizeHistoryEntries("Draft", draftHistory.data.entries);
    if (!entries) return { error: "Lo storico del Draft non è valido." };
    expectedDraftHistory = draftHistory.data.entries;
    nextDraftHistory = renameOpenDraftHistory(entries, nextState.draftAssets, originalCode, code).entries;
  }
  const competitionUpdates = (competitionContent.data ?? []).map((row) => {
    const nextContent = replaceTeamCodeInContent(row.content, originalCode, code);
    return {
      season_id: row.season_id,
      competition_name: row.competition_name,
      expected_content: row.content,
      next_content: nextContent,
    };
  });
  const response = await supabase.rpc("rename_league_team", {
    expected_state_payload: state,
    next_state_payload: nextState,
    original_code: originalCode,
    next_code: code,
    next_name: name,
    next_owner: owner,
    expected_draft_history_payload: expectedDraftHistory,
    next_draft_history_payload: nextDraftHistory,
    competition_updates: competitionUpdates,
  });
  if (response.error) return { error: response.error.message };

  revalidatePath("/", "layout");
  redirect(`/admin/squadre-proprietari?updated=${encodeURIComponent("Squadra aggiornata.")}`);
}
