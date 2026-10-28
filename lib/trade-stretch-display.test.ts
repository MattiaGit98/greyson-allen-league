import { describe, expect, it } from "vitest";
import { tradeMovementPresentation } from "./trade-movement-display";

describe("stretch dei tagliati nel dettaglio dei movimenti", () => {
  it("la attribuisce solo alla squadra proprietaria, senza presentarla come cessione", () => {
    const result = tradeMovementPresentation("Scambio AAA ↔ BBB: Ricevuto: BBB → AAA; Roster → Roster; 160 crediti, contratto 27; Stretch su tagliato: Vecchio tagliato (AAA); 300 crediti, contratto 27; 3 rate da 100 crediti, scadenza 29");
    expect(result?.concise).toContain("stretch Vecchio tagliato (AAA)");
    const [aaa, bbb] = result!.full.split("\n\n");
    expect(aaa).toContain("Stretch su tagliato: Vecchio tagliato");
    expect(aaa).toContain("3 rate da 100 crediti, scadenza 29");
    expect(bbb).not.toContain("Vecchio tagliato");
  });
});
