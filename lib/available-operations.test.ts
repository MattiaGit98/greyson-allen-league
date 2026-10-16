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

  it("mantiene il rilascio per squalifica fino alla chiusura della prima free agency", () => {
    const label = "Rilasci: senza squadra o squalifica";
    expect(labelsAt("auction_start")).not.toContain(label);
    expect(labelsAt("trade_deadline")).toContain(label);
    expect(labelsAt("buyout_end")).toContain(label);
    expect(labelsAt("free_agency_end")).not.toContain(label);
  });

  it("ordina alfabeticamente le operazioni con la stessa scadenza", () => {
    const labels = labelsAt("offseason_start");
    expect(labels.indexOf("Estensioni contrattuali")).toBeLessThan(labels.indexOf("Rilasci: meno del 40% della stagione NBA"));
    expect(labels.slice(-2)).toEqual(["Stretch provision", "Tagli"]);
    expect(labels).not.toContain("Promozioni di slot");
  });

  it("non colora gli scambi di rosso prima della data informativa di inizio campionato", () => {
    const dates = { regular_season_start: "2026-10-20", trade_deadline: "2027-02-01" };
    const beforeStart = availableOperationsAt("contract_delivery", dates, "2026-10-19");
    expect(beforeStart.find((operation) => operation.label === "Scambi")?.urgency).not.toBe("urgent");
    expect(beforeStart.find((operation) => operation.label === "Esercizio DPE")?.urgency).not.toBe("urgent");
    expect(availableOperationsAt("contract_delivery", dates, "2026-10-20").find((operation) => operation.label === "Scambi")?.urgency).not.toBe("urgent");

    const afterStart = availableOperationsAt("contract_delivery", dates, "2026-10-21");
    expect(afterStart.find((operation) => operation.label === "Scambi")?.urgency).toBe("urgent");
    expect(afterStart.find((operation) => operation.label === "Esercizio DPE")?.urgency).toBe("urgent");
  });

  it("considera anche l'inizio postseason prima della riapertura free agency", () => {
    const dates = { postseason_start: "2027-04-01", free_agency_reopening: "2027-04-05" };
    const beforeStart = availableOperationsAt("free_agency_end", dates, "2027-03-31");
    expect(beforeStart.every((operation) => operation.urgency !== "urgent")).toBe(true);

    const afterStart = availableOperationsAt("free_agency_end", dates, "2027-04-02");
    expect(afterStart.find((operation) => operation.label === "Segnalazione utilizzo G-League nei playoff")?.urgency).toBe("urgent");
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
