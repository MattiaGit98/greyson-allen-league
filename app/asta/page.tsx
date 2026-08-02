import { redirect } from "next/navigation";
import { leagueMomentFromSeason, operationWindows } from "@/lib/league-moments";
import { requireActiveSeason } from "@/lib/active-season";

export default async function AuctionPage() {
  const activeSeason = await requireActiveSeason();
  const leagueMoment = leagueMomentFromSeason(activeSeason.season);
  if (!operationWindows.auction(leagueMoment)) redirect("/squadre");

  return <section className="auction-page"><p className="eyebrow">Asta live</p><h1>Asta</h1><div className="auction-stage"><span>ULTIMO ACQUISTO</span><strong>—</strong><small>Nessuna asta in corso</small></div></section>;
}
