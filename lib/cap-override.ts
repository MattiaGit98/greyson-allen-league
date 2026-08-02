export const capIssueCodes = new Set([
  "OFFSEASON_CAP",
  "AUCTION_OVER_CAP_MAX_ONE",
  "IN_SEASON_FROZEN",
  "FREE_AGENT_MAX_ONE",
]);

export function isCapIssueCode(code: string) {
  return capIssueCodes.has(code);
}

export function capOverrideRequested(formData: FormData) {
  return formData.get("force_cap") === "true";
}

export function requireCapOverride(warnings: string[], forced: boolean, fail: (message: string) => never) {
  if (warnings.length && !forced) {
    fail(`${warnings.join(" ")} Per procedere devi confermare esplicitamente la forzatura del salary cap.`);
  }
}

export function hasBlockingDpeCutCapViolation(isDpeCut: boolean, warnings: readonly string[]) {
  return isDpeCut && warnings.length > 0;
}

export function capOverrideSummary(summary: string, warnings: string[], forced: boolean) {
  return warnings.length && forced ? `${summary} · CAP FORZATO` : summary;
}

export function salaryCapWarningsForSpaces(input: {
  before: readonly number[];
  after: readonly number[];
  seasonNames: readonly string[];
  phase: string;
  currentLimit?: 1000 | 1100;
}) {
  const warnings: string[] = [];
  const currentLimit = input.currentLimit ?? (input.phase === "offseason" ? 1000 : 1100);
  const currentFloor = 1000 - currentLimit;
  const currentBefore = input.before[0] ?? 0;
  const currentAfter = input.after[0] ?? 0;

  if (currentAfter < currentFloor && (currentLimit === 1000 || currentAfter < currentBefore)) {
    warnings.push(`Il cap libero ${input.seasonNames[0]} sarebbe ${currentAfter} (limite ${currentLimit}).`);
  }
  input.after.slice(1).forEach((space, index) => {
    if (space < 0) warnings.push(`Il cap libero ${input.seasonNames[index + 1]} sarebbe ${space} (limite 1000).`);
  });
  return warnings;
}
