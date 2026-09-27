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
});

function labelsAt(moment: Parameters<typeof availableOperationsAt>[0]) {
  return availableOperationsAt(moment).map((operation) => operation.label);
}
