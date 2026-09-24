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
