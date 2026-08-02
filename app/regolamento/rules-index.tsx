"use client";

type IndexArticle = { number: number; title: string; id: string };

export function RulesIndex({ articles }: { articles: IndexArticle[] }) {
  function goToArticle(id: string) {
    if (!id) return;
    window.location.hash = id;
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <>
      <nav className="rules-index" aria-label="Indice del regolamento">
        <span>Indice</span>
        {articles.map((article) => (
          <a href={`#${article.id}`} key={article.id}>
            <b>{article.number}</b>
            <small>{article.title}</small>
          </a>
        ))}
      </nav>
      <label className="rules-index-mobile">
        <span>Vai all’articolo</span>
        <select defaultValue="" onChange={(event) => goToArticle(event.target.value)}>
          <option value="" disabled>Seleziona</option>
          {articles.map((article) => (
            <option value={article.id} key={article.id}>
              {article.number}. {article.title}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}
