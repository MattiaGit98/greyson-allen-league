import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyLeagueState } from "./league-state";

const sources = vi.hoisted(() => ({ season: vi.fn(), state: vi.fn(), regulation: vi.fn() }));
vi.mock("@/lib/active-season", () => ({ requireActiveSeason: sources.season }));
vi.mock("@/lib/league-state", () => ({ loadEditableLeagueState: sources.state }));
vi.mock("@/lib/regulation", () => ({ loadRegulation: sources.regulation }));
vi.mock("@/lib/public-league-context", async () => import("./public-league-context"));
vi.mock("@/lib/load-public-league-context", async () => import("./load-public-league-context"));
import * as route from "../app/api/ai/context/route";

beforeEach(() => {
  vi.resetAllMocks();
  sources.season.mockResolvedValue({ season: { name: "2026/27", status: "offseason", timeline_moment: "offseason_start", team_options_resolved: false } });
  sources.state.mockResolvedValue(emptyLeagueState());
  sources.regulation.mockResolvedValue([]);
});

describe("GET /api/ai/context", () => {
  it("restituisce JSON pubblico non memorizzabile usando le stesse tre fonti del sito", async () => {
    const response = await route.GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(Object.keys(await response.json())).toEqual(["squadre", "listone", "regolamento"]);
    for (const source of Object.values(sources)) expect(source).toHaveBeenCalledOnce();
    expect(route.dynamic).toBe("force-dynamic");
    expect(route.revalidate).toBe(0);
    expect(Object.keys(route).filter((key) => /^[A-Z]+$/.test(key))).toEqual(["GET"]);
  });

  it("rilegge i dati ad ogni richiesta senza copie precedenti", async () => {
    expect((await (await route.GET()).json()).listone.giocatori).toEqual([]);
    sources.state.mockResolvedValue({ ...emptyLeagueState(), playerList: [{ name: "New player", role: "G", realTeam: "", rookie: false, under23: false }] });
    const next = await (await route.GET()).json();
    expect(next.listone.giocatori[0].nome).toBe("New player");
    expect(sources.state).toHaveBeenCalledTimes(2);
  });

  it("restituisce 503 senza dettagli tecnici né dati di ripiego se una fonte non è disponibile", async () => {
    sources.state.mockRejectedValue(new Error("Private backend details"));
    const response = await route.GET();
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toEqual({ error: "Dati della lega temporaneamente non disponibili." });
  });
});
