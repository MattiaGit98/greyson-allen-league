"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type CalendarSaveState = { message?: string; error?: string };

export async function saveCalendar(
  _previousState: CalendarSaveState,
  formData: FormData,
): Promise<CalendarSaveState> {
  let input: unknown;
  try {
    input = JSON.parse(String(formData.get("calendar_json") ?? "[]"));
  } catch {
    return { error: "Il calendario non è valido." };
  }

  if (!Array.isArray(input) || input.length > 300) {
    return { error: "Il calendario non è valido." };
  }

  const rows = input.map((row) => {
    if (!row || typeof row !== "object") return null;
    const value = row as Record<string, unknown>;
    return {
      event: typeof value.event === "string" ? value.event.slice(0, 500) : "",
      date: typeof value.date === "string" ? value.date.slice(0, 500) : "",
    };
  }).filter((row): row is { event: string; date: string } => Boolean(row));

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { error: "Supabase non configurato." };
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sessione scaduta." };

  const { error } = await supabase.rpc("replace_active_calendar", { payload: rows });
  if (error) return { error: error.message };

  revalidatePath("/calendario");
  revalidatePath("/admin/calendario");
  return { message: "Calendario salvato." };
}
