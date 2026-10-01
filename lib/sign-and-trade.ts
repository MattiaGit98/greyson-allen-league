import type { PlayerListEntry } from "./league-types";
import { normalizePlayerName } from "./admin-alerts";
import type { RosterEntry } from "./league-types";
import type { EditableLeagueState } from "./league-state";
import { operationWindows, tradeDeadlineHasPassed, tradesAreSuspendedForAuction, type LeagueMoment } from "./league-moments";
import { automaticFreeAgentContract } from "./rules/free-agent";
import { tradePlayerId } from "./trade-state";
import { inheritedDpeSeasons } from "./dpe-rules";
import { orderPlayerListByRole } from "./player-list-order";

export type SignAndTradeRequest = {
  kind: "free_agent";
  playerSource: "list" | "outside";
  playerName: string;
  playerRole: "G" | "A" | "C" | "X" | "";
  realTeam: string;
  signerTeamCode: string;
  price: number;
  destinationSlot: "regular" | "two_way";
  buyoutTopSixConfirmed: boolean;
};

export type SignAndTradeProvisional = {
  state: EditableLeagueState;
  signingEntry: RosterEntry;
  signingEntryId: string;
  signerTeamCode: string;
  playerName: string;
  label: string;
};

export function signAndTradeTransfersNewSigning(
  moves: readonly { id: string; fromTeamCode: string; toTeamCode: string }[],
  signingEntryId: string,
  signerTeamCode: string,
) {
  return moves.some((move) => (
    move.id === signingEntryId
    && move.fromTeamCode === signerTeamCode
    && move.toTeamCode !== signerTeamCode
  ));
}

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
  if (request.destinationSlot === "two_way" && request.price > 10) {
    throw new Error("Un free agent può essere inserito nei two-way soltanto fino a 10 crediti.");
  }

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
  if (activePlayer) throw new Error("Il giocatore appartiene già a una squadra.");
  const qualifyingOffer = state.qualifyingOfferRights.find((right) => normalizePlayerName(right.playerName) === normalizedName);
  if (qualifyingOffer) throw new Error("Il giocatore è coperto da una qualifying offer e non è un free agent.");
  const buyoutFreeAgent = request.playerSource === "list" && state.rosterEntries.some((entry) => (
    normalizePlayerName(entry.name) === normalizedName
    && entry.state === "cut"
    && entry.buyoutApplied === true
  ));
  if (buyoutFreeAgent && !request.buyoutTopSixConfirmed) {
    throw new Error("Conferma di aver verificato che la squadra firmataria occupi una delle prime otto posizioni della regular season per acquisire questo free agent soggetto a buyout.");
  }
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
      playerList: request.playerSource === "outside" ? orderPlayerListByRole([...state.playerList, player]) : state.playerList,
    },
    signingEntry,
    signingEntryId: tradePlayerId(request.signerTeamCode, signingEntry.name),
    signerTeamCode: request.signerTeamCode,
    playerName: player.name,
    label: `Firma free agent · ${request.signerTeamCode} · ${request.price} crediti · ${slotLabel(request.destinationSlot)}`,
  } satisfies SignAndTradeProvisional;
}

function slotLabel(slot: "regular" | "two_way") {
  if (slot === "two_way") return "Two-way";
  return "Roster";
}
