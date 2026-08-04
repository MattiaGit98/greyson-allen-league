import { allowedPostAuctionContracts, isPostAuctionContractAssignmentCandidate, type PostAuctionContractKind } from "./auction-management";
import type { EditableLeagueState } from "./league-state";
import { findAllSlotOverflows, slotOverflowMessage } from "./roster-slot-limits";
import { assignedAuctionContract } from "./rules/contracts";
import { seasonEndYear } from "./season-time";
import { slotEligibilityErrors } from "./slot-eligibility";

export type PostAuctionContractSlot = "regular" | "two_way" | "g_league";

export type PostAuctionContractDraft = {
  seasonName: string;
  teamCode: string;
  playerName: string;
  contractKind: PostAuctionContractKind;
  slot: PostAuctionContractSlot;
};

export function postAuctionContractDraftKey(teamCode: string, playerName: string) {
  return `${teamCode.trim().toLocaleUpperCase("it-IT")}|${normalizePlayerName(playerName)}`;
}

export function postAuctionContractCandidates(state: EditableLeagueState, seasonName: string) {
  return state.rosterEntries.filter((entry) => isPostAuctionContractAssignmentCandidate(entry, seasonName));
}

export function missingPostAuctionContractDrafts(
  state: EditableLeagueState,
  drafts: PostAuctionContractDraft[],
  seasonName: string,
) {
  const assigned = new Set(drafts
    .filter((draft) => draft.seasonName === seasonName)
    .map((draft) => postAuctionContractDraftKey(draft.teamCode, draft.playerName)));
  return postAuctionContractCandidates(state, seasonName)
    .filter((entry) => !assigned.has(postAuctionContractDraftKey(entry.teamCode, entry.name)));
}

export function applyPostAuctionContractDrafts({
  state,
  drafts,
  seasonName,
  requireComplete = true,
}: {
  state: EditableLeagueState;
  drafts: PostAuctionContractDraft[];
  seasonName: string;
  requireComplete?: boolean;
}): EditableLeagueState {
  const endYear = seasonEndYear(seasonName);
  if (endYear === null) throw new Error("Annata non valida.");

  const candidates = postAuctionContractCandidates(state, seasonName);
  const candidatesByKey = new Map(candidates.map((entry) => [postAuctionContractDraftKey(entry.teamCode, entry.name), entry]));
  const currentDrafts = drafts.filter((draft) => draft.seasonName === seasonName);
  const draftsByKey = new Map<string, PostAuctionContractDraft>();
  const playersByName = new Map(state.playerList.map((player) => [normalizePlayerName(player.name), player]));

  for (const draft of currentDrafts) {
    const key = postAuctionContractDraftKey(draft.teamCode, draft.playerName);
    if (draftsByKey.has(key)) throw new Error(`${draft.playerName} compare più di una volta nelle bozze dei contratti.`);
    const entry = candidatesByKey.get(key);
    // Una bozza può diventare obsoleta dopo uno scambio o la rimozione di un acquisto.
    // Rimane privata nello storico della stagione, ma non partecipa alla consegna.
    if (!entry) continue;
    validateDraft(entry, draft, playersByName.get(normalizePlayerName(entry.name)));
    draftsByKey.set(key, draft);
  }

  if (requireComplete) {
    const missing = candidates.filter((entry) => !draftsByKey.has(postAuctionContractDraftKey(entry.teamCode, entry.name)));
    if (missing.length) throw new Error(`${missing.length} contratti dell'asta non sono ancora stati assegnati.`);
  }

  const rosterEntries = state.rosterEntries.map((entry) => {
    const draft = draftsByKey.get(postAuctionContractDraftKey(entry.teamCode, entry.name));
    if (!draft || !isPostAuctionContractAssignmentCandidate(entry, seasonName)) return entry;
    return {
      ...entry,
      ...assignedAuctionContract(entry.auctionPrice ?? entry.cost, draft.contractKind, endYear),
      slot: draft.slot,
      contractStartSeason: entry.contractStartSeason ?? seasonName,
    };
  });
  const affectedTeams = new Set([...draftsByKey.values()].map((draft) => draft.teamCode));
  const slotErrors = findAllSlotOverflows(rosterEntries, affectedTeams).map(slotOverflowMessage);
  if (slotErrors.length) throw new Error(slotErrors.join(" "));

  for (const entry of rosterEntries.filter((item) => draftsByKey.has(postAuctionContractDraftKey(item.teamCode, item.name)))) {
    if (entry.state !== "active" || (entry.slot !== "two_way" && entry.slot !== "g_league")) continue;
    const errors = slotEligibilityErrors(entry, entry.slot, seasonName);
    if (errors.length) throw new Error(`${entry.name}: ${errors.join(" ")}`);
  }

  return { ...state, rosterEntries };
}

function validateDraft(
  entry: EditableLeagueState["rosterEntries"][number],
  draft: PostAuctionContractDraft,
  player: EditableLeagueState["playerList"][number] | undefined,
) {
  if (!player) throw new Error(`${entry.name} non è presente nel listone.`);
  if (!allowedPostAuctionContracts(entry.auctionAcquisition).includes(draft.contractKind)) {
    throw new Error(entry.auctionAcquisition === "qualifying_offer"
      ? `${entry.name}: una Q.O. accettata richiede il contratto annuale.`
      : `${entry.name}: un restricted free agent può ricevere soltanto un contratto annuale o biennale.`);
  }
  if (entry.state === "cut" && draft.slot !== "regular") {
    throw new Error(`${entry.name}: un giocatore già tagliato deve restare fuori dagli slot attivi.`);
  }
  if (entry.auctionAcquisition && draft.slot !== "regular") {
    throw new Error(`${entry.name}: un acquisto tramite Q.O. o come RFA deve restare nel roster.`);
  }
  const auctionPrice = entry.auctionPrice ?? entry.cost;
  const destinationRequiresTeamOption = draft.slot === "two_way" || draft.slot === "g_league";
  if (destinationRequiresTeamOption && draft.contractKind !== "team_option") {
    throw new Error(`${entry.name}: negli slot speciali è selezionabile soltanto la T.O.`);
  }
  const teamOptionEligible = player.rookie || (player.under23 && auctionPrice <= 15);
  if (draft.contractKind === "team_option" && !teamOptionEligible) {
    throw new Error(`${entry.name} non rispetta i requisiti per la T.O.`);
  }
  if (draft.slot === "two_way" && auctionPrice > 10) {
    throw new Error(`${entry.name}: il Two-way richiede un costo massimo di 10.`);
  }
  if (draft.slot === "g_league" && auctionPrice > 5) {
    throw new Error(`${entry.name}: la G-League richiede un costo massimo di 5.`);
  }
}

function normalizePlayerName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("it-IT");
}
