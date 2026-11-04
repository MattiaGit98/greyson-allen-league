import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyLeagueState } from "./league-state";
import { applyValidatedTrade, existingTradeClauseAgreements, tradePickId, type TradeTransactionPayload } from "./trade-state";
import { registerTrade } from "../app/admin/scambi/actions";

const mocks = vi.hoisted(() => ({ client: vi.fn(), load: vi.fn(), persist: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: mocks.client }));
vi.mock("@/lib/league-state", () => ({ loadEditableLeagueState: mocks.load }));
vi.mock("@/lib/league-movements", () => ({ persistLeagueMovement: mocks.persist }));
vi.mock("@/lib/history-competition-store", () => ({ loadHistoryCompetitionState: async () => ({ competitions: { Draft: [] } }) }));
vi.mock("@/lib/admin-alerts", async () => import("./admin-alerts"));
vi.mock("@/lib/cap-override", async () => import("./cap-override"));
vi.mock("@/lib/draft-positions", async () => import("./draft-positions"));
vi.mock("@/lib/future-draft-picks", async () => import("./future-draft-picks"));
vi.mock("@/lib/draft-history", async () => import("./draft-history"));
vi.mock("@/lib/league-moments", async () => import("./league-moments"));
vi.mock("@/lib/post-auction-contracts", async () => import("./post-auction-contracts"));
vi.mock("@/lib/roleless-player-list", async () => import("./roleless-player-list"));
vi.mock("@/lib/rules/roster", async () => import("./rules/roster"));
vi.mock("@/lib/role-minimums", async () => import("./role-minimums"));
vi.mock("@/lib/rules/trade", async () => import("./rules/trade"));
vi.mock("@/lib/season-time", async () => import("./season-time"));
vi.mock("@/lib/slot-eligibility", async () => import("./slot-eligibility"));
vi.mock("@/lib/sign-and-trade", async () => import("./sign-and-trade"));
vi.mock("@/lib/team-option-contract", async () => import("./team-option-contract"));
vi.mock("@/lib/stretch-provision", async () => import("./stretch-provision"));
vi.mock("@/lib/trade-stretch", async () => import("./trade-stretch"));
vi.mock("@/lib/trade-state", async () => import("./trade-state"));
vi.mock("@/lib/trade-clause-selection", async () => import("./trade-clause-selection"));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(decodeURIComponent(url)); } }));

function setup() {
  const state = emptyLeagueState();
  state.teams = ["AAA", "BBB", "CCC"].map((code) => ({ code, name: code, owner: code, slug: code, credits: 0, cost: 0, players: 0, cutPlayers: 0, qualifyingOffers: 0, draftAssets: 0, nextSeasonCredits: 0, followingSeasonCredits: 0 }));
  state.draftAssets = [
    { label: "Scelta", year: 2027, round: "1° giro", originOrOverall: "BBB", teamCode: "BBB" },
    { label: "Scelta", year: 2028, round: "2° giro", originOrOverall: "AAA", teamCode: "AAA" },
    { label: "Scelta", year: 2028, round: "1° giro", originOrOverall: "CCC", teamCode: "CCC" },
  ];
  mocks.client.mockResolvedValue({ auth: { getUser: async () => ({ data: { user: { id: "admin-fixture" } } }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { name: "2026/27", status: "offseason", team_options_resolved: true, trade_deadline_passed: false, timeline_moment: "team_option_deadline" }, error: null }) }) }) }) });
  mocks.load.mockResolvedValue(state);
  mocks.persist.mockResolvedValue({ error: null });
  const ids = state.draftAssets.map((pick, index) => tradePickId(pick.teamCode, index, pick));
  const payload: TradeTransactionPayload = { signAndTrade: null, participantCodes: ["AAA", "BBB", "CCC"], playerMoves: [], pickMoves: [], qualifyingOfferMoves: [], existingClauseChanges: [], cuts: [], promotions: [],
    pickClauses: [{ id: "protection", pickId: ids[0], pickOwnerTeamCode: "BBB", beneficiaryTeamCode: "AAA", clause: "protected_top_5", counterpartyPickId: ids[1], counterpartyTeamCode: "AAA" }] };
  return { state, ids, payload };
}
function form(payload: TradeTransactionPayload) {
  const data = new FormData();
  data.set("trade_json", JSON.stringify(payload));
  return data;
}
beforeEach(() => vi.clearAllMocks());

describe("salvataggio server delle clausole sui proprietari finali", () => {
  it("salva una protezione senza cessione, con entrambe le facce della clausola", async () => {
    const { state, payload } = setup();
    await expect(registerTrade(form(payload))).rejects.toThrow(/updated=.*Scambio registrato/);
    expect(mocks.persist).toHaveBeenCalledOnce();
    const args = mocks.persist.mock.calls[0];
    expect(args[2].draftAssets[0]).toMatchObject({ teamCode: "BBB", clauseResolution: { role: "protected", threshold: 5 } });
    expect(args[2].draftAssets[1]).toMatchObject({ teamCode: "AAA", clauseResolution: { role: "protection_counterparty", threshold: 5 } });
    expect(state.draftAssets[0]).not.toHaveProperty("clauseResolution");
    expect(args[4]).toContain("proprietari finali BBB ↔ AAA; a favore di AAA");
  });

  it("accetta che entrambe le scelte siano appena ricevute nello scambio a tre", async () => {
    const { payload, ids } = setup();
    payload.pickMoves = [{ id: ids[0], fromTeamCode: "BBB", toTeamCode: "CCC" }, { id: ids[2], fromTeamCode: "CCC", toTeamCode: "AAA" }];
    payload.pickClauses[0].counterpartyPickId = ids[2];
    payload.pickClauses[0].counterpartyTeamCode = "CCC";
    await expect(registerTrade(form(payload))).rejects.toThrow(/updated=/);
    const after = mocks.persist.mock.calls[0][2];
    expect(after.draftAssets[0]).toMatchObject({ teamCode: "CCC", clauseResolution: { role: "protected" } });
    expect(after.draftAssets[2]).toMatchObject({ teamCode: "AAA", clauseResolution: { role: "protection_counterparty" } });
  });

  it("materializza la contropartita virtuale del quarto draft soltanto quando serve", async () => {
    const { payload } = setup();
    payload.pickClauses[0].counterpartyPickId = "future-pick:2030:1:AAA";
    await expect(registerTrade(form(payload))).rejects.toThrow(/updated=/);
    expect(mocks.persist.mock.calls[0][2].draftAssets).toContainEqual(expect.objectContaining({ year: 2030, teamCode: "AAA", clauseResolution: expect.objectContaining({ role: "protection_counterparty" }) }));
  });

  it("rifiuta un beneficiario falsificato anche quando partecipa allo scambio", async () => {
    const { payload } = setup();
    payload.pickClauses[0].beneficiaryTeamCode = "CCC";
    await expect(registerTrade(form(payload))).rejects.toThrow(/beneficiario.*non corrisponde/);
    expect(mocks.persist).not.toHaveBeenCalled();
  });

  it("rifiuta una protezione che lascia le due scelte allo stesso proprietario", async () => {
    const { payload, ids } = setup();
    payload.pickMoves = [{ id: ids[0], fromTeamCode: "BBB", toTeamCode: "AAA" }];
    await expect(registerTrade(form(payload))).rejects.toThrow(/squadre diverse dopo lo scambio/);
    expect(mocks.persist).not.toHaveBeenCalled();
  });

  it("rifiuta due clausole concorrenti sulla stessa scelta", async () => {
    const { payload } = setup();
    payload.pickClauses.push({ ...payload.pickClauses[0], id: "duplicate" });
    await expect(registerTrade(form(payload))).rejects.toThrow(/altra clausola|altro accordo/);
    expect(mocks.persist).not.toHaveBeenCalled();
  });

  it("consente rimozione e nuova protezione nello stesso scambio", async () => {
    const { payload, state } = setup();
    const existing = applyValidatedTrade(state, { playerMoves: [], pickMoves: [], qualifyingOfferMoves: [], cuts: [], existingClauseChanges: [], pickClauses: [{ subjectIndex: 0, counterpartyIndex: 1, clause: "protected_top_5" }] });
    mocks.load.mockResolvedValue(existing);
    const [old] = existingTradeClauseAgreements(existing.draftAssets, state.teams.map((team) => team.code));
    payload.existingClauseChanges = [{ agreementId: old.agreementId, action: "remove", clause: null }];
    payload.pickClauses[0].clause = "protected_top_3";
    await expect(registerTrade(form(payload))).rejects.toThrow(/updated=/);
    expect(mocks.persist.mock.calls[0][2].draftAssets[0].clauseResolution.threshold).toBe(3);
  });

  it("continua a cancellare automaticamente un accordo quando le due scelte finiscono alla stessa squadra", async () => {
    const { payload, state, ids } = setup();
    const existing = applyValidatedTrade(state, { playerMoves: [], pickMoves: [], qualifyingOfferMoves: [], cuts: [], existingClauseChanges: [], pickClauses: [{ subjectIndex: 0, counterpartyIndex: 1, clause: "protected_top_5" }] });
    mocks.load.mockResolvedValue(existing);
    payload.pickClauses = [];
    payload.pickMoves = [{ id: ids[0], fromTeamCode: "BBB", toTeamCode: "AAA" }];
    await expect(registerTrade(form(payload))).rejects.toThrow(/updated=/);
    const after = mocks.persist.mock.calls[0][2];
    expect(after.draftAssets[0].clauseResolution).toBeUndefined();
    expect(after.draftAssets[1].clauseResolution).toBeUndefined();
  });

  it("può riutilizzare una scelta appena liberata dalla rimozione automatica di un accordo", async () => {
    const { payload, state, ids } = setup();
    const existing = applyValidatedTrade(state, { playerMoves: [], pickMoves: [], qualifyingOfferMoves: [], cuts: [], existingClauseChanges: [], pickClauses: [{ subjectIndex: 0, counterpartyIndex: 1, clause: "protected_top_5" }] });
    mocks.load.mockResolvedValue(existing);
    payload.pickMoves = [{ id: ids[0], fromTeamCode: "BBB", toTeamCode: "AAA" }];
    payload.pickClauses[0] = { ...payload.pickClauses[0], beneficiaryTeamCode: "CCC", counterpartyPickId: ids[2], counterpartyTeamCode: "CCC" };
    await expect(registerTrade(form(payload))).rejects.toThrow(/updated=/);
    const after = mocks.persist.mock.calls[0][2];
    expect(after.draftAssets[0]).toMatchObject({ teamCode: "AAA", clauseResolution: { role: "protected", counterpartOriginTeamCode: "CCC" } });
    expect(after.draftAssets[1].clauseResolution).toBeUndefined();
  });
});
