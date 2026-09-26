import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { articleId, parseRegulation } from "./regulation";

describe("regolamento LaTeX", () => {
  const source = readFileSync(join(process.cwd(), "content", "Regolamento.tex"), "utf8");
  const articles = parseRegulation(source);

  it("importa tutti gli articoli e i commi", () => {
    expect(articles).toHaveLength(15);
    expect(articles.reduce((total, article) => total + article.clauses.length, 0)).toBe(92);
  });

  it("mantiene etichette e richiami per la navigazione interna", () => {
    expect(articles.find((article) => article.label === "Scambi")?.number).toBe(13);
    expect(articleId("Two-way contract e G-League")).toBe("articolo-two-way-contract-e-g-league");
    expect(articles.some((article) => article.clauses.some((clause) => clause.includes("\\ref{Scambi}")))).toBe(true);
  });
});
