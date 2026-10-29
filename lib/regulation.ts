import { readFile } from "node:fs/promises";
import { join } from "node:path";

export type RegulationArticle = {
  number: number;
  title: string;
  label: string;
  id: string;
  clauses: string[];
};

export async function loadRegulation() {
  const source = await readFile(join(process.cwd(), "content", "Regolamento.tex"), "utf8");
  return parseRegulation(source);
}

export function parseRegulation(source: string): RegulationArticle[] {
  const articles = [...source.matchAll(
    /\\section\{([^}]*)\}\\label\{([^}]*)\}([\s\S]*?)(?=\\section\{|\\end\{document\})/g,
  )];

  return articles.map((match, index) => {
    const enumeration = match[3].match(
      /\\begin\{enumerate\}(?:\[[^\]]*\])?([\s\S]*?)\\end\{enumerate\}/,
    );
    const clauses = enumeration
      ? enumeration[1]
        .split(/\\item\s+/)
        .slice(1)
        .map(cleanLatexText)
        .filter(Boolean)
      : [];

    return {
      number: index + 1,
      title: cleanLatexText(match[1]),
      label: match[2].trim(),
      id: articleId(match[2]),
      clauses,
    };
  });
}

export function articleId(label: string) {
  return `articolo-${label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("it-IT")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}`;
}

export function cleanLatexText(value: string) {
  return value
    .replace(/\\%/g, "%")
    .replace(/\\&/g, "&")
    .replace(/\\_/g, "_")
    .replace(/\s+/g, " ")
    .trim();
}
