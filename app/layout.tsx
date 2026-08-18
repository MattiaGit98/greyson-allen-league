import type { Metadata } from "next";
import { SiteNavigation } from "@/components/site-navigation";
import { LivePageRefresh } from "@/components/live-page-refresh";
import { RouteScrollReset } from "@/components/route-scroll-reset";
import { displayedSeasonName } from "@/lib/season-time";
import { leagueMomentFromSeason, publicPhaseLabel } from "@/lib/league-moments";
import { loadActiveSeason } from "@/lib/active-season";
import { normalizePhaseDates } from "@/lib/phase-calendar";
import "./globals.css";

export const metadata: Metadata = {
  title: "Greyson Allen League",
  description: "Roster, contratti e movimenti della lega",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const { season } = await loadActiveSeason();
  const seasonName = season ? displayedSeasonName(season.name) : "—";
  const leagueMoment = season ? leagueMomentFromSeason(season) : null;
  const todayParts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(new Date()).reduce((value, part) => ({ ...value, [part.type]: part.value }), {} as Record<string, string>);
  const today = `${todayParts.year}-${todayParts.month}-${todayParts.day}`;
  const phaseName = leagueMoment ? publicPhaseLabel(leagueMoment, normalizePhaseDates(season?.phase_dates).postseason_start, today) : "Stato non disponibile";
  return (
    <html lang="it">
      <body>
        <SiteNavigation seasonName={seasonName} phaseName={phaseName} />
        <main>{children}</main>
        <RouteScrollReset />
        <LivePageRefresh />
      </body>
    </html>
  );
}
