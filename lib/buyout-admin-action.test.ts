import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LeagueMoment } from "./league-moments";
import type { RosterEntry } from "./league-types";
import { emptyLeagueState } from "./league-state";
import { applyRosterExitOperation, applyStretchProvision } from "../app/admin/tagli-rilasci/actions";

const mocks = vi.hoisted(() => ({ client: vi.fn(), load: vi.fn(), persist: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: mocks.client }));
vi.mock("@/lib/league-state", () => ({ loadEditableLeagueState: mocks.load }));
vi.mock("@/lib/league-movements", () => ({ persistLeagueMovement: mocks.persist }));
vi.mock("@/lib/release-operations", async () => import("./release-operations"));
vi.mock("@/lib/season-time", async () => import("./season-time"));
vi.mock("@/lib/stretch-provision", async () => import("./stretch-provision"));
vi.mock("@/lib/league-moments", async () => import("./league-moments"));
vi.mock("@/lib/cap-override", async () => import("./cap-override"));
vi.mock("@/lib/free-release", async () => import("./free-release"));
vi.mock("@/lib/team-option-contract", async () => import("./team-option-contract"));
vi.mock("@/lib/role-minimums", async () => import("./role-minimums"));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(decodeURIComponent(url)); } }));

function form(confirmed = false) {
  const data = new FormData();
  data.set("team_code", "AAA");
  data.set("player_name", "Target");
  data.set("operation_kind", "buyout");
  data.set("role_minimum_confirmed", String(confirmed));
  return data;
}

function setup(moment: LeagueMoment = "trade_deadline", target: Partial<RosterEntry> = {}, loggedIn = true) {
  const state = emptyLeagueState();
  state.rosterEntries = [
    ...Array.from({ length: 13 }, (_, index): RosterEntry => ({ name: `Player ${index}`, cost: 1, contract: "27", state: "active", slot: "regular", teamCode: "AAA", role: index < 5 ? "G" : index < 10 ? "A" : "C" })),
    { name: "Target", cost: 47, contract: "29", role: "G", state: "active", slot: "regular", teamCode: "AAA", ...target },
  ];
  const client = {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: loggedIn ? { id: "admin-fixture" } : null } }) },
    from: vi.fn().mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { name: "2026/27", status: "regular_season", team_options_resolved: true, timeline_moment: moment }, error: null }) }) }) }),
  };
  mocks.client.mockResolvedValue(client);
  mocks.load.mockResolvedValue(state);
  mocks.persist.mockResolvedValue({ error: null });
  return state;
}

beforeEach(() => vi.clearAllMocks());

describe("controlli server buyout", () => {
  it.each(["auction_start", "auction_completed", "contract_delivery", "buyout_end", "free_agency_end", "free_agency_reopening"] as const)("non salva fuori finestra a %s", async (moment) => {
    setup(moment);
    await expect(applyRosterExitOperation(form())).rejects.toThrow(/finestra dei buyout non è aperta/);
    expect(mocks.persist).not.toHaveBeenCalled();
  });

  it.each(["regular", "two_way", "g_league", "dpe"] as const)("salva il buyout attivo dallo slot %s con sconto e dettaglio corretto", async (slot) => {
    const before = setup("trade_deadline", { slot });
    await expect(applyRosterExitOperation(form())).rejects.toThrow(/updated=.*Buyout registrato/);
    expect(mocks.persist).toHaveBeenCalledOnce();
    const args = mocks.persist.mock.calls[0];
    expect(args[2].rosterEntries.at(-1)).toMatchObject({ state: "cut", slot: "regular", cost: 113, contract: "27", buyoutApplied: true });
    expect(args[3]).toBe("buyout");
    expect(args[4]).toContain("riduzione 20%");
    expect(before.rosterEntries.at(-1)).toMatchObject({ state: "active", cost: 47, contract: "29" });
  });

  it("concentra il contratto già tagliato senza sconto e senza toccare roster o ruoli", async () => {
    const before = setup("trade_deadline", { state: "cut" });
    const data = form();
    data.set("discount", "true"); // Un campo client non può ottenere lo sconto.
    await expect(applyRosterExitOperation(data)).rejects.toThrow(/updated=.*Buyout registrato/);
    const args = mocks.persist.mock.calls[0];
    expect(args[2].rosterEntries.at(-1)).toMatchObject({ state: "cut", cost: 141, contract: "27", buyoutApplied: true });
    expect(args[2].rosterEntries.filter((entry: RosterEntry) => entry.state === "active"))
      .toEqual(before.rosterEntries.filter((entry) => entry.state === "active"));
    expect(args[4]).toContain("già tagliato, nessuno sconto");
    expect(args[4]).not.toContain("riduzione 20%");
  });

  it.each(["stretchProvisionApplied", "buyoutApplied"] as const)("non permette di aggirare %s tramite invio diretto del form", async (marker) => {
    setup("trade_deadline", { state: "cut", [marker]: true });
    await expect(applyRosterExitOperation(form())).rejects.toThrow(/nessuna stretch provision o buyout/);
    expect(mocks.persist).not.toHaveBeenCalled();
  });

  it.each(["27", "PENDING", "27 + T.O.", "27 + R.E."])("rifiuta il contratto %s", async (contract) => {
    setup("trade_deadline", { contract });
    await expect(applyRosterExitOperation(form())).rejects.toThrow(/più di una stagione/);
    expect(mocks.persist).not.toHaveBeenCalled();
  });

  it.each([859, 860])("applica il limite di 1000 anche al buyout senza sconto, con altri costi %i", async (otherCosts) => {
    const state = setup("trade_deadline", { state: "cut" });
    state.rosterEntries[0].cost = otherCosts - 12;
    if (otherCosts === 859) {
      await expect(applyRosterExitOperation(form())).rejects.toThrow(/updated=.*Buyout registrato/);
      expect(mocks.persist).toHaveBeenCalledOnce();
    } else {
      await expect(applyRosterExitOperation(form())).rejects.toThrow(/non rispetta il salary cap/);
      expect(mocks.persist).not.toHaveBeenCalled();
    }
  });

  it("richiede ancora la conferma per una carenza di ruolo provocata dal taglio", async () => {
    const state = setup();
    state.rosterEntries[0].role = undefined;
    await expect(applyRosterExitOperation(form())).rejects.toThrow(/Conferma il ripristino obbligatorio/);
    expect(mocks.persist).not.toHaveBeenCalled();
    await expect(applyRosterExitOperation(form(true))).rejects.toThrow(/updated=.*Buyout registrato/);
    expect(mocks.persist).toHaveBeenCalledOnce();
  });

  it("blocca una successiva stretch su un contratto segnato come buyout", async () => {
    setup("trade_deadline", { state: "cut", contract: "27", cost: 141, buyoutApplied: true });
    const data = form();
    data.set("installments", "3");
    await expect(applyStretchProvision(data)).rejects.toThrow(/non è idoneo alla stretch/);
    expect(mocks.persist).not.toHaveBeenCalled();
  });

  it("non accetta operazioni senza sessione", async () => {
    setup("trade_deadline", {}, false);
    await expect(applyRosterExitOperation(form())).rejects.toThrow(/Sessione scaduta/);
    expect(mocks.persist).not.toHaveBeenCalled();
  });
});
