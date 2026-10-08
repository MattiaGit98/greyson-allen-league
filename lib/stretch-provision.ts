import type { RosterEntry } from "./league-types";
import type { LeagueMoment } from "./league-moments";
import { applyStandardContractCut, contractAfterRosterExitForEntry } from "./team-option-contract";

export type StretchYears = 2 | 3;

export function canStretchContextualCut(
  entry: Pick<RosterEntry, "cost" | "contract" | "stretchProvisionApplied" | "buyoutApplied" | "playoffTeamOptionUsedSeason">,
  currentSeasonEndYear: number,
) {
  return canApplyStretchProvision({
    ...entry,
    state: "cut",
    contract: contractAfterRosterExitForEntry(entry, currentSeasonEndYear),
  }, currentSeasonEndYear);
}

export function applyContextualContractCut<T extends RosterEntry>(
  entry: T,
  currentSeasonEndYear: number,
  moment: LeagueMoment,
  stretchYears: StretchYears | null = null,
): T {
  const cut = applyStandardContractCut(entry, currentSeasonEndYear, moment);
  if (stretchYears === null) return cut;
  if (![2, 3].includes(stretchYears) || !canApplyStretchProvision(cut, currentSeasonEndYear)) {
    throw new Error(`${entry.name}: stretch provision non consentita per questo taglio.`);
  }
  return {
    ...cut,
    cost: Math.ceil(cut.cost / stretchYears),
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
  return entry.state === "cut"
    && entry.cost > 0
    && !isStretchUnavailable(entry)
    && contractExpiryYear(entry.contract, currentSeasonEndYear) === currentSeasonEndYear;
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
