import type { EditableLeagueState } from "./league-state";
import { changedSlotTeamCodes, findAllSlotOverflows, slotOverflowMessage } from "./roster-slot-limits";
import type { createSupabaseServerClient } from "./supabase/server";

type Supabase = NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>;

export async function persistLeagueMovement(
  supabase: Supabase,
  before: EditableLeagueState,
  after: EditableLeagueState,
  operationType: string,
  summary: string,
) {
  const affectedTeams = changedSlotTeamCodes(before.rosterEntries, after.rosterEntries);
  const slotErrors = findAllSlotOverflows(after.rosterEntries, affectedTeams).map(slotOverflowMessage);
  if (slotErrors.length) {
    return {
      data: null,
      error: {
        message: `${slotErrors.join(" ")} Libera prima uno slot adeguato e ripeti l'operazione.`,
      },
    };
  }
  return supabase.rpc("apply_league_state_movement", {
    expected_before_state: before,
    next_state: after,
    movement_type: operationType,
    movement_summary: summary,
  });
}

export function buildMovementReversal(
  current: EditableLeagueState,
  before: EditableLeagueState,
  after: EditableLeagueState,
): EditableLeagueState {
  return {
    ...current,
    rosterEntries: sortRosterEntriesByBlock(restoreGroups(
      current.rosterEntries,
      before.rosterEntries,
      after.rosterEntries,
      (entry) => entry.name.trim().toLocaleLowerCase("it-IT"),
      "giocatori coinvolti",
    )),
    draftAssets: restoreGroups(
      current.draftAssets,
      before.draftAssets,
      after.draftAssets,
      (asset) => `${asset.year}|${asset.round}|${asset.originTeamCode ?? asset.originOrOverall}`,
      "scelte coinvolte",
    ),
    qualifyingOfferRights: restoreGroups(
      current.qualifyingOfferRights,
      before.qualifyingOfferRights,
      after.qualifyingOfferRights,
      (right) => right.playerName.trim().toLocaleLowerCase("it-IT"),
      "qualifying offer coinvolte",
    ),
    playerList: restoreGroups(
      current.playerList,
      before.playerList,
      after.playerList,
      (player) => player.name.trim().toLocaleLowerCase("it-IT"),
      "giocatori del listone coinvolti",
    ),
  };
}

export function movementReversalSlotErrors(
  current: EditableLeagueState,
  restored: EditableLeagueState,
) {
  const affectedTeams = changedSlotTeamCodes(current.rosterEntries, restored.rosterEntries);
  return findAllSlotOverflows(restored.rosterEntries, affectedTeams).map(slotOverflowMessage);
}

function sortRosterEntriesByBlock(entries: EditableLeagueState["rosterEntries"]) {
  const blockOrder = { regular: 0, two_way: 1, g_league: 2, dpe: 3 } as const;
  return [...entries].sort((left, right) => (
    left.teamCode.localeCompare(right.teamCode, "it")
    || Number(left.state === "cut") - Number(right.state === "cut")
    || blockOrder[left.slot] - blockOrder[right.slot]
    || right.cost - left.cost
    || left.name.localeCompare(right.name, "it")
  ));
}

function restoreGroups<T>(
  current: T[],
  before: T[],
  after: T[],
  identity: (item: T) => string,
  label: string,
) {
  const identities = new Set([...before, ...after].map(identity));
  const changed = [...identities].filter((key) => (
    stableJson(before.filter((item) => identity(item) === key))
    !== stableJson(after.filter((item) => identity(item) === key))
  ));
  for (const key of changed) {
    if (
      stableJson(current.filter((item) => identity(item) === key))
      !== stableJson(after.filter((item) => identity(item) === key))
    ) {
      throw new Error(`Non puoi annullare il movimento: i ${label} sono stati modificati successivamente.`);
    }
  }
  return [
    ...current.filter((item) => !changed.includes(identity(item))),
    ...before.filter((item) => changed.includes(identity(item))),
  ];
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).sort().join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
