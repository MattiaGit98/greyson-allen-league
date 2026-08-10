import Link from "next/link";
import { buildRoleMinimumAlerts } from "@/lib/admin-alerts";
import { loadCurrentHistoryImports } from "@/lib/history-competition-store";
import { loadEditableLeagueState } from "@/lib/league-state";
import { leagueMomentFromSeason } from "@/lib/league-moments";
import { buildPreAdvanceChecklist, type PreAdvanceChecklist } from "@/lib/pre-advance-alerts";
import { requireActiveSeason } from "@/lib/active-season";
import { loadPostAuctionContractDrafts } from "@/lib/post-auction-contract-store";

const actionGroups = [
  {
    title: "Operazioni",
    actions: [
      { href: "/admin/free-agent", title: "Firma free agent" },
      { href: "/admin/scambi", title: "Scambi" },
      { href: "/admin/team-option", title: "Team option" },
      { href: "/admin/contratti", title: "Assegnazione contratti" },
      { href: "/admin/slot", title: "Spostamento slot" },
      { href: "/admin/altre-operazioni", title: "Altre operazioni" },
    ],
  },
  {
    title: "Gestione lega",
    actions: [
      { href: "/admin/impostazioni", title: "Avanzamento della lega" },
      { href: "/admin/listone", title: "Listone" },
    ],
  },
  {
    title: "Asta e draft",
    actions: [
      { href: "/admin/asta", title: "Pannello asta" },
      { href: "/admin/posizioni-draft", title: "Posizioni draft" },
      { href: "/admin/draft", title: "Pannello draft" },
    ],
  },
  {
    title: "Calendario e classifiche",
    actions: [
      { href: "/admin/calendario", title: "Calendario" },
      { href: "/admin/contenuti", title: "Classifiche e tabelloni" },
      { href: "/admin/storico", title: "Storico" },
    ],
  },
  {
    title: "Modifiche e rettifiche",
    actions: [
      { href: "/admin/rettifiche-roster", title: "Rettifiche roster" },
      { href: "/admin/movimenti", title: "Annulla movimenti" },
      { href: "/admin/squadre-proprietari", title: "Squadre e proprietari" },
    ],
  },
  {
    title: "Backup e ripristino",
    actions: [
      { href: "/admin/backup", title: "Backup" },
      { href: "/admin/importa-dati", title: "Importa dati" },
    ],
  },
];

export default async function AdminDashboardPage() {
  const [activeSeason, leagueState, currentHistory] = await Promise.all([
    requireActiveSeason(),
    loadEditableLeagueState(),
    loadCurrentHistoryImports(),
  ]);
  const seasonName = activeSeason.season.name;
  const leagueMoment = leagueMomentFromSeason(activeSeason.season);
  const contractDrafts = await loadPostAuctionContractDrafts(seasonName);
  const preAdvanceChecklist = buildPreAdvanceChecklist({
    currentMoment: leagueMoment,
    seasonName,
    state: leagueState,
    currentHistorySeason: currentHistory.season,
    contractDrafts,
  });
  const blockingChecklist = {
    ...preAdvanceChecklist,
    alerts: preAdvanceChecklist.alerts.filter((alert) => alert.tone === "blocker"),
  };
  const roleMinimumAlerts = activeSeason.season.status === "regular_season"
    ? buildRoleMinimumAlerts(leagueState)
    : [];

  return (
    <section className="section page-top admin-dashboard">
      {roleMinimumAlerts.length > 0 && (
        <section className="admin-role-minimum-alert" role="alert">
          <strong>Intervento richiesto: minimi di ruolo non rispettati</strong>
          <p>Assegna casualmente un free agent da 1 credito per ogni carenza; il salvataggio dello scambio resta valido, ma l’operazione va completata manualmente.</p>
          <ul>
            {roleMinimumAlerts.map((team) => (
              <li key={team.teamCode}><b>{team.teamName}</b>: {[
                team.missing.G ? `${team.missing.G} G` : "",
                team.missing.A ? `${team.missing.A} A` : "",
                team.missing.C ? `${team.missing.C} C` : "",
              ].filter(Boolean).join(" · ")}</li>
            ))}
          </ul>
          <Link href="/admin/free-agent">Vai ai free agent →</Link>
        </section>
      )}
      <PreAdvanceChecklistView checklist={blockingChecklist} />
      <div className="admin-action-sections">
        {actionGroups.map((group) => (
          <section className="admin-action-section" key={group.title}>
            <h2>{group.title}</h2>
            <div className="admin-action-grid">
              {group.actions.map((action) => (
                <Link href={action.href} className="admin-action" key={action.href}>
                  <strong>{action.title}</strong>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}

function PreAdvanceChecklistView({ checklist }: { checklist: PreAdvanceChecklist }) {
  return (
    <section className="pre-advance-checklist">
      <header className="pre-advance-checklist-head">
        <div>
          <span>Prima del prossimo avanzamento</span>
          <strong>{checklist.transitionLabel}</strong>
        </div>
        <div className={checklist.blockerCount ? "has-blockers" : "is-ready"}>
          {checklist.blockerCount ? `${checklist.blockerCount} blocchi` : "Nessun blocco"}
        </div>
        <Link href="/admin/impostazioni">Vai all’avanzamento →</Link>
      </header>
      {checklist.alerts.length ? (
        <div className="pre-advance-alert-list">
          {checklist.alerts.map((alert) => (
            <details className={`pre-advance-alert ${alert.tone}`} key={alert.id}>
              <summary className="pre-advance-alert-title">
                <i>{alert.tone === "blocker" ? "!" : alert.tone === "warning" ? "•" : "i"}</i>
                <strong>{alert.title}</strong>
                <b aria-hidden="true">⌄</b>
              </summary>
              <div className="pre-advance-alert-body">
                <p>{alert.message}</p>
                {alert.items?.length ? (
                  <ul>{alert.items.map((item) => <li key={item}>{item}</li>)}</ul>
                ) : null}
                {alert.href && <footer><Link href={alert.href}>{alert.actionLabel ?? "Apri"} →</Link></footer>}
              </div>
            </details>
          ))}
        </div>
      ) : null}
    </section>
  );
}
