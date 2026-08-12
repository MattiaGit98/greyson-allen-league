const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export function isHomepageCalendarDate(value: string) {
  if (!datePattern.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
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
