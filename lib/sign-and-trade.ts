import type { PlayerListEntry } from "./league-types";
import { normalizePlayerName } from "./admin-alerts";
import { isCapIssueCode } from "./cap-override";
import type { RosterEntry } from "./league-types";
import type { EditableLeagueState } from "./league-state";
import { operationWindows, tradeDeadlineHasPassed, tradesAreSuspendedForAuction, type LeagueMoment } from "./league-moments";
import { automaticFreeAgentContract, evaluateFreeAgentSigning } from "./rules/free-agent";
import { countRosterRoles } from "./rules/roster";
import { calculateCapSpace } from "./season-time";
import { tradePlayerId } from "./trade-state";
import { inheritedDpeSeasons } from "./dpe-rules";

export type SignAndTradeRequest = {
  kind: "free_agent";
  playerSource: "list" | "outside";
  playerName: string;
  playerRole: "G" | "A" | "C" | "X" | "";
  realTeam: string;
  signerTeamCode: string;
  price: number;
  destinationSlot: "regular" | "two_way";
};

export type SignAndTradeProvisional = {
  state: EditableLeagueState;
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
}): SignAndTradeProvisional {
  if (!operationWindows.trades(input.moment)) {
    throw new Error(tradesAreSuspendedForAuction(input.moment)
      ? "Il sign and trade è sospeso durante l'asta."
      : "Il sign and trade non è disponibile dopo la trade deadline.");
  }
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
    if (!request.playerName.trim() || !["G", "A", "C", "X"].includes(role)) {
      throw new Error("Per il giocatore fuori listone devi indicare nome e ruolo.");
    }
    player = {
      name: request.playerName.trim().replace(/\s+/g, " "),
      role: role as PlayerListEntry["role"],
      realTeam: "FA",
      rookie: false,
      under23: false,
    };
  }
  const normalizedName = normalizePlayerName(player.name);
  const activePlayer = state.rosterEntries.find((entry) => normalizePlayerName(entry.name) === normalizedName && entry.state === "active");
  const qualifyingOffer = state.qualifyingOfferRights.find((right) => normalizePlayerName(right.playerName) === normalizedName);
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
  const contract = automaticFreeAgentContract(input.seasonName, tradeDeadlineHasPassed(input.moment));
  if (!contract) throw new Error("Annata non valida.");
  const dpeAppliedSeasons = inheritedDpeSeasons(state.rosterEntries, player.name);
  const signingEntry: RosterEntry = {
    name: player.name,
    role: player.role === "X" ? undefined : player.role,
    cost: request.price,
    contract,
    state: "active",
    slot: request.destinationSlot,
    teamCode: request.signerTeamCode,
    stretchProvisionApplied: false,
    buyoutApplied: false,
    freeAgentSignedSeason: input.seasonName,
    contractStartSeason: input.seasonName,
    ...(dpeAppliedSeasons.length ? { dpeAppliedSeasons } : {}),
  };
  return {
    state: {
      ...state,
      rosterEntries: [...state.rosterEntries, signingEntry],
      playerList: request.playerSource === "outside" ? [...state.playerList, player] : state.playerList,
    },
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

function slotLabel(slot: "regular" | "two_way") {
  if (slot === "two_way") return "Two-way";
  return "Roster";
}
