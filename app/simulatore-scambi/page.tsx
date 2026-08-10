import { TradeBuilder } from "@/app/admin/scambi/trade-builder";
import { requireActiveSeason } from "@/lib/active-season";
import { nextDraftYear } from "@/lib/draft-positions";
import { fourthDraftVirtualPicks } from "@/lib/future-draft-picks";
import { loadEditableLeagueState } from "@/lib/league-state";
import { hasReachedMoment, leagueMomentFromSeason, operationWindows, tradeDeadlineHasPassed } from "@/lib/league-moments";
import { calculateCapSpace, followingSeasonName, shouldCountTeamOptions } from "@/lib/season-time";
import { legalPromotionDestinations, legalSlotDestinations, type ManagedRosterSlot } from "@/lib/slot-eligibility";
import { isUnresolvedTeamOption } from "@/lib/team-option-contract";
import { existingTradeClauseAgreements, tradePickId, tradePlayerId, tradeQualifyingOfferId } from "@/lib/trade-state";

export default async function TradeSimulatorPage() {
  const [activeSeason, leagueState] = await Promise.all([
    requireActiveSeason(),
    loadEditableLeagueState(),
  ]);
  const seasonName = activeSeason.season.name;
  const phase = activeSeason.season.status;
  const leagueMoment = leagueMomentFromSeason(activeSeason.season);
  const countTeamOptions = shouldCountTeamOptions(
    phase,
    activeSeason.season.team_options_resolved,
  );
  const capSeasons = [
    seasonName,
    followingSeasonName(seasonName),
    followingSeasonName(seasonName, 2),
  ];
  const officialRoles = new Map(leagueState.playerList.map((player) => [normalizePlayerName(player.name), player.role]));
  const firstTradableDraft = nextDraftYear(leagueState.draftAssets);
  const tradableDraftYears = firstTradableDraft === null
    ? []
    : [firstTradableDraft, firstTradableDraft + 1, firstTradableDraft + 2];
  const protectionCounterpartyDraftYears = firstTradableDraft === null
    ? []
    : [...tradableDraftYears, firstTradableDraft + 3];
  const existingClauseAgreements = existingTradeClauseAgreements(
    leagueState.draftAssets,
    leagueState.teams.map((team) => team.code),
  );
  const virtualFourthDraftPicks = fourthDraftVirtualPicks(leagueState.draftAssets, leagueState.teams);

  const teams = leagueState.teams.map((team) => {
    const teamEntries = leagueState.rosterEntries.filter((entry) => entry.teamCode === team.code);
    const scheduledCost = (entry: (typeof teamEntries)[number], targetSeason: string) => (
      1000 - calculateCapSpace({
        entries: [entry],
        seasonName: targetSeason,
        optionSeasonName: seasonName,
        countTeamOptions,
      })
    );
    return {
      code: team.code,
      name: team.name,
      currentSeasonName: seasonName,
      currentCost: 1000 - calculateCapSpace({
        entries: teamEntries.filter((entry) => entry.state !== "active" || entry.slot !== "dpe"),
        seasonName,
        optionSeasonName: seasonName,
        countTeamOptions,
      }),
      futureCosts: capSeasons.slice(1).map((futureSeason) => ({
        seasonName: futureSeason,
        currentCost: 1000 - calculateCapSpace({
          entries: teamEntries,
          seasonName: futureSeason,
          optionSeasonName: seasonName,
          countTeamOptions,
        }),
      })),
      cutPlayerNames: teamEntries
        .filter((entry) => entry.state === "cut")
        .map((entry) => entry.name)
        .sort((left, right) => left.localeCompare(right, "it")),
      qualifyingOffers: leagueState.qualifyingOfferRights
        .filter((right) => right.teamCode === team.code)
        .map((right) => ({
          id: tradeQualifyingOfferId(team.code, right.playerName),
          playerName: right.playerName,
          amount: right.qualifyingAmount,
        }))
        .sort((left, right) => left.playerName.localeCompare(right.playerName, "it")),
      players: teamEntries
        .filter((entry) => entry.state === "active")
        .map((entry) => ({
          id: tradePlayerId(team.code, entry.name),
          name: entry.name,
          cost: entry.cost,
          capCost: scheduledCost(entry, seasonName),
          futureCapCosts: Object.fromEntries(capSeasons.slice(1).map((futureSeason) => (
            [futureSeason, scheduledCost(entry, futureSeason)]
          ))),
          contract: entry.contract,
          role: (() => {
            const role = officialRoles.get(normalizePlayerName(entry.name));
            return role && role !== "X" ? role : null;
          })(),
          slot: entry.slot,
          cuttable: !isUnresolvedTeamOption(entry, leagueMoment),
          promotionDestinations: entry.slot === "dpe"
            ? []
            : legalPromotionDestinations(
              { ...entry, slot: entry.slot as ManagedRosterSlot },
              seasonName,
              leagueMoment,
            ),
          allowedDestinations: entry.slot === "dpe"
            ? ["dpe" as const]
            : orderCurrentSlotFirst(
              entry.slot,
              legalSlotDestinations(
                { ...entry, slot: entry.slot as ManagedRosterSlot },
                seasonName,
                leagueMoment,
              ),
            ),
        }))
        .sort((left, right) => left.name.localeCompare(right.name, "it")),
      picks: [
        ...leagueState.draftAssets.map((pick, index) => ({ pick, id: tradePickId(pick.teamCode, index, pick), virtual: false })),
        ...virtualFourthDraftPicks.map(({ id, virtual: _virtual, ...pick }) => ({ pick, id, virtual: true })),
      ]
        .filter(({ pick }) => pick.teamCode === team.code)
        .filter(({ pick }) => protectionCounterpartyDraftYears.includes(pick.year))
        .map(({ pick, id, virtual }) => ({
          id,
          label: pick.label,
          round: pick.round,
          year: pick.year,
          originOrOverall: pick.originOrOverall,
          hasExistingCondition: Boolean(pick.clauseResolution) || /protetta|swap|contropartita|c\.p\./i.test(pick.label),
          tradable: tradableDraftYears.includes(pick.year),
          virtual,
        }))
        .sort((left, right) => (
          left.year - right.year
          || left.round.localeCompare(right.round, "it")
          || String(left.originOrOverall).localeCompare(String(right.originOrOverall), "it", { numeric: true })
        )),
    };
  });

  return (
    <section className="section page-top workbook-page trade-simulator-page">
      <header className="trade-simulator-heading">
        <span>Strumento pubblico</span>
        <h1>Simulatore scambi</h1>
        <p>Compila una proposta: non verrà salvata né inviata alla lega.</p>
      </header>
      <TradeBuilder
        mode="simulator"
        phase={phase}
        tradeDeadlinePassed={tradeDeadlineHasPassed(leagueMoment)}
        tradesOpen={operationWindows.trades(leagueMoment)}
        qualifyingOfferTransfersOpen={!hasReachedMoment(leagueMoment, "auction_completed")}
        enforceOffseasonCap={!hasReachedMoment(leagueMoment, "auction_start")}
        tradableDraftYears={tradableDraftYears}
        protectionCounterpartyDraftYears={protectionCounterpartyDraftYears}
        existingClauseAgreements={existingClauseAgreements}
        signAndTrade={null}
        teams={teams}
      />
    </section>
  );
}

function normalizePlayerName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("it-IT");
}

function orderCurrentSlotFirst<T extends string>(current: T, slots: T[]) {
  return [current, ...slots.filter((slot) => slot !== current)];
}
