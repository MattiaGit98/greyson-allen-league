import { NextResponse } from "next/server";
import { requireActiveSeason } from "@/lib/active-season";
import { buildAuctionEmergencyWorkbook } from "@/lib/auction-emergency-workbook";
import { backupFileTimestamp } from "@/lib/backup-file";
import { loadEditableLeagueState } from "@/lib/league-state";
import { shouldCountTeamOptions } from "@/lib/season-time";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return new NextResponse("Supabase non configurato", { status: 503 });

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return new NextResponse("Accesso richiesto", { status: 401 });

  const { data: membership, error: membershipError } = await supabase
    .from("admin_users")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();
  if (membershipError) return new NextResponse("Autorizzazione non verificabile", { status: 503 });
  if (!membership) return new NextResponse("Account non autorizzato", { status: 403 });

  try {
    const [{ season }, state] = await Promise.all([requireActiveSeason(), loadEditableLeagueState()]);
    const exportedAt = new Date();
    const workbook = buildAuctionEmergencyWorkbook({
      state,
      seasonName: season.name,
      exportedAt,
      countTeamOptions: shouldCountTeamOptions(season.status, season.team_options_resolved),
    });
    const buffer = await workbook.xlsx.writeBuffer();
    return new NextResponse(buffer as BodyInit, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="asta-emergenza_${backupFileTimestamp(exportedAt)}.xlsx"`,
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Esportazione non riuscita.";
    return new NextResponse(message, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
