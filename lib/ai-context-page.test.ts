import * as React from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadContext = vi.hoisted(() => vi.fn());
vi.mock("@/lib/load-public-league-context", () => ({ loadPublicLeagueContext: loadContext }));
import AiContextPage, { dynamic, revalidate } from "../app/ai-context/page";

const context = {
  squadre: [{
    sigla: "AAA", nome: "Test team", proprietari: "Test owner",
    capLibero: [{ annata: "2026/27", crediti: 987 }], ruoli: { G: 5, A: 6, C: 3 },
    roster: [{ nome: "Test player", ruolo: "G", scadenza: "28 EXT", costo: 13, bollini: ["DPE", "PLAYOFF"] }],
    twoWay: [], gLeague: [], dpe: [],
    tagliati: [{ nome: "Cut player", scadenza: "27", costo: 0, stretchNonDisponibile: false, bollini: [] }],
    numeroScelteScambiabili: 1,
    scelte: [{ anno: 2028, giro: "1° giro", origineOPosizione: "AAA", clausola: "Diritto di swap con BBB" }],
    qualifyingOffer: [{ nome: "Test right", ruolo: "C", importo: 7 }],
  }],
  listone: { ufficiale: true, giocatori: [{ nome: "Test player", ruolo: "G", stato: "Non in scad.", squadra: "AAA", numero: null, rookie: false, under23: false }] },
  regolamento: [{ numero: 1, titolo: "Test article", commi: ["First clause", "Second clause with <script>alert(1)</script>"] }],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("React", React);
  loadContext.mockResolvedValue(context);
});
afterEach(() => vi.unstubAllGlobals());

function escaped(value: unknown) {
  return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#x27;" })[character]!);
}

function scalarValues(value: unknown): unknown[] {
  if (Array.isArray(value)) return value.flatMap(scalarValues);
  if (value !== null && typeof value === "object") return Object.values(value).flatMap(scalarValues);
  return [value];
}

describe("pagina HTML del contesto AI", () => {
  it("renderizza tutti i dati del contesto condiviso in HTML leggibile senza JavaScript", async () => {
    const html = renderToStaticMarkup(await AiContextPage());
    expect(loadContext).toHaveBeenCalledOnce();
    for (const title of ["Squadre", "Listone", "Regolamento"]) expect(html).toContain(`>${title}</h2>`);
    for (const value of scalarValues(context)) {
      const text = value === null ? "—" : typeof value === "boolean" ? value ? "Sì" : "No" : String(value);
      expect(html).toContain(escaped(text));
    }
    expect(html).toContain("<table>");
    expect(html).toContain('<ol type="a">');
    expect(html).not.toMatch(/<script|<button|<input|<select|<details/);
    expect(dynamic).toBe("force-dynamic");
    expect(revalidate).toBe(0);
  });

  it("rilegge il contesto ad ogni richiesta senza una copia separata", async () => {
    await AiContextPage();
    loadContext.mockResolvedValue({ ...context, squadre: [{ ...context.squadre[0], nome: "Renamed team" }] });
    const html = renderToStaticMarkup(await AiContextPage());
    expect(html).toContain("Renamed team");
    expect(html).not.toContain("Test team");
    expect(loadContext).toHaveBeenCalledTimes(2);
  });

  it("non sostituisce dati indisponibili con una copia precedente o uno stato vuoto", async () => {
    loadContext.mockRejectedValue(new Error("Unavailable"));
    await expect(AiContextPage()).rejects.toThrow("Unavailable");
  });

  it("indica nel README il nuovo indirizzo pubblico", () => {
    const readme = readFileSync("README.md", "utf8");
    expect(readme).toContain("https://greyson-allen-league.vercel.app/ai-context");
    expect(readme).not.toContain("https://greyson-allen-league.vercel.app/api/ai/context");
  });
});
