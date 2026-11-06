import { beforeEach, describe, expect, it, vi } from "vitest";
import { saveCompetitionContent } from "../app/admin/contenuti/actions";
import type { CupGroupContent } from "./competitions";

const mocks = vi.hoisted(() => ({ client: vi.fn(), rpc: vi.fn(), teams: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: mocks.client }));
vi.mock("@/lib/competitions", async () => import("./competitions"));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));

const codes = ["AAA", "BBB", "CCC", "DDD"];
function group(): CupGroupContent {
  return { kind: "cup_group", rounds: 2, results: Object.fromEntries(codes.map((code, index) => [code, {
    wins: [index < 2 ? 1 : 0, null], scores: ["100", ""],
  }])) };
}
function form(content: unknown, name = "Girone coppa") {
  const data = new FormData();
  data.set("competition_name", name);
  data.set("content_json", JSON.stringify(content));
  return data;
}
function setup(loggedIn = true) {
  mocks.teams.mockResolvedValue({ data: codes.map((code) => ({ code })), error: null });
  const from = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ eq: mocks.teams }) });
  mocks.rpc.mockResolvedValue({ error: null });
  mocks.client.mockResolvedValue({ auth: { getUser: async () => ({ data: { user: loggedIn ? { id: "admin-fixture" } : null } }) }, from, rpc: mocks.rpc });
  return from;
}
beforeEach(() => { vi.clearAllMocks(); setup(); });

describe("salvataggio del girone coppa", () => {
  it("salva una giornata completa bilanciata, lasciando vuote le successive e mantenendo 0/1", async () => {
    const content = group();
    expect(await saveCompetitionContent({}, form(content))).toEqual({ message: "Modifiche salvate." });
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("replace_active_competition_content", { target_name: "Girone coppa", payload: content });
    expect(mocks.teams).toHaveBeenCalledWith("active", true);
    expect(mocks.revalidate).toHaveBeenCalledWith("/competizioni");
    expect(mocks.revalidate).toHaveBeenCalledWith("/admin/contenuti");
    expect(mocks.revalidate).toHaveBeenCalledWith("/");
  });

  it("salva un girone interamente vuoto", async () => {
    expect(await saveCompetitionContent({}, form({ kind: "cup_group", rounds: 5, results: {} }))).toEqual({ message: "Modifiche salvate." });
    expect(mocks.rpc).toHaveBeenCalledOnce();
  });

  it("rifiuta giornate parziali anche inviando il form direttamente", async () => {
    const content = group();
    content.results.DDD = { wins: [null, null], scores: ["", ""] };
    expect(await saveCompetitionContent({}, form(content))).toEqual({ error: expect.stringContaining("G1: giornata incompleta (3/4") });
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it.each(["wins", "scores"] as const)("rifiuta risultati senza %s per una squadra", async (field) => {
    const content = group();
    if (field === "wins") content.results.AAA.wins[0] = null;
    else content.results.AAA.scores[0] = " ";
    expect(await saveCompetitionContent({}, form(content))).toEqual({ error: expect.stringContaining("giornata incompleta") });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("rifiuta una giornata completa ma sbilanciata", async () => {
    const content = group();
    content.results.DDD.wins[0] = 1;
    expect(await saveCompetitionContent({}, form(content))).toEqual({ error: expect.stringContaining("Il numero di vittorie deve essere uguale") });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("controlla anche una giornata successiva e non salva le precedenti da sole", async () => {
    const content = group();
    content.results.AAA.wins[1] = 1;
    content.results.AAA.scores[1] = "120";
    expect(await saveCompetitionContent({}, form(content))).toEqual({ error: expect.stringContaining("G2: giornata incompleta") });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("usa la lista autorevole delle squadre attive, non le sole righe ricevute", async () => {
    const content = group();
    delete content.results.CCC;
    delete content.results.DDD;
    content.results.BBB.wins[0] = 0;
    expect(await saveCompetitionContent({}, form(content))).toEqual({ error: expect.stringContaining("2/4 squadre complete") });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("riconosce anche i valori 0 e 1 salvati come testo, senza cambiare il formato", async () => {
    const content = group();
    const raw = JSON.parse(JSON.stringify(content));
    for (const code of codes) raw.results[code].wins[0] = String(raw.results[code].wins[0]);
    expect(await saveCompetitionContent({}, form(raw))).toEqual({ message: "Modifiche salvate." });
    expect(mocks.rpc.mock.calls[0][1].payload).toEqual(content);
  });

  it("non applica i nuovi controlli a classifiche e tabelloni diversi dal girone", async () => {
    expect(await saveCompetitionContent({}, form({ kind: "ranking", positions: ["AAA", null] }, "Regular season"))).toEqual({ message: "Modifiche salvate." });
    expect(mocks.rpc).toHaveBeenCalledOnce();
  });

  it("non salva senza sessione", async () => {
    setup(false);
    expect(await saveCompetitionContent({}, form(group()))).toEqual({ error: "Sessione scaduta." });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("non salva se non può verificare le squadre correnti", async () => {
    mocks.teams.mockResolvedValue({ data: null, error: { message: "Errore lettura squadre" } });
    expect(await saveCompetitionContent({}, form(group()))).toEqual({ error: "Errore lettura squadre" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("riporta un errore di salvataggio senza annunciare il successo", async () => {
    mocks.rpc.mockResolvedValue({ error: { message: "Salvataggio rifiutato" } });
    expect(await saveCompetitionContent({}, form(group()))).toEqual({ error: "Salvataggio rifiutato" });
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
});
