import { describe, expect, it } from "vitest";
import { generatedLeagueCalendar, nextPhaseDate, normalizePhaseDates, phaseCalendarValidationErrors } from "./phase-calendar";

describe("calendario delle fasi", () => {
  const dates = normalizePhaseDates({
    team_option_deadline: "2026-09-20",
    auction_start: "2026-10-01",
    contract_delivery: "2026-10-11",
    regular_season_start: "2026-10-15",
    trade_deadline: "2027-02-12",
  });

  it("usa per il termine asta la stessa data dell'inizio asta", () => {
    expect(nextPhaseDate(dates, "auction_start")).toEqual({ transition: "auction_completed", event: "Asta", date: "2026-10-01" });
  });

  it("genera tutte le voci, una sola Asta e non mostra l'inizio offseason", () => {
    expect(generatedLeagueCalendar(dates)).toEqual([
      { key: "team_option_deadline", event: "Scadenza T.O. e R.E.", date: "2026-09-20" },
      { key: "auction_start", event: "Asta", date: "2026-10-01" },
      { key: "contract_delivery", event: "Consegna contratti", date: "2026-10-11" },
      { key: "regular_season_start", event: "Inizio campionato", date: "2026-10-15" },
      { key: "trade_deadline", event: "Trade deadline", date: "2027-02-12" },
      { key: "buyout_end", event: "Termine buyout", date: "" },
      { key: "free_agency_end", event: "Chiusura free agency", date: "" },
      { key: "postseason_start", event: "Inizio postseason", date: "" },
      { key: "free_agency_reopening", event: "Riapertura free agency", date: "" },
      { key: "season_end", event: "Fine stagione", date: "" },
    ]);
  });

  it("dopo l'inizio del campionato passa automaticamente alla trade deadline", () => {
    expect(nextPhaseDate(dates, "contract_delivery", "2026-10-15")).toMatchObject({ event: "Inizio campionato" });
    expect(nextPhaseDate(dates, "contract_delivery", "2026-10-16")).toMatchObject({ event: "Trade deadline" });
  });

  it("dopo l'inizio postseason passa automaticamente alla riapertura della free agency", () => {
    const postseasonDates = normalizePhaseDates({ ...dates, postseason_start: "2027-05-20", free_agency_reopening: "2027-05-25", season_end: "2027-06-01" });
    expect(nextPhaseDate(postseasonDates, "free_agency_end", "2027-05-20")).toMatchObject({ event: "Inizio postseason" });
    expect(nextPhaseDate(postseasonDates, "free_agency_end", "2027-05-21")).toMatchObject({ event: "Riapertura free agency" });
    expect(nextPhaseDate(postseasonDates, "free_agency_reopening", "2027-05-26")).toMatchObject({ event: "Fine stagione" });
  });

  it("rifiuta date in ordine cronologico inverso anche se fra loro ci sono eventi vuoti", () => {
    const invalidDates = normalizePhaseDates({
      team_option_deadline: "2026-09-20",
      contract_delivery: "2026-09-19",
    });
    expect(phaseCalendarValidationErrors({
      dates: invalidDates,
      previousDates: {},
      currentMoment: "offseason_start",
      today: "2026-09-01",
    })).toContain("Consegna contratti non può precedere Scadenza T.O. e R.E..");
  });

  it("consente date uguali e date future non ancora compilate", () => {
    const validDates = normalizePhaseDates({
      team_option_deadline: "2026-09-20",
      auction_start: "2026-09-20",
    });
    expect(phaseCalendarValidationErrors({
      dates: validDates,
      previousDates: {},
      currentMoment: "offseason_start",
      today: "2026-09-01",
    })).toEqual([]);
  });

  it("non permette di cancellare o spostare nel futuro una fase già conclusa", () => {
    const previousDates = normalizePhaseDates({ team_option_deadline: "2026-09-20" });
    expect(phaseCalendarValidationErrors({
      dates: {},
      previousDates,
      currentMoment: "team_option_deadline",
      today: "2026-09-25",
    })).toContain("La data già conclusa di Scadenza T.O. e R.E. non può essere cancellata.");
    expect(phaseCalendarValidationErrors({
      dates: normalizePhaseDates({ team_option_deadline: "2026-09-30" }),
      previousDates,
      currentMoment: "team_option_deadline",
      today: "2026-09-25",
    })).toContain("La data già conclusa di Scadenza T.O. e R.E. non può essere spostata nel futuro.");
  });

  it("lascia correggere una data scaduta se la fase non è ancora stata avanzata", () => {
    const previousDates = normalizePhaseDates({ team_option_deadline: "2026-09-20" });
    expect(phaseCalendarValidationErrors({
      dates: normalizePhaseDates({ team_option_deadline: "2026-09-30" }),
      previousDates,
      currentMoment: "offseason_start",
      today: "2026-09-25",
    })).toEqual([]);
  });

  it("protegge gli eventi informativi dal giorno successivo alla loro data", () => {
    const previousDates = normalizePhaseDates({ regular_season_start: "2026-10-15" });
    expect(phaseCalendarValidationErrors({
      dates: normalizePhaseDates({ regular_season_start: "2026-10-20" }),
      previousDates,
      currentMoment: "contract_delivery",
      today: "2026-10-16",
    })).toContain("La data già conclusa di Inizio campionato non può essere spostata nel futuro.");
  });
});
