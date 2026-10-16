import { describe, expect, it } from "vitest";
import { liveRefreshDecision } from "./live-refresh-policy";

const cleanAdmin = {
  preserveWork: true,
  autoRefreshing: false,
  submitting: false,
  dirtyForm: false,
  openDialog: false,
};

describe("avviso degli aggiornamenti live", () => {
  it("aggiorna automaticamente una pagina senza lavoro aperto, incluso il simulatore intatto", () => {
    expect(liveRefreshDecision(cleanAdmin)).toBe("refresh");
  });

  it("mostra l'avviso se ci sono modifiche o una finestra aperta da preservare", () => {
    expect(liveRefreshDecision({ ...cleanAdmin, dirtyForm: true })).toBe("notice");
    expect(liveRefreshDecision({ ...cleanAdmin, openDialog: true })).toBe("notice");
  });

  it("non mostra l'avviso per un salvataggio o un aggiornamento automatico già in corso", () => {
    expect(liveRefreshDecision({ ...cleanAdmin, submitting: true, openDialog: true })).toBe("ignore");
    expect(liveRefreshDecision({ ...cleanAdmin, autoRefreshing: true, dirtyForm: true })).toBe("ignore");
  });
});
