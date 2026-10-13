import { describe, expect, it } from "vitest";
import { conciseMovementDetail, fullMovementDetail, movementOperationLabel, movementOperationTypesForFilter, movementSearchFilter, normalizeMovementSearchQuery } from "./movement-display";

describe("visualizzazione sintetica dei movimenti", () => {
  it("abbrevia una team option mantenendo giocatore e squadra", () => {
    expect(conciseMovementDetail(
      "team_option",
      "Cooper Flagg: T.O. esercitata da CSS; slot Roster; 25 crediti; contratto 27 + R.E.",
    )).toBe("Cooper Flagg: T.O. esercitata da CSS");
  });

  it("mantiene il taglio contestuale nelle acquisizioni", () => {
    expect(conciseMovementDetail(
      "firma_free_agent",
      "Nuovo: firmato da AAA per 12 crediti; slot Roster; contratto 27; taglio contestuale di Vecchio",
    )).toBe("Nuovo: firmato da AAA; taglio contestuale di Vecchio");
  });

  it("elenca squadre e destinatari dei beni scambiati", () => {
    expect(conciseMovementDetail(
      "scambio",
      "Scambio AAA ↔ BBB: Primo: AAA → BBB; Roster → Two-way; 20 crediti, contratto 28; Secondo: BBB → AAA; Roster → Roster; 15 crediti, contratto 27",
    )).toBe("AAA ↔ BBB: Primo (BBB); Secondo (AAA)");
  });

  it("mostra il dettaglio per squadra, includendo scelte, Q.O. e operazioni contestuali", () => {
    const summary = "Scambio AAA ↔ BBB ↔ CCC: Primo: AAA → BBB; Roster → Two-way; 20 crediti, contratto 28; Scelta 2028 1° giro, Orig/pos CCC: BBB → CCC; Diritti Q.O. su Secondo: CCC → AAA; importo 1; Taglio contestuale: Terzo (BBB); 8 crediti, contratto 27; Spostamento contestuale: Quarto (AAA); Two-way → Roster; Clausola eliminata: scelta 2028 1° giro (AAA) con contropartita 2029 2° giro (BBB)";
    expect(conciseMovementDetail("scambio", summary)).toContain("Primo (BBB); Scelta 2028 1° giro, Orig/pos CCC (CCC); Q.O. Secondo (AAA)");
    const full = fullMovementDetail("scambio", summary);
    expect(full).toContain("AAA\nCede: Primo · 20 crediti, contratto 28 · Roster → Two-way\nRiceve: Q.O. Secondo (1 credito)");
    expect(full).toContain("BBB\nCede: Scelta 2028 1° giro, Orig/pos CCC\nRiceve: Primo");
    expect(full).toContain("Taglio contestuale: Terzo");
    expect(full).toContain("Clausole: Clausola eliminata:");
    expect(full).toContain("CCC\nCede: Q.O. Secondo");
  });

  it("non inventa una ripartizione per testi di scambio non riconosciuti", () => {
    expect(fullMovementDetail("scambio", "Scambio storico senza dettagli sufficienti")).toBe("Scambio storico senza dettagli sufficienti");
  });

  it("rende il sign and trade leggibile e separa le clausole senza inventare beneficiari", () => {
    const summary = "Sign and trade AAA ↔ BBB: Firma free agent · AAA · 20 crediti · Roster; Nuovo: AAA → BBB; Roster → Roster; 20 crediti, contratto 27; Clausola su scelta 2028 1° giro, Orig/pos AAA: diritto di swap; contropartita 2028 1° giro, Orig/pos BBB";
    expect(conciseMovementDetail("sign_and_trade", summary)).toContain("AAA ↔ BBB: Nuovo (BBB)");
    expect(fullMovementDetail("sign_and_trade", summary)).toContain("Clausole dello scambio: Clausola su scelta 2028 1° giro");
    expect(fullMovementDetail("sign_and_trade", summary)).toContain("Firma free agent · AAA · 20 crediti · Roster");
  });

  it("attribuisce le nuove clausole alla squadra beneficiaria quando è registrata", () => {
    const summary = "Scambio AAA ↔ BBB: Primo: AAA → BBB; Roster → Roster; 20 crediti, contratto 27; Clausola su scelta 2028 1° giro, Orig/pos AAA: protetta top 3; contropartita 2029 2° giro, Orig/pos BBB; a favore di AAA";
    expect(conciseMovementDetail("scambio", summary)).toContain("clausola su scelta 2028 1° giro, Orig/pos AAA: protetta top 3 (AAA)");
    const full = fullMovementDetail("scambio", summary);
    expect(full).toContain("AAA\nCede: Primo");
    expect(full).toContain("Clausole: Clausola su scelta 2028 1° giro, Orig/pos AAA: protetta top 3; contropartita 2029 2° giro, Orig/pos BBB");
    expect(full).not.toContain("Clausole dello scambio:");
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
    expect(movementOperationLabel("taglio_programmato")).toBe("Taglio programmato");
    expect(movementOperationLabel("annulla_taglio_programmato")).toBe("Taglio programmato annullato");
    expect(movementOperationLabel("operazione_personalizzata")).toBe("Operazione personalizzata");
  });

  it("raggruppa i tipi simili nei filtri pubblici", () => {
    expect(movementOperationTypesForFilter("rettifiche_admin")).toEqual([
      "rettifica_roster_contratto",
      "rettifica_roster_rimozione",
      "rettifica_roster_aggiunta",
      "rettifica_admin_scambio",
    ]);
    expect(movementOperationTypesForFilter("team_option")).toEqual(["team_option", "rookie_extension", "team_option_playoff"]);
    expect(movementOperationTypesForFilter("tagli_rilasci")).toContain("taglio_programmato");
    expect(movementOperationTypesForFilter("tagli_rilasci")).toContain("annulla_taglio_programmato");
    expect(movementOperationTypesForFilter("procedure_stagionali")).toEqual(["ordine_draft_finale", "consegna_contratti"]);
    expect(movementOperationTypesForFilter("inesistente")).toBeNull();
  });

  it("costruisce la ricerca testuale anche sui nomi leggibili delle operazioni", () => {
    expect(normalizeMovementSearchQuery("  LeBron   James  ")).toBe("LeBron James");
    expect(movementSearchFilter("rettifica admin")).toContain("operation_type.in.(rettifica_roster_contratto,rettifica_roster_rimozione,rettifica_roster_aggiunta,rettifica_admin_scambio)");
    expect(movementSearchFilter("Q.O.")).toContain("qualifying_offer_non_estesa");
    expect(movementSearchFilter("... ")).toBeNull();
  });
});
