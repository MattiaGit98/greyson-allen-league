"use server";

import { revalidatePath } from "next/cache";
import {
  competitionNames,
  normalizeCompetitionContent,
  type CompetitionName,
} from "@/lib/competitions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ContentSaveState = { message?: string; error?: string };

export async function saveCompetitionContent(
  _previousState: ContentSaveState,
  formData: FormData,
): Promise<ContentSaveState> {
  const competitionName = String(formData.get("competition_name") ?? "");
  if (!(competitionNames as readonly string[]).includes(competitionName)) {
    return { error: "Competizione non valida." };
  }

  let input: unknown;
  try {
    input = JSON.parse(String(formData.get("content_json") ?? ""));
  } catch {
    return { error: "I dati inseriti non sono validi." };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { error: "Supabase non configurato." };
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sessione scaduta." };

  const teamResponse = await supabase.from("teams").select("code").eq("active", true);
  if (teamResponse.error) return { error: teamResponse.error.message };
  const content = normalizeCompetitionContent(
    competitionName as CompetitionName,
    input,
    (teamResponse.data ?? []).map((team) => team.code),
  );
  if (!content) return { error: "I dati inseriti non sono validi." };

  const { error } = await supabase.rpc("replace_active_competition_content", {
    target_name: competitionName,
    payload: content,
  });
  if (error) return { error: error.message };

  revalidatePath("/competizioni");
  revalidatePath("/");
  revalidatePath("/admin/contenuti");
  return { message: "Modifiche salvate." };
}
