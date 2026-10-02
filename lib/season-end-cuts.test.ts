import { describe, expect, it } from "vitest";
import { shouldShowScheduledCutBadge } from "./season-end-cuts";

describe("taglio programmato", () => {
  it("mostra il bollino soltanto al giocatore attivo programmato nell'annata corrente", () => {
    expect(shouldShowScheduledCutBadge({ state: "active", scheduledSeasonEndCut: "2026/27" }, "2026/27", "free_agency_reopening")).toBe(true);
    expect(shouldShowScheduledCutBadge({ state: "active", scheduledSeasonEndCut: "2025/26" }, "2026/27", "free_agency_reopening")).toBe(false);
    expect(shouldShowScheduledCutBadge({ state: "cut", scheduledSeasonEndCut: "2026/27" }, "2026/27", "free_agency_reopening")).toBe(false);
    expect(shouldShowScheduledCutBadge({ state: "active", scheduledSeasonEndCut: "2026/27" }, "2026/27", "free_agency_end")).toBe(false);
  });
});
