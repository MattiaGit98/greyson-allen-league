import { hasReachedMoment, type LeagueMoment } from "./league-moments";

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
  currentMoment?: LeagueMoment;
  currentLimit?: 1000 | 1100;
}) {
  const warnings: string[] = [];
  const currentBefore = input.before[0] ?? 0;
  const currentAfter = input.after[0] ?? 0;
  const beforeAuction = input.phase === "offseason"
    && (!input.currentMoment || !hasReachedMoment(input.currentMoment, "auction_start"));
  const currentLimit = input.currentLimit ?? (beforeAuction ? 1000 : input.phase === "regular_season" ? 1100 : null);
  const explicitHardCurrentLimit = input.currentLimit === 1000;

  if (
    currentLimit !== null
    && currentAfter < 1000 - currentLimit
    && (explicitHardCurrentLimit || currentAfter < currentBefore)
  ) {
    warnings.push(`Il cap libero ${input.seasonNames[0]} sarebbe ${currentAfter} (limite ${currentLimit}).`);
  }
  input.after.slice(1).forEach((space, index) => {
    if (space < 0) warnings.push(`Il cap libero ${input.seasonNames[index + 1]} sarebbe ${space} (limite 1000).`);
  });
  return warnings;
}
