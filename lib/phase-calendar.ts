import { hasReachedMoment, leagueMomentLabels, type LeagueMoment, type LeagueTransition } from "./league-moments";

export type LeagueCalendarEventKey = LeagueTransition | "regular_season_start" | "postseason_start";
export type PhaseDateMap = Partial<Record<LeagueCalendarEventKey, string>>;

export const datedLeagueTransitions: LeagueCalendarEventKey[] = [
  "team_option_deadline",
  "auction_start",
  "auction_completed",
  "contract_delivery",
  "regular_season_start",
  "trade_deadline",
  "buyout_end",
  "free_agency_end",
  "postseason_start",
  "free_agency_reopening",
  "season_end",
];

const chronologicalCalendarEvents: LeagueCalendarEventKey[] = [
  "team_option_deadline",
  "auction_start",
  "contract_delivery",
  "regular_season_start",
  "trade_deadline",
  "buyout_end",
  "free_agency_end",
  "postseason_start",
  "free_agency_reopening",
  "season_end",
];

export function isPhaseDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function normalizePhaseDates(value: unknown): PhaseDateMap {
  if (!value || typeof value !== "object") return {};
  const input = value as Record<string, unknown>;
  const dates: PhaseDateMap = {};
  datedLeagueTransitions.forEach((event) => {
    if (isPhaseDate(input[event])) dates[event] = input[event];
  });
  if (dates.auction_start) dates.auction_completed = dates.auction_start;
  else delete dates.auction_completed;
  return dates;
}

export function phaseDateForTransition(dates: PhaseDateMap, transition: LeagueTransition) {
  return transition === "auction_completed" ? dates.auction_start : dates[transition];
}

export function todayInRome(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now).reduce((value, part) => ({ ...value, [part.type]: part.value }), {} as Record<string, string>);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function playoffTeamOptionWindowOpen(moment: LeagueMoment, dates: PhaseDateMap, today: string) {
  return moment === "free_agency_end" && Boolean(dates.postseason_start && dates.postseason_start <= today);
}

export function formatPhaseDate(date: string) {
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year}`;
}

export function phaseCalendarValidationErrors({
  dates,
  previousDates,
  currentMoment,
  today,
}: {
  dates: PhaseDateMap;
  previousDates: PhaseDateMap;
  currentMoment: LeagueMoment;
  today: string;
}) {
  const errors: string[] = [];
  let previousPopulated: { event: LeagueCalendarEventKey; date: string } | null = null;

  chronologicalCalendarEvents.forEach((event) => {
    const date = dates[event];
    if (!date) return;
    if (previousPopulated && date < previousPopulated.date) {
      errors.push(`${calendarEventLabel(event)} non può precedere ${calendarEventLabel(previousPopulated.event)}.`);
    }
    previousPopulated = { event, date };
  });

  chronologicalCalendarEvents.forEach((event) => {
    if (!calendarEventIsCompleted(event, previousDates, currentMoment, today)) return;
    const previousDate = previousDates[event];
    const date = dates[event];
    if (previousDate && !date) {
      errors.push(`La data già conclusa di ${calendarEventLabel(event)} non può essere cancellata.`);
      return;
    }
    if (date && date > today) {
      errors.push(`La data già conclusa di ${calendarEventLabel(event)} non può essere spostata nel futuro.`);
    }
  });

  return [...new Set(errors)];
}

function calendarEventIsCompleted(event: LeagueCalendarEventKey, previousDates: PhaseDateMap, currentMoment: LeagueMoment, today: string) {
  if (event === "regular_season_start") {
    return hasReachedMoment(currentMoment, "trade_deadline")
      || Boolean(previousDates.regular_season_start && previousDates.regular_season_start < today);
  }
  if (event === "postseason_start") {
    return hasReachedMoment(currentMoment, "free_agency_reopening")
      || Boolean(previousDates.postseason_start && previousDates.postseason_start < today);
  }
  if (event === "season_end") return false;
  if (event === "auction_completed") return hasReachedMoment(currentMoment, "auction_completed");
  return hasReachedMoment(currentMoment, event);
}

export function generatedLeagueCalendar(dates: PhaseDateMap) {
  const rows: Array<{ key: string; event: string; date: string }> = [];
  datedLeagueTransitions.forEach((transition) => {
    if (transition === "auction_completed") return;
    const date = transition === "regular_season_start" || transition === "postseason_start"
      ? dates[transition] ?? ""
      : phaseDateForTransition(dates, transition) ?? "";
    rows.push({
      key: transition,
      event: calendarEventLabel(transition),
      date,
    });
  });
  return rows;
}

export function nextPhaseDate(dates: PhaseDateMap, moment: LeagueMoment, today?: string) {
  if (moment === "contract_delivery") {
    const regularSeasonStart = dates.regular_season_start;
    if (regularSeasonStart && (!today || regularSeasonStart >= today)) {
      return { transition: "regular_season_start" as const, event: calendarEventLabel("regular_season_start"), date: regularSeasonStart };
    }
    const date = phaseDateForTransition(dates, "trade_deadline");
    return date ? { transition: "trade_deadline" as const, event: calendarEventLabel("trade_deadline"), date } : null;
  }
  if (moment === "free_agency_end") {
    const postseasonStart = dates.postseason_start;
    if (postseasonStart && (!today || postseasonStart >= today)) {
      return { transition: "postseason_start" as const, event: calendarEventLabel("postseason_start"), date: postseasonStart };
    }
    const date = phaseDateForTransition(dates, "free_agency_reopening");
    return date ? { transition: "free_agency_reopening" as const, event: calendarEventLabel("free_agency_reopening"), date } : null;
  }
  const transitions = datedLeagueTransitions.slice(datedLeagueTransitions.indexOf(moment as LeagueTransition) + 1);
  const next = transitions.find((transition): transition is LeagueTransition => (
    transition !== "regular_season_start" && transition !== "postseason_start"
  ));
  if (!next) return null;
  const date = phaseDateForTransition(dates, next);
  return date ? { transition: next, event: calendarEventLabel(next), date } : null;
}

export function calendarEventLabel(event: LeagueCalendarEventKey) {
  if (event === "auction_start" || event === "auction_completed") return "Asta";
  if (event === "regular_season_start") return "Inizio campionato";
  if (event === "postseason_start") return "Inizio postseason";
  return leagueMomentLabels[event];
}
