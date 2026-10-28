import { readFileSync, readdirSync } from "node:fs";
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

  it("usa nell'interfaccia soltanto riferimenti a commi esistenti", () => {
    const clauseCounts = new Map(articles.map((article) => [article.number, article.clauses.length]));
    const sourceFiles = ["app", "components", "lib"].flatMap((directory) => sourceFilesUnder(join(process.cwd(), directory)));
    const invalidReferences: string[] = [];

    sourceFiles.forEach((file) => {
      const content = readFileSync(file, "utf8");
      for (const match of content.matchAll(/Art\.\s*(\d+)(?:\(([^)]+)\))?/g)) {
        const articleNumber = Number(match[1]);
        const clauseCount = clauseCounts.get(articleNumber);
        if (!clauseCount) {
          invalidReferences.push(`${file}: Art. ${articleNumber}`);
          continue;
        }
        if (!match[2]) continue;
        referencedClauseIndexes(match[2]).forEach((index) => {
          if (index < 1 || index > clauseCount) invalidReferences.push(`${file}: ${match[0]}`);
        });
      }
    });

    expect(invalidReferences).toEqual([]);
  });
});

function sourceFilesUnder(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFilesUnder(path);
    return /\.(?:ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".test.ts") ? [path] : [];
  });
}

function referencedClauseIndexes(reference: string) {
  return reference.split(",").flatMap((part) => {
    const range = part.trim().match(/^([a-z])(?:\s*-\s*([a-z]))?$/i);
    if (!range) return [Number.NaN];
    const start = range[1]!.toLocaleLowerCase("it").charCodeAt(0) - 96;
    const end = (range[2] ?? range[1])!.toLocaleLowerCase("it").charCodeAt(0) - 96;
    return Array.from({ length: Math.max(0, end - start + 1) }, (_, index) => start + index);
  });
}
