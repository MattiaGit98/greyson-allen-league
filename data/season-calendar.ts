export type CalendarEvent = {
  label: string;
  date: string | null;
};

// Primo foglio "Calendario" di Stagione.xlsx, nello stesso ordine del file.
export const calendarEvents: CalendarEvent[] = [
  { label: "Scadenza esercizio team option", date: null },
  { label: "Inizio draft", date: null },
  { label: "Inizio rilasci gratuiti", date: null },
  { label: "Asta", date: null },
  { label: "Consegna contratti", date: null },
  { label: "Inizio regular season", date: null },
  { label: "Quarti di finale coppa", date: null },
  { label: "Trade deadline", date: null },
  { label: "Termine buyout", date: null },
  { label: "Termine free agency", date: null },
  { label: "Ultima giornata regular season", date: null },
  { label: "Fase finale coppa", date: null },
  { label: "Play-in", date: null },
  { label: "Quarti di finale playoff", date: null },
  { label: "Semifinali playoff", date: null },
  { label: "Qualificazioni All Star Game", date: null },
  { label: "Fase finale All Star Game", date: null },
  { label: "Finale playoff", date: null },
  { label: "March Madness", date: null },
  { label: "Data termine stagione", date: null },
];
