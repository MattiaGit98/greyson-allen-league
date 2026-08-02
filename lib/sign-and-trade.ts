import type { PlayerListEntry } from "./league-types";
import { nbaTeamCodes } from "../data/nba-teams";
import { normalizePlayerName } from "./admin-alerts";
import { isCapIssueCode } from "./cap-override";
import { buildDraftAssignment, type DraftAssignmentResult, type DraftDestinationSlot } from "./draft-assignment";
import type { RosterEntry } from "./league-types";
import type { HistoryCompetitionEntry } from "./history-competitions";
import type { EditableLeagueState } from "./league-state";
import { operationWindows, tradeDeadlineHasPassed, type LeagueMoment } from "./league-moments";
import { evaluateFreeAgentSigning } from "./rules/free-agent";
import { countRosterRoles } from "./rules/roster";
import { calculateCapSpace, seasonEndYear } from "./season-time";
import { tradePlayerId } from "./trade-state";

export type FreeAgentSignAndTradeRequest = {
  kind: "free_agent";
  playerSource: "list" | "outside";
  playerName: string;
  playerRole: "G" | "A" | "C" | "X" | "";
  realTeam: string;
  signerTeamCode: string;
  price: number;
  destinationSlot: "regular" | "two_way";
};

export type DraftSignAndTradeRequest = {
  kind: "draft";
  playerName: string;
  signerTeamCode: string;
  pickIndex: number;
  draftYear: number;
  destinationSlot: DraftDestinationSlot;
};

export type SignAndTradeRequest = FreeAgentSignAndTradeRequest | DraftSignAndTradeRequest;

export type SignAndTradeProvisional = {
  state: EditableLeagueState;
  draftAssignment: DraftAssignmentResult | null;
  draftHistoryBefore: HistoryCompetitionEntry[] | null;
  draftHistoryAfter: HistoryCompetitionEntry[] | null;
  signingEntry: RosterEntry;
  signingEntryId: string;
  signerTeamCode: string;
  playerName: string;
  label: string;
  capWarnings: string[];
  warnings: string[];
  spaceBefore: number;
  spaceAfterSigning: number;
};

export function buildSignAndTradeProvisional(input: {
  state: EditableLeagueState;
  request: SignAndTradeRequest;
  seasonName: string;
  phase: string;
  moment: LeagueMoment;
  draftHistoryEntries?: HistoryCompetitionEntry[];
}): SignAndTradeProvisional {
  if (!operationWindows.trades(input.moment)) {
    throw new Error("Il sign and trade non è disponibile durante l'asta o dopo la trade deadline.");
  }
  if (input.request.kind === "draft") return buildDraftProvisional({ ...input, request: input.request });
  return buildFreeAgentProvisional({ ...input, request: input.request });
}

function buildFreeAgentProvisional(input: {
  state: EditableLeagueState;
  request: FreeAgentSignAndTradeRequest;
  seasonName: string;
  phase: string;
  moment: LeagueMoment;
}) {
  const { state, request } = input;
  if (!operationWindows.freeAgency(input.moment)) throw new Error("La free agency non è aperta.");
  if (state.playerListStatus !== "published") throw new Error("Il listone ufficiale non è ancora pubblicato.");
  if (!state.teams.some((team) => team.code === request.signerTeamCode)) throw new Error("Squadra firmataria non valida.");
  if (!Number.isInteger(request.price) || request.price < 1) throw new Error("Il prezzo deve essere un intero di almeno 1 credito.");
  if (!["regular", "two_way"].includes(request.destinationSlot)) throw new Error("Slot della firma non valido.");

  const requestedName = normalizePlayerName(request.playerName);
  const listedPlayer = state.playerList.find((player) => normalizePlayerName(player.name) === requestedName);
  let player: PlayerListEntry;
  if (request.playerSource === "list") {
    if (!listedPlayer) throw new Error("Il giocatore non è presente nel listone.");
    player = listedPlayer;
  } else {
    if (listedPlayer) throw new Error("Il giocatore è già nel listone.");
    const role = request.playerRole;
    const realTeam = request.realTeam.trim().toUpperCase();
    if (!request.playerName.trim() || !["G", "A", "C", "X"].includes(role) || !nbaTeamCodes.has(realTeam)) {
      throw new Error("Per il giocatore fuori listone devi indicare nome, ruolo e squadra NBA.");
    }
    player = {
      name: request.playerName.trim().replace(/\s+/g, " "),
      role: role as PlayerListEntry["role"],
      realTeam,
      rookie: false,
      under23: false,
    };
  }
  const normalizedName = normalizePlayerName(player.name);
  const activePlayer = state.rosterEntries.find((entry) => normalizePlayerName(entry.name) === normalizedName && entry.state === "active");
  const qualifyingOffer = state.qualifyingOfferRights.find((right) => normalizePlayerName(right.playerName) === normalizedName);
  const cutBySigningTeam = state.rosterEntries.some((entry) => (
    normalizePlayerName(entry.name) === normalizedName
    && entry.teamCode === request.signerTeamCode
    && entry.state === "cut"
  ));
  const teamEntries = state.rosterEntries.filter((entry) => entry.teamCode === request.signerTeamCode);
  const activeEntries = teamEntries.filter((entry) => entry.state === "active");
  const rolesByName = new Map(state.playerList.map((item) => [
    normalizePlayerName(item.name),
    item.role === "X" ? null : item.role,
  ]));
  const currentCost = 1000 - calculateCapSpace({
    entries: teamEntries.filter((entry) => entry.state !== "active" || entry.slot !== "dpe"),
    seasonName: input.seasonName,
    optionSeasonName: input.seasonName,
    countTeamOptions: true,
  });
  const evaluation = evaluateFreeAgentSigning({
    phase: input.phase,
    currentCost,
    price: request.price,
    destination: request.destinationSlot,
    slots: {
      regular: activeEntries.filter((entry) => entry.slot === "regular").length,
      twoWay: activeEntries.filter((entry) => entry.slot === "two_way").length,
      gLeague: activeEntries.filter((entry) => entry.slot === "g_league").length,
      dpe: activeEntries.filter((entry) => entry.slot === "dpe").length,
    },
    playerSelected: true,
    playerAlreadyOwned: Boolean(activePlayer),
    qualifyingOfferActive: Boolean(qualifyingOffer),
    cutBySigningTeam,
    roles: countRosterRoles(activeEntries.map((entry) => ({
      role: rolesByName.get(normalizePlayerName(entry.name)) ?? null,
      slot: entry.slot,
    }))),
    playerRole: player.role === "X" ? null : player.role,
    cutRole: null,
    cutSlot: null,
  });
  const blockingErrors = evaluation.errors.filter((issue) => !issue.code.startsWith("SLOT_"));
  if (blockingErrors.length) throw new Error(blockingErrors.map((issue) => issue.message).join(" "));
  const endYear = seasonEndYear(input.seasonName);
  if (!endYear) throw new Error("Annata non valida.");
  const expiry = String(endYear).slice(-2);
  const signingEntry: RosterEntry = {
    name: player.name,
    role: player.role === "X" ? undefined : player.role,
    cost: request.price,
    contract: tradeDeadlineHasPassed(input.moment) ? expiry : `${expiry} (Q)`,
    state: "active",
    slot: request.destinationSlot,
    teamCode: request.signerTeamCode,
    stretchProvisionApplied: false,
    buyoutApplied: false,
    freeAgentSignedSeason: input.seasonName,
    contractStartSeason: input.seasonName,
  };
  return {
    state: {
      ...state,
      rosterEntries: [...state.rosterEntries, signingEntry],
      playerList: request.playerSource === "outside" ? [...state.playerList, player] : state.playerList,
    },
    draftAssignment: null,
    draftHistoryBefore: null,
    draftHistoryAfter: null,
    signingEntry,
    signingEntryId: tradePlayerId(request.signerTeamCode, signingEntry.name),
    signerTeamCode: request.signerTeamCode,
    playerName: player.name,
    label: `Firma free agent · ${request.signerTeamCode} · ${request.price} crediti · ${slotLabel(request.destinationSlot)}`,
    capWarnings: evaluation.warnings.filter((issue) => isCapIssueCode(issue.code)).map((issue) => issue.message),
    warnings: evaluation.warnings.filter((issue) => !isCapIssueCode(issue.code)).map((issue) => issue.message),
    spaceBefore: evaluation.calculated.spaceBefore,
    spaceAfterSigning: evaluation.calculated.spaceAfter,
  } satisfies SignAndTradeProvisional;
}

function buildDraftProvisional(input: {
  state: EditableLeagueState;
  request: DraftSignAndTradeRequest;
  seasonName: string;
  phase: string;
  moment: LeagueMoment;
  draftHistoryEntries?: HistoryCompetitionEntry[];
}) {
  if (!operationWindows.draft(input.moment)) throw new Error("Il Draft non è aperto.");
  const activeDraftYear = Number(input.seasonName.slice(0, 4));
  if (input.request.draftYear !== activeDraftYear) {
    throw new Error(`Il Draft ${input.request.draftYear} è soltanto in anteprima nell'annata attuale.`);
  }
  const historyEntries = input.draftHistoryEntries ?? [];
  const assignment = buildDraftAssignment({
    state: input.state,
    historyEntries,
    draftYear: input.request.draftYear,
    pickIndex: input.request.pickIndex,
    requestedPlayerName: input.request.playerName,
    destinationSlot: input.request.destinationSlot,
    allowTemporarySlotOverflow: true,
  });
  if (assignment.teamCode !== input.request.signerTeamCode) throw new Error("La scelta non appartiene più alla squadra indicata.");
  const signingEntry = assignment.state.rosterEntries.find((entry) => (
    entry.name === assignment.playerName
    && entry.teamCode === assignment.teamCode
    && entry.state === "active"
  ));
  if (!signingEntry) throw new Error("Non è stato possibile preparare la firma del rookie.");
  const beforeEntries = input.state.rosterEntries.filter((entry) => entry.teamCode === assignment.teamCode && (entry.state !== "active" || entry.slot !== "dpe"));
  const afterEntries = assignment.state.rosterEntries.filter((entry) => entry.teamCode === assignment.teamCode && (entry.state !== "active" || entry.slot !== "dpe"));
  const capInput = {
    seasonName: input.seasonName,
    optionSeasonName: input.seasonName,
    countTeamOptions: true,
  };
  return {
    state: assignment.state,
    draftAssignment: assignment,
    draftHistoryBefore: historyEntries,
    draftHistoryAfter: assignment.historyEntries,
    signingEntry,
    signingEntryId: tradePlayerId(assignment.teamCode, signingEntry.name),
    signerTeamCode: assignment.teamCode,
    playerName: assignment.playerName,
    label: `Scelta #${assignment.position} · ${assignment.teamCode} · ${assignment.price} crediti · ${slotLabel(assignment.slot)}`,
    capWarnings: [],
    warnings: [],
    spaceBefore: calculateCapSpace({ entries: beforeEntries, ...capInput }),
    spaceAfterSigning: calculateCapSpace({ entries: afterEntries, ...capInput }),
  } satisfies SignAndTradeProvisional;
}

function slotLabel(slot: DraftDestinationSlot | "regular" | "two_way") {
  if (slot === "two_way") return "Two-way";
  if (slot === "g_league") return "G-League";
  return "Roster";
}
