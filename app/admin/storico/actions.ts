"use server";

import { revalidatePath } from "next/cache";
import {
  isHistoryCompetitionName,
  manuallyEditableHistoryNames,
  normalizeHistoryEntries,
} from "@/lib/history-competitions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type HistorySaveState = { message?: string; error?: string };

export async function saveHistoryCompetition(
  _previousState: HistorySaveState,
  formData: FormData,
): Promise<HistorySaveState> {
  const category = String(formData.get("category") ?? "");
  if (!isHistoryCompetitionName(category)) return { error: "Categoria non valida." };
  if (!(manuallyEditableHistoryNames as readonly string[]).includes(category)) {
    return { error: "Questa categoria viene aggiornata automaticamente." };
  }

  let input: unknown;
  try {
    input = JSON.parse(String(formData.get("entries_json") ?? ""));
  } catch {
    return { error: "I dati inseriti non sono validi." };
  }
  const entries = normalizeHistoryEntries(category, input);
  if (!entries) return { error: "I dati inseriti non sono validi." };

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { error: "Supabase non configurato." };
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sessione scaduta." };

  const { error } = await supabase.rpc("replace_history_competition_content", {
    target_category: category,
    payload: entries,
  });
  if (error) return { error: error.message };

  revalidatePath("/storico");
  revalidatePath("/admin/storico");
  return { message: "Storico salvato." };
}
