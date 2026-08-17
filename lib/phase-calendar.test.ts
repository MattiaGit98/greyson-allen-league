import { describe, expect, it } from "vitest";
import { generatedLeagueCalendar, nextPhaseDate, normalizePhaseDates } from "./phase-calendar";

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
      { key: "team_option_deadline", event: "Scadenza esercizio T.O.", date: "2026-09-20" },
      { key: "auction_start", event: "Asta", date: "2026-10-01" },
      { key: "contract_delivery", event: "Consegna contratti", date: "2026-10-11" },
      { key: "regular_season_start", event: "Inizio campionato", date: "2026-10-15" },
      { key: "trade_deadline", event: "Trade deadline", date: "2027-02-12" },
      { key: "buyout_end", event: "Termine buyout", date: "" },
      { key: "free_agency_end", event: "Termine free agency", date: "" },
      { key: "postseason_start", event: "Inizio postseason", date: "" },
      { key: "season_end", event: "Fine stagione", date: "" },
    ]);
  });

  it("dopo l'inizio del campionato passa automaticamente alla trade deadline", () => {
    expect(nextPhaseDate(dates, "contract_delivery", "2026-10-15")).toMatchObject({ event: "Inizio campionato" });
    expect(nextPhaseDate(dates, "contract_delivery", "2026-10-16")).toMatchObject({ event: "Trade deadline" });
  });

  it("dopo l'inizio postseason passa automaticamente alla fine stagione", () => {
    const postseasonDates = normalizePhaseDates({ ...dates, postseason_start: "2027-05-20", season_end: "2027-06-01" });
    expect(nextPhaseDate(postseasonDates, "free_agency_end", "2027-05-20")).toMatchObject({ event: "Inizio postseason" });
    expect(nextPhaseDate(postseasonDates, "free_agency_end", "2027-05-21")).toMatchObject({ event: "Fine stagione" });
  });
});
