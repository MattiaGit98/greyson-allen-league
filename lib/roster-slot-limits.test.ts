import { describe, expect, it } from "vitest";
import type { RosterEntry } from "./league-types";
import {
  changedSlotTeamCodes,
  countActiveRosterSlots,
  findAllSlotOverflows,
  findTeamSlotOverflows,
} from "./roster-slot-limits";

function entries(teamCode: string, slot: RosterEntry["slot"], count: number): RosterEntry[] {
  return Array.from({ length: count }, (_, index) => ({
    name: `${teamCode}-${slot}-${index}`,
    teamCode,
    role: "G",
    cost: 1,
    contract: "27",
    state: "active",
    slot,
  }));
}

describe("limiti globali degli slot", () => {
  it("conta soltanto i giocatori attivi della squadra", () => {
    const roster = [
      ...entries("AAA", "regular", 2),
      { ...entries("AAA", "regular", 1)[0], name: "Tagliato", state: "cut" as const },
      ...entries("BBB", "regular", 3),
    ];
    expect(countActiveRosterSlots(roster, "AAA")).toEqual({ regular: 2, two_way: 0, g_league: 0, dpe: 0 });
  });

  it("rileva ogni tipo di slot oltre il limite", () => {
    const roster = [
      ...entries("AAA", "regular", 16),
      ...entries("AAA", "two_way", 3),
      ...entries("AAA", "g_league", 4),
      ...entries("AAA", "dpe", 2),
    ];
    expect(findTeamSlotOverflows(roster, "AAA").map((item) => item.slot))
      .toEqual(["regular", "two_way", "g_league", "dpe"]);
  });

  it("limita il controllo alle squadre coinvolte nell'operazione", () => {
    const before = [...entries("AAA", "regular", 15), ...entries("BBB", "regular", 16)];
    const after = [...before, ...entries("AAA", "two_way", 3)];
    const affected = changedSlotTeamCodes(before, after);
    expect(affected).toEqual(["AAA"]);
    expect(findAllSlotOverflows(after, affected).map((item) => item.teamCode)).toEqual(["AAA"]);
  });
});
