import type { QualifyingOfferRight, RosterEntry } from "./league-types";
import { hasReachedMoment, type LeagueMoment } from "./league-moments";
import { followingSeasonName, seasonEndYear } from "./season-time";

const rookieExtensionPattern = /^(\d{2})\s*\+\s*R\.?E\.?$/i;
const annualTeamOptionPattern = /^(\d{2})\s*\+\s*T\.?O\.?$/i;
const legacyDoublePattern = /^(\d{2})\s*(?:\((?:2X|X2)\)|(?:2X|X2))$/i;
const legacyDoubleTextPattern = /(\d{2})\s*(?:\((?:2X|X2)\)|(?:2X|X2))/gi;

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
  entry: Pick<RosterEntry, "name" | "cost" | "teamCode">,
): QualifyingOfferRight {
  return {
    playerName: entry.name,
    qualifyingAmount: entry.cost,
    teamCode: entry.teamCode,
  };
}

export function exerciseOrdinaryTeamOption<T extends RosterEntry>(
  entry: T,
  activeSeasonName: string,
  requestedForGLeague: "regular" | "two_way" = "two_way",
): T {
  const activeEndYear = seasonEndYear(activeSeasonName);
  if (activeEndYear === null) throw new Error("Annata non valida.");
  return {
    ...entry,
    slot: destinationAfterTeamOptionExercise(entry.slot, requestedForGLeague),
    contract: rookieExtensionContract(activeEndYear),
    teamOptionBaseCost: undefined,
    teamOptionFinalYear: undefined,
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
    playoffTeamOptionPromotionSeason: undefined,
    twoWayPromotionLocked: true,
  };
}

export function exercisePlayoffTeamOption<T extends RosterEntry>(entry: T, activeSeasonName: string): T {
  const activeEndYear = seasonEndYear(activeSeasonName);
  if (activeEndYear === null) throw new Error("Annata non valida.");
  return {
    ...entry,
    contract: rookieExtensionContract(activeEndYear + 1),
    teamOptionBaseCost: undefined,
    teamOptionFinalYear: undefined,
    playoffTeamOptionPromotionSeason: followingSeasonName(activeSeasonName),
  };
}

export function normalizeLegacyRookieExtensionEntry<T extends RosterEntry>(entry: T): T {
  const match = entry.contract.trim().match(legacyDoublePattern);
  if (!match) return entry;
  const previousShortYear = (Number(match[1]) + 99) % 100;
  return {
    ...entry,
    contract: `${String(previousShortYear).padStart(2, "0")} + R.E.`,
    teamOptionBaseCost: undefined,
    teamOptionFinalYear: undefined,
  };
}

export function normalizeLegacyRookieExtensionText(value: string) {
  return value.replace(legacyDoubleTextPattern, (_, shortYear: string) => (
    `${String((Number(shortYear) + 99) % 100).padStart(2, "0")} + R.E.`
  ));
}

export function normalizeLegacyRookieExtensionState<T>(value: T): T {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.rosterEntries)) return value;
  return {
    ...record,
    rosterEntries: record.rosterEntries.map((entry) => (
      entry && typeof entry === "object" && typeof (entry as Record<string, unknown>).contract === "string"
        ? normalizeLegacyRookieExtensionEntry(entry as RosterEntry)
        : entry
    )),
  } as T;
}

export function normalizeLegacyAnnualTeamOptionState<T>(
  value: T,
  activeSeasonName: string,
  teamOptionsResolved: boolean,
): T {
  if (!teamOptionsResolved || !value || typeof value !== "object" || Array.isArray(value)) return value;
  const activeEndYear = seasonEndYear(activeSeasonName);
  if (activeEndYear === null) return value;
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.rosterEntries)) return value;
  return {
    ...record,
    rosterEntries: record.rosterEntries.map((entry) => (
      entry && typeof entry === "object" && (entry as Record<string, unknown>).contract === "T.O."
        ? { ...entry, contract: annualTeamOptionContract(activeEndYear) }
        : entry
    )),
  } as T;
}

export function applyStandardContractCut<T extends RosterEntry>(
  entry: T,
  _currentSeasonEndYear: number,
  _moment: LeagueMoment,
): T {
  return {
    ...entry,
    state: "cut",
    slot: "regular",
  };
}
