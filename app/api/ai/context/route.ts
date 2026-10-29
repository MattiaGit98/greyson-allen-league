import { loadPublicLeagueContext } from "@/lib/load-public-league-context";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const headers = { "Cache-Control": "no-store, max-age=0", "X-Content-Type-Options": "nosniff" };

export async function GET() {
  try {
    return Response.json(await loadPublicLeagueContext(), { headers });
  } catch {
    return Response.json({ error: "Dati della lega temporaneamente non disponibili." }, { status: 503, headers });
  }
}
