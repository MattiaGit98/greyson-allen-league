import { describe, expect, it } from "vitest";
import { recentAuctionCallsFromFeed } from "./auction-call-feed";

describe("ultime chiamate dell'asta", () => {
  it("mostra prima la chiamata più recente", () => {
    const result = recentAuctionCallsFromFeed([
      { id: "2", created_at: "2026-10-05T10:02:00Z", auction_player_name: "Secondo", auction_team_code: "bbb", auction_cost: 7, auction_role: "A" },
      { id: "1", created_at: "2026-10-05T10:01:00Z", auction_player_name: "Primo", auction_team_code: "aaa", auction_cost: 3, auction_role: "G" },
    ], []);
    expect(result.map((call) => call.playerName)).toEqual(["Secondo", "Primo"]);
    expect(result[0]).toMatchObject({ teamCode: "BBB", cost: 7, role: "A" });
  });

  it("preferisce il ruolo del listone ufficiale a quello salvato nel movimento", () => {
    const result = recentAuctionCallsFromFeed([
      { id: "1", created_at: "2026-10-05T10:01:00Z", auction_player_name: "Giocatore", auction_team_code: "AAA", auction_cost: 5, auction_role: "G" },
    ], [{ name: "Giocatore", role: "C", realTeam: "NBA", rookie: false, under23: false }]);
    expect(result[0].role).toBe("C");
  });

  it("ignora righe incomplete invece di mostrare dati ambigui", () => {
    expect(recentAuctionCallsFromFeed([
      { id: "1", created_at: "2026-10-05T10:01:00Z", auction_player_name: null, auction_team_code: "AAA", auction_cost: 5, auction_role: "G" },
    ], [])).toEqual([]);
  });
});
