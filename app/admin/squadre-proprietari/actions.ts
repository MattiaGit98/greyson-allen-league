"use server";

import { revalidatePath } from "next/cache";
import { loadEditableLeagueState, type EditableLeagueState } from "@/lib/league-state";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type TeamIdentitySaveState = { message?: string; error?: string };

export async function saveTeamIdentity(
  _previousState: TeamIdentitySaveState,
  formData: FormData,
): Promise<TeamIdentitySaveState> {
  const originalCode = String(formData.get("original_code") ?? "").trim().toUpperCase();
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  const name = String(formData.get("name") ?? "").trim();
  const owner = String(formData.get("owner") ?? "").trim();
  if (!/^[A-Z0-9]{2,5}$/.test(code)) return { error: "La sigla deve contenere da 2 a 5 lettere o numeri." };
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

  const nextState: EditableLeagueState = {
    ...state,
    teams: state.teams.map((team) => team.code === originalCode
      ? { ...team, code, name, owner, slug: code.toLocaleLowerCase("it") }
      : team),
    rosterEntries: state.rosterEntries.map((entry) => entry.teamCode === originalCode
      ? { ...entry, teamCode: code }
      : entry),
    draftAssets: state.draftAssets.map((asset) => asset.teamCode === originalCode
      ? { ...asset, teamCode: code }
      : asset),
    qualifyingOfferRights: state.qualifyingOfferRights.map((right) => right.teamCode === originalCode
      ? { ...right, teamCode: code }
      : right),
  };
  const saved = await persistLeagueState(nextState, "Squadra aggiornata.");
  if (saved.error) return saved;
  await synchronizeTeamIdentity(originalCode, code, name, owner);
  return saved;
}

async function persistLeagueState(state: EditableLeagueState, message: string): Promise<TeamIdentitySaveState> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { error: "Supabase non configurato." };
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sessione scaduta." };
  const response = await supabase.rpc("replace_league_state", { state_payload: state });
  if (response.error) return { error: response.error.message };

  [
    "/squadre",
    "/giocatori",
    "/admin",
    "/admin/squadre-proprietari",
    "/admin/free-agent",
    "/admin/scambi",
  ].forEach((path) => revalidatePath(path));
  return { message };
}

async function synchronizeTeamIdentity(originalCode: string, code: string, name: string, owner: string) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return;
  await supabase
    .from("teams")
    .update({ code, name, owner_name: owner, slug: code.toLocaleLowerCase("it") })
    .eq("code", originalCode);

  if (originalCode === code) return;
  const content = await supabase.from("competition_content").select("id,content");
  if (content.error) return;
  await Promise.all((content.data ?? []).map((row) => supabase
    .from("competition_content")
    .update({ content: replaceStringValue(row.content, originalCode, code) })
    .eq("id", row.id)));
}

function replaceStringValue(value: unknown, previous: string, next: string): unknown {
  if (value === previous) return next;
  if (Array.isArray(value)) return value.map((item) => replaceStringValue(item, previous, next));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => (
    [key === previous ? next : key, replaceStringValue(item, previous, next)]
  )));
}
