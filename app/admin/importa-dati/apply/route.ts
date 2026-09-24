import { revalidatePath } from "next/cache";
import { parseImportableLeagueBackup } from "@/lib/importable-league-backup";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const maximumBackupBytes = 100 * 1024 * 1024;

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return jsonError("Supabase non configurato.", 503);

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return jsonError("Sessione scaduta.", 401);
  const membership = await supabase.from("admin_users").select("role").eq("user_id", user.id).maybeSingle();
  if (membership.error || !membership.data) return jsonError("Account non autorizzato.", 403);

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > maximumBackupBytes) return jsonError("Il file supera il limite di 100 MB.", 413);

  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > maximumBackupBytes) {
      return jsonError("Il file supera il limite di 100 MB.", 413);
    }
    const backup = parseImportableLeagueBackup(JSON.parse(text));
    const response = await supabase.rpc("restore_importable_league_backup", {
      backup_document: backup,
    });
    if (response.error) throw new Error(response.error.message);

    revalidateLeaguePages();
    return Response.json({
      ok: true,
      seasonName: backup.payload.activeSeason.name,
      timelineMoment: backup.payload.activeSeason.timeline_moment,
      exportedAt: backup.exportedAt,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "File non valido.";
    return jsonError(`Ripristino non riuscito: ${message}`, 400);
  }
}

function revalidateLeaguePages() {
  [
    "/", "/squadre", "/giocatori", "/movimenti", "/calendario", "/competizioni", "/storico",
    "/admin", "/admin/impostazioni", "/admin/importa-dati", "/admin/movimenti", "/admin/calendario",
    "/admin/contenuti", "/admin/storico", "/admin/listone", "/admin/asta", "/admin/backup",
    "/admin/draft", "/admin/posizioni-draft", "/admin/free-agent", "/admin/scambi",
    "/admin/team-option", "/admin/contratti", "/admin/slot", "/admin/altre-operazioni",
    "/admin/avvisi", "/admin/rettifiche-roster", "/admin/squadre-proprietari",
  ].forEach((route) => revalidatePath(route));
}

function jsonError(message: string, status: number) {
  return Response.json({ ok: false, error: message }, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
