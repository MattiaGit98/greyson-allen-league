import { loadEditableLeagueState } from "@/lib/league-state";
import { calculateCapSpace } from "@/lib/season-time";
import { FreeAgentPanel } from "./free-agent-panel";
import { hasReachedMoment, leagueMomentFromSeason, operationWindows, tradeDeadlineHasPassed } from "@/lib/league-moments";
import { legalPromotionDestinations, type ManagedRosterSlot } from "@/lib/slot-eligibility";
import { isUnresolvedTeamOption } from "@/lib/team-option-contract";
import { requireActiveSeason } from "@/lib/active-season";
import { roleMinimumChecksApply } from "@/lib/role-minimums";

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
    const cutTeamCodes = leagueState.rosterEntries
      .filter((entry) => entry.name === player.name && entry.state === "cut")
      .map((entry) => entry.teamCode);
    const buyoutApplied = leagueState.rosterEntries.some((entry) => (
      normalizePlayerName(entry.name) === normalizePlayerName(player.name)
      && entry.state === "cut"
      && entry.buyoutApplied === true
    ));

    return {
      name: player.name,
      role: player.role,
      rookie: player.rookie,
      under23: player.under23,
      listOrder: index + 1,
      rosterTeamCode: activeEntry?.teamCode ?? null,
      qualifyingTeamCode: activeEntry ? null : qualifyingOffer?.teamCode ?? null,
      cutTeamCodes,
      buyoutApplied,
    };
  });

  const teamOptions = leagueState.teams.map((team) => ({
    code: team.code,
    name: team.name,
    currentCost: 1000 - calculateCapSpace({
      entries: leagueState.rosterEntries.filter((entry) => entry.teamCode === team.code && (entry.state !== "active" || entry.slot !== "dpe")),
      seasonName,
      optionSeasonName: seasonName,
      countTeamOptions: true,
    }),
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
        cuttable: !isUnresolvedTeamOption(entry, leagueMoment),
        promotionDestinations: entry.slot === "dpe" || isUnresolvedTeamOption(entry, leagueMoment)
          ? []
          : legalPromotionDestinations(
            { ...entry, slot: entry.slot as ManagedRosterSlot },
            seasonName,
            leagueMoment,
          ),
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
        seasonName={seasonName}
        tradeDeadlinePassed={tradeDeadlineHasPassed(leagueMoment)}
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
