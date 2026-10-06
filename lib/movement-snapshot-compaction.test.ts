import { describe, expect, it } from "vitest";
import { buildMovementReversal } from "./league-movements";
import type { EditableLeagueState } from "./league-state";
import { compactMovementSnapshotsForBackup } from "./movement-snapshot-compaction";

function state(teamCode: string): EditableLeagueState {
  return {
    teams: [], playerListStatus: "published",
    rosterEntries: [
      { name: "Moved", teamCode, cost: 10, contract: "28", state: "active", slot: "regular" },
      { name: "Unchanged", teamCode: "CCC", cost: 8, contract: "28", state: "active", slot: "regular" },
    ],
    draftAssets: [], qualifyingOfferRights: [], playerList: [],
  };
}

describe("backup movement snapshots", () => {
  it("keeps only affected entries and preserves undo and redo", () => {
    const before = state("AAA");
    const after = state("BBB");
    const movement = compactMovementSnapshotsForBackup({
      id: "movement-id", before_state: before, after_state: after,
    });

    expect(movement.id).toBe("movement-id");
    expect(movement.before_state.rosterEntries).toEqual([before.rosterEntries[0]]);
    expect(movement.after_state.rosterEntries).toEqual([after.rosterEntries[0]]);
    expect(movement.before_state.teams).toEqual([]);
    expect(movement.after_state.playerListStatus).toBe("published");
    expect(compactMovementSnapshotsForBackup(movement)).toEqual(movement);

    const current = { ...after, rosterEntries: [after.rosterEntries[0], { ...after.rosterEntries[1], cost: 9 }] };
    const restored = buildMovementReversal(
      current,
      movement.before_state as EditableLeagueState,
      movement.after_state as EditableLeagueState,
    );
    expect(restored.rosterEntries).toContainEqual(before.rosterEntries[0]);
    expect(restored.rosterEntries).toContainEqual({ ...after.rosterEntries[1], cost: 9 });
    expect(buildMovementReversal(
      restored,
      movement.after_state as EditableLeagueState,
      movement.before_state as EditableLeagueState,
    ).rosterEntries).toEqual(current.rosterEntries);
  });

  it("retains every entry sharing a changed identity and leaves history untouched", () => {
    const shared = { name: "Moved", teamCode: "AAA", cost: 10 };
    const movement = compactMovementSnapshotsForBackup({
      before_state: { rosterEntries: [shared, { ...shared, state: "cut" }, { name: "Other" }], beforeHistory: [1] },
      after_state: { rosterEntries: [{ ...shared, teamCode: "BBB" }, { name: "Other" }], afterHistory: [2] },
    });
    expect(movement.before_state.rosterEntries).toHaveLength(2);
    expect(movement.after_state.rosterEntries).toHaveLength(1);
    expect(movement.before_state.beforeHistory).toEqual([1]);
    expect(movement.after_state.afterHistory).toEqual([2]);
  });

  it("does not discard malformed collections silently", () => {
    const movement = compactMovementSnapshotsForBackup({
      before_state: { rosterEntries: "unexpected" }, after_state: { rosterEntries: [] },
    });
    expect(movement.before_state.rosterEntries).toBe("unexpected");
  });
});
