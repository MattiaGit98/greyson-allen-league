import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import GlobalError from "../app/error";

const screen = vi.hoisted(() => ({ retrying: true }));
vi.mock("react", async () => ({ ...await vi.importActual<typeof React>("react"), useState: () => [screen.retrying, vi.fn()], useEffect: vi.fn() }));
vi.mock("@/lib/page-load-recovery", async () => import("./page-load-recovery"));

beforeEach(() => { screen.retrying = true; vi.stubGlobal("React", React); });
afterEach(() => vi.unstubAllGlobals());
function render() {
  return renderToStaticMarkup(React.createElement(GlobalError, { error: new Error("Fixture"), reset: vi.fn() }));
}

describe("schermate di caricamento ed errore della lega", () => {
  it("mostra il logo ufficiale e un solo messaggio di caricamento, senza riquadro di errore", () => {
    const html = render();
    expect(html).toContain('class="league-state-screen league-loading-screen"');
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('src="/icons/icon-192.png"');
    expect(html).toContain('alt="Greyson Allen League"');
    expect(html).toContain("Caricamento della lega…");
    expect(html).toContain('class="league-loading-spinner" aria-hidden="true"');
    expect(html).not.toContain("Clicca qui per ricaricare la pagina");
    expect(html).not.toContain('class="notice');
    expect(html).not.toContain("Nuovo tentativo di connessione");
  });

  it("mostra un errore a tutto schermo senza logo e con un pulsante esplicito per ricaricare", () => {
    screen.retrying = false;
    const html = render();
    expect(html).toContain('class="league-state-screen league-error-screen"');
    expect(html).toContain('role="alert"');
    expect(html).toContain('aria-labelledby="league-error-title"');
    expect(html).toContain('<h1 id="league-error-title">Impossibile caricare la lega</h1>');
    expect(html).toContain("Clicca qui per ricaricare la pagina");
    expect(html).toContain('class="button primary league-reload-button"');
    expect(html).not.toContain('class="notice');
    expect(html).not.toContain("league-loading-screen");
    expect(html).not.toContain("league-loading-logo");
  });

  it("nasconde navigazione e banner durante entrambi gli stati isolati", () => {
    const css = readFileSync("app/globals.css", "utf8");
    for (const selector of [".site-header", ".public-navigation", ".section-nav", ".admin-session-bar", ".live-update-notice"]) {
      expect(css).toContain(`body:has(.league-state-screen) ${selector}`);
    }
    expect(css).toMatch(/\.league-state-screen\s*\{[^}]*position: fixed;[^}]*inset: 0;/);
    expect(css).toMatch(/body:has\(\.league-state-screen\)[\s\S]*?\.live-update-notice\s*\{ display: none; \}/);
    expect(css).toContain("env(safe-area-inset-top, 0px)");
    expect(css).toContain("@media (max-height: 400px)");
  });

  it("rispetta la preferenza di riduzione delle animazioni", () => {
    const css = readFileSync("app/globals.css", "utf8");
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.league-loading-spinner\s*\{ animation: none; \}/);
  });

  it("mantiene la ricarica completa già usata dal pulsante manuale", () => {
    screen.retrying = false;
    const element = GlobalError({ error: new Error("Fixture"), reset: vi.fn() });
    const button = element.props.children.props.children[1];
    const reload = vi.fn();
    vi.stubGlobal("window", { location: { reload } });
    button.props.onClick();
    expect(reload).toHaveBeenCalledOnce();
  });
});
