import { requireActiveSeason } from "@/lib/active-season";
import { loadEditableLeagueState } from "@/lib/league-state";
import { buildPublicLeagueContext } from "@/lib/public-league-context";
import { loadRegulation } from "@/lib/regulation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const headers = { "Cache-Control": "no-store, max-age=0", "X-Content-Type-Options": "nosniff" };

export async function GET() {
  try {
    const [activeSeason, state, articles] = await Promise.all([
      requireActiveSeason(),
      loadEditableLeagueState(),
      loadRegulation(),
    ]);
    return Response.json(buildPublicLeagueContext(state, activeSeason.season, articles), { headers });
  } catch {
    return Response.json({ error: "Dati della lega temporaneamente non disponibili." }, { status: 503, headers });
  }
}
