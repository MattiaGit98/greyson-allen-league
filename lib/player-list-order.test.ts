import { describe, expect, it } from "vitest";
import { movePlayerToRoleBoundary, orderPlayerListByRole } from "./player-list-order";

const player = (name: string, role: "G" | "A" | "C" | "X") => ({ name, role });

describe("ordinamento del listone per presenza del ruolo", () => {
  it("sposta in fondo un giocatore che perde il ruolo", () => {
    const players = [player("Guardia", "G"), player("Da aggiornare", "X"), player("Senza ruolo", "X")];
    expect(movePlayerToRoleBoundary(players, 1).map((item) => item.name)).toEqual([
      "Guardia", "Senza ruolo", "Da aggiornare",
    ]);
  });

  it("colloca come ultimo dei giocatori con ruolo chi riceve un ruolo", () => {
    const players = [player("Guardia", "G"), player("Da aggiornare", "A"), player("Senza ruolo", "X")];
    expect(movePlayerToRoleBoundary(players, 1).map((item) => item.name)).toEqual([
      "Guardia", "Da aggiornare", "Senza ruolo",
    ]);
  });

  it("mantiene l’ordine relativo separando giocatori con e senza ruolo", () => {
    const players = [player("G1", "G"), player("X1", "X"), player("A1", "A"), player("X2", "X")];
    expect(orderPlayerListByRole(players).map((item) => item.name)).toEqual(["G1", "A1", "X1", "X2"]);
  });
});
