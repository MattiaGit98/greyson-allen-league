import ExcelJS from "exceljs";
import { backupFileTimestamp } from "@/lib/backup-file";
import { loadHistoryCompetitionState } from "@/lib/history-competition-store";
import { loadEditableLeagueState } from "@/lib/league-state";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return textError("Supabase non configurato.", 503);

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return textError("Sessione scaduta.", 401);
  const membership = await supabase
    .from("admin_users")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();
  if (membership.error || !membership.data) return textError("Account non autorizzato.", 403);

  try {
    const [seasonResponse, leagueState, historyState] = await Promise.all([
      supabase
        .from("seasons")
        .select("name,status,team_options_resolved,trade_deadline_passed,timeline_moment,is_active")
        .eq("is_active", true)
        .maybeSingle(),
      loadEditableLeagueState(),
      loadHistoryCompetitionState(),
    ]);
    if (seasonResponse.error || !seasonResponse.data) {
      throw new Error(seasonResponse.error?.message ?? "Nessuna stagione attiva.");
    }
    const exportedAt = new Date();
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Greyson Allen League";
    workbook.created = exportedAt;

    const summary = workbook.addWorksheet("Riepilogo");
    summary.addRows([
      ["Greyson Allen League", "Backup precedente all’avanzamento della lega"],
      ["Esportato il", exportedAt.toISOString()],
      ["Contenuto", "Squadre e storico"],
    ]);
    styleSummary(summary);

    addRecordSheet(workbook, "squadre", recordRows(leagueState.teams));
    addRecordSheet(workbook, "roster", recordRows(leagueState.rosterEntries));
    addRecordSheet(workbook, "qualifying_offer", recordRows(leagueState.qualifyingOfferRights));
    addRecordSheet(workbook, "scelte", recordRows(leagueState.draftAssets));
    addRecordSheet(workbook, "stagione", recordRows([seasonResponse.data]));

    const resolvedHistory = Object.entries(historyState.competitions).flatMap(([category, entries]) => (
      entries.map((entry) => ({
        categoria: category,
        stagione: entry.season,
        contenuto: entry.content,
      }))
    ));
    addRecordSheet(workbook, "storico_risolto", resolvedHistory);

    const data = await workbook.xlsx.writeBuffer();
    const filename = `greyson-allen-league-backup_${backupFileTimestamp(exportedAt)}.xlsx`;
    return new Response(new Uint8Array(data), {
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore sconosciuto";
    return textError(`Backup Excel non riuscito: ${message}`, 500);
  }
}

function recordRows(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object")
    : [];
}

function addRecordSheet(workbook: ExcelJS.Workbook, requestedName: string, rows: Array<Record<string, unknown>>) {
  const name = uniqueSheetName(workbook, requestedName);
  const sheet = workbook.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  if (!columns.length) {
    sheet.addRow(["Nessun dato"]);
    sheet.getCell("A1").font = { bold: true, color: { argb: "FF183F34" } };
    return;
  }
  sheet.columns = columns.map((column) => ({ header: column, key: column, width: 16 }));
  rows.forEach((row) => sheet.addRow(Object.fromEntries(columns.map((column) => [column, excelValue(row[column])]))));
  sheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF183F34" } };
    cell.alignment = { vertical: "middle" };
  });
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  sheet.columns.forEach((column) => {
    let width = String(column.header ?? "").length + 2;
    column.eachCell?.({ includeEmpty: false }, (cell) => { width = Math.max(width, String(cell.value ?? "").length + 2); });
    column.width = Math.min(45, Math.max(10, width));
  });
}

function excelValue(value: unknown): string | number | boolean {
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function uniqueSheetName(workbook: ExcelJS.Workbook, requestedName: string) {
  const base = requestedName.replace(/[\\/*?:[\]]/g, "_").slice(0, 31) || "Dati";
  let name = base;
  let suffix = 2;
  while (workbook.getWorksheet(name)) {
    const tail = `_${suffix}`;
    name = `${base.slice(0, 31 - tail.length)}${tail}`;
    suffix += 1;
  }
  return name;
}

function styleSummary(sheet: ExcelJS.Worksheet) {
  sheet.columns = [{ width: 22 }, { width: 70 }];
  sheet.getColumn(1).font = { bold: true, color: { argb: "FF183F34" } };
  sheet.getRow(1).height = 28;
  sheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF183F34" } };
  });
}

function textError(message: string, status: number) {
  return new Response(message, {
    status,
    headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" },
  });
}
