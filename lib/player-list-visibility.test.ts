import { describe, expect, it } from "vitest";
import { showPlayerListRealTeam } from "./player-list-visibility";

describe("visibilità della squadra NBA nel listone", () => {
  it("la mostra solo per il listone ufficiale fino al termine dell'asta", () => {
    expect(showPlayerListRealTeam("offseason", "offseason_start")).toBe(false);
    expect(showPlayerListRealTeam("published", "team_option_deadline")).toBe(true);
    expect(showPlayerListRealTeam("published", "auction_start")).toBe(true);
    expect(showPlayerListRealTeam("published", "auction_completed")).toBe(false);
    expect(showPlayerListRealTeam("published", "contract_delivery")).toBe(false);
    expect(showPlayerListRealTeam("published", "free_agency_reopening")).toBe(false);
  });
});
