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

export function rosterCorrectionContractError(value: string) {
  return normalizeRosterCorrectionContract(value) === null
    ? "Scadenza non riconosciuta. Usa solo uno dei formati indicati nella legenda."
    : null;
}

export function applyRosterCorrections({
  state,
  teamCode,
  seasonName,
  corrections,
}: {
  state: EditableLeagueState;
  teamCode: string;
  seasonName: string;
  corrections: RosterCorrectionInput[];
}) {
  if (!state.teams.some((team) => team.code === teamCode)) throw new Error("Squadra non valida.");
  if (!corrections.length) throw new Error("Non hai inserito alcuna rettifica.");
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

  if (!changes.length) throw new Error("Non hai inserito alcuna rettifica.");
  const changeByIndex = new Map(changes.map((change) => [change.sourceIndex, change]));
  const rosterEntries = state.rosterEntries.flatMap((entry, index) => {
    const change = changeByIndex.get(index);
    if (!change) return [entry];
    return change.after ? [change.after] : [];
  });

  for (const entry of rosterEntries.filter((item) => item.teamCode === teamCode)) {
    if (normalizeRosterCorrectionContract(entry.contract) === null) {
      throw new Error(`${entry.name}: scadenza non riconosciuta. Correggila prima di salvare.`);
    }
    if (!Number.isSafeInteger(entry.cost) || entry.cost < 0) {
      throw new Error(`${entry.name}: il costo deve essere un numero intero non negativo.`);
    }
  }

  return { state: { ...state, rosterEntries }, changes };
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
