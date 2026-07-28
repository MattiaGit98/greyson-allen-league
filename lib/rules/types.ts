export type RuleIssue = { code: string; message: string };
export type RuleResult<T extends Record<string, unknown> = Record<string, never>> = {
  valid: boolean;
  errors: RuleIssue[];
  warnings: RuleIssue[];
  appliedRules: string[];
  calculated: T;
};

export function result<T extends Record<string, unknown>>(
  calculated: T,
  appliedRules: string[],
  errors: RuleIssue[] = [],
  warnings: RuleIssue[] = [],
): RuleResult<T> {
  return { valid: errors.length === 0, errors, warnings, appliedRules, calculated };
}
