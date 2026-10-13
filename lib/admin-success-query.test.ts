import { describe, expect, it } from "vitest";
import { urlWithoutAdminSuccess } from "./admin-success-query";

describe("chiusura conferma admin", () => {
  it("rimuove solo i parametri della conferma e conserva filtri e dati della pagina", () => {
    expect(urlWithoutAdminSuccess("https://league.test/admin/asta?updated=Assegnato&onlyAstabili=1&q=allen"))
      .toBe("https://league.test/admin/asta?onlyAstabili=1&q=allen");
    expect(urlWithoutAdminSuccess("https://league.test/admin/scambi?updated=Scambio&sign_kind=free_agent&sign_player=Allen"))
      .toBe("https://league.test/admin/scambi?sign_kind=free_agent&sign_player=Allen");
  });

  it("rimuove anche il token del backup automatico dopo un avanzamento", () => {
    expect(urlWithoutAdminSuccess("https://league.test/admin/impostazioni?stepped=auction_start&auction_export=abc"))
      .toBe("https://league.test/admin/impostazioni");
  });

  it("lascia intatti gli errori e segnala quando non serve pulire l'URL", () => {
    expect(urlWithoutAdminSuccess("https://league.test/admin/movimenti?reverted=1&error=no&q=prova"))
      .toBe("https://league.test/admin/movimenti?error=no&q=prova");
    expect(urlWithoutAdminSuccess("https://league.test/admin/avvisi?error=no"))
      .toBeNull();
  });
});
