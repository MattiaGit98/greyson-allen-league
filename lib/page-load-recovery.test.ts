import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pageLoadRecoveryDelay, startPageLoadRecovery } from "./page-load-recovery";

const now = Date.parse("2026-11-06T12:00:00Z");

function fixture(pathname = "/") {
  const values = new Map<string, string>();
  const snapshot = { href: `https://league.test${pathname}`, pathname, online: true, visible: true, unfinishedWork: false, documentStartedAt: now - 500 };
  const storage = { getItem: vi.fn((key: string) => values.get(key) ?? null), setItem: vi.fn((key: string, value: string) => { values.set(key, value); }) };
  const environment = { snapshot: () => snapshot, storage: () => storage, reload: vi.fn(), onRetrying: vi.fn() };
  return { values, snapshot, storage, environment };
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(now); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("recupero limitato degli errori di caricamento", () => {
  it.each(["/", "/squadre", "/giocatori", "/movimenti", "/calendario", "/competizioni", "/storico", "/regolamento"])("ritenta la lettura di %s dopo una breve attesa", (path) => {
    const { environment, storage, values } = fixture(path);
    startPageLoadRecovery(environment);
    expect(environment.onRetrying).toHaveBeenLastCalledWith(true);
    expect(environment.reload).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
    vi.advanceTimersByTime(pageLoadRecoveryDelay);
    expect(environment.reload).toHaveBeenCalledOnce();
    expect([...values.values()]).toEqual([String(now + pageLoadRecoveryDelay)]);
    vi.advanceTimersByTime(600_000);
    expect(environment.reload).toHaveBeenCalledOnce();
  });

  it.each(["/admin", "/admin/asta", "/admin/free-agent", "/admin/scambi", "/admin/impostazioni", "/login", "/simulatore-scambi", "/api/unknown", "/esporta-dati", "/nuova-pagina"])("non ricarica automaticamente %s e non ripete operazioni", (path) => {
    const { environment, storage } = fixture(path);
    startPageLoadRecovery(environment);
    vi.runAllTimers();
    expect(environment.reload).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(environment.onRetrying).toHaveBeenLastCalledWith(false);
  });

  it.each(["online", "visible", "unfinishedWork"] as const)("evita il recupero quando %s non lo consente", (field) => {
    const { environment, snapshot } = fixture();
    snapshot[field] = field === "unfinishedWork";
    startPageLoadRecovery(environment);
    vi.runAllTimers();
    expect(environment.reload).not.toHaveBeenCalled();
    expect(environment.onRetrying).toHaveBeenLastCalledWith(false);
  });

  it("può riprovare quando la connessione torna, senza consumare tentativi offline", () => {
    const { environment, snapshot, storage } = fixture();
    snapshot.online = false;
    startPageLoadRecovery(environment);
    expect(storage.setItem).not.toHaveBeenCalled();
    snapshot.online = true;
    startPageLoadRecovery(environment);
    vi.runAllTimers();
    expect(environment.reload).toHaveBeenCalledOnce();
  });

  it.each(["online", "visible", "unfinishedWork", "href", "pathname"] as const)("ricontrolla %s immediatamente prima di ricaricare", (field) => {
    const { environment, snapshot, storage } = fixture();
    startPageLoadRecovery(environment);
    if (field === "href") snapshot.href = "https://league.test/squadre";
    else if (field === "pathname") snapshot.pathname = "/admin";
    else snapshot[field] = field === "unfinishedWork";
    vi.runAllTimers();
    expect(environment.reload).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(environment.onRetrying).toHaveBeenLastCalledWith(false);
  });

  it("cleanup e doppio effetto di Strict Mode non consumano il tentativo", () => {
    const { environment, storage } = fixture();
    startPageLoadRecovery(environment)();
    vi.runAllTimers();
    expect(environment.reload).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
    startPageLoadRecovery(environment);
    vi.runAllTimers();
    expect(environment.reload).toHaveBeenCalledOnce();
  });

  it("ferma un errore persistente dopo il reload, anche con una risposta molto lenta", () => {
    const { environment, snapshot } = fixture();
    startPageLoadRecovery(environment);
    vi.advanceTimersByTime(pageLoadRecoveryDelay);
    snapshot.documentStartedAt = Date.now() + 1;
    vi.advanceTimersByTime(600_000);
    startPageLoadRecovery(environment);
    vi.runAllTimers();
    expect(environment.reload).toHaveBeenCalledOnce();
    expect(environment.onRetrying).toHaveBeenLastCalledWith(false);
  });

  it("può recuperare un nuovo caricamento indipendente dopo il periodo di sicurezza", () => {
    const { environment, snapshot } = fixture();
    startPageLoadRecovery(environment);
    vi.advanceTimersByTime(pageLoadRecoveryDelay);
    vi.advanceTimersByTime(180_000);
    snapshot.documentStartedAt = Date.now();
    startPageLoadRecovery(environment);
    vi.runAllTimers();
    expect(environment.reload).toHaveBeenCalledTimes(2);
  });

  it("un errore ripetuto o un filtro diverso nello stesso URL non crea un secondo tentativo", () => {
    const { environment, snapshot } = fixture("/giocatori");
    startPageLoadRecovery(environment);
    vi.runAllTimers();
    snapshot.href += "?q=allen";
    startPageLoadRecovery(environment);
    vi.runAllTimers();
    expect(environment.reload).toHaveBeenCalledOnce();
    expect(environment.onRetrying).toHaveBeenLastCalledWith(false);
  });

  it("due richieste contemporanee condividono il limite persistente", () => {
    const { environment } = fixture();
    startPageLoadRecovery(environment);
    startPageLoadRecovery(environment);
    vi.runAllTimers();
    expect(environment.reload).toHaveBeenCalledOnce();
  });

  it.each(["access", "read", "write"] as const)("mantiene il recupero manuale se lo storage fallisce in %s", (stage) => {
    const { environment, storage } = fixture();
    const fail = () => { throw new Error("storage unavailable"); };
    if (stage === "access") environment.storage = fail;
    else if (stage === "read") storage.getItem.mockImplementation(fail);
    else storage.setItem.mockImplementation(fail);
    startPageLoadRecovery(environment);
    vi.runAllTimers();
    expect(environment.reload).not.toHaveBeenCalled();
    expect(environment.onRetrying).toHaveBeenLastCalledWith(false);
  });

  it.each(["invalid", "0", "NaN", "Infinity", String(now + 10_000)])("non rischia loop con un contatore non valido o futuro: %s", (value) => {
    const { environment, values } = fixture();
    values.set("gal:page-load-recovery:/", value);
    startPageLoadRecovery(environment);
    vi.runAllTimers();
    expect(environment.reload).not.toHaveBeenCalled();
    expect(environment.onRetrying).toHaveBeenLastCalledWith(false);
  });

  it("torna al pulsante manuale se il browser rifiuta la ricarica", () => {
    const { environment } = fixture();
    environment.reload.mockImplementation(() => { throw new Error("reload unavailable"); });
    startPageLoadRecovery(environment);
    vi.runAllTimers();
    expect(environment.reload).toHaveBeenCalledOnce();
    expect(environment.onRetrying).toHaveBeenLastCalledWith(false);
  });

  it("non ricarica se lo storage accetta la scrittura ma non la conserva", () => {
    const { environment, storage } = fixture();
    storage.setItem.mockImplementation(() => {});
    startPageLoadRecovery(environment);
    vi.runAllTimers();
    expect(environment.reload).not.toHaveBeenCalled();
    expect(environment.onRetrying).toHaveBeenLastCalledWith(false);
  });
});
