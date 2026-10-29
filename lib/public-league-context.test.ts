import { describe, expect, it } from "vitest";
import { emptyLeagueState, type EditableLeagueState } from "./league-state";
import { buildPublicLeagueContext } from "./public-league-context";
import { loadRegulation, parseRegulation } from "./regulation";

const season = { name: "2026/27", status: "regular_season" as const, timeline_moment: "auction_completed", team_options_resolved: true };

function fixture(): EditableLeagueState {
  return {
    ...emptyLeagueState(),
    playerListStatus: "published",
    publicNotice: "Excluded notice",
    teams: [{ code: "AAA", name: "Test team", owner: "Test owner", credits: 0, cost: 0, players: 0,
      cutPlayers: 0, qualifyingOffers: 0, draftAssets: 0, nextSeasonCredits: 0, followingSeasonCredits: 0, slug: "test" }],
    rosterEntries: [
      { name: "Regular", role: "G", cost: 20, contract: "28 (E)", state: "active", slot: "regular", teamCode: "AAA", originalContractYears: 3 },
      { name: "Young", role: "A", cost: 1, contract: "PENDING", state: "active", slot: "two_way", teamCode: "AAA", auctionPrice: 1, contractStartSeason: "2026/27" },
      { name: "Academy", role: "C", cost: 3, contract: "27 + T.O.", state: "active", slot: "g_league", teamCode: "AAA" },
      { name: "Injured", role: "C", cost: 100, contract: "28", state: "active", slot: "dpe", teamCode: "AAA", dpeAppliedSeasons: ["2026/27"] },
      { name: "Cut", role: "A", cost: 6, contract: "27", state: "cut", slot: "regular", teamCode: "AAA", stretchProvisionApplied: true },
    ],
    playerList: [
      { name: "Regular", role: "G", realTeam: "BOS", rookie: false, under23: false },
      { name: "Young", role: "A", realTeam: "MIA", rookie: true, under23: false },
      { name: "Academy", role: "C", realTeam: "LAL", rookie: true, under23: false },
      { name: "Injured", role: "C", realTeam: "DET", rookie: false, under23: false },
      { name: "Free Agent", role: "X", realTeam: "", rookie: false, under23: false },
    ],
    qualifyingOfferRights: [{ playerName: "Free Agent", teamCode: "AAA", qualifyingAmount: 2, role: "G" }],
    draftAssets: [
      { year: 2027, round: "1° giro", originOrOverall: "AAA", teamCode: "AAA", label: "Scelta" },
      { year: 2030, round: "1° giro", originOrOverall: "AAA", teamCode: "AAA", label: "Scelta" },
      { year: 2030, round: "2° giro", originOrOverall: "AAA", teamCode: "AAA", label: "Diritto di swap con BBB" },
    ],
  };
}

describe("contesto pubblico per assistenti AI", () => {
  it("espone solo i tre blocchi richiesti e i campi pubblici, senza modificare lo stato", () => {
    const state = fixture();
    Object.assign(state.teams[0], { internalAdminNote: "Not public" });
    Object.assign(state.playerList[0], { internalAdminNote: "Not public" });
    const before = JSON.stringify(state);
    const context = buildPublicLeagueContext(state, season, []);
    expect(Object.keys(context)).toEqual(["squadre", "listone", "regolamento"]);
    expect(context.squadre[0]).toMatchObject({ sigla: "AAA", nome: "Test team", proprietari: "Test owner" });
    expect(context.squadre[0].roster[0].scadenza).toBe("28 EXT");
    expect(context.squadre[0].twoWay[0].scadenza).toBe("? T.O.");
    expect(context.squadre[0].tagliati[0]).toMatchObject({ scadenza: "27", stretchNonDisponibile: true });
    expect(context.squadre[0].capLibero[0]).toEqual({ annata: "2026/27", crediti: 970 });
    expect(context.squadre[0].ruoli).toEqual({ G: 1, A: 1, C: 1 });
    expect(context.listone.giocatori).toHaveLength(state.playerList.length);
    for (const field of ["originalContractYears", "auctionPrice", "contractStartSeason", "dpeAppliedSeasons", "publicNotice", "draftOrders", "slug", "internalAdminNote"]) {
      expect(JSON.stringify(context)).not.toContain(`"${field}"`);
    }
    expect(JSON.stringify(state)).toBe(before);
  });

  it("rispetta le finestre pubbliche di listone, ruoli Q.O. e scelte nascoste", () => {
    const state = fixture();
    const pre = buildPublicLeagueContext(state, { ...season, timeline_moment: "auction_start" }, []);
    expect(pre.listone.giocatori[1]).toMatchObject({ squadraNba: "MIA", rookie: true, numero: null });
    expect(pre.listone.giocatori[4]).toMatchObject({ numero: 1, stato: "Q.O.", squadra: "AAA" });
    expect(pre.squadre[0].qualifyingOffer?.[0].ruolo).toBe("X");
    state.playerListStatus = "offseason";
    const provisional = buildPublicLeagueContext(state, { ...season, status: "offseason", timeline_moment: "offseason_start" }, []);
    expect(provisional.squadre[0].qualifyingOffer?.[0].ruolo).toBe("G");
    expect(provisional.listone.giocatori[0]).not.toHaveProperty("squadraNba");
    const post = buildPublicLeagueContext(state, season, []);
    expect(post.squadre[0]).not.toHaveProperty("qualifyingOffer");
    for (const field of ["squadraNba", "rookie", "under23", "numero"]) expect(post.listone.giocatori[1]).not.toHaveProperty(field);
    expect(post.squadre[0].scelte).toHaveLength(2);
    expect(post.squadre[0].numeroScelteScambiabili).toBe(1);
    expect(post.squadre[0].scelte[1].clausola).toBe("Non scambiabile · Diritto di swap con BBB");
  });

  it("conteggia la DPE nei ruoli solo nella finestra prevista, mantenendola nel suo slot", () => {
    const context = buildPublicLeagueContext(fixture(), { ...season, timeline_moment: "free_agency_reopening" }, []);
    expect(context.squadre[0].ruoli.C).toBe(2);
    expect(context.squadre[0].dpe[0].nome).toBe("Injured");
    expect(context.squadre[0].roster).toHaveLength(1);
  });

  it("non rivela dettagli tecnici RFA e mostra i contratti come nel roster pubblico", () => {
    const state = fixture();
    state.rosterEntries[1].auctionAcquisition = "restricted_free_agent";
    state.rosterEntries[0].contract = "26 + R.E.";
    const context = buildPublicLeagueContext(state, season, []);
    expect(context.squadre[0].twoWay[0].scadenza).toBe("?");
    expect(context.squadre[0].roster[0].scadenza).toBe("R.E.");
    expect(JSON.stringify(context)).not.toContain("restricted_free_agent");
  });

  it("legge l'intero regolamento dalla fonte del sito e risolve i riferimenti agli articoli", async () => {
    const articles = await loadRegulation();
    const context = buildPublicLeagueContext(fixture(), season, articles);
    expect(context.regolamento).toHaveLength(articles.length);
    expect(context.regolamento.reduce((total, article) => total + article.commi.length, 0))
      .toBe(articles.reduce((total, article) => total + article.clauses.length, 0));
    expect(JSON.stringify(context.regolamento)).not.toContain("\\ref{");
    const custom = parseRegulation("\\section{Test}\\label{test}\\begin{enumerate}\\item Vedi Art. \\ref{test}.\\end{enumerate}\\end{document}");
    expect(buildPublicLeagueContext(fixture(), season, custom).regolamento[0].commi).toEqual(["Vedi Art. 1."]);
  });
});
