import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContentEditor } from "../app/admin/contenuti/content-editor";
import { defaultCompetitionMap, type CupGroupContent } from "./competitions";

vi.mock("@/lib/competitions", async () => import("./competitions"));
vi.mock("../app/admin/contenuti/actions", () => ({ saveCompetitionContent: vi.fn() }));
vi.mock("@/components/home-feature-toggle", () => ({ HomepageFeatureToggle: () => null }));

const teams = [{ code: "AAA", name: "Alfa" }, { code: "BBB", name: "Beta" }];
beforeEach(() => vi.stubGlobal("React", React));
afterEach(() => vi.unstubAllGlobals());
function render(content: CupGroupContent) {
  return renderToStaticMarkup(React.createElement(ContentEditor, { competitions: { ...defaultCompetitionMap(teams.length), "Girone coppa": content }, teams, homepageCompetition: null }));
}
function input(html: string, label: string) {
  return html.match(new RegExp(`<input[^>]*aria-label="${label}"[^>]*>`))?.[0];
}

describe("spunte W/L del girone coppa", () => {
  it("traduce i risultati esistenti 1 in W e 0 in L, lasciando vuote le giornate non inserite", () => {
    const content: CupGroupContent = { kind: "cup_group", rounds: 3, results: {
      AAA: { wins: [1, 0, null], scores: ["100", "90", ""] },
      BBB: { wins: [0, 1, null], scores: ["90", "100", ""] },
    } };
    const before = structuredClone(content);
    const html = render(content);
    expect(input(html, "Vittoria Alfa, G1")).toContain('checked=""');
    expect(input(html, "Sconfitta Alfa, G1")).not.toContain('checked=""');
    expect(input(html, "Vittoria Alfa, G2")).not.toContain('checked=""');
    expect(input(html, "Sconfitta Alfa, G2")).toContain('checked=""');
    expect(input(html, "Vittoria Alfa, G3")).not.toContain('checked=""');
    expect(input(html, "Sconfitta Alfa, G3")).not.toContain('checked=""');
    expect(html).toContain(">W</span>");
    expect(html).toContain(">L</span>");
    expect(html).not.toContain("Salvataggio bloccato");
    expect(html.match(/<button[^>]*content-save-button[^>]*>/)?.[0]).not.toContain('disabled=""');
    expect(content).toEqual(before);
  });

  it("mostra il motivo e disabilita il salvataggio per una giornata incompleta", () => {
    const html = render({ kind: "cup_group", rounds: 1, results: { AAA: { wins: [1], scores: ["100"] } } });
    expect(html).toContain("Salvataggio bloccato");
    expect(html).toContain("G1: giornata incompleta (1/2");
    expect(html.match(/<button[^>]*content-save-button[^>]*>/)?.[0]).toContain('disabled=""');
  });

  it("mostra il motivo e disabilita il salvataggio per una giornata sbilanciata", () => {
    const html = render({ kind: "cup_group", rounds: 1, results: {
      AAA: { wins: [1], scores: ["100"] }, BBB: { wins: [1], scores: ["90"] },
    } });
    expect(html).toContain("Il numero di vittorie deve essere uguale al numero di sconfitte");
    expect(html.match(/<button[^>]*content-save-button[^>]*>/)?.[0]).toContain('disabled=""');
  });

  it("consente di salvare un girone vuoto con entrambe le spunte non selezionate", () => {
    const html = render({ kind: "cup_group", rounds: 1, results: {} });
    expect(input(html, "Vittoria Alfa, G1")).not.toContain('checked=""');
    expect(input(html, "Sconfitta Alfa, G1")).not.toContain('checked=""');
    expect(html).not.toContain("Salvataggio bloccato");
    expect(html.match(/<button[^>]*content-save-button[^>]*>/)?.[0]).not.toContain('disabled=""');
  });
});
