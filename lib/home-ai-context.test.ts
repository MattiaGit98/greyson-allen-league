import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HomeAiContext } from "../components/home-ai-context";

const setState = vi.hoisted(() => vi.fn());
vi.mock("react", async (original) => ({
  ...await original<typeof React>(),
  useState: () => ["idle", setState],
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("React", React);
});
afterEach(() => vi.unstubAllGlobals());

function copyButton(element: React.ReactElement): { onClick: () => Promise<void> } {
  if (element.type === "button") return element.props as { onClick: () => Promise<void> };
  const children = React.Children.toArray((element.props as { children?: React.ReactNode }).children);
  for (const child of children) {
    if (!React.isValidElement(child)) continue;
    try { return copyButton(child); } catch { /* Search the next sibling. */ }
  }
  throw new Error("Copy button not found");
}

describe("blocco AI della homepage", () => {
  it("mostra testo e indirizzo richiesti senza trasformare l'indirizzo in link", () => {
    const markup = renderToStaticMarkup(React.createElement(HomeAiContext));
    expect(markup).toContain("Analizza la lega con l’IA");
    expect(markup).toContain("Per permettere ad assistenti AI di leggere i dati della Greyson Allen League, condividi con loro questo indirizzo:");
    expect(markup).toContain("<span>https://greyson-allen-league.vercel.app/api/ai/context</span>");
    expect(markup).not.toContain("<a ");
    expect(markup).toContain(">Copia</button>");
  });

  it("copia esattamente l'indirizzo e mostra la conferma", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    await copyButton(HomeAiContext()).onClick();
    expect(writeText).toHaveBeenCalledWith("https://greyson-allen-league.vercel.app/api/ai/context");
    expect(setState).toHaveBeenCalledWith("copied");
  });

  it("gestisce il rifiuto degli appunti senza errori non intercettati", async () => {
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("Denied")) } });
    await copyButton(HomeAiContext()).onClick();
    expect(setState).toHaveBeenCalledWith("error");
  });
});
