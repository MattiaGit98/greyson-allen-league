import type { Metadata } from "next";
import { SiteNavigation } from "@/components/site-navigation";
import { displayedSeasonName } from "@/lib/season-time";
import { leagueMomentFromSeason, macroPhaseForMoment, operationWindows } from "@/lib/league-moments";
import { loadActiveSeason } from "@/lib/active-season";
import "./globals.css";

export const metadata: Metadata = {
  title: "Greyson Allen League",
  description: "Roster, contratti e movimenti della lega",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const { season } = await loadActiveSeason();
  const seasonName = season ? displayedSeasonName(season.name) : "—";
  const leagueMoment = season ? leagueMomentFromSeason(season) : null;
  const phaseName = leagueMoment ? (macroPhaseForMoment(leagueMoment) === "offseason" ? "Offseason" : "Stagione") : "Stato non disponibile";
  const auctionOpen = leagueMoment ? operationWindows.auction(leagueMoment) : false;
  return (
    <html lang="it">
      <body>
        <SiteNavigation seasonName={seasonName} phaseName={phaseName} auctionOpen={auctionOpen} />
        <main>{children}</main>
      </body>
    </html>
  );
}
