import { loadEditableLeagueState } from "@/lib/league-state";
import { calculateCapSpace, followingSeasonName, seasonEndYear } from "@/lib/season-time";
import { FreeAgentPanel } from "./free-agent-panel";
import { hasReachedMoment, leagueMomentFromSeason, operationWindows } from "@/lib/league-moments";
import { legalSlotDestinations, type ManagedRosterSlot } from "@/lib/slot-eligibility";
import { isUnresolvedTeamOption } from "@/lib/team-option-contract";
import { requireActiveSeason } from "@/lib/active-season";
import { roleMinimumChecksApply } from "@/lib/role-minimums";
import { contextualStretchYears } from "@/lib/stretch-provision";

export default async function FreeAgentPage({ searchParams }: { searchParams: Promise<{ error?: string; updated?: string }> }) {
  const query = await searchParams;
  const [activeSeason, leagueState] = await Promise.all([
    requireActiveSeason(),
    loadEditableLeagueState(),
  ]);
  const seasonName = activeSeason.season.name;
  const leagueMoment = leagueMomentFromSeason(activeSeason.season);
  const freeAgencyOpen = operationWindows.freeAgency(leagueMoment);
  const signAndTradeOpen = freeAgencyOpen && operationWindows.trades(leagueMoment);
  const officialRoles = new Map(leagueState.playerList.map((player) => [normalizePlayerName(player.name), player.role]));

  const players = leagueState.playerList.map((player, index) => {
    const activeEntry = leagueState.rosterEntries.find(
      (entry) => entry.name === player.name && entry.state === "active",
    );
    const qualifyingOffer = leagueState.qualifyingOfferRights.find((right) => right.playerName === player.name);
    return {
      name: player.name,
      role: player.role,
      listOrder: index + 1,
      rosterTeamCode: activeEntry?.teamCode ?? null,
      qualifyingTeamCode: activeEntry ? null : qualifyingOffer?.teamCode ?? null,
    };
  });

  const teamOptions = leagueState.teams.map((team) => ({
    code: team.code,
    twoWaySlotLimit: leagueState.twoWaySlotLimit,
    name: team.name,
    currentCost: 1000 - calculateCapSpace({
      entries: leagueState.rosterEntries.filter((entry) => entry.teamCode === team.code && (entry.state !== "active" || entry.slot !== "dpe")),
      seasonName,
      optionSeasonName: seasonName,
      countTeamOptions: true,
    }),
    futureSpaces: [1, 2].map((distance) => calculateCapSpace({
      entries: leagueState.rosterEntries.filter((entry) => entry.teamCode === team.code),
      seasonName: followingSeasonName(seasonName, distance),
      optionSeasonName: seasonName,
      countTeamOptions: true,
    })) as [number, number],
    cutPlayerNames: leagueState.rosterEntries
      .filter((entry) => entry.teamCode === team.code && entry.state === "cut")
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right, "it")),
    rosterPlayers: leagueState.rosterEntries
      .filter((entry) => entry.teamCode === team.code && entry.state === "active")
      .map((entry) => ({
        name: entry.name,
        role: (() => {
          const role = officialRoles.get(normalizePlayerName(entry.name));
          return role && role !== "X" ? role : null;
        })(),
        slot: entry.slot,
        cost: entry.cost,
        contract: entry.contract,
        cuttable: !isUnresolvedTeamOption(entry, leagueMoment, seasonName),
        stretchOptions: contextualStretchYears(entry, seasonEndYear(seasonName) ?? 0),
        charges: [0, 1, 2].map((distance) => 1000 - calculateCapSpace({
          entries: [entry],
          seasonName: followingSeasonName(seasonName, distance),
          optionSeasonName: seasonName,
          countTeamOptions: true,
        })) as [number, number, number],
        moveDestinations: entry.slot === "dpe" || isUnresolvedTeamOption(entry, leagueMoment, seasonName)
          ? []
          : legalSlotDestinations(
            { ...entry, slot: entry.slot as ManagedRosterSlot },
            seasonName,
            leagueMoment,
          ).filter((destination) => destination !== entry.slot),
      }))
      .sort((left, right) => left.name.localeCompare(right.name, "it")),
  }));

  return (
    <section className="section page-top admin-dashboard free-agent-admin-page">
      {query.updated && <p className="notice success">{query.updated}</p>}
      {query.error && <p className="notice error">Operazione non riuscita: {query.error}</p>}
      {!freeAgencyOpen && <p className="notice"><strong>Free agency chiusa.</strong> {hasReachedMoment(leagueMoment, "free_agency_end")
        ? "Riaprirà con l’avanzamento alla fase Riapertura free agency."
        : "Aprirà dopo la consegna dei contratti."}</p>}
      {freeAgencyOpen && leagueState.playerListStatus !== "published" && <p className="notice">Pubblica il listone ufficiale per rendere operative le firme dei free agent.</p>}
      <FreeAgentPanel
        phase={freeAgencyOpen ? "regular_season" : "closed"}
        enforceRoleMinimums={roleMinimumChecksApply(activeSeason.season.status, leagueMoment)}
        freeAgentThousandLimitApplies={!hasReachedMoment(leagueMoment, "free_agency_reopening")}
        seasonName={seasonName}
        leagueMoment={leagueMoment}
        signAndTradeOpen={signAndTradeOpen}
        listPublished={leagueState.playerListStatus === "published"}
        teams={teamOptions}
        players={players}
      />
    </section>
  );
}

function normalizePlayerName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("it-IT");
}
