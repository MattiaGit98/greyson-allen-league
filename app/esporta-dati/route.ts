import { loadPublicLeagueContext } from "@/lib/load-public-league-context";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const headers = { "Cache-Control": "no-store, max-age=0", "X-Content-Type-Options": "nosniff" };

export async function GET() {
  try {
    const context = await loadPublicLeagueContext();
    const document = {
      generated_at: new Date().toISOString(),
      teams: context.squadre,
      player_list: context.listone,
      regulation: context.regolamento,
    };
    return new Response(`${JSON.stringify(document, null, 2)}\n`, {
      headers: {
        ...headers,
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": 'attachment; filename="greyson-allen-league-data.json"',
      },
    });
  } catch {
    return Response.json({ error: "Dati della lega temporaneamente non disponibili." }, { status: 503, headers });
  }
}
