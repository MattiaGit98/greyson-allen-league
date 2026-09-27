import type { RosterEntry } from "./league-types";
import type { EditableLeagueState } from "./league-state";
import { hasReachedMoment, type LeagueMoment } from "./league-moments";
import { seasonEndYear } from "./season-time";
import { isAnnualTeamOptionContract } from "./team-option-contract";

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
  const rookieExtension = normalized.match(/^(\d{2}) \+ R\.?E\.?$/);
  if (rookieExtension) return `${rookieExtension[1]} + R.E.`;
  const annualTeamOption = normalized.match(/^(\d{2}) \+ T\.?O\.?$/);
  if (annualTeamOption) return `${annualTeamOption[1]} + T.O.`;
  const match = normalized.match(/^(\d{2})(?: \((E|Q)\))?$/);
  if (!match) return null;
  return match[2] ? `${match[1]} (${match[2]})` : match[1];
}

export function rosterCorrectionContractOptions(seasonName: string, leagueMoment: LeagueMoment) {
  const currentEndYear = seasonEndYear(seasonName);
  if (currentEndYear === null) return [];
  const options: { value: string; label: string }[] = [];
  if (leagueMoment === "offseason_start") {
    options.push({ value: "T.O.", label: "T.O." });
    options.push({ value: `${shortYear(currentEndYear - 1)} + R.E.`, label: "R.E." });
  }
  for (let distance = 0; distance < 3; distance += 1) {
    const year = shortYear(currentEndYear + distance);
    options.push(
      { value: year, label: year },
      { value: `${year} + T.O.`, label: `${year} + T.O.` },
      { value: `${year} + R.E.`, label: `${year} + R.E.` },
      { value: `${year} (Q)`, label: `${year} → Q.O.` },
    );
    if (distance > 0 || !hasReachedMoment(leagueMoment, "auction_start")) {
      options.push({ value: `${year} (E)`, label: `${year} + EXT` });
    }
  }
  return options;
}

export function applyRosterCorrections({
  state,
  teamCode,
  seasonName,
  leagueMoment,
  corrections,
  addition = null,
}: {
  state: EditableLeagueState;
  teamCode: string;
  seasonName: string;
  leagueMoment: LeagueMoment;
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
    if (!contract) throw new Error(`${entry.name}: scadenza non riconosciuta. Seleziona una delle opzioni disponibili.`);
    const initialContract = normalizeRosterCorrectionContract(entry.contract);
    if (initialContract === "PENDING" && contract !== "PENDING") {
      throw new Error(`${entry.name}: il contratto da assegnare non può essere modificato dalle rettifiche roster.`);
    }
    if (contract === "PENDING" && initialContract !== "PENDING") {
      throw new Error(`${entry.name}: PENDING può restare soltanto sui contratti dell'asta ancora da pubblicare.`);
    }
    if (!isSelectableCorrectionContract(contract, seasonName, leagueMoment) && contract !== initialContract) {
      throw new Error(`${entry.name}: seleziona una delle scadenze previste per l'annata attiva.`);
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
      throw new Error(`${player.name}: scadenza non riconosciuta.`);
    }
    if (!isSelectableCorrectionContract(contract, seasonName, leagueMoment)) {
      throw new Error(`${player.name}: seleziona una delle scadenze previste per l'annata attiva.`);
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

function correctedContractMetadata(entry: RosterEntry, _seasonName: string): RosterEntry {
  const isRookieExtension = /^\d{2} \+ R\.E\.$/.test(entry.contract);
  const keepsTeamOptionHistory = entry.contract === "T.O."
    || isAnnualTeamOptionContract(entry)
    || (entry.contract.includes("(Q)") && entry.teamOptionFinalYear !== undefined);
  return {
    ...entry,
    originalContractYears: entry.contract.includes("(E)") ? 3 : entry.originalContractYears,
    teamOptionBaseCost: keepsTeamOptionHistory ? entry.teamOptionBaseCost : undefined,
    teamOptionFinalYear: keepsTeamOptionHistory ? entry.teamOptionFinalYear : undefined,
    playoffTeamOptionPromotionSeason: keepsTeamOptionHistory || isRookieExtension ? entry.playoffTeamOptionPromotionSeason : undefined,
  };
}

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("it-IT");
}

function shortYear(year: number) {
  return String(year % 100).padStart(2, "0");
}

function isSelectableCorrectionContract(contract: string, seasonName: string, leagueMoment: LeagueMoment) {
  return rosterCorrectionContractOptions(seasonName, leagueMoment).some((option) => option.value === contract);
}
