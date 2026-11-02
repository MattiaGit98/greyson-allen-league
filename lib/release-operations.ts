import type { RosterEntry } from "./league-types";
import { contractAfterRosterExitForEntry, isPendingContractAssignment } from "./team-option-contract";
import { isStretchUnavailable } from "./stretch-provision";

export type ReleaseOperationKind = "cut" | "free_release" | "buyout";
export type ThreeYearValues = [number, number, number];

/** Lo sconto del 20% si applica soltanto ai contratti non ancora tagliati. */
export function buyoutCost(charges: readonly number[], alreadyCut = false) {
  const residual = charges.reduce((total, charge) => total + charge, 0);
  if (charges.some((charge) => !Number.isSafeInteger(charge) || charge < 0) || !Number.isSafeInteger(residual)) {
    throw new Error("Costo residuo del buyout non valido.");
  }
  return alreadyCut ? residual : residual - Math.floor(residual / 5);
}

export function canApplyBuyout(
  entry: Pick<RosterEntry, "state" | "contract" | "stretchProvisionApplied" | "buyoutApplied">,
  currentSeasonEndYear: number,
  charges: readonly number[],
) {
  const shortExpiry = entry.contract.match(/\d{2}/)?.[0];
  const expiry = shortExpiry ? Math.floor(currentSeasonEndYear / 100) * 100 + Number(shortExpiry) : null;
  return !isStretchUnavailable(entry) && !isPendingContractAssignment(entry.contract)
    && expiry !== null && expiry > currentSeasonEndYear
    && charges.filter((charge) => charge > 0).length > 1;
}

export function applyBuyout<T extends RosterEntry>(entry: T, currentSeasonEndYear: number, charges: readonly number[]): T {
  if (!canApplyBuyout(entry, currentSeasonEndYear, charges)) {
    throw new Error("Il buyout richiede più di una stagione residua già contrattualizzata e nessuna stretch provision o buyout già applicati.");
  }
  return {
    ...entry, state: "cut", slot: "regular", cost: buyoutCost(charges, entry.state === "cut"), contract: String(currentSeasonEndYear).slice(-2),
    buyoutApplied: true, scheduledSeasonEndCut: undefined, playoffTeamOptionUsedSeason: undefined,
    dpeActivatedAfterDeadline: undefined,
  };
}

export function applyFreeRelease<T extends RosterEntry>(entry: T, currentSeasonEndYear: number): T {
  const pendingContract = isPendingContractAssignment(entry.contract);
  return {
    ...entry,
    cost: 0,
    contract: contractAfterRosterExitForEntry(entry, currentSeasonEndYear),
    originalContractYears: pendingContract ? 1 : entry.originalContractYears,
    state: "cut",
    slot: "regular",
    dpeActivatedAfterDeadline: undefined,
    scheduledSeasonEndCut: undefined,
    playoffTeamOptionUsedSeason: undefined,
  };
}

export function rosterAfterFreeRelease<T extends RosterEntry>(
  entries: T[],
  entryIndex: number,
  currentSeasonEndYear: number,
): T[] {
  return entries.map((entry, index) => index === entryIndex ? applyFreeRelease(entry, currentSeasonEndYear) : entry);
}

export function releaseCapSpaces({
  kind,
  spacesBefore,
  contractCharges,
  cutContractCharges,
  currentDpeExemption,
  buyoutAlreadyCut = false,
}: {
  kind: ReleaseOperationKind;
  spacesBefore: ThreeYearValues;
  contractCharges: ThreeYearValues;
  cutContractCharges?: ThreeYearValues;
  currentDpeExemption: boolean;
  buyoutAlreadyCut?: boolean;
}): ThreeYearValues {
  const after: ThreeYearValues = [...spacesBefore];
  if (kind === "cut") {
    const chargesAfterCut = cutContractCharges ?? contractCharges;
    chargesAfterCut.forEach((charge, index) => {
      const chargeBefore = index === 0 && currentDpeExemption ? 0 : contractCharges[index];
      after[index] += chargeBefore - charge;
    });
    return after;
  }
  if (kind === "free_release") {
    after[0] += currentDpeExemption ? 0 : contractCharges[0];
    after[1] += contractCharges[1];
    after[2] += contractCharges[2];
    return after;
  }

  const currentCharge = currentDpeExemption ? 0 : contractCharges[0];
  after[0] += currentCharge - buyoutCost(contractCharges, buyoutAlreadyCut);
  after[1] += contractCharges[1];
  after[2] += contractCharges[2];
  return after;
}

export function stretchCapSpaces(
  spacesBefore: ThreeYearValues,
  residualCharges: ThreeYearValues,
  installments: 2 | 3,
): { spacesAfter: ThreeYearValues; installment: number } {
  const installment = Math.ceil(residualCharges.reduce((total, charge) => total + charge, 0) / installments);
  const spacesAfter = spacesBefore.map((space, index) => (
    space + residualCharges[index] - (index < installments ? installment : 0)
  )) as ThreeYearValues;
  return { spacesAfter, installment };
}
