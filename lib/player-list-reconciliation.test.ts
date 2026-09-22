import { describe, expect, it } from "vitest";
import type { PlayerListEntry, RosterEntry } from "./league-types";
import { alignActiveRosterEntries, referencedPlayerNames, syncActiveRosterRoles } from "./player-list-reconciliation";

const active: RosterEntry = {
  name: "Nome vecchio",
  cost: 10,
  contract: "27",
  role: "G",
  state: "active",
  slot: "regular",
  teamCode: "AAA",
};

const cut: RosterEntry = {
  name: "Tagliato non nel listone",
  cost: 5,
  contract: "27",
  role: "A",
  state: "cut",
  slot: "regular",
  teamCode: "BBB",
};

describe("riconciliazione del listone", () => {
  it("richiede un abbinamento per gli attivi e le Q.O., ma non per i tagliati", () => {
    const references = referencedPlayerNames([active, cut], [
      { playerName: "Diritto Q.O.", qualifyingAmount: 3, teamCode: "CCC" },
    ]);

    expect([...references.keys()]).toEqual(["Nome vecchio", "Diritto Q.O."]);
    expect(references.has(cut.name)).toBe(false);
  });

  it("rinomina e aggiorna il ruolo solo dei giocatori attivi", () => {
    const listed: PlayerListEntry = {
      name: "Nome ufficiale", role: "C", realTeam: "BOS", rookie: false, under23: false,
    };
    const aligned = alignActiveRosterEntries([active, cut], (name) => name === active.name ? listed : undefined);

    expect(aligned[0]).toMatchObject({ name: "Nome ufficiale", role: "C" });
    expect(aligned[1]).toBe(cut);
  });

  it("non cambia il ruolo del tagliato quando si salva il listone", () => {
    const synced = syncActiveRosterRoles([active, cut], () => "C");

    expect(synced[0].role).toBe("C");
    expect(synced[1]).toBe(cut);
  });
});
