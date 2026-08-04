import { describe, expect, it } from "vitest";
import { conciseMovementDetail, movementOperationLabel } from "./movement-display";

describe("visualizzazione sintetica dei movimenti", () => {
  it("abbrevia una team option mantenendo giocatore e squadra", () => {
    expect(conciseMovementDetail(
      "team_option",
      "Cooper Flagg: T.O. esercitata da CSS; slot Roster; 25 crediti; scadenza 28 (2X)",
    )).toBe("Cooper Flagg: T.O. esercitata da CSS");
  });

  it("mantiene il taglio contestuale nelle acquisizioni", () => {
    expect(conciseMovementDetail(
      "firma_free_agent",
      "Nuovo: firmato da AAA per 12 crediti; slot Roster; contratto 27; taglio contestuale di Vecchio",
    )).toBe("Nuovo: firmato da AAA; taglio contestuale di Vecchio");
  });

  it("mantiene gli slot soltanto quando cambiano in uno scambio", () => {
    expect(conciseMovementDetail(
      "scambio",
      "Scambio AAA ↔ BBB: Primo: AAA → BBB; Roster → Two-way; 20 crediti, contratto 28; Secondo: BBB → AAA; Roster → Roster; 15 crediti, contratto 27",
    )).toBe("Scambio AAA ↔ BBB: Primo: AAA → BBB; Roster → Two-way; Secondo: BBB → AAA");
  });

  it("nasconde costo e scadenza di una rettifica roster", () => {
    expect(conciseMovementDetail(
      "rettifica_roster_contratto",
      "Giocatore (AAA, Roster): costo 10 → 12; scadenza 27 → 28 (Q)",
    )).toBe("Giocatore (AAA): contratto rettificato");
  });

  it("mostra la squadra ma non gli importi in una rettifica del prezzo d'asta", () => {
    expect(conciseMovementDetail(
      "modifica_asta",
      "Giocatore: prezzo modificato da 10 a 15 per AAA",
    )).toBe("Giocatore (AAA): prezzo rettificato");
  });

  it("conserva l'indicazione di cap forzato", () => {
    expect(conciseMovementDetail(
      "estensione_contrattuale",
      "Giocatore: estensione esercitata da AAA; costo 10 → 13 crediti; scadenza 28 · CAP FORZATO",
    )).toBe("Giocatore: estensione esercitata da AAA · CAP FORZATO");
  });

  it("formatta il tipo di operazione", () => {
    expect(movementOperationLabel("spostamento_slot")).toBe("Spostamento slot");
    expect(movementOperationLabel("operazione_personalizzata")).toBe("Operazione personalizzata");
  });
});
