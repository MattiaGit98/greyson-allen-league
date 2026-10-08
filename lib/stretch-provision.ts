import type { RosterEntry } from "./league-types";
import type { LeagueMoment } from "./league-moments";
import { applyStandardContractCut, contractAfterRosterExitForEntry } from "./team-option-contract";

export type StretchYears = 2 | 3;

export function allowedStretchYears(entry: {
  cost: number;
  contract: string;
  state: "active" | "cut";
  stretchProvisionApplied?: boolean;
  buyoutApplied?: boolean;
}, currentSeasonEndYear: number): StretchYears[] {
  if (entry.state !== "cut" || entry.cost <= 0 || isStretchUnavailable(entry)) return [];
  const remainingYears = (contractExpiryYear(entry.contract, currentSeasonEndYear) ?? 0) - currentSeasonEndYear + 1;
  if (remainingYears === 1) return [2, 3];
  if (remainingYears === 2) return [3];
  return [];
}

export function contextualStretchYears(
  entry: Pick<RosterEntry, "cost" | "contract" | "stretchProvisionApplied" | "buyoutApplied" | "playoffTeamOptionUsedSeason">,
  currentSeasonEndYear: number,
): StretchYears[] {
  return allowedStretchYears({
    ...entry,
    state: "cut",
    contract: contractAfterRosterExitForEntry(entry, currentSeasonEndYear),
  }, currentSeasonEndYear);
}

export function stretchInstallmentForEntry(
  entry: Parameters<typeof allowedStretchYears>[0],
  currentSeasonEndYear: number,
  installments: StretchYears,
) {
  if (!allowedStretchYears(entry, currentSeasonEndYear).includes(installments)) {
    throw new Error("Stretch provision non consentita per questo contratto o numero di rate.");
  }
  const remainingYears = contractExpiryYear(entry.contract, currentSeasonEndYear)! - currentSeasonEndYear + 1;
  return Math.ceil(entry.cost * remainingYears / installments);
}

export function canStretchContextualCut(
  entry: Pick<RosterEntry, "cost" | "contract" | "stretchProvisionApplied" | "buyoutApplied" | "playoffTeamOptionUsedSeason">,
  currentSeasonEndYear: number,
) {
  return contextualStretchYears(entry, currentSeasonEndYear).length > 0;
}

export function applyContextualContractCut<T extends RosterEntry>(
  entry: T,
  currentSeasonEndYear: number,
  moment: LeagueMoment,
  stretchYears: StretchYears | null = null,
): T {
  const cut = applyStandardContractCut(entry, currentSeasonEndYear, moment);
  if (stretchYears === null) return cut;
  if (!allowedStretchYears(cut, currentSeasonEndYear).includes(stretchYears)) {
    throw new Error(`${entry.name}: stretch provision non consentita per questo taglio.`);
  }
  return {
    ...cut,
    cost: stretchInstallmentForEntry(cut, currentSeasonEndYear, stretchYears),
    contract: String(currentSeasonEndYear + stretchYears - 1).slice(-2),
    stretchProvisionApplied: true,
  };
}

export function canApplyStretchProvision(entry: {
  cost: number;
  contract: string;
  state: "active" | "cut";
  stretchProvisionApplied?: boolean;
  buyoutApplied?: boolean;
}, currentSeasonEndYear: number) {
  return allowedStretchYears(entry, currentSeasonEndYear).length > 0;
}

export function isStretchUnavailable(entry: {
  stretchProvisionApplied?: boolean;
  buyoutApplied?: boolean;
}) {
  return entry.stretchProvisionApplied === true || entry.buyoutApplied === true;
}

function contractExpiryYear(contract: string, referenceYear: number) {
  const shortYear = contract.match(/\d{2}/)?.[0];
  return shortYear ? Math.floor(referenceYear / 100) * 100 + Number(shortYear) : null;
}
