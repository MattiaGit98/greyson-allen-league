import { describe, expect, it } from "vitest";
import { availableOperationsAt } from "./available-operations";
import { operationWindows } from "./league-moments";

describe("operazioni disponibili", () => {
  it("tiene aperta l'estinzione dopo il Termine buyout e la chiude con la prima free agency", () => {
    for (const moment of ["offseason_start", "team_option_deadline", "auction_start", "auction_completed", "contract_delivery", "free_agency_end", "free_agency_reopening"] as const) {
      expect(operationWindows.earlyTermination(moment)).toBe(false);
      expect(labelsAt(moment)).not.toContain("Estinzione anticipata");
    }
    for (const moment of ["trade_deadline", "buyout_end"] as const) {
      expect(operationWindows.earlyTermination(moment)).toBe(true);
      expect(labelsAt(moment)).toContain("Estinzione anticipata");
    }
    expect(availableOperationsAt("trade_deadline").find((item) => item.label === "Estinzione anticipata")?.urgency).toBe("upcoming");
    expect(availableOperationsAt("buyout_end").find((item) => item.label === "Estinzione anticipata")?.urgency).toBe("urgent");
  });
  it("mostra il buyout soltanto dalla Trade deadline al Termine buyout", () => {
    expect(labelsAt("auction_start")).not.toContain("Buyout");
    expect(labelsAt("auction_completed")).not.toContain("Buyout");
    expect(labelsAt("contract_delivery")).not.toContain("Buyout");
    expect(labelsAt("trade_deadline")).toContain("Buyout");
    expect(availableOperationsAt("trade_deadline").find((item) => item.label === "Buyout")?.urgency).toBe("urgent");
    expect(labelsAt("buyout_end")).not.toContain("Buyout");
    expect(labelsAt("free_agency_reopening")).not.toContain("Buyout");
  });
  it("mostra il reintegro anticipato soltanto dalla deadline e lo chiude con la prima free agency", () => {
    const label = "Reintegro anticipato DPE";
    expect(labelsAt("offseason_start")).not.toContain(label);
    expect(labelsAt("auction_start")).not.toContain(label);
    expect(labelsAt("auction_completed")).not.toContain(label);
    expect(labelsAt("contract_delivery")).not.toContain(label);
    expect(labelsAt("trade_deadline")).toContain(label);
    expect(labelsAt("buyout_end")).toContain(label);
    expect(availableOperationsAt("buyout_end").find((item) => item.label === label)?.urgency).toBe("urgent");
    expect(labelsAt("free_agency_end")).not.toContain(label);
    expect(labelsAt("free_agency_reopening")).not.toContain(label);
  });
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

  it("mostra solo il rilascio senza squadra fino alla chiusura della prima free agency", () => {
    const label = "Rilasci: senza squadra";
    expect(labelsAt("auction_start")).not.toContain(label);
    expect(labelsAt("trade_deadline")).toContain(label);
    expect(labelsAt("buyout_end")).toContain(label);
    expect(labelsAt("free_agency_end")).not.toContain(label);
    expect(labelsAt("free_agency_reopening")).not.toContain(label);
    expect(labelsAt("trade_deadline")).not.toContain("Rilasci: senza squadra o squalifica");
  });

  it("mantiene la DPE dopo la deadline, la evidenzia prima della Chiusura free agency e non la riapre", () => {
    const label = "Esercizio DPE";
    expect(labelsAt("offseason_start")).toContain(label);
    expect(labelsAt("auction_start")).not.toContain(label);
    expect(labelsAt("auction_completed")).toContain(label);
    expect(labelsAt("trade_deadline")).toContain(label);
    expect(labelsAt("buyout_end")).toContain(label);
    expect(availableOperationsAt("buyout_end").find((item) => item.label === label)?.urgency).toBe("urgent");
    expect(labelsAt("free_agency_end")).not.toContain(label);
    expect(labelsAt("free_agency_reopening")).not.toContain(label);
  });

  it("ordina alfabeticamente le operazioni con la stessa scadenza", () => {
    const labels = labelsAt("offseason_start");
    expect(labels.indexOf("Estensioni contrattuali")).toBeLessThan(labels.indexOf("Rilasci: meno della metà della stagione NBA"));
    expect(labels.at(-1)).toBe("Tagli e stretch provision");
    expect(labels).not.toContain("Tagli");
    expect(labels).not.toContain("Stretch provision");
    expect(labels).not.toContain("Promozioni di slot");
  });

  it("rinomina la firma dei free agent mantenendo le finestre e le scadenze", () => {
    expect(labelsAt("auction_start")).not.toContain("Firma free agent");
    expect(labelsAt("contract_delivery")).toContain("Firma free agent");
    expect(labelsAt("buyout_end")).toContain("Firma free agent");
    expect(labelsAt("free_agency_end")).not.toContain("Firma free agent");
    expect(labelsAt("free_agency_reopening")).toContain("Firma free agent");
    expect(labelsAt("contract_delivery")).not.toContain("Free agent");
    expect(availableOperationsAt("buyout_end").find((item) => item.label === "Firma free agent")?.urgency).toBe("urgent");
    expect(availableOperationsAt("free_agency_reopening").find((item) => item.label === "Firma free agent")?.urgency).toBe("urgent");
  });

  it("non colora gli scambi di rosso prima della data informativa di inizio campionato", () => {
    const dates = { regular_season_start: "2026-10-20", trade_deadline: "2027-02-01" };
    const beforeStart = availableOperationsAt("contract_delivery", dates, "2026-10-19");
    expect(beforeStart.find((operation) => operation.label === "Scambi")?.urgency).not.toBe("urgent");
    expect(beforeStart.find((operation) => operation.label === "Esercizio DPE")?.urgency).not.toBe("urgent");
    expect(availableOperationsAt("contract_delivery", dates, "2026-10-20").find((operation) => operation.label === "Scambi")?.urgency).not.toBe("urgent");

    const afterStart = availableOperationsAt("contract_delivery", dates, "2026-10-21");
    expect(afterStart.find((operation) => operation.label === "Scambi")?.urgency).toBe("urgent");
    expect(afterStart.find((operation) => operation.label === "Esercizio DPE")?.urgency).not.toBe("urgent");
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
