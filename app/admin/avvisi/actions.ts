"use server";

import { revalidatePath } from "next/cache";
import { loadEditableLeagueState } from "@/lib/league-state";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type PublicNoticeSaveState = { message?: string; error?: string };

export async function savePublicNotice(
  _previousState: PublicNoticeSaveState,
  formData: FormData,
): Promise<PublicNoticeSaveState> {
  const publicNotice = formData.get("clear_notice") === "true"
    ? ""
    : String(formData.get("public_notice") ?? "").trim();
  if (publicNotice.length > 2000) return { error: "L'avviso può contenere al massimo 2.000 caratteri." };

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { error: "Supabase non configurato." };
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sessione scaduta." };

  const state = await loadEditableLeagueState();
  const response = await supabase.rpc("replace_league_state", {
    state_payload: { ...state, publicNotice },
  });
  if (response.error) return { error: response.error.message };

  ["/", "/admin", "/admin/avvisi"].forEach((path) => revalidatePath(path));
  return { message: publicNotice ? "Avviso pubblicato." : "Avviso svuotato." };
}
