import Link from "next/link";
import { AvailableOperations } from "@/components/available-operations";
import { HomeCompetitionFeature, HomeDraftFeature, HomeHonoursFeature } from "@/components/home-season-feature";
import { requireActiveSeason } from "@/lib/active-season";
import { buildRoleMinimumAlerts } from "@/lib/admin-alerts";
import { availableOperationsAt } from "@/lib/available-operations";
import { loadEditableLeagueState, type EditableLeagueState } from "@/lib/league-state";
import { hasReachedMoment, leagueMomentFromSeason, publicPhaseLabel, type LeagueMoment } from "@/lib/league-moments";
import { conciseMovementDetail, movementOperationLabel } from "@/lib/movement-display";
import { buildPreAdvanceChecklist } from "@/lib/pre-advance-alerts";
import { formatHomepageCalendarDate } from "@/lib/calendar-homepage";
import { nextPhaseDate, normalizePhaseDates } from "@/lib/phase-calendar";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadHistoryCompetitionState } from "@/lib/history-competition-store";
import { loadCompetitionState } from "@/lib/competition-store";

const movementDateFormatter = new Intl.DateTimeFormat("it-IT", {
  timeZone: "Europe/Rome",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function HomePage() {
  const [activeSeason, state, supabase] = await Promise.all([
    requireActiveSeason(),
    loadEditableLeagueState(),
    createSupabaseServerClient(),
  ]);
  const [movementResponse] = await Promise.all([
    supabase
      ? supabase.from("league_movement_feed").select("id,operation_type,summary,created_at,reverted").order("created_at", { ascending: false }).limit(12)
      : null,
  ]);
  if (movementResponse?.error) throw new Error(`Movimenti recenti non disponibili: ${movementResponse.error.message}`);
  const movements = (movementResponse?.data ?? []).filter((movement) => !movement.reverted).slice(0, 5);
  const moment = leagueMomentFromSeason(activeSeason.season);
  const macroPhase = publicPhaseLabel(moment);
  const [historyState, competitionState] = await Promise.all([loadHistoryCompetitionState(), loadCompetitionState()]);
  const alerts = homeLeagueAlerts({ moment, seasonName: activeSeason.season.name, state });
  const todayParts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(new Date()).reduce((value, part) => ({ ...value, [part.type]: part.value }), {} as Record<string, string>);
  const today = `${todayParts.year}-${todayParts.month}-${todayParts.day}`;
  const nextCalendarEvent = nextPhaseDate(normalizePhaseDates(activeSeason.season.phase_dates), moment, today);
  const quickLinks: { href: string; label: string }[] = [];
  const draftYear = Number(activeSeason.season.name.slice(0, 4));
  const selectedHonours = moment === "offseason_start"
    ? historyState.competitions["Albo d'oro"].find((entry) => entry.season === state.homepageHonoursTable && entry.content.kind === "honours")
    : undefined;
  const selectedDraft = hasReachedMoment(moment, "team_option_deadline") && !hasReachedMoment(moment, "contract_delivery")
    && (state.finalizedDraftPositionYears ?? []).includes(draftYear)
    ? historyState.competitions.Draft.find((entry) => entry.season === String(draftYear) && entry.content.kind === "draft")
    : undefined;
  const selectedCompetition = hasReachedMoment(moment, "contract_delivery") && state.homepageCompetition
    ? { name: state.homepageCompetition, content: competitionState.competitions[state.homepageCompetition] }
    : null;
  const teamNames = new Map(competitionState.teams.map((team) => [team.code, team.name]));

  return (
    <section className="section home-page">
      <header className="home-hero">
        <p className="eyebrow">Greyson Allen League</p>
        <h1>{activeSeason.season.name}</h1>
        <p>{macroPhase}</p>
      </header>
      {state.publicNotice && <section className="home-public-notice" aria-label="Avviso della lega"><p>{state.publicNotice}</p></section>}
      {alerts.length > 0 && (
        <section className="home-league-alerts" aria-label="Avvisi della lega">
          {alerts.map((alert) => (
            <article className={`home-league-alert ${alert.tone ?? "info"}`} key={alert.id}>
              <strong>{alert.title}</strong>
              {alert.items?.length ? <ul>{alert.items.map((item) => <li key={item}>{item}</li>)}</ul> : null}
            </article>
          ))}
        </section>
      )}
      {nextCalendarEvent && (
        <section className={`home-next-calendar-event${nextCalendarEvent.date < today ? " is-overdue" : ""}`} aria-label="Prossimo appuntamento">
          <span>Prossimo appuntamento</span>
          <strong>{nextCalendarEvent.event}</strong>
          <time dateTime={nextCalendarEvent.date}>{formatHomepageCalendarDate(nextCalendarEvent.date)}</time>
          <Link href="/calendario">Mostra tutte le date →</Link>
        </section>
      )}
      <div className="home-grid">
        <div className="home-main-column">
          <AvailableOperations operations={availableOperationsAt(moment)} />
          <section className="home-recent-movements" aria-labelledby="recent-movements-title">
            <header>
              <div>
                <span>Registro della lega</span>
                <h2 id="recent-movements-title">Ultimi movimenti</h2>
              </div>
              <Link href="/movimenti">Tutti i movimenti →</Link>
            </header>
            {movements.length ? (
              <div className="home-movement-list">
                {movements.map((movement) => (
                  <div className="home-movement" key={movement.id}>
                    <time dateTime={movement.created_at}>{formatMovementDate(movement.created_at)}</time>
                    <div><strong>{movementOperationLabel(String(movement.operation_type))}</strong><span>{conciseMovementDetail(String(movement.operation_type), String(movement.summary))}</span></div>
                  </div>
                ))}
              </div>
            ) : <p className="home-empty">Nessun movimento registrato.</p>}
          </section>
        </div>
        <aside className="home-side-column">
          <nav className="home-quick-links" aria-label="Accessi rapidi">
            {quickLinks.map((link) => <Link href={link.href} key={link.href}>{link.label} <span>→</span></Link>)}
          </nav>
        </aside>
      </div>
      <div className="home-seasonal-content">
        {selectedHonours?.content.kind === "honours" && <HomeHonoursFeature title={selectedHonours.season} rows={selectedHonours.content.rows} />}
        {selectedDraft?.content.kind === "draft" && <HomeDraftFeature year={draftYear} rows={selectedDraft.content.rows.map((row) => ({ ...row, team: teamNames.get(row.team) ?? row.team }))} />}
        {selectedCompetition && <HomeCompetitionFeature name={selectedCompetition.name} content={selectedCompetition.content} teams={competitionState.teams} />}
      </div>
    </section>
  );
}

type HomeLeagueAlert = {
  id: string;
  title: string;
  items?: string[];
  tone?: "info" | "attention";
};

function homeLeagueAlerts({
  moment,
  seasonName,
  state,
}: {
  moment: LeagueMoment;
  seasonName: string;
  state: EditableLeagueState;
}): HomeLeagueAlert[] {
  const alerts: HomeLeagueAlert[] = [];

  if (hasReachedMoment(moment, "auction_completed") && !hasReachedMoment(moment, "free_agency_end")) {
    const roleAlerts = buildRoleMinimumAlerts(state);
    if (roleAlerts.length) {
      alerts.push({
        id: "role-minimums",
        title: "Carenze di ruolo da colmare",
        items: roleAlerts.map((team) => `${team.teamName}: ${[
          team.missing.G ? `${team.missing.G} G` : "",
          team.missing.A ? `${team.missing.A} A` : "",
          team.missing.C ? `${team.missing.C} C` : "",
        ].filter(Boolean).join(" · ")}`),
      });
    }
  }

  if (moment === "free_agency_end") {
    const overflowAlert = buildPreAdvanceChecklist({ currentMoment: moment, seasonName, state })
      .alerts.find((alert) => alert.id === "blocked-offseason-roster-moves");
    if (overflowAlert) {
      alerts.push({
        id: "season-end-overflow",
        title: "Tagli necessari prima della fine della stagione",
        items: overflowAlert.items,
        tone: "attention",
      });
    }
  }

  return alerts;
}

function formatMovementDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : movementDateFormatter.format(date);
}
