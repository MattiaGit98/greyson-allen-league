import { describe, expect, it } from "vitest";
import { removeRolelessPlayersLeavingRosters } from "./roleless-player-list";
import type { EditableLeagueState } from "./league-state";

function state(): EditableLeagueState {
  return {
    teams: [],
    draftAssets: [],
    qualifyingOfferRights: [],
    playerListStatus: "published",
    playerList: [
      { name: "Senza ruolo attivo", role: "X", realTeam: "", rookie: false, under23: false },
      { name: "Giocatore listone", role: "G", realTeam: "", rookie: false, under23: false },
    ],
    rosterEntries: [
      { name: "Senza ruolo attivo", teamCode: "AAA", cost: 1, contract: "27", state: "active", slot: "regular" },
    ],
  };
}

describe("removeRolelessPlayersLeavingRosters", () => {
  it("removes a role X player when the operation makes them leave the active roster", () => {
    const input = state();
    const after = {
      ...input,
      rosterEntries: input.rosterEntries.map((entry) => entry.name === "Senza ruolo attivo" ? { ...entry, state: "cut" as const } : entry),
    };
    expect(removeRolelessPlayersLeavingRosters(input, after).playerList.map((player) => player.name)).toEqual([
      "Giocatore listone",
    ]);
  });

  it("does not remove a manually added role X player that has not yet entered a roster", () => {
    const input = state();
    input.playerList.push({ name: "Rookie da scegliere", role: "X", realTeam: "", rookie: true, under23: true });
    expect(removeRolelessPlayersLeavingRosters(input, { ...input }).playerList.some((player) => player.name === "Rookie da scegliere")).toBe(true);
  });
});
