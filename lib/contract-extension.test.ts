import { beforeEach, describe, expect, it, vi } from "vitest";
import { contractExtensionCost } from "./contract-extension";
import { emptyLeagueState } from "./league-state";
import { applyContractExtension } from "../app/admin/estensioni/actions";

const mocks = vi.hoisted(() => ({ client: vi.fn(), load: vi.fn(), persist: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: mocks.client }));
vi.mock("@/lib/league-state", () => ({ loadEditableLeagueState: mocks.load }));
vi.mock("@/lib/league-movements", () => ({ persistLeagueMovement: mocks.persist }));
vi.mock("@/lib/season-time", async () => import("./season-time"));
vi.mock("@/lib/league-moments", async () => import("./league-moments"));
vi.mock("@/lib/cap-override", async () => import("./cap-override"));
vi.mock("@/lib/contract-extension", async () => import("./contract-extension"));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(decodeURIComponent(url)); } }));

beforeEach(() => vi.clearAllMocks());

describe("aumento del 20% per le estensioni contrattuali", () => {
  it.each([[180, 216], [200, 240], [201, 242], [203, 244], [335, 402]])("estende %i a %i crediti senza errori di arrotondamento", (cost, expected) => {
    expect(contractExtensionCost(cost)).toBe(expected);
  });

  function setup(legacy = false, otherCost = 0) {
    const state = emptyLeagueState();
    state.rosterEntries = [{ name: "Esistente", teamCode: "AAA", role: "G", state: "active", slot: "regular", cost: 180, contract: "27 (E)",
      ...(legacy ? {} : { auctionPrice: 200, originalContractYears: 3 as const }) }];
    if (otherCost) state.rosterEntries.push({ name: "Altro", teamCode: "AAA", role: "A", state: "active", slot: "regular", cost: otherCost, contract: "28" });
    mocks.load.mockResolvedValue(state);
    mocks.persist.mockResolvedValue({ error: null });
    mocks.client.mockResolvedValue({ auth: { getUser: async () => ({ data: { user: { id: "admin-fixture" } } }) },
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { name: "2026/27", status: "offseason", team_options_resolved: true, timeline_moment: "team_option_deadline" }, error: null }) }) }) }) });
    const form = new FormData();
    form.set("team_code", "AAA");
    form.set("player_name", "Esistente");
    return { state, form };
  }

  it.each([false, true])("applica il nuovo aumento a un contratto già assegnato, anche senza metadati originari: %s", async (legacy) => {
    const { state, form } = setup(legacy);
    await expect(applyContractExtension(form)).rejects.toThrow(/updated=.*Estensione registrata/);
    const args = mocks.persist.mock.calls[0];
    expect(args[2].rosterEntries[0]).toMatchObject({ cost: 216, contract: "28", lastExtensionSeason: "2026/27" });
    expect(args[4]).toContain("180 → 216");
    expect(state.rosterEntries[0]).toMatchObject({ cost: 180, contract: "27 (E)" });
  });

  it("usa il 20% anche nei controlli del cap e continua a bloccare il superamento dei limiti", async () => {
    const allowed = setup(false, 780);
    await expect(applyContractExtension(allowed.form)).rejects.toThrow(/updated=/);
    expect(mocks.persist).toHaveBeenCalledOnce();
    mocks.persist.mockClear();
    const blocked = setup(false, 785);
    await expect(applyContractExtension(blocked.form)).rejects.toThrow(/oltre il salary cap/);
    expect(mocks.persist).not.toHaveBeenCalled();
  });
});
