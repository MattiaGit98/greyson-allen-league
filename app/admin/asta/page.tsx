import { AuctionPanel } from "./auction-panel";
import { loadEditableLeagueState } from "@/lib/league-state";
import { calculateCapSpace, followingSeasonName, shouldCountTeamOptions } from "@/lib/season-time";
import { leagueMomentFromSeason, operationWindows } from "@/lib/league-moments";
import { requireActiveSeason } from "@/lib/active-season";
import { buildMovementReversal } from "@/lib/league-movements";
import { normalizeState } from "@/lib/league-state";
import { countActiveRosterSlots } from "@/lib/roster-slot-limits";
import { entriesForDpeAdjustedCap } from "@/lib/dpe-rules";
import { conciseMovementDetail } from "@/lib/movement-display";
import { legalAuctionContextualDestinations } from "@/lib/auction-management";
import { freeReleaseReasonAvailability } from "@/lib/free-release";

export default async function AuctionAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; updated?: string; reverted?: string }>;
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
  const auctionMovements = await activeSeason.supabase
    .from("league_movements")
    .select("id,operation_type,summary,before_state,after_state,reverted_at")
    .eq("operation_type", "acquisto_asta")
    .order("created_at", { ascending: false })
    .limit(300);
  if (auctionMovements.error) throw new Error(`Registro movimenti non disponibile: ${auctionMovements.error.message}`);
  const assignmentUndos = auctionAssignmentUndos({
    movements: auctionMovements.data ?? [],
    current: leagueState,
    seasonName,
    teamOptionsResolved: activeSeason.season.team_options_resolved,
    seasonNames: capSeasons,
  });

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
      cutPlayerNames: entries
        .filter((entry) => entry.state === "cut")
        .map((entry) => entry.name)
        .sort((left, right) => left.localeCompare(right, "it")),
      players: active
        .filter((entry) => entry.slot !== "dpe")
        .map((entry) => {
          const listedPlayer = leagueState.playerList.find((player) => player.name === entry.name);
          return {
            name: entry.name,
            role: entry.role ?? null,
            cost: entry.cost,
            contract: entry.contract,
            slot: entry.slot as "regular" | "two_way" | "g_league",
            cuttable: true,
            freeReleasable: freeReleaseReasonAvailability(
              "one_credit_team_option",
              leagueMoment,
              {
                ...entry,
                rookie: listedPlayer?.rookie ?? false,
                under23: listedPlayer?.under23 ?? false,
              },
              seasonName,
            ).available,
            charges: capSeasons.map((targetSeason) => 1000 - calculateCapSpace({
              entries: [entry],
              seasonName: targetSeason,
              optionSeasonName: seasonName,
              countTeamOptions,
            })) as [number, number, number],
            moveDestinations: legalAuctionContextualDestinations({
              entry,
              rookie: listedPlayer?.rookie ?? false,
              under23: listedPlayer?.under23 ?? false,
              seasonName,
              moment: leagueMoment,
            }),
          };
        })
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
        pendingAuctionContract: roster.auctionPrice !== undefined && roster.contractStartSeason === seasonName,
        teamOptionFinalYear: roster.teamOptionFinalYear,
        freeAgentSignedSeason: roster.freeAgentSignedSeason,
        endedPreviousSeasonInGLeague: roster.endedPreviousSeasonInGLeague,
        contractStartSeason: roster.contractStartSeason,
        twoWayPromotionLocked: roster.twoWayPromotionLocked,
        freeReleaseEligible: freeReleaseReasonAvailability(
          "one_credit_team_option",
          leagueMoment,
          {
            ...roster,
            rookie: player.rookie,
            under23: player.under23,
          },
          seasonName,
        ).available,
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
      {query.reverted && <p className="notice success">Assegnazione d’asta annullata e situazione precedente ripristinata.</p>}
      {query.error && <p className="notice error">Operazione non riuscita: {query.error}</p>}
      {leagueState.playerListStatus !== "published" && <p className="notice">Pubblica il listone ufficiale per rendere operativo il pannello asta.</p>}
      {leagueState.playerListStatus === "published" && !auctionOpen && <p className="notice">Il pannello è operativo da Inizio asta fino a Termine asta.</p>}
      {auctionOpen && pendingDraftPicks > 0 && (
        <p className="notice error">Concludi prima il Draft {currentDraftYear}: restano {pendingDraftPicks} scelte da assegnare. Il pannello resta consultabile, ma tutte le operazioni sono bloccate.</p>
      )}
      <AuctionPanel rows={rows} teams={teams} phase={auctionOpen ? "auction" : "closed"} seasonName={seasonName} pendingDraftPicks={pendingDraftPicks} assignmentUndos={assignmentUndos} />
    </section>
  );
}

type AuctionMovement = {
  id: string;
  operation_type: string;
  summary: string;
  before_state: unknown;
  after_state: unknown;
  reverted_at: string | null;
};

type AssignmentUndo = {
  movementId: string;
  summary: string;
  preview: { code: string; name: string; slotsBefore: SlotCounts; slotsAfter: SlotCounts; rolesBefore: RoleCounts; rolesAfter: RoleCounts; capSpaces: { seasonName: string; before: number; after: number }[] }[];
  roleMinimumConfirmationRequired: boolean;
  disabled: boolean;
};

type SlotCounts = { regular: number; two_way: number; g_league: number; dpe: number };
type RoleCounts = { G: number; A: number; C: number };

function auctionAssignmentUndos({
  movements,
  current,
  seasonName,
  teamOptionsResolved,
  seasonNames,
}: {
  movements: AuctionMovement[];
  current: Awaited<ReturnType<typeof loadEditableLeagueState>>;
  seasonName: string;
  teamOptionsResolved: boolean;
  seasonNames: string[];
}) {
  const result: Record<string, AssignmentUndo> = {};
  for (const movement of movements) {
    if (movement.reverted_at) continue;
    const before = normalizeState(movement.before_state);
    const after = normalizeState(movement.after_state);
    const acquired = after.rosterEntries.find((entry) => (
      entry.state === "active"
      && entry.auctionPrice !== undefined
      && entry.contractStartSeason === seasonName
      && !before.rosterEntries.some((previous) => previous.state === "active" && previous.teamCode === entry.teamCode && previous.name === entry.name)
    ));
    if (!acquired || result[acquired.name]) continue;
    let restored: typeof current | null = null;
    let disabled = false;
    try {
      restored = buildMovementReversal(current, before, after);
    } catch {
      disabled = true;
    }
    result[acquired.name] = {
      movementId: movement.id,
      summary: conciseMovementDetail(movement.operation_type, movement.summary),
      preview: restored ? movementPreview(current, restored, seasonName, seasonNames, teamOptionsResolved) : [],
      roleMinimumConfirmationRequired: false,
      disabled,
    };
  }
  return result;
}

function movementPreview(
  current: Awaited<ReturnType<typeof loadEditableLeagueState>>,
  restored: Awaited<ReturnType<typeof loadEditableLeagueState>>,
  seasonName: string,
  seasonNames: string[],
  teamOptionsResolved: boolean,
) {
  const countTeamOptions = shouldCountTeamOptions("auction", teamOptionsResolved);
  return [...new Set([...current.teams, ...restored.teams].map((team) => team.code))].flatMap((teamCode) => {
    if (auctionTeamSnapshot(current, teamCode) === auctionTeamSnapshot(restored, teamCode)) return [];
    const team = restored.teams.find((item) => item.code === teamCode) ?? current.teams.find((item) => item.code === teamCode);
    const entries = restored.rosterEntries.filter((entry) => entry.teamCode === teamCode);
    const currentEntries = current.rosterEntries.filter((entry) => entry.teamCode === teamCode);
    return [{
      code: teamCode,
      name: team?.name ?? teamCode,
      slotsBefore: countActiveRosterSlots(current.rosterEntries, teamCode),
      slotsAfter: countActiveRosterSlots(restored.rosterEntries, teamCode),
      rolesBefore: countRoles(currentEntries),
      rolesAfter: countRoles(entries),
      capSpaces: seasonNames.map((targetSeason, distance) => ({
        seasonName: targetSeason,
        before: calculateCapSpace({ entries: entriesForDpeAdjustedCap(currentEntries, distance), seasonName: targetSeason, optionSeasonName: seasonName, countTeamOptions }),
        after: calculateCapSpace({ entries: entriesForDpeAdjustedCap(entries, distance), seasonName: targetSeason, optionSeasonName: seasonName, countTeamOptions }),
      })),
    }];
  });
}

function countRoles(entries: Awaited<ReturnType<typeof loadEditableLeagueState>>["rosterEntries"]) {
  return entries
    .filter((entry) => entry.state === "active" && entry.slot !== "dpe")
    .reduce((roles, entry) => {
      if (entry.role) roles[entry.role] += 1;
      return roles;
    }, { G: 0, A: 0, C: 0 });
}

function auctionTeamSnapshot(state: Awaited<ReturnType<typeof loadEditableLeagueState>>, teamCode: string) {
  const normalized = <T,>(rows: T[]) => rows.map((row) => JSON.stringify(row)).sort();
  return JSON.stringify({
    roster: normalized(state.rosterEntries.filter((entry) => entry.teamCode === teamCode)),
    picks: normalized(state.draftAssets.filter((pick) => pick.teamCode === teamCode)),
    qualifyingOffers: normalized(state.qualifyingOfferRights.filter((right) => right.teamCode === teamCode)),
  });
}
