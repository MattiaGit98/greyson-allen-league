import { requireActiveSeason } from "@/lib/active-season";
import { leagueMomentFromSeason } from "@/lib/league-moments";
import { auctionAssignmentReversalDuringAuction, buildMovementReversal, draftChoiceBelongsToSeason, movementReversalCapErrors, movementReversalSlotErrors, movementUndoMetadataFromState, movementUndoWindowError } from "@/lib/league-movements";
import { loadEditableLeagueState, normalizeState } from "@/lib/league-state";
import { conciseMovementDetail, movementOperationLabel, movementSearchFilter, normalizeMovementSearchQuery } from "@/lib/movement-display";
import { countActiveRosterSlots } from "@/lib/roster-slot-limits";
import { calculateCapSpace, followingSeasonName, shouldCountTeamOptions } from "@/lib/season-time";
import { entriesForDpeAdjustedCap } from "@/lib/dpe-rules";
import { UndoMovementButton } from "./undo-movement-button";
import { roleMinimumRecoverySlotErrorForEntries, roleMinimumsWorsen } from "@/lib/role-minimums";
import { MovementTextSearch } from "@/components/movement-text-search";

export default async function MovementAdminPage({ searchParams }: { searchParams: Promise<{ error?: string; reverted?: string; q?: string }> }) {
  const query = await searchParams;
  const searchQuery = normalizeMovementSearchQuery(query.q ?? "");
  const textFilter = movementSearchFilter(searchQuery);
  const [{ supabase, season }, current] = await Promise.all([requireActiveSeason(), loadEditableLeagueState()]);
  const currentMoment = leagueMomentFromSeason(season);
  const capSeasonNames = [0, 1, 2].map((distance) => followingSeasonName(season.name, distance));
  const countTeamOptions = shouldCountTeamOptions(season.status, season.team_options_resolved);
  let movementRequest = supabase.from("league_movements").select("id,operation_type,summary,before_state,after_state,season_name,undo_before_moment,created_at,reverted_at");
  if (textFilter) movementRequest = movementRequest.or(textFilter);
  const [response, draftChoicesResponse] = await Promise.all([
    movementRequest.order("created_at", { ascending: false }).limit(100),
    supabase
      .from("league_movements")
      .select("id,season_name,after_history")
      .eq("operation_type", "scelta_draft")
      .is("reverted_at", null)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false }),
  ]);
  if (response.error) throw new Error(`Registro movimenti non disponibile: ${response.error.message}`);
  if (draftChoicesResponse.error) throw new Error(`Scelte del Draft non disponibili: ${draftChoicesResponse.error.message}`);
  const latestDraftChoiceId = (draftChoicesResponse.data ?? []).find((movement) => (
    draftChoiceBelongsToSeason(movement.season_name, movement.after_history, season.name)
  ))?.id ?? null;
  const movements = (response.data ?? []).map((movement) => {
    let reversible = !movement.reverted_at;
    let reason = "";
    let restored: typeof current | null = null;
    if (reversible) {
      const snapshotMetadata = movementUndoMetadataFromState(movement.before_state);
      const windowError = movementUndoWindowError({
        operationType: movement.operation_type,
        movementSeasonName: movement.season_name ?? snapshotMetadata.seasonName,
        undoBeforeMoment: movement.undo_before_moment ?? snapshotMetadata.undoBeforeMoment,
        currentSeasonName: season.name,
        currentMoment,
        isLatestDraftChoice: movement.id === latestDraftChoiceId,
      });
      if (windowError) {
        reversible = false;
        reason = windowError;
      }
    }
    if (reversible) {
      try {
        restored = buildMovementReversal(
          current,
          normalizeState(movement.before_state),
          normalizeState(movement.after_state),
        );
        const isAuctionAssignmentUndo = auctionAssignmentReversalDuringAuction(movement.operation_type, currentMoment);
        if (!isAuctionAssignmentUndo) {
          const slotErrors = movementReversalSlotErrors(current, restored);
          if (slotErrors.length) {
            reversible = false;
            reason = `${slotErrors.join(" ")} L'annullamento ricreerebbe un conflitto di slot.`;
          }
          const capErrors = movementReversalCapErrors(current, restored, {
            seasonName: season.name,
            phase: season.status,
            teamOptionsResolved: season.team_options_resolved,
            currentMoment,
          });
          if (capErrors.length) {
            reversible = false;
            reason = `${capErrors.join(" ")} L'annullamento non rispetterebbe il salary cap.`;
          }
          const restoredState = restored;
          const roleMinimumSlotErrors = [...new Set(restoredState.rosterEntries.map((entry) => entry.teamCode))]
            .flatMap((teamCode) => {
              const error = roleMinimumRecoverySlotErrorForEntries(restoredState.rosterEntries.filter((entry) => entry.teamCode === teamCode), season.status, currentMoment);
              return error ? [`${teamCode}: ${error}`] : [];
            });
          if (roleMinimumSlotErrors.length) {
            reversible = false;
            reason = `${roleMinimumSlotErrors.join(" ")} L'annullamento non lascerebbe slot sufficienti per ripristinare i ruoli.`;
          }
        }
      } catch (error) {
        reversible = false;
        reason = error instanceof Error ? error.message : "Non annullabile.";
      }
    }
    const preview = restored ? movementReversalPreview({
      current,
      restored,
      seasonName: season.name,
      seasonNames: capSeasonNames,
      countTeamOptions,
    }) : [];
    const roleMinimumConfirmationRequired = restored && !auctionAssignmentReversalDuringAuction(movement.operation_type, currentMoment)
      ? roleMinimumsWorsen(current.rosterEntries, restored.rosterEntries, season.status, currentMoment)
      : false;
    return { ...movement, reversible, reason, preview, roleMinimumConfirmationRequired };
  });
  return (
    <section className="section page-top admin-dashboard movement-admin-page">
      {query.reverted && <p className="notice success">Movimento annullato e stato precedente ripristinato.</p>}
      {query.error && <p className="notice error">Annullamento non riuscito: {query.error}</p>}
      <div className="movement-admin-search">
        <MovementTextSearch initialValue={searchQuery} path="/admin/movimenti" />
      </div>
      <div className="movement-admin-list">
        {movements.map((movement) => (
          <article className={movement.reverted_at ? "reverted" : ""} key={movement.id}>
            <div><span>{movementOperationLabel(movement.operation_type)}</span><strong>{conciseMovementDetail(movement.operation_type, movement.summary)}</strong>{movement.reason && <small>{movement.reason}</small>}{movement.reverted_at && <small>Movimento già annullato</small>}</div>
            <UndoMovementButton movementId={movement.id} summary={conciseMovementDetail(movement.operation_type, movement.summary)} preview={movement.preview} roleMinimumConfirmationRequired={movement.roleMinimumConfirmationRequired} disabled={!movement.reversible} />
          </article>
        ))}
        {!movements.length && <p className="data-empty">{searchQuery ? "Nessun movimento corrisponde alla ricerca." : "Nessun movimento annullabile registrato."}</p>}
      </div>
    </section>
  );
}

function movementReversalPreview({
  current,
  restored,
  seasonName,
  seasonNames,
  countTeamOptions,
}: {
  current: Awaited<ReturnType<typeof loadEditableLeagueState>>;
  restored: Awaited<ReturnType<typeof loadEditableLeagueState>>;
  seasonName: string;
  seasonNames: string[];
  countTeamOptions: boolean;
}) {
  const teamCodes = new Set([...current.teams, ...restored.teams].map((team) => team.code));
  return [...teamCodes].flatMap((teamCode) => {
    if (teamSnapshot(current, teamCode) === teamSnapshot(restored, teamCode)) return [];
    const entries = restored.rosterEntries.filter((entry) => entry.teamCode === teamCode);
    const currentEntries = current.rosterEntries.filter((entry) => entry.teamCode === teamCode);
    const team = restored.teams.find((item) => item.code === teamCode) ?? current.teams.find((item) => item.code === teamCode);
    return [{
      code: teamCode,
      name: team?.name ?? teamCode,
      slotsBefore: countActiveRosterSlots(current.rosterEntries, teamCode),
      slotsAfter: countActiveRosterSlots(restored.rosterEntries, teamCode),
      rolesBefore: countRoles(currentEntries),
      rolesAfter: countRoles(entries),
      capSpaces: seasonNames.map((targetSeason, distance) => ({
        seasonName: targetSeason,
        before: calculateCapSpace({
          entries: entriesForDpeAdjustedCap(currentEntries, distance),
          seasonName: targetSeason,
          optionSeasonName: seasonName,
          countTeamOptions,
        }),
        after: calculateCapSpace({
          entries: entriesForDpeAdjustedCap(entries, distance),
          seasonName: targetSeason,
          optionSeasonName: seasonName,
          countTeamOptions,
        }),
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

function teamSnapshot(state: Awaited<ReturnType<typeof loadEditableLeagueState>>, teamCode: string) {
  const normalized = <T,>(rows: T[]) => rows.map((row) => JSON.stringify(row)).sort();
  return JSON.stringify({
    roster: normalized(state.rosterEntries.filter((entry) => entry.teamCode === teamCode)),
    picks: normalized(state.draftAssets.filter((pick) => pick.teamCode === teamCode)),
    qualifyingOffers: normalized(state.qualifyingOfferRights.filter((right) => right.teamCode === teamCode)),
  });
}
