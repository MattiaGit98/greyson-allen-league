import { describe, expect, it } from "vitest";
import {
  capOverrideRequested,
  capOverrideSummary,
  hasBlockingDpeCutCapViolation,
  salaryCapWarningsForSpaces,
} from "./cap-override";

const seasons = ["2026/27", "2027/28", "2028/29"];

describe("forceable salary-cap warnings", () => {
  it("uses the strict 1000 limit in offseason", () => {
    expect(salaryCapWarningsForSpaces({ before: [10, 10, 10], after: [-1, 10, 10], seasonNames: seasons, phase: "offseason" })).toHaveLength(1);
  });

  it("allows the seasonal room between 1000 and 1100", () => {
    expect(salaryCapWarningsForSpaces({ before: [0, 10, 10], after: [-50, 10, 10], seasonNames: seasons, phase: "regular_season" })).toHaveLength(0);
  });

  it("warns when an operation crosses or worsens the seasonal 1100 limit", () => {
    expect(salaryCapWarningsForSpaces({ before: [-90, 10, 10], after: [-110, 10, 10], seasonNames: seasons, phase: "regular_season" })).toHaveLength(1);
    expect(salaryCapWarningsForSpaces({ before: [-150, 10, 10], after: [-120, 10, 10], seasonNames: seasons, phase: "regular_season" })).toHaveLength(0);
  });

  it("keeps the future cap at 1000 and the buyout current cap at 1000", () => {
    expect(salaryCapWarningsForSpaces({ before: [10, 10, 10], after: [10, -1, 10], seasonNames: seasons, phase: "regular_season" })).toHaveLength(1);
    expect(salaryCapWarningsForSpaces({ before: [10, 10, 10], after: [-1, 10, 10], seasonNames: seasons, phase: "regular_season", currentLimit: 1000 })).toHaveLength(1);
  });

  it("recognizes and records an explicit force", () => {
    const formData = new FormData();
    formData.set("force_cap", "true");
    expect(capOverrideRequested(formData)).toBe(true);
    expect(capOverrideSummary("Operazione", ["Cap oltre soglia"], true)).toBe("Operazione · CAP FORZATO");
  });

  it("rende bloccanti le violazioni di cap soltanto per il taglio dalla DPE", () => {
    const warnings = ["Cap oltre soglia"];
    expect(hasBlockingDpeCutCapViolation(true, warnings)).toBe(true);
    expect(hasBlockingDpeCutCapViolation(false, warnings)).toBe(false);
    expect(hasBlockingDpeCutCapViolation(true, [])).toBe(false);
  });
});
