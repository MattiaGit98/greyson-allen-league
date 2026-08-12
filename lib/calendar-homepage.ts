export type CalendarHomepageEvent = {
  event: string;
  date: string;
  sortOrder: number;
};

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export function isHomepageCalendarDate(value: string) {
  if (!datePattern.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function calendarHomepageEventKey(event: Pick<CalendarHomepageEvent, "event" | "date">) {
  return JSON.stringify([event.event.trim(), event.date]);
}

export function nextHomepageCalendarEvent(
  events: CalendarHomepageEvent[],
  selectedKeys: string[],
  now = new Date(),
) {
  const selected = new Set(selectedKeys);
  const today = isoDateInRome(now);
  return events
    .filter((event) => selected.has(calendarHomepageEventKey(event)) && isHomepageCalendarDate(event.date) && event.date >= today)
    .sort((left, right) => left.date.localeCompare(right.date) || left.sortOrder - right.sortOrder)[0] ?? null;
}

export function formatHomepageCalendarDate(value: string) {
  if (!isHomepageCalendarDate(value)) return value;
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "long", year: "numeric", timeZone: "Europe/Rome" })
    .format(new Date(Date.UTC(year, month - 1, day, 12)));
}

export function formatCalendarDate(value: string) {
  if (!isHomepageCalendarDate(value)) return value;
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function isoDateInRome(value: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}
