import type { RosterEntry } from "./league-types";

export type ReleaseOperationKind = "cut" | "free_release" | "buyout";
export type ThreeYearValues = [number, number, number];

export function applyFreeRelease<T extends RosterEntry>(entry: T): T {
  return {
    ...entry,
    cost: 0,
    state: "cut",
    slot: "regular",
  };
}

export function releaseCapSpaces({
  kind,
  spacesBefore,
  contractCharges,
  cutContractCharges,
  buyoutContractCharges,
  currentDpeExemption,
}: {
  kind: ReleaseOperationKind;
  spacesBefore: ThreeYearValues;
  contractCharges: ThreeYearValues;
  cutContractCharges?: ThreeYearValues;
  buyoutContractCharges?: ThreeYearValues;
  currentDpeExemption: boolean;
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
  const totalResidual = (buyoutContractCharges ?? contractCharges).reduce((total, charge) => total + charge, 0);
  after[0] += currentCharge - totalResidual;
  after[1] += contractCharges[1];
  after[2] += contractCharges[2];
  return after;
}

export function stretchCapSpaces(
  spacesBefore: ThreeYearValues,
  residualCharge: number,
  installments: 2 | 3,
): { spacesAfter: ThreeYearValues; installment: number } {
  const installment = Math.ceil(residualCharge / installments);
  const spacesAfter: ThreeYearValues = [
    spacesBefore[0] + residualCharge - installment,
    spacesBefore[1] - installment,
    spacesBefore[2] - (installments === 3 ? installment : 0),
  ];
  return { spacesAfter, installment };
}
