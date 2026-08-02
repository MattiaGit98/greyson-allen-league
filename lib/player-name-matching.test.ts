import { describe, expect, it } from "vitest";
import { playerNameComparisonKey, suggestPlayerName } from "./player-name-matching";

const candidates = [
  { name: "P.J. Washington" },
  { name: "Karl-Anthony Towns" },
  { name: "Nicolas Claxton" },
  { name: "Jabari Smith Jr." },
  { name: "Nikola Jovi\u0107" },
];

describe("riconciliazione dei nomi del listone", () => {
  it("ignora accenti e segni tipografici", () => {
    expect(playerNameComparisonKey("  PJ  Washington ")).toBe("pj washington");
    expect(suggestPlayerName("P.J. Washington", candidates)).toBe("P.J. Washington");
    expect(suggestPlayerName("Karl Anthony Towns", candidates)).toBe("Karl-Anthony Towns");
    expect(suggestPlayerName("Nikola Jovic", candidates)).toBe("Nikola Jovi\u0107");
  });

  it("propone abbreviazioni e suffissi senza salvarli automaticamente", () => {
    expect(suggestPlayerName("Nic Claxton", candidates)).toBe("Nicolas Claxton");
    expect(suggestPlayerName("Jabari Smith", candidates)).toBe("Jabari Smith Jr.");
  });

  it("lascia vuota una proposta troppo debole", () => {
    expect(suggestPlayerName("Giocatore Sconosciuto", candidates)).toBeNull();
  });
});
