import { buildImportableLeagueBackup } from "@/lib/importable-league-backup";
import { backupFileTimestamp } from "@/lib/backup-file";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return textError("Supabase non configurato.", 503);

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return textError("Sessione scaduta.", 401);
  const membership = await supabase.from("admin_users").select("role").eq("user_id", user.id).maybeSingle();
  if (membership.error || !membership.data) return textError("Account non autorizzato.", 403);

  try {
    const backup = await buildImportableLeagueBackup(supabase);
    const exportedAt = new Date(backup.exportedAt);
    const filename = `greyson-allen-league_ripristino_${backupFileTimestamp(exportedAt)}.json`;
    const body = new Blob([JSON.stringify(backup, null, 2)], {
      type: "application/json; charset=utf-8",
    }).stream();
    return new Response(body, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Type": "application/json; charset=utf-8",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore sconosciuto";
    return textError(`Backup importabile non riuscito: ${message}`, 500);
  }
}

function textError(message: string, status: number) {
  return new Response(message, {
    status,
    headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" },
  });
}
