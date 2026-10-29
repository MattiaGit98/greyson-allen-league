import * as React from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyLeagueState } from "./league-state";
import { buildPublicLeagueContext } from "./public-league-context";
import { HomeDataExport } from "../components/home-data-export";

const sources = vi.hoisted(() => ({ season: vi.fn(), state: vi.fn(), regulation: vi.fn() }));
vi.mock("@/lib/active-season", () => ({ requireActiveSeason: sources.season }));
vi.mock("@/lib/league-state", () => ({ loadEditableLeagueState: sources.state }));
vi.mock("@/lib/regulation", () => ({ loadRegulation: sources.regulation }));
vi.mock("@/lib/public-league-context", async () => import("./public-league-context"));
vi.mock("@/lib/load-public-league-context", async () => import("./load-public-league-context"));
import * as route from "../app/esporta-dati/route";

const season = { name: "2026/27", status: "offseason" as const, timeline_moment: "offseason_start", team_options_resolved: false };
const articles = [{ number: 1, title: "Test article", label: "test", id: "articolo-test", clauses: ["Test clause"] }];

function fixture() {
  return {
    ...emptyLeagueState(),
    teams: [{ code: "AAA", name: "Test team", owner: "Test owner", credits: 0, cost: 0, players: 0,
      cutPlayers: 0, qualifyingOffers: 0, draftAssets: 0, nextSeasonCredits: 0, followingSeasonCredits: 0, slug: "test" }],
    playerList: [{ name: "Test player", role: "G" as const, realTeam: "", rookie: false, under23: false }],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("React", React);
  sources.season.mockResolvedValue({ season });
  sources.state.mockResolvedValue(fixture());
  sources.regulation.mockResolvedValue(articles);
});
afterEach(() => vi.unstubAllGlobals());

describe("download pubblico dei dati della lega", () => {
  it("scarica un file JSON leggibile, aggiornato e non memorizzabile in cache", async () => {
    const started = Date.now();
    const response = await route.GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="greyson-allen-league-data.json"');
    expect(response.headers.get("cache-control")).toContain("no-store");
    const text = await response.text();
    const document = JSON.parse(text);
    expect(Object.keys(document)).toEqual(["generated_at", "teams", "player_list", "regulation"]);
    expect(Date.parse(document.generated_at)).toBeGreaterThanOrEqual(started);
    expect(Date.parse(document.generated_at)).toBeLessThanOrEqual(Date.now());
    expect(text).toContain('\n  "teams": [');
    expect(text.endsWith("\n")).toBe(true);
    expect(route.dynamic).toBe("force-dynamic");
    expect(route.revalidate).toBe(0);
    expect(Object.keys(route).filter((key) => /^[A-Z]+$/.test(key))).toEqual(["GET"]);
  });

  it("usa integralmente la proiezione pubblica e le stesse tre fonti del sito", async () => {
    const expected = buildPublicLeagueContext(fixture(), season, articles);
    const document = await (await route.GET()).json();
    expect(document.teams).toEqual(expected.squadre);
    expect(document.player_list).toEqual(expected.listone);
    expect(document.regulation).toEqual(expected.regolamento);
    for (const source of Object.values(sources)) expect(source).toHaveBeenCalledOnce();
  });

  it("rilegge lo stato ad ogni download invece di riutilizzare il file precedente", async () => {
    expect((await (await route.GET()).json()).teams[0].nome).toBe("Test team");
    const next = fixture();
    next.teams[0].name = "Updated team";
    next.playerList.push({ ...next.playerList[0], name: "New player" });
    sources.state.mockResolvedValue(next);
    const document = await (await route.GET()).json();
    expect(document.teams[0].nome).toBe("Updated team");
    expect(document.player_list.giocatori).toHaveLength(2);
    expect(sources.state).toHaveBeenCalledTimes(2);
  });

  it("non include campi privati o tecnici presenti nei dati sorgente", async () => {
    const state = fixture();
    Object.assign(state, { publicNotice: "Excluded notice", privateDrafts: ["Excluded draft"] });
    Object.assign(state.teams[0], { adminOnlyNote: "Excluded admin note" });
    sources.state.mockResolvedValue(state);
    const text = await (await route.GET()).text();
    for (const field of ["publicNotice", "privateDrafts", "adminOnlyNote", "slug", "before_state", "after_state"]) {
      expect(text).not.toContain(`"${field}"`);
    }
    expect(text).not.toContain("Excluded");
  });

  it("non scarica copie vecchie o messaggi tecnici quando il caricamento fallisce", async () => {
    sources.state.mockRejectedValue(new Error("Private backend details"));
    const response = await route.GET();
    expect(response.status).toBe(503);
    expect(response.headers.get("content-disposition")).toBeNull();
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toEqual({ error: "Dati della lega temporaneamente non disponibili." });
  });

  it("mostra un solo comando di download in homepage, senza JavaScript dedicato", () => {
    const html = renderToStaticMarkup(React.createElement(HomeDataExport));
    expect(html).toContain("Esporta dati della lega");
    expect(html).toContain("Scarica i dati aggiornati della lega per analisi offline o utilizzo con strumenti esterni.");
    expect(html).toContain('href="/esporta-dati" download="greyson-allen-league-data.json"');
    expect(html).toContain(">Scarica dati</a>");
    expect(html.match(/<a /g)).toHaveLength(1);
    expect(html).not.toContain("<script");
  });

  it("documenta soltanto la possibilità di esportare dalla homepage", () => {
    expect(readFileSync("README.md", "utf8")).toContain("Dalla homepage è possibile esportare uno snapshot JSON aggiornato di squadre, listone e regolamento.");
  });
});
