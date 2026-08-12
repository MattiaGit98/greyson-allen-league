import type { Metadata } from "next";
import { SiteNavigation } from "@/components/site-navigation";
import { LivePageRefresh } from "@/components/live-page-refresh";
import { displayedSeasonName } from "@/lib/season-time";
import { leagueMomentFromSeason, publicPhaseLabel } from "@/lib/league-moments";
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
  const phaseName = leagueMoment ? publicPhaseLabel(leagueMoment) : "Stato non disponibile";
  return (
    <html lang="it">
      <body>
        <SiteNavigation seasonName={seasonName} phaseName={phaseName} />
        <main>{children}</main>
        <LivePageRefresh />
      </body>
    </html>
  );
}
