import { describe, expect, it } from "vitest";
import { matchesPublicPlayerFilters, togglePlayerFilterSelection } from "./public-player-filters";
import type { PublicPlayerListRow, PublicPlayerStatus } from "./public-player-list";

function row(name: string, patch: Partial<PublicPlayerListRow> = {}): PublicPlayerListRow {
  return { name, role: "G", realTeam: "", rookie: false, under23: false, listOrder: 1, publicOrder: 1,
    rosterTeamCode: null, rosterContract: null, qualifyingTeamCode: null, ...patch };
}

const rows = [
  row("Rookie FA", { rookie: true }),
  row("Under 23 FA", { role: "A", under23: true }),
  row("Veterano FA", { role: "C" }),
  row("In scadenza", { rosterTeamCode: "AAA", rosterContract: "27 (Q)" }),
  row("Non in scadenza", { role: "A", rosterTeamCode: "BBB", rosterContract: "28" }),
  row("Pending", { role: "X", rosterTeamCode: "CCC", rosterContract: "PENDING" }),
  row("Con Q.O.", { role: "C", qualifyingTeamCode: "DDD" }),
];

const defaults: Parameters<typeof matchesPublicPlayerFilters>[1] = {
  query: "", seasonName: "2026/27", postAuction: true, showEligibility: true,
  availableStatuses: ["fa", "expiring", "not_expiring", "pending"], roles: [], statuses: [], categories: [],
};
function names(patch: Partial<typeof defaults> = {}) {
  return rows.filter((row) => matchesPublicPlayerFilters(row, { ...defaults, ...patch })).map((row) => row.name);
}

describe("filtri pubblici del listone", () => {
  it("mostra tutti i giocatori quando non c'è nessuna spunta", () => {
    expect(names()).toEqual(rows.map((row) => row.name));
  });

  it("più ruoli nello stesso blocco sono un'unione", () => {
    expect(names({ roles: ["G", "A"] })).toEqual(["Rookie FA", "Under 23 FA", "In scadenza", "Non in scadenza"]);
  });

  it("più stati nello stesso blocco sono un'unione", () => {
    expect(names({ statuses: ["fa", "expiring"] })).toEqual(["Rookie FA", "Under 23 FA", "Veterano FA", "In scadenza"]);
  });

  it("più categorie sono un'unione e non richiedono entrambe le caratteristiche", () => {
    expect(names({ categories: ["rookie", "under23"] })).toEqual(["Rookie FA", "Under 23 FA"]);
  });

  it("combina blocchi diversi in intersezione", () => {
    expect(names({ roles: ["G", "A"], statuses: ["fa"], categories: ["under23", "veteran"] })).toEqual(["Under 23 FA"]);
    expect(names({ roles: ["C"], statuses: ["pending"] })).toEqual([]);
  });

  it("un blocco completamente selezionato equivale a un blocco vuoto", () => {
    expect(names({ roles: ["G", "A", "C", "X"] })).toEqual(names());
    expect(names({ statuses: [...defaults.availableStatuses] })).toEqual(names());
    expect(names({ categories: ["rookie", "under23", "veteran"] })).toEqual(names());
    expect(names({ roles: ["G", "A", "C", "X"], statuses: [...defaults.availableStatuses], categories: ["rookie", "under23", "veteran"] })).toEqual(names());
    expect(names({ roles: ["G"], statuses: [...defaults.availableStatuses] })).toEqual(names({ roles: ["G"] }));
  });

  it("rispetta la ricerca testuale anche con nessuna spunta o con tutte le spunte", () => {
    expect(names({ query: "FA" })).toEqual(["Rookie FA", "Under 23 FA", "Veterano FA"]);
    expect(names({ query: "FA", roles: ["G", "A", "C", "X"], statuses: [...defaults.availableStatuses], categories: ["rookie", "under23", "veteran"] }))
      .toEqual(names({ query: "FA" }));
    expect(names({ query: "FA", roles: ["A"] })).toEqual(["Under 23 FA"]);
  });

  it("funziona anche prima dell'asta, con gli stati FA, Q.O. e roster", () => {
    const phase = { postAuction: false, availableStatuses: ["fa", "qo", "roster"] as PublicPlayerStatus[] };
    expect(names(phase)).toEqual(rows.map((row) => row.name));
    expect(names({ ...phase, statuses: ["qo"] })).toEqual(["Con Q.O."]);
    expect(names({ ...phase, statuses: ["roster"] })).toEqual(["In scadenza", "Non in scadenza", "Pending"]);
    expect(names({ ...phase, statuses: phase.availableStatuses })).toEqual(names(phase));
  });

  it("dopo la consegna contratti non fa passare un eventuale pending attraverso il filtro FA", () => {
    const phase = { availableStatuses: ["fa", "expiring", "not_expiring"] as PublicPlayerStatus[] };
    expect(names(phase)).toContain("Pending");
    expect(names({ ...phase, statuses: ["fa"] })).not.toContain("Pending");
    expect(names({ ...phase, statuses: phase.availableStatuses })).toEqual(names(phase));
  });

  it("ignora le categorie nelle fasi in cui non vengono mostrate", () => {
    expect(names({ showEligibility: false, categories: ["rookie"] })).toEqual(names());
  });

  it("mantiene rookie, Under 23 e veterani come categorie esclusive", () => {
    const legacy = row("Rookie", { rookie: true, under23: true });
    expect(matchesPublicPlayerFilters(legacy, { ...defaults, categories: ["rookie"] })).toBe(true);
    expect(matchesPublicPlayerFilters(legacy, { ...defaults, categories: ["under23"] })).toBe(false);
  });

  it("permette di selezionare da zero e di togliere anche l'ultima spunta senza mutare lo stato precedente", () => {
    const selected = ["G"];
    expect(togglePlayerFilterSelection<string>([], "G")).toEqual(["G"]);
    expect(togglePlayerFilterSelection(selected, "A")).toEqual(["G", "A"]);
    expect(togglePlayerFilterSelection(selected, "G")).toEqual([]);
    expect(selected).toEqual(["G"]);
  });
});
