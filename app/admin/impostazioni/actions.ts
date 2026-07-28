"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function changeLeaguePhase(formData: FormData) {
  const status = String(formData.get("status") ?? "");
  if (!["offseason", "auction", "regular_season"].includes(status)) {
    redirect("/admin/impostazioni?error=fase-non-valida");
  }
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/admin/impostazioni?error=supabase-non-configurato");
  const { error } = await supabase.rpc("set_active_season_status", { requested_status: status });
  if (error) redirect(`/admin/impostazioni?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/");
  revalidatePath("/admin/impostazioni");
  redirect("/admin/impostazioni?updated=1");
}
