import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LeagueMoment } from "./league-moments";
import type { RosterEntry } from "./league-types";
import { emptyLeagueState } from "./league-state";
import { applyDpeOperation } from "../app/admin/dpe/actions";

const mocks = vi.hoisted(() => ({ client: vi.fn(), load: vi.fn(), persist: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: mocks.client }));
vi.mock("@/lib/league-state", () => ({ loadEditableLeagueState: mocks.load }));
vi.mock("@/lib/league-movements", () => ({ persistLeagueMovement: mocks.persist }));
vi.mock("@/lib/season-time", async () => import("./season-time"));
vi.mock("@/lib/league-moments", async () => import("./league-moments"));
vi.mock("@/lib/cap-override", async () => import("./cap-override"));
vi.mock("@/lib/dpe-rules", async () => import("./dpe-rules"));
vi.mock("@/lib/team-option-contract", async () => import("./team-option-contract"));
vi.mock("@/lib/role-minimums", async () => import("./role-minimums"));
vi.mock("@/lib/dpe-operations", async () => import("./dpe-operations"));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(decodeURIComponent(url)); } }));

function form(operation: "dpe_activate" | "dpe_reintegrate", confirmed = true) {
  const result = new FormData();
  result.set("team_code", "AAA");
  result.set("player_name", "Target");
  result.set("dpe_operation", operation);
  result.set("requirements_confirmed", String(confirmed));
  return result;
}

function setup(moment: LeagueMoment, target: Partial<RosterEntry> = {}, loggedIn = true) {
  const state = emptyLeagueState();
  state.rosterEntries = [
    ...Array.from({ length: 13 }, (_, index): RosterEntry => ({ name: `Player ${index}`, cost: 1, contract: "27", state: "active", slot: "regular", teamCode: "AAA", role: index < 5 ? "G" : index < 10 ? "A" : "C" })),
    { name: "Target", cost: 20, contract: "28", role: "G", state: "active", slot: "dpe", teamCode: "AAA", ...target },
  ];
  const client = { auth: { getUser: vi.fn().mockResolvedValue({ data: { user: loggedIn ? { id: "admin-fixture" } : null } }) },
    from: vi.fn().mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { name: "2026/27", status: "regular_season", team_options_resolved: true, timeline_moment: moment }, error: null }) }) }) }) };
  mocks.client.mockResolvedValue(client);
  mocks.load.mockResolvedValue(state);
  mocks.persist.mockResolvedValue({ error: null });
  return state;
}

beforeEach(() => vi.clearAllMocks());

describe("controlli server delle operazioni DPE", () => {
  it("non consente di aggirare il blocco NO R. inviando direttamente il form", async () => {
    setup("trade_deadline", { dpeActivatedAfterDeadline: true });
    await expect(applyDpeOperation(form("dpe_reintegrate"))).rejects.toThrow(/DPE in essere.*dopo la trade deadline/);
    expect(mocks.persist).not.toHaveBeenCalled();
  });

  it.each(["contract_delivery", "free_agency_end", "free_agency_reopening"] as const)("non reintegra fuori finestra a %s", async (moment) => {
    setup(moment);
    await expect(applyDpeOperation(form("dpe_reintegrate"))).rejects.toThrow(/disponibile dalla Trade deadline/);
    expect(mocks.persist).not.toHaveBeenCalled();
  });

  it("salva il reintegro idoneo e conserva la normale registrazione del movimento", async () => {
    setup("trade_deadline", { dpeActivatedAfterDeadline: false });
    await expect(applyDpeOperation(form("dpe_reintegrate"))).rejects.toThrow(/updated=.*Reintegro anticipato/);
    expect(mocks.persist).toHaveBeenCalledOnce();
    const args = mocks.persist.mock.calls[0];
    expect(args[2].rosterEntries.at(-1)).toMatchObject({ slot: "regular" });
    expect(args[2].rosterEntries.at(-1).dpeActivatedAfterDeadline).toBeUndefined();
    expect(args[3]).toBe("dpe_reintegrate");
  });

  it("consente l'esercizio dopo la deadline e registra NO R. senza cambiare costo o contratto", async () => {
    setup("trade_deadline", { slot: "regular" });
    await expect(applyDpeOperation(form("dpe_activate"))).rejects.toThrow(/updated=.*Esercizio DPE/);
    expect(mocks.persist.mock.calls[0][2].rosterEntries.at(-1)).toMatchObject({ cost: 20, contract: "28", slot: "dpe", dpeActivatedAfterDeadline: true });
  });

  it("mantiene vincolanti slot e salary cap anche per un reintegro idoneo", async () => {
    const full = setup("trade_deadline");
    full.rosterEntries.push(...full.rosterEntries.slice(0, 2).map((entry, index) => ({ ...entry, name: `Extra ${index}` })));
    await expect(applyDpeOperation(form("dpe_reintegrate"))).rejects.toThrow(/slot roster libero/);
    expect(mocks.persist).not.toHaveBeenCalled();
    const expensive = setup("trade_deadline", { cost: 100 });
    expensive.rosterEntries[0].cost = 1050;
    await expect(applyDpeOperation(form("dpe_reintegrate"))).rejects.toThrow(/salary cap|team salary|1100/i);
    expect(mocks.persist).not.toHaveBeenCalled();
  });

  it("richiede la nuova conferma e una sessione valida prima di salvare", async () => {
    setup("trade_deadline", { slot: "regular" });
    await expect(applyDpeOperation(form("dpe_activate", false))).rejects.toThrow(/NBC Sports Edge.*25 partite NBA/);
    expect(mocks.persist).not.toHaveBeenCalled();
    setup("trade_deadline", {}, false);
    await expect(applyDpeOperation(form("dpe_reintegrate"))).rejects.toThrow(/Sessione scaduta/);
    expect(mocks.persist).not.toHaveBeenCalled();
  });
});
