import type { Metadata } from "next";
import { SiteNavigation } from "@/components/site-navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { season as snapshotSeason } from "@/lib/demo-data";
import "./globals.css";

export const metadata: Metadata = {
  title: "Greyson Allen League",
  description: "Roster, contratti e movimenti della lega",
};

const phaseLabels: Record<string, string> = {
  offseason: "Offseason",
  auction: "Asta",
  regular_season: "Stagione",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const supabase = await createSupabaseServerClient();
  const response = supabase
    ? await supabase.from("seasons").select("name,status").eq("is_active", true).maybeSingle()
    : null;
  const seasonName = response?.data?.name ?? snapshotSeason.name;
  const phaseName = phaseLabels[response?.data?.status ?? snapshotSeason.phase] ?? "Offseason";
  return (
    <html lang="it">
      <body>
        <SiteNavigation seasonName={seasonName} phaseName={phaseName} />
        <main>{children}</main>
      </body>
    </html>
  );
}
