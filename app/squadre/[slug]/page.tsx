import { notFound } from "next/navigation";
import { teams } from "@/lib/demo-data";

export function generateStaticParams() {
  return teams.map(({ slug }) => ({ slug }));
}

export default async function TeamPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const team = teams.find((item) => item.slug === slug);
  if (!team) notFound();
  return (
    <section className="section page-top">
      <p className="eyebrow">{team.code} · Stagione 2025/26</p>
      <h1>{team.name}</h1>
      <p className="lede">{team.owner}</p>
      <div className="metrics compact">
        <article><span>Cap libero</span><strong>{team.credits}</strong><small>su 1.000 iniziali</small></article>
        <article><span>Costo rosa</span><strong>{team.cost}</strong><small>crediti impegnati</small></article>
        <article><span>Giocatori</span><strong>{team.players}</strong><small>{Math.max(0, 20-team.players)} slot base liberi</small></article>
      </div>
      <div className="empty-state">
        <span>01</span>
        <h2>Dettaglio rosa pronto per l’import</h2>
        <p>Lo schema separa slot, contratto e stato. Il dettaglio sarà popolato solo dopo la validazione del report d’importazione.</p>
      </div>
    </section>
  );
}
