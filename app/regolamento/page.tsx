import type { ReactNode } from "react";
import { articleId, loadRegulation } from "@/lib/regulation";
import { RulesIndex } from "./rules-index";

export default async function RegulationPage() {
  const articles = await loadRegulation();
  const articleNumbers = new Map(articles.map((article) => [article.label, article.number]));

  return (
    <section className="section rules-page">
      <RulesIndex articles={articles.map(({ number, title, id }) => ({ number, title, id }))} />
      <article className="rules-document">
        <header className="rules-document-header">
          <span>Greyson Allen League</span>
          <strong>Regolamento</strong>
        </header>
        {articles.map((article) => (
          <section className="rules-article" id={article.id} key={article.id}>
            <header>
              <h2>Art. {article.number}. {article.title}</h2>
            </header>
            <ol>
              {article.clauses.map((clause, index) => (
                <li key={`${article.id}-${index}`}>
                  <span>({String.fromCharCode(97 + index)})</span>
                  <p>{renderClause(clause, articleNumbers)}</p>
                </li>
              ))}
            </ol>
          </section>
        ))}
      </article>
    </section>
  );
}

function renderClause(text: string, articleNumbers: Map<string, number>) {
  const parts: ReactNode[] = [];
  const referencePattern = /\\ref\{([^}]+)\}/g;
  let cursor = 0;

  for (const match of text.matchAll(referencePattern)) {
    const matchIndex = match.index ?? 0;
    parts.push(text.slice(cursor, matchIndex));
    const label = match[1];
    parts.push(
      <a href={`#${articleId(label)}`} key={`${label}-${matchIndex}`}>
        {articleNumbers.get(label) ?? label}
      </a>,
    );
    cursor = matchIndex + match[0].length;
  }
  parts.push(text.slice(cursor));
  return parts;
}
