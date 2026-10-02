import Link from "next/link";
import { buildRoleMinimumAlerts } from "@/lib/admin-alerts";
import { loadCurrentHistoryImports } from "@/lib/history-competition-store";
import { loadEditableLeagueState } from "@/lib/league-state";
import { leagueMomentFromSeason, leagueMomentLabels } from "@/lib/league-moments";
import { roleMinimumChecksApply } from "@/lib/role-minimums";
import { normalizePhaseDates, phaseDateForTransition } from "@/lib/phase-calendar";
import { buildPreAdvanceChecklist, type PreAdvanceChecklist } from "@/lib/pre-advance-alerts";
import { requireActiveSeason } from "@/lib/active-season";
import { loadPostAuctionContractDrafts } from "@/lib/post-auction-contract-store";

const actionGroups = [
  {
    title: "Operazioni",
    actions: [
      { href: "/admin/free-agent", title: "Firma free agent" },
      { href: "/admin/scambi", title: "Scambi" },
      { href: "/admin/team-option", title: "Contratti da rookie" },
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
      { href: "/admin/draft", title: "Pannello draft" },
      { href: "/admin/posizioni-draft", title: "Posizioni draft" },
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
    title: "Avvisi",
    actions: [
      { href: "/admin/avvisi", title: "Avvisi" },
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
  const blockingAlerts = preAdvanceChecklist.alerts.filter((alert) => (
    alert.tone === "blocker" && alert.id !== "role-minimums"
  ));
  const blockingChecklist = {
    ...preAdvanceChecklist,
    alerts: blockingAlerts,
    blockerCount: blockingAlerts.length,
  };
  const roleMinimumAlerts = roleMinimumChecksApply(activeSeason.season.status, leagueMoment)
    ? buildRoleMinimumAlerts(leagueState, leagueMoment)
    : [];
  const nextPhaseDate = phaseDateForTransition(normalizePhaseDates(activeSeason.season.phase_dates), preAdvanceChecklist.transition);
  const dateParts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(new Date()).reduce((value, part) => ({ ...value, [part.type]: part.value }), {} as Record<string, string>);
  const today = `${dateParts.year}-${dateParts.month}-${dateParts.day}`;

  return (
    <section className="section page-top admin-dashboard">
      {!nextPhaseDate && <p className="notice">Manca la data di {preAdvanceChecklist.transition === "auction_completed" ? "Asta" : leagueMomentLabels[preAdvanceChecklist.transition]}: inseriscila nell’avanzamento della lega.</p>}
      {nextPhaseDate && nextPhaseDate < today && <p className="notice error">La data di {preAdvanceChecklist.transition === "auction_completed" ? "Asta" : leagueMomentLabels[preAdvanceChecklist.transition]} è trascorsa e la lega non è stata ancora avanzata.</p>}
      {roleMinimumAlerts.length > 0 && (
        <section className="admin-role-minimum-alert" role="alert">
          <strong>Intervento richiesto: minimi di ruolo non rispettati</strong>
          <p>Assegna casualmente un free agent da 1 credito per ogni carenza. La situazione deve essere regolarizzata entro la Fine stagione; dalla Riapertura free agency anche la DPE concorre ai minimi.</p>
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
