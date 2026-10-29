import type { QualifyingOfferRight, RosterEntry } from "./league-types";
import { hasReachedMoment, type LeagueMoment } from "./league-moments";
import { seasonEndYear } from "./season-time";

const rookieExtensionPattern = /^(\d{2})\s*\+\s*R\.?E\.?$/i;
const annualTeamOptionPattern = /^(\d{2})\s*\+\s*T\.?O\.?$/i;
const exitOptionalMarkerPattern = /^(\d{2})\s*(?:\+\s*(?:T\.?O\.?|R\.?E\.?|EXT)|\((?:E|Q)\))$/i;
const pendingContractValues = new Set(["", "-", "PENDING", "DA ASSEGNARE"]);

export function isPendingContractAssignment(contract: string) {
  return pendingContractValues.has(contract.trim().replace(/\s+/g, " ").toLocaleUpperCase("it-IT"));
}

export function destinationAfterTeamOptionExercise(
  source: RosterEntry["slot"],
  requestedForGLeague: "regular" | "two_way",
): RosterEntry["slot"] {
  if (source === "g_league") return requestedForGLeague;
  if (source === "two_way") return "regular";
  return source;
}

export function isUnresolvedTeamOption(
  entry: Pick<RosterEntry, "contract">,
  moment: LeagueMoment,
  activeSeasonName?: string,
) {
  if (hasReachedMoment(moment, "team_option_deadline")) return false;
  return entry.contract === "T.O."
    || Boolean(activeSeasonName && isRookieExtensionDecisionDue(entry, activeSeasonName));
}

export function rookieExtensionExpiryYear(contract: string, referenceYear?: number) {
  const match = contract.trim().match(rookieExtensionPattern);
  if (!match) return null;
  const shortYear = Number(match[1]);
  if (referenceYear === undefined) return shortYear;
  const century = Math.floor(referenceYear / 100) * 100;
  let fullYear = century + shortYear;
  if (fullYear > referenceYear + 50) fullYear -= 100;
  if (fullYear < referenceYear - 50) fullYear += 100;
  return fullYear;
}

export function annualTeamOptionExpiryYear(contract: string, referenceYear?: number) {
  const match = contract.trim().match(annualTeamOptionPattern);
  if (!match) return null;
  const shortYear = Number(match[1]);
  if (referenceYear === undefined) return shortYear;
  const century = Math.floor(referenceYear / 100) * 100;
  let fullYear = century + shortYear;
  if (fullYear > referenceYear + 50) fullYear -= 100;
  if (fullYear < referenceYear - 50) fullYear += 100;
  return fullYear;
}

export function isAnnualTeamOptionContract(entry: Pick<RosterEntry, "contract">) {
  return annualTeamOptionExpiryYear(entry.contract) !== null;
}

export function annualTeamOptionContract(endYear: number) {
  return `${String(endYear).slice(-2)} + T.O.`;
}

export function isRookieExtensionContract(entry: Pick<RosterEntry, "contract">) {
  return rookieExtensionExpiryYear(entry.contract) !== null;
}

export function isRookieExtensionDecisionDue(
  entry: Pick<RosterEntry, "contract">,
  activeSeasonName: string,
) {
  const activeEndYear = seasonEndYear(activeSeasonName);
  if (activeEndYear === null) return false;
  const expiry = rookieExtensionExpiryYear(entry.contract, activeEndYear);
  return expiry !== null && expiry < activeEndYear;
}

export function rookieExtensionContract(endYear: number) {
  return `${String(endYear).slice(-2)} + R.E.`;
}

export function qualifyingOfferForDeclinedRookieExtension(
  entry: Pick<RosterEntry, "name" | "cost" | "teamCode" | "role">,
): QualifyingOfferRight {
  return {
    playerName: entry.name,
    qualifyingAmount: entry.cost,
    teamCode: entry.teamCode,
    role: entry.role,
  };
}

export function exerciseOrdinaryTeamOption<T extends RosterEntry>(
  entry: T,
  activeSeasonName: string,
  requestedForGLeague: "regular" | "two_way" = "two_way",
): T {
  const activeEndYear = seasonEndYear(activeSeasonName);
  if (activeEndYear === null) throw new Error("Annata non valida.");
  if (entry.playoffTeamOptionUsedSeason && requestedForGLeague !== "regular") {
    throw new Error("Dopo l'utilizzo nei playoff la T.O. deve portare il giocatore nel Roster.");
  }
  return {
    ...entry,
    slot: destinationAfterTeamOptionExercise(entry.slot, requestedForGLeague),
    contract: rookieExtensionContract(activeEndYear),
    teamOptionBaseCost: undefined,
    teamOptionFinalYear: undefined,
    playoffTeamOptionUsedSeason: undefined,
  };
}

export function applyRookieExtension<T extends RosterEntry>(entry: T, activeSeasonName: string): T {
  const activeEndYear = seasonEndYear(activeSeasonName);
  if (activeEndYear === null) throw new Error("Annata non valida.");
  return {
    ...entry,
    cost: entry.cost * 2,
    contract: String(activeEndYear).slice(-2),
    slot: "regular",
    teamOptionBaseCost: undefined,
    teamOptionFinalYear: undefined,
    playoffTeamOptionUsedSeason: undefined,
    twoWayPromotionLocked: true,
  };
}

export function recordPlayoffTeamOptionUse<T extends RosterEntry>(entry: T, activeSeasonName: string): T {
  const activeEndYear = seasonEndYear(activeSeasonName);
  if (activeEndYear === null || entry.state !== "active" || entry.slot !== "g_league"
    || annualTeamOptionExpiryYear(entry.contract, activeEndYear) !== activeEndYear) {
    throw new Error("Il giocatore non ha una T.O. annuale attiva in G-League.");
  }
  if (entry.playoffTeamOptionUsedSeason) throw new Error("L'utilizzo nei playoff è già stato registrato.");
  return {
    ...entry,
    playoffTeamOptionUsedSeason: activeSeasonName,
  };
}

export function applyStandardContractCut<T extends RosterEntry>(
  entry: T,
  currentSeasonEndYear: number,
  _moment: LeagueMoment,
): T {
  const pendingContract = isPendingContractAssignment(entry.contract);
  return {
    ...entry,
    contract: contractAfterRosterExitForEntry(entry, currentSeasonEndYear),
    originalContractYears: pendingContract ? 1 : entry.originalContractYears,
    state: "cut",
    slot: "regular",
    scheduledSeasonEndCut: undefined,
    playoffTeamOptionUsedSeason: undefined,
    dpeActivatedAfterDeadline: undefined,
  };
}

export function contractAfterRosterExitForEntry(entry: Pick<RosterEntry, "contract" | "playoffTeamOptionUsedSeason">, currentSeasonEndYear: number) {
  const usedEndYear = entry.playoffTeamOptionUsedSeason ? seasonEndYear(entry.playoffTeamOptionUsedSeason) : null;
  if (usedEndYear !== null && (entry.contract === "T.O." || isAnnualTeamOptionContract(entry))) {
    return String(usedEndYear + 1).slice(-2);
  }
  return contractAfterRosterExit(entry.contract, currentSeasonEndYear);
}

export function contractAfterRosterExit(contract: string, currentSeasonEndYear: number) {
  const normalized = contract.trim().replace(/\s+/g, " ").toLocaleUpperCase("it-IT");
  if (isPendingContractAssignment(normalized)) return String(currentSeasonEndYear).padStart(2, "0").slice(-2);
  const optionalMarker = normalized.match(exitOptionalMarkerPattern);
  return optionalMarker?.[1] ?? contract;
}
