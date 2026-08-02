import { loadEditableLeagueState } from "@/lib/league-state";
import { calculateCapSpace, followingSeasonName, shouldCountTeamOptions } from "@/lib/season-time";
import { TradeBuilder } from "./trade-builder";
import { leagueMomentFromSeason, operationWindows, tradeDeadlineHasPassed } from "@/lib/league-moments";
import { legalSlotDestinations, type ManagedRosterSlot } from "@/lib/slot-eligibility";
import { nextDraftYear } from "@/lib/draft-positions";
import { existingTradeClauseAgreements, tradePickId, tradePlayerId, tradeQualifyingOfferId } from "@/lib/trade-state";
import { loadHistoryCompetitionState } from "@/lib/history-competition-store";
import { buildSignAndTradeProvisional, type SignAndTradeRequest } from "@/lib/sign-and-trade";
import { requireActiveSeason } from "@/lib/active-season";

export default async function TradesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const query = await searchParams;
  const [activeSeason, rawLeagueState, history] = await Promise.all([
    requireActiveSeason(),
    loadEditableLeagueState(),
    loadHistoryCompetitionState(),
  ]);
  const phase = activeSeason.season.status;
  const seasonName = activeSeason.season.name;
  const leagueMoment = leagueMomentFromSeason(activeSeason.season);
  let signAndTrade = null;
  let signAndTradeError = "";
  const signAndTradeRequest = parseSignAndTradeRequest(query);
  if (signAndTradeRequest) {
    try {
      signAndTrade = buildSignAndTradeProvisional({
        state: rawLeagueState,
        request: signAndTradeRequest,
        seasonName,
        phase,
        moment: leagueMoment,
        draftHistoryEntries: history.competitions.Draft,
      });
    } catch (error) {
      signAndTradeError = error instanceof Error ? error.message : "Sign and trade non valido.";
    }
  }
  const leagueState = signAndTrade?.state ?? rawLeagueState;
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

  const tradeTeams = leagueState.teams.map((team) => {
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
        entries: teamEntries.filter((entry) => (
          entry.state !== "active" || entry.slot !== "dpe"
        )),
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
      qualifyingOffers: leagueState.qualifyingOfferRights
        .filter((right) => right.teamCode === team.code)
        .map((right) => ({
          id: tradeQualifyingOfferId(team.code, right.playerName),
          playerName: right.playerName,
          amount: right.qualifyingAmount,
        }))
        .sort((left, right) => left.playerName.localeCompare(right.playerName, "it")),
      players: teamEntries
      .filter((entry) => entry.teamCode === team.code && entry.state === "active")
      .map((entry) => ({
        id: tradePlayerId(team.code, entry.name),
        name: entry.name,
        cost: entry.cost,
        capCost: scheduledCost(entry, seasonName),
        futureCapCosts: Object.fromEntries(capSeasons.slice(1).map((futureSeason) => (
          [futureSeason, scheduledCost(entry, futureSeason)]
        ))),
        contract: entry.contract,
        newSigning: entry.name === signAndTrade?.playerName && entry.teamCode === signAndTrade.signerTeamCode,
        role: (() => {
          const role = officialRoles.get(normalizePlayerName(entry.name));
          return role && role !== "X" ? role : null;
        })(),
        slot: entry.slot,
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
    picks: leagueState.draftAssets
      .map((pick, index) => ({ pick, index }))
      .filter(({ pick }) => pick.teamCode === team.code)
      .filter(({ pick }) => protectionCounterpartyDraftYears.includes(pick.year))
      .map(({ pick, index }) => ({
        id: tradePickId(team.code, index, pick),
        label: pick.label,
        round: pick.round,
        year: pick.year,
        originOrOverall: pick.originOrOverall,
        hasExistingCondition: Boolean(pick.clauseResolution) || /protetta|swap|contropartita|c\.p\./i.test(pick.label),
        tradable: tradableDraftYears.includes(pick.year),
      }))
      .sort((left, right) => (
        left.year - right.year
        || left.round.localeCompare(right.round, "it")
        || String(left.originOrOverall).localeCompare(String(right.originOrOverall), "it", { numeric: true })
      )),
    };
  });

  return (
    <section className="section page-top admin-dashboard">
      {query.updated && <p className="notice success">{query.updated}</p>}
      {query.error && <p className="notice error">Operazione non riuscita: {query.error}</p>}
      {signAndTradeError && <p className="notice error">Sign and trade non disponibile: {signAndTradeError}</p>}
      <TradeBuilder
        phase={phase}
        tradeDeadlinePassed={tradeDeadlineHasPassed(leagueMoment)}
        tradesOpen={operationWindows.trades(leagueMoment)}
        tradableDraftYears={tradableDraftYears}
        protectionCounterpartyDraftYears={protectionCounterpartyDraftYears}
        existingClauseAgreements={existingClauseAgreements}
        signAndTrade={signAndTrade && signAndTradeRequest ? {
          request: signAndTradeRequest,
          signerTeamCode: signAndTrade.signerTeamCode,
          playerName: signAndTrade.playerName,
          signingEntryId: signAndTrade.signingEntryId,
          label: signAndTrade.label,
          capWarnings: signAndTrade.capWarnings,
          warnings: signAndTrade.warnings,
          spaceBefore: signAndTrade.spaceBefore,
          spaceAfterSigning: signAndTrade.spaceAfterSigning,
        } : null}
        teams={tradeTeams}
      />
    </section>
  );
}

function parseSignAndTradeRequest(query: Record<string, string | undefined>): SignAndTradeRequest | null {
  if (query.sign_kind === "free_agent") {
    return {
      kind: "free_agent",
      playerSource: query.sign_source === "outside" ? "outside" : "list",
      playerName: query.sign_player ?? "",
      playerRole: (["G", "A", "C", "X"] as const).find((role) => role === query.sign_role) ?? "",
      realTeam: query.sign_real_team ?? "",
      signerTeamCode: (query.sign_team ?? "").toUpperCase(),
      price: Number(query.sign_price),
      destinationSlot: query.sign_slot === "two_way" ? "two_way" : "regular",
    };
  }
  if (query.sign_kind === "draft") {
    const slot = (["regular", "two_way", "g_league"] as const).find((item) => item === query.sign_slot) ?? "regular";
    return {
      kind: "draft",
      playerName: query.sign_player ?? "",
      signerTeamCode: (query.sign_team ?? "").toUpperCase(),
      pickIndex: Number(query.sign_pick_index),
      draftYear: Number(query.sign_draft_year),
      destinationSlot: slot,
    };
  }
  return null;
}

function normalizePlayerName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("it-IT");
}

function orderCurrentSlotFirst<T extends string>(current: T, slots: T[]) {
  return [current, ...slots.filter((slot) => slot !== current)];
}
