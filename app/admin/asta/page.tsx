import { AuctionPanel } from "./auction-panel";
import { loadEditableLeagueState } from "@/lib/league-state";
import { calculateCapSpace, followingSeasonName, shouldCountTeamOptions } from "@/lib/season-time";
import { leagueMomentFromSeason, operationWindows } from "@/lib/league-moments";
import { requireActiveSeason } from "@/lib/active-season";

export default async function AuctionAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; updated?: string }>;
}) {
  const query = await searchParams;
  const [activeSeason, leagueState] = await Promise.all([
    requireActiveSeason(),
    loadEditableLeagueState(),
  ]);
  const seasonName = activeSeason.season.name;
  const phase = activeSeason.season.status;
  const leagueMoment = leagueMomentFromSeason(activeSeason.season);
  const auctionOpen = operationWindows.auction(leagueMoment) && leagueState.playerListStatus === "published";
  const currentDraftYear = Number(seasonName.slice(0, 4));
  const pendingDraftPicks = Number.isInteger(currentDraftYear)
    ? leagueState.draftAssets.filter((asset) => asset.year === currentDraftYear).length
    : 0;
  const countTeamOptions = shouldCountTeamOptions(
    phase as "offseason" | "auction" | "regular_season",
    activeSeason.season.team_options_resolved,
  );
  const capSeasons = [seasonName, followingSeasonName(seasonName), followingSeasonName(seasonName, 2)];

  const teams = leagueState.teams.map((team) => {
    const entries = leagueState.rosterEntries.filter((entry) => entry.teamCode === team.code);
    const active = entries.filter((entry) => entry.state === "active");
    const spaces = capSeasons.map((targetSeason, index) => calculateCapSpace({
      entries: entries.filter((entry) => index !== 0 || entry.state !== "active" || entry.slot !== "dpe"),
      seasonName: targetSeason,
      optionSeasonName: seasonName,
      countTeamOptions,
    }));
    return {
      code: team.code,
      name: team.name,
      spaces: spaces as [number, number, number],
      slots: {
        regular: active.filter((entry) => entry.slot === "regular").length,
        two_way: active.filter((entry) => entry.slot === "two_way").length,
        g_league: active.filter((entry) => entry.slot === "g_league").length,
      },
      players: active
        .filter((entry) => entry.slot !== "dpe")
        .map((entry) => ({
          name: entry.name,
          role: entry.role ?? null,
          cost: entry.cost,
          contract: entry.contract,
          slot: entry.slot as "regular" | "two_way" | "g_league",
        }))
        .sort((left, right) => left.name.localeCompare(right.name, "it")),
    };
  });

  const rows = leagueState.playerList.map((player, index) => {
    const roster = leagueState.rosterEntries.find((entry) => entry.name === player.name && entry.state === "active");
    const qualifying = roster
      ? undefined
      : leagueState.qualifyingOfferRights.find((right) => right.playerName === player.name);
    return {
      ...player,
      listOrder: index + 1,
      roster: roster ? {
        teamCode: roster.teamCode,
        cost: roster.cost,
        contract: roster.contract,
        slot: roster.slot,
        auctionAcquisition: roster.auctionAcquisition,
        charges: capSeasons.map((targetSeason) => 1000 - calculateCapSpace({
          entries: [roster],
          seasonName: targetSeason,
          optionSeasonName: seasonName,
          countTeamOptions,
        })) as [number, number, number],
      } : null,
      qualifying: qualifying ? {
        teamCode: qualifying.teamCode,
        amount: qualifying.qualifyingAmount,
      } : null,
    };
  });

  return (
    <section className="section page-top admin-dashboard auction-admin-page">
      {query.updated && <p className="notice success">{query.updated}</p>}
      {query.error && <p className="notice error">Operazione non riuscita: {query.error}</p>}
      {leagueState.playerListStatus !== "published" && <p className="notice">Pubblica il listone ufficiale per rendere operativo il pannello asta.</p>}
      {leagueState.playerListStatus === "published" && !auctionOpen && <p className="notice">Il pannello è operativo in Offseason — dopo le T.O.</p>}
      {auctionOpen && pendingDraftPicks > 0 && (
        <p className="notice error">Concludi prima il Draft {currentDraftYear}: restano {pendingDraftPicks} scelte da assegnare. Il pannello resta consultabile, ma tutte le operazioni sono bloccate.</p>
      )}
      <AuctionPanel rows={rows} teams={teams} phase={auctionOpen ? "auction" : "closed"} seasonName={seasonName} pendingDraftPicks={pendingDraftPicks} />
    </section>
  );
}
