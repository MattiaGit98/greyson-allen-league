"use client";

export async function downloadImportableBackup() {
  const response = await fetch("/admin/importa-dati/backup", {
    cache: "no-store",
    credentials: "same-origin",
  });
  if (!response.ok) throw new Error((await response.text()) || "Backup non riuscito.");

  const disposition = response.headers.get("content-disposition") ?? "";
  const filename = disposition.match(/filename="([^"]+)"/i)?.[1] ?? "greyson-allen-league_ripristino.json";
  const backup = await response.blob();
  const url = URL.createObjectURL(backup);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  if (!window.confirm("Confermi che il backup preventivo sia stato salvato sul dispositivo? Se il download è stato bloccato, annulla e riprova.")) {
    throw new Error("Backup preventivo non confermato. Nessuna operazione è stata avviata.");
  }
}
