"use client";

import { Upload } from "tus-js-client";
import {
  backupImportBucket,
  backupUploadChunkBytes,
  createBackupImportPath,
} from "./backup-import-storage";
import { createSupabaseBrowserClient } from "./supabase/browser";

export type BackupUploadProgress = (uploadedBytes: number, totalBytes: number) => void;
export type BackupUploadPrepared = (storagePath: string) => void;

export async function uploadImportableBackup(
  file: File,
  onProgress?: BackupUploadProgress,
  onPrepared?: BackupUploadPrepared,
): Promise<string> {
  const supabase = createSupabaseBrowserClient();
  if (!supabase) throw new Error("Supabase non configurato.");

  const [{ data: userData, error: userError }, { data: sessionData, error: sessionError }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.auth.getSession(),
  ]);
  const user = userData.user;
  const accessToken = sessionData.session?.access_token;
  if (userError || sessionError || !user || !accessToken) {
    throw new Error("Sessione scaduta. Accedi nuovamente all’area amministrativa.");
  }

  const storagePath = createBackupImportPath(user.id, crypto.randomUUID());
  onPrepared?.(storagePath);
  const endpoint = storageResumableUploadEndpoint();

  await new Promise<void>((resolve, reject) => {
    const upload = new Upload(file, {
      endpoint,
      retryDelays: [0, 3_000, 5_000, 10_000, 20_000],
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-upsert": "false",
      },
      metadata: {
        bucketName: backupImportBucket,
        objectName: storagePath,
        contentType: "application/json",
        cacheControl: "no-cache",
      },
      chunkSize: backupUploadChunkBytes,
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      storeFingerprintForResuming: false,
      onProgress,
      async onBeforeRequest(request) {
        const { data, error } = await supabase.auth.getSession();
        const freshAccessToken = data.session?.access_token;
        if (error || !freshAccessToken) throw new Error("Sessione scaduta durante il caricamento.");
        request.setHeader("authorization", `Bearer ${freshAccessToken}`);
      },
      onError: (cause) => reject(new Error(`Caricamento del backup non riuscito: ${cause.message}`)),
      onSuccess: () => resolve(),
    });
    upload.start();
  });

  return storagePath;
}

export async function removeUploadedImportableBackup(storagePath: string) {
  const supabase = createSupabaseBrowserClient();
  if (!supabase) throw new Error("Supabase non configurato.");
  const { error } = await supabase.storage.from(backupImportBucket).remove([storagePath]);
  if (error) throw new Error(error.message);
}

export function storageResumableUploadEndpoint(
  rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL,
) {
  if (!rawUrl) throw new Error("Supabase non configurato.");
  const url = new URL(rawUrl);
  if (url.hostname.endsWith(".supabase.co")) {
    const projectReference = url.hostname.slice(0, -".supabase.co".length);
    return `${url.protocol}//${projectReference}.storage.supabase.co/storage/v1/upload/resumable`;
  }
  return `${url.origin}/storage/v1/upload/resumable`;
}
