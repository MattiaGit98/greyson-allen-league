import { describe, expect, it } from "vitest";
import { emptyLeagueState, type EditableLeagueState } from "./league-state";
import {
  applyPostAuctionContractDrafts,
  missingPostAuctionContractDrafts,
  tradedPostAuctionContractDraftNames,
  type PostAuctionContractDraft,
} from "./post-auction-contracts";

const seasonName = "2026/27";

function state(): EditableLeagueState {
  return {
    ...emptyLeagueState(),
    teams: [{
      code: "AAA", name: "Alpha", owner: "A", credits: 0, cost: 0, players: 2, cutPlayers: 0,
      qualifyingOffers: 0, draftAssets: 0, nextSeasonCredits: 0, followingSeasonCredits: 0, slug: "alpha",
    }],
    playerList: [
      { name: "Guardia", role: "G", realTeam: "", rookie: false, under23: false },
      { name: "Rookie", role: "A", realTeam: "", rookie: true, under23: true },
    ],
    playerListStatus: "published",
    rosterEntries: [
      {
        name: "Guardia", role: "G", cost: 100, contract: "PENDING", state: "active", slot: "regular",
        teamCode: "AAA", auctionPrice: 100, contractStartSeason: seasonName,
      },
      {
        name: "Rookie", role: "A", cost: 5, contract: "PENDING", state: "active", slot: "g_league",
        teamCode: "AAA", auctionPrice: 5, contractStartSeason: seasonName,
      },
    ],
  };
}

function draft(playerName: string, patch: Partial<PostAuctionContractDraft> = {}): PostAuctionContractDraft {
  return {
    seasonName,
    teamCode: "AAA",
    playerName,
    contractKind: playerName === "Rookie" ? "team_option" : "annual",
    slot: playerName === "Rookie" ? "g_league" : "regular",
    ...patch,
  };
}

describe("bozze private dei contratti post asta", () => {
  it("individua i giocatori ancora senza bozza", () => {
    expect(missingPostAuctionContractDrafts(state(), [draft("Guardia")], seasonName).map((entry) => entry.name))
      .toEqual(["Rookie"]);
  });

  it("esclude dalla consegna il contratto annuale già assegnato con una Q.O. accettata", () => {
    const current = state();
    current.rosterEntries.push({
      name: "Q.O. accettata",
      role: "C",
      cost: 1,
      contract: "27 (Q)",
      state: "active",
      slot: "regular",
      teamCode: "AAA",
      auctionAcquisition: "qualifying_offer",
      auctionPrice: 1,
      contractStartSeason: seasonName,
      originalContractYears: 1,
    });

    expect(missingPostAuctionContractDrafts(current, [draft("Guardia"), draft("Rookie")], seasonName))
      .toEqual([]);
    const published = applyPostAuctionContractDrafts({
      state: current,
      drafts: [draft("Guardia"), draft("Rookie")],
      seasonName,
    });
    expect(published.rosterEntries.at(-1)).toMatchObject({
      name: "Q.O. accettata",
      contract: "27 (Q)",
      auctionAcquisition: "qualifying_offer",
    });
  });

  it("pubblica insieme tutte le bozze senza modificare lo stato di partenza", () => {
    const current = state();
    const published = applyPostAuctionContractDrafts({
      state: current,
      drafts: [draft("Guardia", { contractKind: "biennial" }), draft("Rookie")],
      seasonName,
    });

    expect(current.rosterEntries[0].contract).toBe("PENDING");
    expect(published.rosterEntries[0]).toMatchObject({ contract: "28", cost: 95, originalContractYears: 2 });
    expect(published.rosterEntries[1]).toMatchObject({ contract: "T.O.", cost: 5, slot: "g_league" });
  });

  it("consente gli slot speciali alle sole T.O. idonee prima della consegna", () => {
    const twoWay = applyPostAuctionContractDrafts({
      state: state(),
      drafts: [draft("Guardia"), draft("Rookie", { slot: "two_way" })],
      seasonName,
    });
    expect(twoWay.rosterEntries.find((entry) => entry.name === "Rookie")).toMatchObject({
      contract: "T.O.",
      slot: "two_way",
    });

    expect(() => applyPostAuctionContractDrafts({
      state: state(),
      drafts: [draft("Guardia", { slot: "two_way" }), draft("Rookie")],
      seasonName,
    })).toThrow("slot speciali");

    expect(() => applyPostAuctionContractDrafts({
      state: state(),
      drafts: [draft("Guardia"), draft("Rookie", { contractKind: "annual", slot: "regular" })],
      seasonName,
    })).toThrow("in Two-way o G-League");
  });

  it("consente la T.O. ai rookie senza soglia e agli U23 soltanto fino a 15 crediti", () => {
    const rookie = state();
    rookie.rosterEntries[1] = {
      ...rookie.rosterEntries[1],
      cost: 20,
      auctionPrice: 20,
      contract: "PENDING",
      slot: "regular",
    };
    expect(() => applyPostAuctionContractDrafts({
      state: rookie,
      drafts: [draft("Guardia"), draft("Rookie", { slot: "regular" })],
      seasonName,
    })).not.toThrow();

    const under23 = state();
    under23.playerList[1] = { ...under23.playerList[1], rookie: false, under23: true };
    under23.rosterEntries[1] = {
      ...under23.rosterEntries[1],
      cost: 15,
      auctionPrice: 15,
      contract: "PENDING",
      slot: "regular",
    };
    expect(() => applyPostAuctionContractDrafts({
      state: under23,
      drafts: [draft("Guardia"), draft("Rookie", { slot: "regular" })],
      seasonName,
    })).not.toThrow();

    under23.rosterEntries[1] = { ...under23.rosterEntries[1], cost: 16, auctionPrice: 16 };
    expect(() => applyPostAuctionContractDrafts({
      state: under23,
      drafts: [draft("Guardia"), draft("Rookie", { slot: "regular" })],
      seasonName,
    })).toThrow("requisiti per la T.O.");
  });

  it("permette di sostituire una scelta già assegnata per l'asta corrente", () => {
    const current = state();
    current.rosterEntries[0] = { ...current.rosterEntries[0], contract: "28", originalContractYears: 2, cost: 95 };
    const published = applyPostAuctionContractDrafts({
      state: current,
      drafts: [draft("Guardia", { contractKind: "triennial" }), draft("Rookie")],
      seasonName,
    });
    expect(published.rosterEntries[0]).toMatchObject({ contract: "29", cost: 90, originalContractYears: 3 });
  });

  it("blocca la pubblicazione se manca anche una sola bozza", () => {
    expect(() => applyPostAuctionContractDrafts({
      state: state(),
      drafts: [draft("Guardia")],
      seasonName,
    })).toThrow("1 contratti dell'asta non sono ancora stati assegnati");
  });

  it("ignora una vecchia bozza resa obsoleta da uno scambio", () => {
    const published = applyPostAuctionContractDrafts({
      state: state(),
      drafts: [
        draft("Guardia"),
        draft("Rookie"),
        draft("Giocatore scambiato", { teamCode: "BBB" }),
      ],
      seasonName,
    });
    expect(published.rosterEntries.map((entry) => entry.contract)).toEqual(["27", "T.O."]);
  });

  it("azzera soltanto le bozze dei contratti pendenti coinvolti nello scambio", () => {
    const current = state();
    current.rosterEntries.push({
      name: "Contratto già assegnato",
      role: "C",
      cost: 20,
      contract: "28",
      state: "active",
      slot: "regular",
      teamCode: "AAA",
    });

    expect(tradedPostAuctionContractDraftNames(current, [0, 2], seasonName)).toEqual(["Guardia"]);
  });
});
