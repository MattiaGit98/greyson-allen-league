import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return new NextResponse("Supabase non configurato", { status: 503 });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Accesso richiesto", { status: 401 });

  const { data: membership } = await supabase
    .from("admin_users")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership) return new NextResponse("Account non autorizzato", { status: 403 });

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Greyson Allen League";
  workbook.created = new Date();

  const instructions = workbook.addWorksheet("Istruzioni", {
    views: [{ showGridLines: false }],
  });
  instructions.columns = [{ width: 105 }];
  instructions.getCell("A1").value = "MODELLO LISTONE — GREYSON ALLEN LEAGUE";
  instructions.getCell("A1").font = { bold: true, size: 18, color: { argb: "FF183F34" } };
  instructions.getCell("A3").value = "Compila il foglio “Listone” rispettando l’ordine ufficiale dei giocatori.";
  instructions.getCell("A4").value = "Non modificare i nomi delle colonne e non lasciare righe vuote tra i giocatori.";
  instructions.getCell("A5").value = "Ruolo: seleziona G, A, C oppure X. Usa X per chi non ha un ruolo ufficiale Dunkest: non verrÃ  contato nei minimi di ruolo.";
  instructions.getCell("A6").value = "La squadra reale resterà quella indicata in questo file anche in caso di trasferimenti successivi.";
  instructions.getCell("A7").value = "Lo stato fantasy non va inserito: verrà calcolato automaticamente da roster e Q.O.";

  const sheet = workbook.addWorksheet("Listone", {
    views: [{ state: "frozen", ySplit: 1, showGridLines: false }],
  });
  sheet.columns = [
    { header: "Ordine", key: "order", width: 11 },
    { header: "Nome", key: "name", width: 34 },
    { header: "Ruolo", key: "role", width: 13 },
    { header: "Squadra reale", key: "realTeam", width: 20 },
    { header: "Rookie", key: "rookie", width: 13 },
    { header: "U23", key: "under23", width: 13 },
  ];

  const header = sheet.getRow(1);
  header.height = 27;
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.alignment = { vertical: "middle", horizontal: "left" };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF183F34" } };

  for (let rowNumber = 2; rowNumber <= 601; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    row.getCell(1).value = rowNumber - 1;
    row.getCell(1).font = { color: { argb: "FF777D76" } };
    row.getCell(3).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: ['"G,A,C,X"'],
      showErrorMessage: true,
      errorTitle: "Ruolo non valido",
      error: "Seleziona G, A, C oppure X.",
    };
    for (const column of [5, 6]) {
      row.getCell(column).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: ['"SI,NO"'],
        showErrorMessage: true,
        errorTitle: "Valore non valido",
        error: "Seleziona SI oppure NO.",
      };
    }
    if (rowNumber % 2 === 0) {
      row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F4EF" } };
    }
  }

  sheet.autoFilter = { from: "A1", to: "F601" };
  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(buffer as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="modello-listone-dunkest.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
