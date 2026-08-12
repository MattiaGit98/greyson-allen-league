import { TeamAccordion } from "./team-accordion";
import { loadEditableLeagueState } from "@/lib/league-state";
import { hasReachedMoment, leagueMomentFromSeason, momentIndex, nextLeagueTransition, operationWindows, tradesAreSuspendedForAuction, type LeagueMoment, type LeagueTransition } from "@/lib/league-moments";
import { displayedSeasonName, shouldCountTeamOptions } from "@/lib/season-time";
import { requireActiveSeason } from "@/lib/active-season";
import { roleMinimumChecksApply } from "@/lib/role-minimums";

export default async function TeamsPage({
  searchParams,
}: {
  searchParams: Promise<{ team?: string }>;
}) {
  const query = await searchParams;
  const [activeSeason, leagueState] = await Promise.all([
    requireActiveSeason(),
    loadEditableLeagueState(),
  ]);
  const phase = activeSeason.season.status;
  const capSeasonName = displayedSeasonName(activeSeason.season.name);
  const teamOptionsResolved = activeSeason.season.team_options_resolved;
  const countTeamOptions = shouldCountTeamOptions(phase, teamOptionsResolved);
  const leagueMoment = leagueMomentFromSeason(activeSeason.season);
  const pendingAuctionContracts = operationWindows.contractAssignment(leagueMoment);
  const availableOperations = availableOperationsAt(leagueMoment);

  return (
    <section className="section teams-page">
      <aside className="available-operations" aria-label="Operazioni disponibili">
        <strong>Operazioni disponibili</strong>
        <ul>
          {availableOperations.map((operation) => <li className={operation.urgency ? `is-${operation.urgency}` : undefined} key={operation.label}>{operation.label}</li>)}
        </ul>
      </aside>
      <TeamAccordion
        teams={leagueState.teams}
        rosterEntries={leagueState.rosterEntries}
        draftAssets={leagueState.draftAssets}
        finalizedDraftPositionYears={leagueState.finalizedDraftPositionYears ?? []}
        qualifyingOfferRights={leagueState.qualifyingOfferRights}
        playerList={leagueState.playerList}
        playerListPublished={leagueState.playerListStatus === "published"}
        inSeason={roleMinimumChecksApply(phase, leagueMoment)}
        initialTeam={query.team?.toUpperCase()}
        showQualifyingOffers={phase === "offseason"}
        capSeasonName={capSeasonName}
        countTeamOptions={countTeamOptions}
        pendingAuctionContracts={pendingAuctionContracts}
      />
    </section>
  );
}

function availableOperationsAt(moment: LeagueMoment) {
  const available: AvailableOperation[] = [];
  const add = (label: string, condition: boolean, closesAt?: LeagueTransition) => {
    if (condition) available.push({ label, closesAt });
  };

  add("Esercizio team option", operationWindows.teamOption(moment), "team_option_deadline");
  add("Draft", operationWindows.draft(moment), "auction_start");
  add("Asta", operationWindows.auction(moment), "auction_completed");
  add("Assegnazione contratti", operationWindows.contractAssignment(moment), "contract_delivery");
  add("Scambi", operationWindows.trades(moment), "trade_deadline");
  add("Free agent", operationWindows.freeAgency(moment), "free_agency_end");
  add("Estensioni contrattuali", operationWindows.extensions(moment), hasReachedMoment(moment, "trade_deadline") ? "free_agency_end" : "auction_start");
  add("Buyout", operationWindows.buyout(moment), "buyout_end");
  add("Esercizio DPE", operationWindows.dpeActivation(moment), "trade_deadline");
  add("Reintegro anticipato DPE", operationWindows.dpeReintegration(moment), "free_agency_end");
  add("T.O. G-League per utilizzo nei playoff", operationWindows.playoffTeamOption(moment), "season_end");
  add("Rilascio: stagione NBA sotto metà", !hasReachedMoment(moment, "auction_start"), "auction_start");
  add("Rilascio: T.O. da 1 credito", hasReachedMoment(moment, "team_option_deadline") && !hasReachedMoment(moment, "contract_delivery"), "contract_delivery");
  add("Rilascio: senza roster NBA", hasReachedMoment(moment, "team_option_deadline") && !hasReachedMoment(moment, "free_agency_end") && !tradesAreSuspendedForAuction(moment), "free_agency_end");
  add("Rilascio: squalifica o cause legali", hasReachedMoment(moment, "team_option_deadline") && !hasReachedMoment(moment, "trade_deadline") && !tradesAreSuspendedForAuction(moment), "trade_deadline");

  available.push(
    { label: "Tagli" },
    { label: "Promozioni di slot" },
    { label: "Stretch provision" },
  );

  const nextTransition = nextLeagueTransition(moment);
  const followingTransition = nextTransition === "season_end" ? null : nextLeagueTransition(nextTransition);
  return available
    .sort((left, right) => closureOrder(left.closesAt) - closureOrder(right.closesAt) || left.label.localeCompare(right.label, "it"))
    .map((operation) => ({
      ...operation,
      urgency: operation.closesAt === nextTransition
        ? "urgent"
        : operation.closesAt === followingTransition
          ? "upcoming"
          : undefined,
    }));
}

type AvailableOperation = {
  label: string;
  closesAt?: LeagueTransition;
  urgency?: "urgent" | "upcoming";
};

function closureOrder(closesAt?: LeagueTransition) {
  if (!closesAt) return Number.POSITIVE_INFINITY;
  return closesAt === "season_end" ? Number.MAX_SAFE_INTEGER : momentIndex(closesAt);
}
