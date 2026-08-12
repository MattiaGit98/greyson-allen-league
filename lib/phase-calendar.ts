import { leagueMomentLabels, type LeagueMoment, type LeagueTransition } from "./league-moments";

export type LeagueCalendarEventKey = LeagueTransition | "regular_season_start";
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

export function generatedLeagueCalendar(dates: PhaseDateMap) {
  const rows: Array<{ key: string; event: string; date: string }> = [];
  datedLeagueTransitions.forEach((transition) => {
    if (transition === "auction_completed") return;
    const date = transition === "regular_season_start" ? dates[transition] ?? "" : phaseDateForTransition(dates, transition) ?? "";
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
  const transitions = datedLeagueTransitions.slice(datedLeagueTransitions.indexOf(moment as LeagueTransition) + 1);
  const next = transitions.find((transition): transition is LeagueTransition => transition !== "regular_season_start");
  if (!next) return null;
  const date = phaseDateForTransition(dates, next);
  return date ? { transition: next, event: calendarEventLabel(next), date } : null;
}

export function calendarEventLabel(event: LeagueCalendarEventKey) {
  if (event === "auction_start" || event === "auction_completed") return "Asta";
  if (event === "regular_season_start") return "Inizio campionato";
  return leagueMomentLabels[event];
}
