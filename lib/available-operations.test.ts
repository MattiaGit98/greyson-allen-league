import { describe, expect, it } from "vitest";
import { availableOperationsAt } from "./available-operations";

describe("operazioni disponibili", () => {
  it("mostra le estensioni solo prima dell'Inizio asta", () => {
    expect(labelsAt("offseason_start")).toContain("Estensioni contrattuali");
    expect(labelsAt("team_option_deadline")).toContain("Estensioni contrattuali");
    expect(labelsAt("auction_start")).not.toContain("Estensioni contrattuali");
    expect(labelsAt("auction_completed")).not.toContain("Estensioni contrattuali");
    expect(labelsAt("trade_deadline")).not.toContain("Estensioni contrattuali");
  });

  it("non mostra l'asta tra le operazioni disponibili in homepage", () => {
    expect(labelsAt("auction_start")).not.toContain("Asta");
  });

  it("non mostra l'assegnazione contratti nella homepage", () => {
    expect(labelsAt("auction_completed")).not.toContain("Assegnazione contratti");
  });

  it("mostra la segnalazione playoff solo tra la data di inizio postseason e la riapertura della free agency", () => {
    const dates = { postseason_start: "2027-04-01" };
    const label = "Segnalazione utilizzo G-League nei playoff";
    expect(availableOperationsAt("free_agency_end", dates, "2027-03-31").map((item) => item.label)).not.toContain(label);
    expect(availableOperationsAt("free_agency_end", dates, "2027-04-01").map((item) => item.label)).toContain(label);
    expect(availableOperationsAt("free_agency_reopening", dates, "2027-04-02").map((item) => item.label)).not.toContain(label);
  });
});

function labelsAt(moment: Parameters<typeof availableOperationsAt>[0]) {
  return availableOperationsAt(moment).map((operation) => operation.label);
}
