import { loadPublicLeagueContext } from "@/lib/load-public-league-context";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AiContextPage() {
  const context = await loadPublicLeagueContext();
  return (
    <article className="section ai-context-page">
      <h1>Greyson Allen League — Dati per assistenti AI</h1>
      <section aria-labelledby="ai-teams-title">
        <h2 id="ai-teams-title">Squadre</h2>
        {context.squadre.map((team) => (
          <section key={team.sigla}>
            <h3>{team.nome} ({team.sigla})</h3>
            <ContextValue value={team} />
          </section>
        ))}
      </section>
      <section aria-labelledby="ai-players-title">
        <h2 id="ai-players-title">Listone</h2>
        <ContextValue value={context.listone} />
      </section>
      <section aria-labelledby="ai-rules-title">
        <h2 id="ai-rules-title">Regolamento</h2>
        {context.regolamento.map((article) => (
          <section key={article.numero}>
            <h3>Art. {article.numero}. {article.titolo}</h3>
            <ol type="a">{article.commi.map((clause, index) => <li key={index}>{clause}</li>)}</ol>
          </section>
        ))}
      </section>
    </article>
  );
}

function ContextValue({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <>—</>;
  if (typeof value === "boolean") return <>{value ? "Sì" : "No"}</>;
  if (Array.isArray(value)) {
    if (!value.length) return <>Nessuno</>;
    if (value.every((item) => item !== null && typeof item === "object" && !Array.isArray(item))) {
      const rows = value as Record<string, unknown>[];
      const keys = [...new Set(rows.flatMap((row) => Object.keys(row)))];
      return <div className="ai-context-table"><table>
        <thead><tr>{keys.map((key) => <th scope="col" key={key}>{fieldLabel(key)}</th>)}</tr></thead>
        <tbody>{rows.map((row, index) => <tr key={index}>{keys.map((key) => <td key={key}><ContextValue value={row[key]} /></td>)}</tr>)}</tbody>
      </table></div>;
    }
    return <ul>{value.map((item, index) => <li key={index}><ContextValue value={item} /></li>)}</ul>;
  }
  if (typeof value === "object") {
    return <dl>{Object.entries(value).map(([key, item]) => <div key={key}>
      <dt>{fieldLabel(key)}</dt><dd><ContextValue value={item} /></dd>
    </div>)}</dl>;
  }
  return <>{String(value)}</>;
}

function fieldLabel(key: string) {
  const labels: Record<string, string> = { twoWay: "Two-way", gLeague: "G-League", dpe: "DPE", squadraNba: "Squadra NBA" };
  return labels[key] ?? key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (character) => character.toUpperCase());
}
