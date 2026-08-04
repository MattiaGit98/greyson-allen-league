import type { RosterEntry } from "./league-types";
import type { EditableLeagueState } from "./league-state";
import { seasonEndYear } from "./season-time";

export type RosterCorrectionInput = {
  sourceIndex: number;
  playerName: string;
  cost: number;
  contract: string;
  remove: boolean;
};

export type RosterAdditionInput = {
  playerName: string;
  cost: number;
  contract: string;
  slot: RosterEntry["slot"];
};

export type AppliedRosterCorrection = {
  sourceIndex: number;
  before: RosterEntry;
  after: RosterEntry | null;
};

export function normalizeRosterCorrectionContract(value: string) {
  const normalized = value.trim().replace(/\s+/g, " ").toLocaleUpperCase("it-IT");
  if (normalized === "T.O.") return "T.O.";
  if (normalized === "PENDING" || normalized === "DA ASSEGNARE") return "PENDING";
  const match = normalized.match(/^(\d{2})(?: \((E|Q|2X)\))?$/);
  if (!match) return null;
  return match[2] ? `${match[1]} (${match[2]})` : match[1];
}

export function applyRosterCorrections({
  state,
  teamCode,
  seasonName,
  corrections,
  addition = null,
}: {
  state: EditableLeagueState;
  teamCode: string;
  seasonName: string;
  corrections: RosterCorrectionInput[];
  addition?: RosterAdditionInput | null;
}) {
  if (!state.teams.some((team) => team.code === teamCode)) throw new Error("Squadra non valida.");
  if (!corrections.length && !addition) throw new Error("Non hai inserito alcuna rettifica.");
  const indices = new Set<number>();
  const changes: AppliedRosterCorrection[] = [];

  for (const correction of corrections) {
    if (!Number.isInteger(correction.sourceIndex) || correction.sourceIndex < 0) {
      throw new Error("Rettifica non valida.");
    }
    if (indices.has(correction.sourceIndex)) throw new Error("Un giocatore compare più di una volta nelle rettifiche.");
    indices.add(correction.sourceIndex);
    const entry = state.rosterEntries[correction.sourceIndex];
    if (!entry || entry.teamCode !== teamCode || entry.name !== correction.playerName) {
      throw new Error(`${correction.playerName || "Un giocatore"} non appartiene più alla squadra selezionata.`);
    }
    if (correction.remove) {
      changes.push({ sourceIndex: correction.sourceIndex, before: entry, after: null });
      continue;
    }
    if (!Number.isSafeInteger(correction.cost) || correction.cost < 0) {
      throw new Error(`${entry.name}: il costo deve essere un numero intero non negativo.`);
    }
    const contract = normalizeRosterCorrectionContract(correction.contract);
    if (!contract) throw new Error(`${entry.name}: scadenza non riconosciuta. Usa solo uno dei formati indicati nella legenda.`);
    if (contract === "PENDING" && normalizeRosterCorrectionContract(entry.contract) !== "PENDING") {
      throw new Error(`${entry.name}: PENDING può restare soltanto sui contratti dell'asta ancora da pubblicare.`);
    }
    const after = correctedContractMetadata({ ...entry, cost: correction.cost, contract }, seasonName);
    if (after.cost === entry.cost && after.contract === entry.contract) continue;
    changes.push({ sourceIndex: correction.sourceIndex, before: entry, after });
  }

  if (!changes.length && !addition) throw new Error("Non hai inserito alcuna rettifica.");
  const changeByIndex = new Map(changes.map((change) => [change.sourceIndex, change]));
  let rosterEntries = state.rosterEntries.flatMap((entry, index) => {
    const change = changeByIndex.get(index);
    if (!change) return [entry];
    return change.after ? [change.after] : [];
  });

  let addedEntry: RosterEntry | null = null;
  if (addition) {
    const requestedName = normalizeName(addition.playerName);
    const player = state.playerList.find((item) => normalizeName(item.name) === requestedName);
    if (!player || player.role === "X") throw new Error("Seleziona un free agent del listone con ruolo riconosciuto.");
    if (state.rosterEntries.some((entry) => entry.state === "active" && normalizeName(entry.name) === requestedName)) {
      throw new Error(`${player.name} è già attivo in un roster.`);
    }
    if (state.qualifyingOfferRights.some((right) => normalizeName(right.playerName) === requestedName)) {
      throw new Error(`${player.name} ha una qualifying offer e non è un free agent puro.`);
    }
    if (!Number.isSafeInteger(addition.cost) || addition.cost < 0) {
      throw new Error(`${player.name}: il costo deve essere un numero intero non negativo.`);
    }
    const contract = normalizeRosterCorrectionContract(addition.contract);
    if (!contract || contract === "PENDING") {
      throw new Error(`${player.name}: scadenza non riconosciuta. Usa solo uno dei formati indicati nella legenda.`);
    }
    if (!["regular", "two_way", "g_league", "dpe"].includes(addition.slot)) {
      throw new Error("Slot della nuova aggiunta non valido.");
    }
    addedEntry = correctedContractMetadata({
      name: player.name,
      role: player.role,
      cost: addition.cost,
      contract,
      state: "active",
      slot: addition.slot,
      teamCode,
      contractStartSeason: seasonName,
    }, seasonName);
    rosterEntries = [...rosterEntries, addedEntry];
  }

  for (const entry of rosterEntries.filter((item) => item.teamCode === teamCode)) {
    if (normalizeRosterCorrectionContract(entry.contract) === null) {
      throw new Error(`${entry.name}: scadenza non riconosciuta. Correggila prima di salvare.`);
    }
    if (!Number.isSafeInteger(entry.cost) || entry.cost < 0) {
      throw new Error(`${entry.name}: il costo deve essere un numero intero non negativo.`);
    }
  }

  return { state: { ...state, rosterEntries }, changes, addition: addedEntry };
}

function correctedContractMetadata(entry: RosterEntry, seasonName: string): RosterEntry {
  const isFutureTeamOption = /\(2X\)/.test(entry.contract);
  const keepsTeamOptionHistory = entry.contract === "T.O."
    || isFutureTeamOption
    || (entry.contract.includes("(Q)") && entry.teamOptionFinalYear !== undefined);
  const expiry = entry.contract.match(/^\d{2}/)?.[0];
  const activeEndYear = seasonEndYear(seasonName);
  const finalYear = expiry && activeEndYear !== null
    ? Math.floor(activeEndYear / 100) * 100 + Number(expiry)
    : undefined;
  return {
    ...entry,
    originalContractYears: entry.contract.includes("(E)") ? 3 : entry.originalContractYears,
    teamOptionBaseCost: isFutureTeamOption ? entry.cost : keepsTeamOptionHistory ? entry.teamOptionBaseCost : undefined,
    teamOptionFinalYear: isFutureTeamOption ? finalYear : keepsTeamOptionHistory ? entry.teamOptionFinalYear : undefined,
    playoffTeamOptionPromotionSeason: keepsTeamOptionHistory ? entry.playoffTeamOptionPromotionSeason : undefined,
  };
}

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("it-IT");
}
