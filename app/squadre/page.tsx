import { TeamAccordion } from "./team-accordion";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { draftAssets, qualifyingOfferRights, rosterEntries, season, teams } from "@/lib/demo-data";

export default async function TeamsPage({
  searchParams,
}: {
  searchParams: Promise<{ team?: string }>;
}) {
  const query = await searchParams;
  const supabase = await createSupabaseServerClient();
  const response = supabase
    ? await supabase.from("seasons").select("status").eq("is_active", true).maybeSingle()
    : null;
  const phase = response?.data?.status ?? season.phase;

  return (
    <section className="section teams-page">
      <TeamAccordion
        teams={teams}
        rosterEntries={rosterEntries}
        draftAssets={draftAssets}
        qualifyingOfferRights={qualifyingOfferRights}
        initialTeam={query.team?.toUpperCase()}
        showQualifyingOffers={phase === "offseason"}
      />
    </section>
  );
}
