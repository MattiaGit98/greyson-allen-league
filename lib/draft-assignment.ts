import type { EditableLeagueState } from "./league-state";
import type { HistoryCompetitionEntry, HistoryDraftRow } from "./history-competitions";
import { compareDraftPicks, draftOverallPosition } from "./draft-rules";
import { findTeamSlotOverflows, slotOverflowMessage } from "./roster-slot-limits";
import { removeRolelessPlayersByName } from "./roleless-player-list";

export type DraftRosterSlot = "regular" | "two_way" | "g_league";
export type DraftDestinationSlot = DraftRosterSlot | "immediate_cut" | "immediate_release";
export type DraftSlotCounts = Record<DraftRosterSlot | "dpe", number>;

export const draftSlotLimits: DraftSlotCounts = { regular: 15, two_way: 2, g_league: 3, dpe: 1 };

export type DraftAssignmentResult = {
  state: EditableLeagueState;
  historyEntries: HistoryCompetitionEntry[];
  playerName: string;
  teamCode: string;
  position: number;
  price: number;
  slot: DraftDestinationSlot;
  assignedPickCount: number;
  expectedPickCount: number;
  draftCompleted: boolean;
  futureDraftYear: number | null;
  futurePicksAdded: number;
};

export function buildDraftAssignment({
  state,
  historyEntries,
  draftYear,
  pickIndex,
  requestedPlayerName,
  destinationSlot,
  allowTemporarySlotOverflow = false,
}: {
  state: EditableLeagueState;
  historyEntries: HistoryCompetitionEntry[];
  draftYear: number;
  pickIndex: number;
  requestedPlayerName: string;
  destinationSlot: DraftDestinationSlot;
  allowTemporarySlotOverflow?: boolean;
}): DraftAssignmentResult {
  if (!Number.isInteger(pickIndex) || pickIndex < 0) throw new Error("Scelta non valida. Aggiorna la pagina e riprova.");
  const pick = state.draftAssets[pickIndex];
  if (!pick || pick.year !== draftYear) throw new Error("La scelta non appartiene al draft attuale.");
  const nextPick = state.draftAssets
    .map((asset, index) => ({ asset, index }))
    .filter(({ asset }) => asset.year === draftYear)
    .sort((left, right) => compareDraftPicks(left.asset, right.asset))[0];
  if (pickIndex !== nextPick?.index) throw new Error("Assegna prima la scelta precedente del draft.");

  const position = draftOverallPosition(pick.originOrOverall);
  const configuredCost = pick.draftCost;
  if (position === null || !Number.isInteger(configuredCost) || Number(configuredCost) < 1) {
    throw new Error("Assegna prima posizione e costo alla scelta.");
  }
  const price = Number(configuredCost);
  if (destinationSlot === "immediate_cut" && price <= 1) {
    throw new Error("Il taglio immediato è riservato alle scelte che costano più di 1 credito.");
  }
  if (destinationSlot === "immediate_release" && price !== 1) {
    throw new Error("Il rilascio immediato è riservato alle scelte da 1 credito.");
  }

  const normalizedRequestedName = normalizePlayerName(requestedPlayerName);
  const player = state.playerList.find((item) => normalizePlayerName(item.name) === normalizedRequestedName);
  if (!player || !player.rookie) throw new Error("Il giocatore selezionato non è un rookie disponibile nel listone.");
  if (state.rosterEntries.some((entry) => normalizePlayerName(entry.name) === normalizedRequestedName)) {
    throw new Error("Il giocatore ha già un contratto attivo o tagliato nella lega.");
  }
  if (state.qualifyingOfferRights.some((right) => normalizePlayerName(right.playerName) === normalizedRequestedName)) {
    throw new Error("Sul giocatore esiste già una qualifying offer.");
  }
  if (!state.teams.some((team) => team.code === pick.teamCode)) throw new Error("La squadra proprietaria della scelta non esiste.");

  const slotCounts = draftTeamSlotCounts(state, pick.teamCode);
  const slotErrors = draftSlotAssignmentErrors({ slot: destinationSlot, price, counts: slotCounts });
  const blockingSlotErrors = allowTemporarySlotOverflow
    ? slotErrors.filter((error) => !error.startsWith("Lo slot "))
    : slotErrors;
  if (blockingSlotErrors.length) throw new Error(blockingSlotErrors.join(" "));

  const season = String(draftYear);
  const existingIndex = historyEntries.findIndex((entry) => entry.season === season);
  const existingContent = existingIndex >= 0 ? historyEntries[existingIndex]?.content : undefined;
  if (existingContent && existingContent.kind !== "draft") throw new Error("Lo storico del draft attuale non è valido.");
  const existingRows = existingContent?.kind === "draft" ? existingContent.rows : [];
  const filledPositionsBefore = existingRows.flatMap((row) => {
    const rowPosition = draftOverallPosition(row.pick);
    return rowPosition !== null && row.team.trim() && row.player.trim() ? [rowPosition] : [];
  });
  const expectedPositions = new Set([
    ...state.draftAssets
      .filter((asset) => asset.year === draftYear)
      .flatMap((asset) => {
        const assetPosition = draftOverallPosition(asset.originOrOverall);
        return assetPosition === null ? [] : [assetPosition];
      }),
    ...filledPositionsBefore,
  ]);

  let nextDraftAssets = state.draftAssets.filter((_, index) => index !== pickIndex);
  const expectedPickCount = expectedPositions.size;

  const rowsByPosition = new Map<number, HistoryDraftRow>();
  for (const row of existingRows) {
    const rowPosition = draftOverallPosition(row.pick);
    if (rowPosition !== null) rowsByPosition.set(rowPosition, row);
  }
  const finalHistoryPosition = Math.max(position, ...expectedPositions);
  const rows = Array.from({ length: finalHistoryPosition }, (_, index): HistoryDraftRow => {
    const rowPosition = index + 1;
    return rowsByPosition.get(rowPosition) ?? { pick: String(rowPosition), team: "", player: "" };
  });
  rows[position - 1] = { pick: String(position), team: pick.teamCode, player: player.name };
  const assignedPickCount = rows.filter((row) => row.team.trim() && row.player.trim()).length;
  const draftCompleted = expectedPickCount > 0
    && assignedPickCount === expectedPickCount
    && !nextDraftAssets.some((asset) => asset.year === draftYear);
  let futureDraftYear: number | null = null;
  let futurePicksAdded = 0;
  if (draftCompleted) {
    futureDraftYear = draftYear + 3;
    const generated = addFutureOrdinaryPicks(nextDraftAssets, state, futureDraftYear);
    nextDraftAssets = generated.draftAssets;
    futurePicksAdded = generated.added;
  }

  const immediateExit = destinationSlot === "immediate_cut" || destinationSlot === "immediate_release";
  const activeSlot = immediateExit ? "regular" : destinationSlot;
  const nextRosterEntries = [
    ...state.rosterEntries,
    {
      name: player.name,
      role: player.role === "X" ? undefined : player.role,
      cost: destinationSlot === "immediate_release" ? 0 : price,
      contract: immediateExit ? String((draftYear + 1) % 100).padStart(2, "0") : "T.O.",
      state: immediateExit ? "cut" as const : "active" as const,
      slot: activeSlot as DraftRosterSlot,
      teamCode: pick.teamCode,
      contractStartSeason: `${draftYear}/${String((draftYear + 1) % 100).padStart(2, "0")}`,
    },
  ];
  const draftedState: EditableLeagueState = {
    ...state,
    rosterEntries: nextRosterEntries,
    draftAssets: nextDraftAssets,
  };
  const nextState = destinationSlot === "immediate_cut" || destinationSlot === "immediate_release"
    ? removeRolelessPlayersByName(draftedState, [player.name])
    : draftedState;
  const finalSlotErrors = destinationSlot === "immediate_cut" || destinationSlot === "immediate_release"
    ? []
    : findTeamSlotOverflows(nextState.rosterEntries, pick.teamCode).map(slotOverflowMessage);
  if (!allowTemporarySlotOverflow && finalSlotErrors.length) {
    throw new Error(`${finalSlotErrors.join(" ")} Libera prima uno slot adeguato e poi assegna il rookie.`);
  }

  const currentEntry: HistoryCompetitionEntry = { season, content: { kind: "draft", rows } };
  const nextHistoryEntries = existingIndex >= 0
    ? historyEntries.map((entry, index) => index === existingIndex ? currentEntry : entry)
    : [currentEntry, ...historyEntries];

  return {
    state: nextState,
    historyEntries: nextHistoryEntries,
    playerName: player.name,
    teamCode: pick.teamCode,
    position,
    price,
    slot: destinationSlot,
    assignedPickCount,
    expectedPickCount,
    draftCompleted,
    futureDraftYear,
    futurePicksAdded,
  };
}

export function draftTeamSlotCounts(state: EditableLeagueState, teamCode: string): DraftSlotCounts {
  const active = state.rosterEntries.filter((entry) => entry.teamCode === teamCode && entry.state === "active");
  return {
    regular: active.filter((entry) => entry.slot === "regular").length,
    two_way: active.filter((entry) => entry.slot === "two_way").length,
    g_league: active.filter((entry) => entry.slot === "g_league").length,
    dpe: active.filter((entry) => entry.slot === "dpe").length,
  };
}

export function draftSlotAssignmentErrors({
  slot,
  price,
  counts,
}: {
  slot: DraftDestinationSlot;
  price: number;
  counts: DraftSlotCounts;
}) {
  const errors: string[] = [];
  if (slot === "immediate_cut" || slot === "immediate_release") return errors;
  if (!(slot in draftSlotLimits)) return ["Seleziona uno slot valido."];
  (Object.keys(draftSlotLimits) as (keyof DraftSlotCounts)[]).forEach((checkedSlot) => {
    const projectedCount = counts[checkedSlot] + (checkedSlot === slot ? 1 : 0);
    if (projectedCount <= draftSlotLimits[checkedSlot]) return;
    if (checkedSlot === slot) {
      errors.push(`Lo slot ${draftSlotLabel(slot)} è pieno (${counts[slot]}/${draftSlotLimits[slot]}). Libera prima uno slot adeguato e poi assegna il rookie.`);
      return;
    }
    errors.push(`Lo slot ${draftSlotLabel(checkedSlot)} è già oltre il limite (${counts[checkedSlot]}/${draftSlotLimits[checkedSlot]}). Sistemalo prima di assegnare il rookie.`);
  });
  if (slot === "two_way" && price > 10) errors.push("Il Two-way è disponibile soltanto fino a 10 crediti.");
  if (slot === "g_league" && price > 5) errors.push("La G-League è disponibile soltanto fino a 5 crediti.");
  return errors;
}

export function draftSlotLabel(slot: DraftDestinationSlot | "dpe") {
  if (slot === "immediate_cut") return "Taglio immediato";
  if (slot === "immediate_release") return "Rilascio immediato";
  if (slot === "two_way") return "Two-way";
  if (slot === "g_league") return "G-League";
  if (slot === "dpe") return "DPE";
  return "Roster";
}

function addFutureOrdinaryPicks(draftAssets: EditableLeagueState["draftAssets"], state: EditableLeagueState, futureDraftYear: number) {
  const next = [...draftAssets];
  let added = 0;
  for (const team of state.teams) {
    for (const round of ["1° giro", "2° giro"]) {
      const exists = next.some((asset) => (
        asset.year === futureDraftYear
        && asset.round === round
        && !asset.isBonus
        && (asset.originTeamCode ?? (typeof asset.originOrOverall === "string" ? asset.originOrOverall : null)) === team.code
      ));
      if (exists) continue;
      next.push({
        label: "Scelta",
        round,
        year: futureDraftYear,
        originOrOverall: team.code,
        originTeamCode: team.code,
        isBonus: false,
        teamCode: team.code,
      });
      added += 1;
    }
  }
  return { draftAssets: next, added };
}

function normalizePlayerName(value: string) {
  return value.trim().toLocaleLowerCase("it-IT");
}
