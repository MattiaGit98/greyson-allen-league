import { revalidatePath } from "next/cache";
import { backupImportBucket } from "@/lib/backup-import-storage";
import {
  assertBackupRestoreAdministrator,
  restoreUploadedImportableBackup,
  UploadedBackupRestoreError,
} from "@/lib/importable-backup-storage-restore";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const maximumRequestBytes = 8 * 1024;

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return jsonError("Supabase non configurato.", 503);

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError) return jsonError("Verifica della sessione non riuscita.", 503);

  const membership = user
    ? await supabase.from("admin_users").select("role").eq("user_id", user.id).maybeSingle()
    : { data: null, error: null };
  if (membership.error) return jsonError("Verifica dell’account amministratore non riuscita.", 503);

  try {
    assertBackupRestoreAdministrator(user?.id ?? null, Boolean(membership.data));
  } catch (cause) {
    return restoreErrorResponse(cause);
  }

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > maximumRequestBytes) {
    return jsonError("Richiesta di ripristino non valida.", 413);
  }

  let storagePath: string;
  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > maximumRequestBytes) {
      return jsonError("Richiesta di ripristino non valida.", 413);
    }
    const body = JSON.parse(text) as unknown;
    if (!isRecord(body) || typeof body.storagePath !== "string") {
      return jsonError("Percorso del backup temporaneo mancante.", 400);
    }
    storagePath = body.storagePath;
  } catch {
    return jsonError("Richiesta di ripristino non valida.", 400);
  }

  try {
    const result = await restoreUploadedImportableBackup(user!.id, storagePath, {
      storage: {
        async download(path) {
          const response = await supabase.storage.from(backupImportBucket).download(
            path,
            undefined,
            { cache: "no-store" },
          );
          if (response.error || !response.data) {
            throw new Error(response.error?.message ?? "File non disponibile.");
          }
          return response.data;
        },
        async remove(path) {
          const response = await supabase.storage.from(backupImportBucket).remove([path]);
          if (response.error) throw new Error(response.error.message);
        },
      },
      async restore(backup) {
        const response = await supabase.rpc("restore_importable_league_backup", {
          backup_document: backup,
        });
        if (response.error) throw new Error(response.error.message);
      },
    });

    revalidateLeaguePages();
    return Response.json({
      ok: true,
      seasonName: result.backup.payload.activeSeason.name,
      timelineMoment: result.backup.payload.activeSeason.timeline_moment,
      exportedAt: result.backup.exportedAt,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (cause) {
    if (cause instanceof UploadedBackupRestoreError && cause.restoreCompleted) {
      revalidateLeaguePages();
    }
    return restoreErrorResponse(cause);
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

function restoreErrorResponse(cause: unknown) {
  const error = cause instanceof UploadedBackupRestoreError
    ? cause
    : new UploadedBackupRestoreError("Ripristino non riuscito.", { status: 500, cause });
  return Response.json({
    ok: false,
    error: error.restoreCompleted
      ? error.message
      : `Ripristino non riuscito: ${error.message} Nessun dato è stato modificato.`,
    restoreCompleted: error.restoreCompleted,
    cleanupFailed: error.cleanupFailed,
  }, {
    status: error.status,
    headers: { "Cache-Control": "no-store" },
  });
}

function jsonError(message: string, status: number) {
  return Response.json({ ok: false, error: message }, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
