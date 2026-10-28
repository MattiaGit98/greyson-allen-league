import Link from "next/link";
import { AvailableOperations } from "@/components/available-operations";
import { HomeCompetitionFeature, HomeDraftFeature, HomeHonoursFeature } from "@/components/home-season-feature";
import { HomeMovementList } from "@/components/home-movement-list";
import { requireActiveSeason } from "@/lib/active-season";
import { buildRoleMinimumAlerts, formatRoleMinimumMissing } from "@/lib/admin-alerts";
import { availableOperationsAt } from "@/lib/available-operations";
import { loadEditableLeagueState, type EditableLeagueState } from "@/lib/league-state";
import { hasReachedMoment, leagueMomentFromSeason, publicPhaseLabel, type LeagueMoment } from "@/lib/league-moments";
import { roleMinimumChecksApply } from "@/lib/role-minimums";
import { conciseMovementDetail, fullMovementDetail, movementOperationLabel } from "@/lib/movement-display";
import { formatHomepageCalendarDate } from "@/lib/calendar-homepage";
import { nextPhaseDate, normalizePhaseDates } from "@/lib/phase-calendar";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadHistoryCompetitionState } from "@/lib/history-competition-store";
import { loadCompetitionState } from "@/lib/competition-store";
import { nextDraftYear } from "@/lib/draft-positions";
import { synchronizeUnassignedDraftOwners } from "@/lib/draft-history";

const movementDateFormatter = new Intl.DateTimeFormat("it-IT", {
  timeZone: "Europe/Rome",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

export default async function HomePage() {
  const [activeSeason, state, historyState, competitionState, movementResponse] = await Promise.all([
    requireActiveSeason(),
    loadEditableLeagueState(),
    loadHistoryCompetitionState(),
    loadCompetitionState(),
    loadRecentMovements(),
  ]);
  if (movementResponse?.error) throw new Error(`Movimenti recenti non disponibili: ${movementResponse.error.message}`);
  const movements = movementResponse?.data ?? [];
  const moment = leagueMomentFromSeason(activeSeason.season);
  const todayParts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(new Date()).reduce((value, part) => ({ ...value, [part.type]: part.value }), {} as Record<string, string>);
  const today = `${todayParts.year}-${todayParts.month}-${todayParts.day}`;
  const phaseDates = normalizePhaseDates(activeSeason.season.phase_dates);
  const alerts = homeLeagueAlerts({
    moment,
    state,
  });
  const macroPhase = publicPhaseLabel(moment, phaseDates.postseason_start, today);
  const nextCalendarEvent = nextPhaseDate(phaseDates, moment, today);
  const draftYear = Number(activeSeason.season.name.slice(0, 4));
  const selectedHonours = moment === "offseason_start"
    ? historyState.competitions["Albo d'oro"].find((entry) => entry.season === state.homepageHonoursTable && entry.content.kind === "honours")
    : undefined;
  const selectedDraft = hasReachedMoment(moment, "team_option_deadline") && !hasReachedMoment(moment, "contract_delivery")
    && (state.finalizedDraftPositionYears ?? []).includes(draftYear)
    ? historyState.competitions.Draft.find((entry) => entry.season === String(draftYear) && entry.content.kind === "draft")
    : undefined;
  const visibleDraft = selectedDraft && nextDraftYear(state.draftAssets) === draftYear
    ? synchronizeUnassignedDraftOwners([selectedDraft], state.draftAssets, [draftYear]).entries[0]
    : selectedDraft;
  const firstRoundLastPosition = Math.max(0, ...(state.draftOrders ?? [])
    .filter((assignment) => assignment.year === draftYear && assignment.round === "1° giro")
    .map((assignment) => assignment.position));
  const selectedCompetition = hasReachedMoment(moment, "contract_delivery") && state.homepageCompetition
    ? { name: state.homepageCompetition, content: competitionState.competitions[state.homepageCompetition] }
    : null;
  const teamNames = new Map(competitionState.teams.map((team) => [team.code, team.name]));

  return (
    <section className="section home-page">
      <header className="home-hero">
        <p className="eyebrow">Greyson Allen League</p>
        <div className="home-season-line">
          <h1>{activeSeason.season.name} · {macroPhase}</h1>
        </div>
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
      <nav className="home-teams-link" aria-label="Accesso alle squadre">
        <Link href="/squadre"><strong>Vai alle squadre</strong><span>→</span></Link>
      </nav>
      {nextCalendarEvent && (
        <section className={`home-next-calendar-event${nextCalendarEvent.date < today ? " is-overdue" : ""}`} aria-label="Prossimo appuntamento">
          <span>Prossimo appuntamento</span>
          <strong>{nextCalendarEvent.event}</strong>
          <div className="home-next-calendar-date">
            <time dateTime={nextCalendarEvent.date}>{formatHomepageCalendarDate(nextCalendarEvent.date)}</time>
            <small>{calendarCountdown(nextCalendarEvent.date, today)}</small>
          </div>
          <Link href="/calendario">Mostra tutte le date →</Link>
        </section>
      )}
      <div className="home-grid">
        <div className="home-main-column">
          <AvailableOperations operations={availableOperationsAt(moment, phaseDates, today)} />
          <section className="home-recent-movements" aria-labelledby="recent-movements-title">
            <header>
              <div>
                <span>Registro della lega</span>
                <h2 id="recent-movements-title">Ultimi movimenti</h2>
              </div>
              <Link href="/movimenti">Tutti i movimenti →</Link>
            </header>
            {movements.length ? (
              <HomeMovementList movements={movements.map((movement) => {
                const operationType = String(movement.operation_type);
                const fullDetail = String(movement.summary);
                return {
                  id: String(movement.id),
                  dateTime: movement.created_at,
                  displayedDate: formatMovementDate(movement.created_at),
                  operation: `${movementOperationLabel(operationType)}${movement.reverted ? " · annullato" : ""}`,
                  conciseDetail: conciseMovementDetail(operationType, fullDetail),
                  fullDetail: `${fullMovementDetail(operationType, fullDetail)}${movement.reverted ? "\n\nMovimento annullato." : ""}`,
                };
              })} />
            ) : <p className="home-empty">Nessun movimento registrato.</p>}
          </section>
        </div>
      </div>
      <div className="home-seasonal-content">
        {selectedHonours?.content.kind === "honours" && <HomeHonoursFeature title={selectedHonours.season} rows={selectedHonours.content.rows} />}
        {visibleDraft?.content.kind === "draft" && <HomeDraftFeature year={draftYear} firstRoundLastPosition={firstRoundLastPosition} rows={visibleDraft.content.rows.map((row) => ({ ...row, team: teamNames.get(row.team) ?? row.team }))} />}
        {selectedCompetition && <HomeCompetitionFeature name={selectedCompetition.name} content={selectedCompetition.content} teams={competitionState.teams} />}
      </div>
    </section>
  );
}

async function loadRecentMovements() {
  const supabase = await createSupabaseServerClient();
  return supabase
    ? supabase.from("league_movement_feed").select("id,operation_type,summary,created_at,reverted").order("created_at", { ascending: false }).limit(5)
    : null;
}

type HomeLeagueAlert = {
  id: string;
  title: string;
  items?: string[];
  tone?: "info" | "attention";
};

function homeLeagueAlerts({
  moment,
  state,
}: {
  moment: LeagueMoment;
  state: EditableLeagueState;
}): HomeLeagueAlert[] {
  const alerts: HomeLeagueAlert[] = [];

  if (roleMinimumChecksApply("regular_season", moment)) {
    const roleAlerts = buildRoleMinimumAlerts(state, moment);
    if (roleAlerts.length) {
      alerts.push({
        id: "role-minimums",
        title: `${roleAlerts.length} ${roleAlerts.length === 1 ? "squadra con carenze di ruolo" : "squadre con carenze di ruolo"}`,
        items: roleAlerts.map((team) => `${team.teamCode}: ${formatRoleMinimumMissing(team)}`),
      });
    }
  }

  return alerts;
}

function formatMovementDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : movementDateFormatter.format(date);
}

function calendarCountdown(date: string, today: string) {
  const parseDay = (value: string) => Date.parse(`${value}T00:00:00Z`);
  const difference = Math.round((parseDay(date) - parseDay(today)) / 86_400_000);
  if (difference === 0) return "Oggi";
  if (difference === 1) return "Tra 1 giorno";
  if (difference > 1) return `Tra ${difference} giorni`;
  if (difference === -1) return "Scaduta da 1 giorno";
  return `Scaduta da ${Math.abs(difference)} giorni`;
}
