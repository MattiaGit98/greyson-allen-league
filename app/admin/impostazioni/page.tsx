import { changeLeaguePhase } from "./actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const phases = [
  { value: "offseason", label: "Offseason", description: "Contratti, opzioni, qualifying offer e scambi." },
  { value: "auction", label: "Asta", description: "Sessione d’asta attiva; gli scambi sono sospesi." },
  { value: "regular_season", label: "Stagione", description: "Regole di roster, free agency e salary cap stagionale." },
];

export default async function LeagueSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; updated?: string }>;
}) {
  const query = await searchParams;
  const supabase = await createSupabaseServerClient();
  const response = supabase
    ? await supabase.from("seasons").select("name,status").eq("is_active", true).maybeSingle()
    : null;
  const currentStatus = response?.data?.status ?? "offseason";
  const seasonName = response?.data?.name ?? "2025/26";

  return (
    <section className="section page-top admin-settings">
      <p className="eyebrow">Amministrazione · {seasonName}</p>
      <h1>Momento della lega</h1>
      <p className="lede">La fase selezionata determina quali operazioni e quali regole sono disponibili.</p>
      {query.updated && <p className="notice success">Fase aggiornata correttamente.</p>}
      {query.error && <p className="notice error">Aggiornamento non riuscito: {query.error}</p>}
      {!supabase && <p className="notice">Anteprima locale: collega Supabase per salvare la modifica nel database.</p>}
      <form action={changeLeaguePhase} className="phase-form">
        {phases.map((phase) => (
          <label className="phase-option" key={phase.value}>
            <input
              type="radio"
              name="status"
              value={phase.value}
              defaultChecked={currentStatus === phase.value}
            />
            <span><strong>{phase.label}</strong><small>{phase.description}</small></span>
          </label>
        ))}
        <button className="button primary" type="submit" disabled={!supabase}>Salva fase</button>
      </form>
      <p className="form-help">Ogni cambio viene registrato nell’audit log. Le transizioni ordinarie sono Offseason → Asta → Stagione.</p>
    </section>
  );
}
