import { describe, expect, it } from "vitest";
import type { RosterEntry } from "./league-types";
import { canReintegrateDpe, dpeRequirementsConfirmation, entriesForDpeAdjustedCap, inheritedDpeSeasons, shouldShowDpeBadge, shouldShowDpeNoReintegrationBadge } from "./dpe-rules";
import { calculateCapSpace } from "./season-time";

const disabledPlayer: RosterEntry = {
  name: "Infortunato",
  cost: 100,
  contract: "28",
  role: "G",
  state: "active",
  slot: "dpe",
  teamCode: "AAA",
};

describe("impatto della disabled player exception", () => {
  it("mostra NO R. soltanto per la DPE in essere dopo la deadline e prima della chiusura", () => {
    const late = { ...disabledPlayer, dpeActivatedAfterDeadline: true };
    for (const moment of ["trade_deadline", "buyout_end"] as const) {
      expect(shouldShowDpeNoReintegrationBadge(late, moment)).toBe(true);
      expect(canReintegrateDpe(late, moment)).toBe(false);
      expect(canReintegrateDpe(disabledPlayer, moment)).toBe(true);
      expect(canReintegrateDpe({ ...disabledPlayer, dpeActivatedAfterDeadline: false }, moment)).toBe(true);
      expect(shouldShowDpeNoReintegrationBadge(disabledPlayer, moment)).toBe(false);
    }
    for (const moment of ["offseason_start", "team_option_deadline", "auction_start", "auction_completed", "contract_delivery", "free_agency_end", "free_agency_reopening"] as const) {
      expect(shouldShowDpeNoReintegrationBadge(late, moment)).toBe(false);
      expect(canReintegrateDpe(disabledPlayer, moment)).toBe(false);
      expect(canReintegrateDpe(late, moment)).toBe(false);
    }
    expect(shouldShowDpeNoReintegrationBadge({ ...late, state: "cut" }, "trade_deadline")).toBe(false);
    expect(shouldShowDpeNoReintegrationBadge({ ...late, slot: "regular" }, "trade_deadline")).toBe(false);
  });

  it("mantiene separati NO R. e il marchio del reintegro automatico", () => {
    const late = { ...disabledPlayer, dpeActivatedAfterDeadline: true };
    expect(shouldShowDpeBadge(late, "2026/27", "trade_deadline")).toBe(false);
    const automatic = { ...late, slot: "regular" as const, dpeActivatedAfterDeadline: undefined, dpeSeasonEndReintegratedSeasons: ["2026/27"] };
    expect(shouldShowDpeBadge(automatic, "2027/28", "offseason_start")).toBe(true);
    expect(shouldShowDpeNoReintegrationBadge(automatic, "offseason_start")).toBe(false);
  });

  it("richiede una sola conferma con la nuova soglia, senza il vecchio minimo di 20 partite", () => {
    expect(dpeRequirementsConfirmation).toContain("NBC Sports Edge");
    expect(dpeRequirementsConfirmation).toContain("a partire da ora");
    expect(dpeRequirementsConfirmation).toContain("giornate Dunkest");
    expect(dpeRequirementsConfirmation).toContain("25 partite NBA");
    expect(dpeRequirementsConfirmation).not.toContain("20 partite");
  });
  it("conserva le annate DPE quando lo stesso giocatore viene rifirmato", () => {
    const entries: RosterEntry[] = [
      { ...disabledPlayer, name: "Mario Rossi", state: "cut", slot: "regular", dpeAppliedSeasons: ["2026/27"] },
      { ...disabledPlayer, name: "MARIO  ROSSI", state: "cut", slot: "regular", dpeAppliedSeasons: ["2026/27", "2027/28"] },
      { ...disabledPlayer, name: "Altro giocatore", state: "cut", slot: "regular", dpeAppliedSeasons: ["2025/26"] },
    ];
    expect(inheritedDpeSeasons(entries, "Mario Rossi")).toEqual(["2026/27", "2027/28"]);
  });

  it("esclude il contratto soltanto dalla prima stagione a concludersi", () => {
    const current = calculateCapSpace({
      entries: entriesForDpeAdjustedCap([disabledPlayer], 0),
      seasonName: "2026/27",
      optionSeasonName: "2026/27",
      countTeamOptions: true,
    });
    const future = calculateCapSpace({
      entries: entriesForDpeAdjustedCap([disabledPlayer], 1),
      seasonName: "2027/28",
      optionSeasonName: "2026/27",
      countTeamOptions: true,
    });
    expect(current).toBe(1000);
    expect(future).toBe(900);
  });

  it("mostra il marchio solo dopo il reintegro automatico e fino all'inizio dell'asta successiva", () => {
    const entry: RosterEntry = { ...disabledPlayer, slot: "regular", dpeAppliedSeasons: ["2026/27"], dpeSeasonEndReintegratedSeasons: ["2026/27"] };

    expect(shouldShowDpeBadge(entry, "2026/27", "free_agency_end")).toBe(false);
    expect(shouldShowDpeBadge(entry, "2027/28", "offseason_start")).toBe(true);
    expect(shouldShowDpeBadge(entry, "2027/28", "team_option_deadline")).toBe(true);
    expect(shouldShowDpeBadge(entry, "2027/28", "auction_start")).toBe(false);
    expect(shouldShowDpeBadge(entry, "2027/28", "auction_completed")).toBe(false);
  });

  it("rimuove i vecchi bollini basati sul solo esercizio della DPE, anche dopo rientro o nuova firma", () => {
    const applied = { ...disabledPlayer, dpeAppliedSeasons: ["2026/27"] };
    for (const slot of ["dpe", "regular"] as const) {
      const entry = { ...applied, slot };
      expect(shouldShowDpeBadge(entry, "2026/27", "contract_delivery")).toBe(false);
      expect(shouldShowDpeBadge(entry, "2026/27", "free_agency_reopening")).toBe(false);
      expect(shouldShowDpeBadge(entry, "2027/28", "offseason_start")).toBe(false);
    }
    const signing = { ...disabledPlayer, slot: "regular" as const, dpeAppliedSeasons: inheritedDpeSeasons([applied], applied.name) };
    expect(shouldShowDpeBadge(signing, "2026/27", "contract_delivery")).toBe(false);
  });

  it("nasconde il marchio quando il giocatore viene tagliato o rilasciato", () => {
    expect(shouldShowDpeBadge({ state: "cut", dpeSeasonEndReintegratedSeasons: ["2026/27"] }, "2027/28", "offseason_start")).toBe(false);
  });

  it("non mostra il marchio di una DPE più vecchia", () => {
    expect(shouldShowDpeBadge({ state: "active", dpeSeasonEndReintegratedSeasons: ["2025/26"] }, "2027/28", "offseason_start")).toBe(false);
  });
});
