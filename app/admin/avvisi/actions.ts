"use server";

import { revalidatePath } from "next/cache";
import { loadEditableLeagueState } from "@/lib/league-state";
import { replaceLeagueStateIfUnchanged } from "@/lib/league-state-persistence";
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
  const response = await replaceLeagueStateIfUnchanged(
    supabase,
    state,
    { ...state, publicNotice },
    publicNotice ? "Pubblicazione dell'avviso in homepage" : "Rimozione dell'avviso dalla homepage",
  );
  if (response.error) return { error: response.error.message };

  ["/", "/admin", "/admin/avvisi"].forEach((path) => revalidatePath(path));
  return { message: publicNotice ? "Avviso pubblicato." : "Avviso svuotato." };
}
