import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TradeBuilder, hydrateTradeImport, tradeImportPayload, tradeSimulationRecap, withTradeImportPayload } from "../app/admin/scambi/trade-builder";
import type { ExistingTradeClauseAgreement } from "./trade-state";

const hooks = vi.hoisted(() => ({ active: false, cursor: 0, values: [] as unknown[] }));
vi.mock("react", async () => {
  const actual = await vi.importActual<typeof React>("react");
  return { ...actual, useEffect: vi.fn(),
    useMemo: (factory: () => unknown, deps: React.DependencyList) => hooks.active ? factory() : actual.useMemo(factory, deps),
    useState: (initial: unknown) => {
      if (!hooks.active) return actual.useState(initial);
      const index = hooks.cursor++;
      if (index >= hooks.values.length) hooks.values.push(typeof initial === "function" ? initial() : initial);
      const values = hooks.values;
      return [values[index], (next: unknown) => {
        values[index] = typeof next === "function" ? next(values[index]) : next;
      }];
    },
  };
});
vi.mock("@/lib/rules/trade", async () => import("./rules/trade"));
vi.mock("@/lib/rules/roster", async () => import("./rules/roster"));
vi.mock("@/lib/roster-slot-limits", async () => import("./roster-slot-limits"));
vi.mock("@/app/admin/cap-force-control", () => ({ CapBlocker: () => null }));
vi.mock("@/lib/sign-and-trade", async () => import("./sign-and-trade"));
vi.mock("@/lib/trade-stretch", async () => import("./trade-stretch"));
vi.mock("@/lib/trade-clause-selection", async () => import("./trade-clause-selection"));

type Props = Parameters<typeof TradeBuilder>[0];
const teams: Props["teams"] = ["AAA", "BBB", "CCC", "DDD"].map((code) => ({
  code, name: code, currentSeasonName: "2026/27", currentCost: 0, futureCosts: [], players: [],
  stretchContracts: [], cutPlayerNames: [], qualifyingOffers: [],
  picks: [{ id: `${code}-pick`, label: "Scelta", year: 2028, round: "1° giro", originOrOverall: code, hasExistingCondition: false, tradable: true }],
}));
function props(overrides: Partial<Props> = {}): Props {
  return { phase: "offseason", tradeDeadlinePassed: false, tradesOpen: true, qualifyingOfferTransfersOpen: true,
    enforceOffseasonCap: true, enforceRoleMinimums: false, includeDpeInRoleMinimums: false,
    tradableDraftYears: [2027, 2028, 2029], protectionCounterpartyDraftYears: [2027, 2028, 2029, 2030],
    existingClauseAgreements: [], signAndTrade: null, teams, ...overrides };
}
function draw(input = props()) {
  hooks.active = true;
  hooks.cursor = 0;
  try { return TradeBuilder(input); } finally { hooks.active = false; }
}
function elements(node: React.ReactNode): React.ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...elements(node.props.children as React.ReactNode)];
}
function find<P>(node: React.ReactNode, test: (element: React.ReactElement<Record<string, unknown>>) => boolean) {
  const found = elements(node).find(test);
  expect(found).toBeDefined();
  return found as React.ReactElement<P>;
}
function card(node: React.ReactNode, code: string) {
  return find<{ onRemove: () => void }>(node, (element) => (element.props.team as { code?: string } | undefined)?.code === code);
}
function drawCard(node: React.ReactNode, code: string, values: unknown[]) {
  const element = card(node, code);
  const component = element.type as (props: typeof element.props) => React.ReactNode;
  const previous = hooks.values;
  hooks.active = true;
  hooks.cursor = 0;
  hooks.values = values;
  try { return component(element.props); } finally { hooks.active = false; hooks.values = previous; }
}
function addTeam(node: React.ReactNode) {
  find<{ onClick: () => void }>(node, (element) => element.type === "button" && element.props.children === "+ Aggiungi squadra").props.onClick();
}
function agreement(clause: ExistingTradeClauseAgreement["clause"], overrides: Partial<ExistingTradeClauseAgreement> = {}): ExistingTradeClauseAgreement {
  return { agreementId: clause, subjectPickId: "AAA-pick", counterpartyPickId: "BBB-pick",
    subjectOwnerTeamCode: "AAA", counterpartyOwnerTeamCode: "BBB", subjectYear: 2028, counterpartyYear: 2028,
    subjectRound: "1° giro", counterpartyRound: "1° giro", clause, label: `Fixture ${clause}`, subjectIndex: 0, counterpartyIndex: 1, ...overrides };
}

function cutFixture(received: boolean, stretchOptions: (2 | 3)[] = [2, 3], contract = "27") {
  const owner = received ? "BBB" : "AAA";
  const player: Props["teams"][number]["players"][number] = {
    id: `${owner}:player:Fixture`, name: "Fixture", cost: 31, capCost: 31, futureCapCosts: {}, contract,
    role: "G", slot: "regular", cuttable: true, stretchOptions, movementDestinations: [], allowedDestinations: ["regular"],
  };
  const input = props({ teams: teams.map((team) => ({ ...team, players: team.code === owner ? [player] : [] })) });
  draw(input);
  if (received) hooks.values[1] = [{ ...player, fromTeamCode: owner, toTeamCode: "AAA", sourceSlot: "regular", destinationSlot: "regular" }];
  hooks.values[5] = [{ ...player, teamCode: "AAA", stretchResidualCost: stretchOptions.length === 1 && stretchOptions[0] === 3 ? 62 : 31 }];
  return { input, player };
}

function section(node: React.ReactNode, label: string) {
  return find<Record<string, unknown>>(node, (element) => element.type === "section" && elements(element.props.children as React.ReactNode).some((child) => child.props.className === "trade-section-label" && child.props.children === label));
}

beforeEach(() => { hooks.active = false; hooks.cursor = 0; hooks.values = []; vi.stubGlobal("React", React); });
afterEach(() => vi.unstubAllGlobals());

describe("squadre e clausole nel pannello condiviso degli scambi", () => {
  it("riserva alla spunta solo lo spazio necessario e mantiene la disposizione mobile separata", () => {
    const css = readFileSync("app/globals.css", "utf8");
    expect(css).toMatch(/\.trade-existing-clause-row\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\) 24px;/);
    expect(css).toMatch(/\.trade-existing-clause-row input\s*\{[^}]*width: 16px;[^}]*height: 16px;[^}]*margin: 0;[^}]*justify-self: center;/);
    const mobile = css.slice(css.indexOf("@media (max-width: 560px)"), css.indexOf("@media (max-width: 850px)", css.indexOf("@media (max-width: 560px)")));
    expect(mobile).toContain(".trade-existing-clause-row { grid-template-columns: 1fr; }");
  });

  it("allinea il riquadro squadre agli altri riquadri sui dispositivi mobili", () => {
    const css = readFileSync("app/globals.css", "utf8");
    const mobile = css.slice(css.indexOf("@media (max-width: 850px)"), css.indexOf("@media (max-width: 560px)"));
    expect(mobile).toContain(".trade-toolbar, .trade-participants, .trade-import-panel, .trade-validation, .trade-submit { margin-right: 8px; margin-left: 8px; }");
    expect(mobile).toContain(".trade-team-column > .trade-summary-card { margin-right: 8px; margin-left: 8px; }");
  });

  it.each(["admin", "simulator"] as const)("colloca ogni riepilogo immediatamente sotto la propria squadra in %s", (mode) => {
    const node = draw(props({ mode }));
    const columns = elements(node).filter((element) => element.props.className === "trade-team-column");
    expect(columns).toHaveLength(2);
    for (const [index, column] of columns.entries()) {
      const children = React.Children.toArray(column.props.children as React.ReactNode) as React.ReactElement<{ team: { code: string } }>[];
      expect(children).toHaveLength(2);
      expect(children[0].props.team.code).toBe(teams[index].code);
      expect(children[1].props.team.code).toBe(teams[index].code);
      expect(renderToStaticMarkup(children[1])).toContain(`aria-label="Riepilogo ${index === 0 ? "Aaa" : "Bbb"}"`);
    }
    expect(renderToStaticMarkup(node)).not.toContain("trade-summary-grid");
  });

  it.each(["admin", "simulator"] as const)("seleziona le squadre solo nel riquadro iniziale in %s", (mode) => {
    const html = renderToStaticMarkup(draw(props({ mode })));
    expect(html).toContain("Squadre coinvolte");
    expect(html.indexOf("trade-participants")).toBeLessThan(html.indexOf("trade-team-grid"));
    expect(html.match(/<select aria-label="Squadra \d"/g)).toHaveLength(2);
    const headers = html.match(/<div class="trade-team-header">.*?<\/div>/g)!;
    expect(headers).toHaveLength(2);
    expect(headers.every((header) => header.includes("<strong>") && !header.includes("<select"))).toBe(true);
    expect(html).not.toContain('aria-label="Rimuovi Aaa"');
  });

  it("aggiunge e rimuove squadre dai due punti senza scendere sotto due partecipanti", () => {
    addTeam(draw());
    let node = draw();
    expect(renderToStaticMarkup(node).match(/aria-label="Rimuovi Ccc"/g)).toHaveLength(2);
    card(node, "CCC").props.onRemove();
    node = draw();
    expect(hooks.values[0]).toEqual(["AAA", "BBB"]);
    card(node, "AAA").props.onRemove();
    expect(hooks.values[0]).toEqual(["AAA", "BBB"]);
    addTeam(draw());
    node = draw();
    const selector = find< { children: React.ReactNode } >(node, (element) => element.props.className === "trade-participant-grid");
    find<{ onClick: () => void }>(selector, (element) => element.props["aria-label"] === "Rimuovi Ccc").props.onClick();
    expect(hooks.values[0]).toEqual(["AAA", "BBB"]);
  });

  it("cambiare una squadra ripulisce i suoi trasferimenti ma conserva quelli delle altre", () => {
    addTeam(draw());
    // State iniziale del builder: partecipanti, giocatori, scelte, clausole, Q.O., tagli, stretch, spostamenti, rimozioni.
    hooks.values[1] = [{ id: "received", fromTeamCode: "AAA", toTeamCode: "BBB" }];
    hooks.values[2] = [{ ...teams[1].picks[0], id: "keep", fromTeamCode: "BBB", toTeamCode: "CCC", clause: "none" }];
    hooks.values[3] = [{ pickId: "AAA-pick", clause: "swap", pickOwnerTeamCode: "AAA", beneficiaryTeamCode: "BBB", counterpartyTeamCode: "CCC" }];
    hooks.values[4] = [{ fromTeamCode: "AAA", toTeamCode: "CCC" }];
    hooks.values[5] = [{ id: "received", teamCode: "BBB" }, { id: "keep-cut", teamCode: "CCC" }];
    hooks.values[7] = [{ teamCode: "AAA" }];
    hooks.values[8] = [{ agreementId: "old" }];
    const input = find<{ onChange: (event: { target: { value: string } }) => void }>(draw(), (element) => element.props["aria-label"] === "Squadra 1");
    input.props.onChange({ target: { value: "DDD" } });
    expect(hooks.values[0]).toEqual(["DDD", "BBB", "CCC"]);
    expect(hooks.values[1]).toEqual([]);
    expect(hooks.values[2]).toHaveLength(1);
    expect(hooks.values[3]).toEqual([]);
    expect(hooks.values[4]).toEqual([]);
    expect(hooks.values[5]).toEqual([{ id: "keep-cut", teamCode: "CCC" }]);
    expect(hooks.values[7]).toEqual([]);
    expect(hooks.values[8]).toEqual([]);
  });

  it.each(["swap", "protected_top_5"] as const)("mostra la clausola %s sotto chi la subisce, non sotto il beneficiario", (clause) => {
    const html = renderToStaticMarkup(draw(props({ existingClauseAgreements: [agreement(clause)] })));
    const cards = html.split('<article class="trade-team-card">').slice(1);
    const affectedIndex = clause === "swap" ? 1 : 0;
    expect(cards[affectedIndex]).toContain(`Fixture ${clause}`);
    expect(cards[1 - affectedIndex]).not.toContain(`Fixture ${clause}`);
  });

  it("segue il proprietario finale della scelta che subisce lo swap anche in uno scambio a tre", () => {
    const input = props({ existingClauseAgreements: [agreement("swap")] });
    addTeam(draw(input));
    hooks.values[2] = [{ ...teams[1].picks[0], fromTeamCode: "BBB", toTeamCode: "CCC", clause: "none" }];
    const html = renderToStaticMarkup(draw(input));
    const cards = html.split('<article class="trade-team-card">').slice(1);
    expect(cards[2]).toContain("Fixture swap");
    expect(cards[0]).not.toContain("Fixture swap");
    expect(cards[1]).not.toContain("Fixture swap");
  });

  it("mantiene bloccata la squadra firmataria nel sign and trade", () => {
    const input = props({ signAndTrade: { signerTeamCode: "BBB", signingEntryId: "new", playerName: "Fixture", label: "Firma", request: {} as NonNullable<Props["signAndTrade"]>["request"] } });
    addTeam(draw(input));
    const node = draw(input);
    const selector = find<{ disabled: boolean; onChange: (event: { target: { value: string } }) => void }>(node, (element) => element.props["aria-label"] === "Squadra 1");
    expect(selector.props.disabled).toBe(true);
    selector.props.onChange({ target: { value: "DDD" } });
    card(node, "BBB").props.onRemove();
    expect(hooks.values[0]).toEqual(["BBB", "AAA", "CCC"]);
    expect(renderToStaticMarkup(node)).not.toContain('aria-label="Rimuovi Bbb"');
  });
});

describe("stretch unificate dei tagli già esistenti e contestuali", () => {
  it("mantiene selezionabili anche i contratti già tagliati senza mescolare le squadre", () => {
    const { input: base, player } = cutFixture(false);
    const contract = { id: "AAA:cut:9:Vecchio", teamCode: "AAA", name: "Vecchio", cost: 30, contract: "27",
      stateIndex: 9, currentCapCost: 30, residualCost: 30, futureCapCosts: {}, stretchOptions: [2, 3] as (2 | 3)[] };
    const input = { ...base, teams: base.teams.map((team) => ({ ...team, stretchContracts: team.code === "AAA" ? [contract] : [] })) };
    const values: unknown[] = [];
    let parent = draw(input);
    let child = drawCard(parent, "AAA", values);
    const selector = find<{ onChange: (event: { target: { value: string } }) => void }>(child, (element) => element.props["aria-label"] === "Contratto tagliato da distribuire");
    const options = renderToStaticMarkup(selector);
    expect(options).toContain(contract.id);
    expect(options).toContain(player.id);
    expect(renderToStaticMarkup(drawCard(parent, "BBB", []))).not.toContain(contract.id);
    selector.props.onChange({ target: { value: contract.id } });
    child = drawCard(parent, "AAA", values);
    find<{ onClick: () => void }>(section(child, "Stretch contestuali"), (element) => element.type === "button" && element.props.children === "Aggiungi").props.onClick();
    expect(hooks.values[6]).toEqual([expect.objectContaining({ id: contract.id, years: 2 })]);
    expect(hooks.values[5]).toEqual([expect.not.objectContaining({ stretchYears: 2 })]);
    parent = draw(input);
    expect(renderToStaticMarkup(parent)).toContain("già tagliato · 30 crediti");
  });

  it.each([false, true])("propone il nuovo taglio nel solo blocco stretch (giocatore ricevuto: %s)", (received) => {
    const { input, player } = cutFixture(received);
    const node = draw(input);
    const html = renderToStaticMarkup(node);
    expect(html).toContain("Stretch contestuali");
    expect(html).not.toContain("Stretch dei tagliati");
    expect(html).toContain(`${player.id}">Fixture · 31 crediti · 27 · taglio contestuale`);
    const child = drawCard(node, "AAA", []);
    const cuts = section(child, "Tagli contestuali");
    expect(elements(cuts).filter((element) => element.type === "input")).toHaveLength(0);
    expect(elements(cuts).filter((element) => element.type === "select")).toHaveLength(1);
  });

  it("non propone un taglio non idoneo alla stretch", () => {
    const { input } = cutFixture(false, []);
    const html = renderToStaticMarkup(draw(input));
    expect(html).not.toContain("Stretch contestuali");
    expect(html).not.toContain("Contratto tagliato da distribuire");
  });

  it.each(["27", "PENDING"])("aggiunge, modifica e rimuove la stretch di un ricevuto con contratto %s senza duplicarla nel payload", (contract) => {
    const { input, player } = cutFixture(true, [2, 3], contract);
    const values: unknown[] = [];
    let parent = draw(input);
    let child = drawCard(parent, "AAA", values);
    find<{ onChange: (event: { target: { value: string } }) => void }>(child, (element) => element.props["aria-label"] === "Contratto tagliato da distribuire").props.onChange({ target: { value: player.id } });
    child = drawCard(parent, "AAA", values);
    find<{ onClick: () => void; disabled: boolean }>(section(child, "Stretch contestuali"), (element) => element.type === "button" && element.props.children === "Aggiungi").props.onClick();
    expect(hooks.values[5]).toEqual([expect.objectContaining({ id: player.id, stretchYears: 2 })]);
    expect(hooks.values[6]).toEqual([]);
    parent = draw(input);
    const serialized = find<{ value: string }>(parent, (element) => element.props.name === "trade_json").props.value;
    expect(JSON.parse(serialized).cuts[0].stretchYears).toBe(2);
    expect(JSON.parse(serialized).stretches).toEqual([]);
    child = drawCard(parent, "AAA", values);
    find<{ onChange: (event: { target: { value: string } }) => void }>(child, (element) => element.props["aria-label"] === "Rate stretch di Fixture").props.onChange({ target: { value: "3" } });
    expect(hooks.values[5]).toEqual([expect.objectContaining({ stretchYears: 3 })]);
    parent = draw(input);
    child = drawCard(parent, "AAA", values);
    find<{ onClick: () => void }>(child, (element) => element.props["aria-label"] === "Rimuovi stretch di Fixture").props.onClick();
    expect(hooks.values[5]).toEqual([expect.objectContaining({ stretchYears: null })]);
    expect(renderToStaticMarkup(draw(input))).toContain(`${player.id}">Fixture · 31 crediti`);
  });

  it("rimuovendo un trasferimento elimina anche il taglio e la sua stretch", () => {
    const { input } = cutFixture(true);
    (hooks.values[5] as { stretchYears?: number }[])[0].stretchYears = 3;
    const parent = draw(input);
    find<{ onRemovePlayer: (id: string) => void }>(parent, (element) => (element.props.team as { code?: string } | undefined)?.code === "AAA").props.onRemovePlayer("BBB:player:Fixture");
    expect(hooks.values[1]).toEqual([]);
    expect(hooks.values[5]).toEqual([]);
    expect(renderToStaticMarkup(draw(input))).not.toContain("Stretch contestuali");
  });

  it("rimuovendo solo il taglio elimina la stretch e conserva il trasferimento", () => {
    const { input } = cutFixture(true);
    (hooks.values[5] as { stretchYears?: number }[])[0].stretchYears = 3;
    const child = drawCard(draw(input), "AAA", []);
    find<{ onClick: () => void }>(section(child, "Tagli contestuali"), (element) => element.props["aria-label"] === "Rimuovi Fixture").props.onClick();
    expect(hooks.values[1]).toHaveLength(1);
    expect(hooks.values[5]).toEqual([]);
    expect(renderToStaticMarkup(draw(input))).not.toContain("Stretch contestuali");
  });

  it("per due anni residui offre soltanto tre rate e mostra il peso totale corretto", () => {
    const { input, player } = cutFixture(false, [3], "28");
    const values: unknown[] = [];
    let parent = draw(input);
    let child = drawCard(parent, "AAA", values);
    find<{ onChange: (event: { target: { value: string } }) => void }>(child, (element) => element.props["aria-label"] === "Contratto tagliato da distribuire").props.onChange({ target: { value: player.id } });
    child = drawCard(parent, "AAA", values);
    const rates = find<Record<string, unknown>>(child, (element) => element.props["aria-label"] === "Rate stretch del contratto tagliato");
    expect(renderToStaticMarkup(rates)).not.toContain('value="2"');
    find<{ onClick: () => void }>(section(child, "Stretch contestuali"), (element) => element.type === "button" && element.props.children === "Aggiungi").props.onClick();
    parent = draw(input);
    expect(hooks.values[5]).toEqual([expect.objectContaining({ stretchYears: 3 })]);
    expect(renderToStaticMarkup(parent)).toContain("21 crediti/anno");
  });
});

describe("slot originario e spostamento dei giocatori ricevuti", () => {
  function fixture(destinations: ("regular" | "g_league")[] = ["regular", "g_league"]) {
    const player: Props["teams"][number]["players"][number] = {
      id: "BBB:player:Mobile", name: "Mobile", cost: 3, capCost: 3, futureCapCosts: {}, contract: "PENDING", role: "G",
      slot: "two_way", cuttable: true, stretchOptions: [2, 3], movementDestinations: destinations,
      // Lo slot originario non è il primo della lista: il default non deve dipendere da quest'ordine.
      allowedDestinations: [...destinations, "two_way"],
    };
    const input = props({ teams: teams.map((team) => ({ ...team, twoWaySlotLimit: 3, currentCost: team.code === "BBB" ? 3 : 0, players: team.code === "BBB" ? [player] : [] })) });
    return { input, player };
  }
  function receive(input: Props, id: string) {
    const values: unknown[] = [];
    let child = drawCard(draw(input), "AAA", values);
    find<{ onChange: (event: { target: { value: string } }) => void }>(section(child, "Giocatori ricevuti"), (element) => element.type === "select").props.onChange({ target: { value: id } });
    child = drawCard(draw(input), "AAA", values);
    find<{ onClick: () => void }>(section(child, "Giocatori ricevuti"), (element) => element.type === "button" && element.props.children === "Aggiungi").props.onClick();
    return values;
  }
  function move(input: Props, id: string, values: unknown[]) {
    let child = drawCard(draw(input), "AAA", values);
    find<{ onChange: (event: { target: { value: string } }) => void }>(section(child, "Spostamenti contestuali"), (element) => element.type === "select").props.onChange({ target: { value: id } });
    child = drawCard(draw(input), "AAA", values);
    find<{ onChange: (event: { target: { value: string } }) => void }>(child, (element) => element.props["aria-label"] === "Destinazione dello spostamento").props.onChange({ target: { value: "g_league" } });
    child = drawCard(draw(input), "AAA", values);
    find<{ onClick: () => void }>(section(child, "Spostamenti contestuali"), (element) => element.type === "button" && element.props.children === "Sposta").props.onClick();
  }

  it("riceve nello slot originario e mostra una sola selezione nella riga di acquisizione", () => {
    const { input, player } = fixture();
    const values = receive(input, player.id);
    expect(hooks.values[1]).toEqual([expect.objectContaining({ sourceSlot: "two_way", destinationSlot: "two_way" })]);
    const child = drawCard(draw(input), "AAA", values);
    expect(elements(section(child, "Giocatori ricevuti")).filter((element) => element.type === "select")).toHaveLength(1);
    expect(renderToStaticMarkup(child)).not.toContain('aria-label="Slot di destinazione"');
    expect(renderToStaticMarkup(section(child, "Spostamenti contestuali"))).toContain(`value="${player.id}"`);
  });

  it("sposta il ricevuto senza doppio conteggio di slot o dati duplicati nel payload", () => {
    const { input, player } = fixture();
    const values = receive(input, player.id);
    move(input, player.id, values);
    expect(hooks.values[1]).toEqual([expect.objectContaining({ sourceSlot: "two_way", destinationSlot: "g_league" })]);
    expect(hooks.values[7]).toEqual([]);
    const parent = draw(input);
    const payload = JSON.parse(find<{ value: string }>(parent, (element) => element.props.name === "trade_json").props.value);
    expect(payload.playerMoves[0].destinationSlot).toBe("g_league");
    expect(payload.promotions).toEqual([]);
    const child = drawCard(parent, "AAA", values);
    expect(renderToStaticMarkup(section(child, "Spostamenti contestuali"))).toContain("Two-way → G-League");
    const html = renderToStaticMarkup(parent);
    const summary = html.slice(html.indexOf('aria-label="Riepilogo Aaa"'), html.indexOf('class="trade-team-column"', html.indexOf('aria-label="Riepilogo Aaa"')));
    expect(summary).toContain("0 / 3 → 1 / 3");
    expect(summary).toContain("0 / 3 → 0 / 3");
  });

  it("rimuovendo lo spostamento riporta il ricevuto allo slot originario senza togliere lo scambio", () => {
    const { input, player } = fixture();
    const values = receive(input, player.id);
    move(input, player.id, values);
    const child = drawCard(draw(input), "AAA", values);
    find<{ onRemove: (id: string) => void }>(section(child, "Spostamenti contestuali"), (element) => Array.isArray(element.props.items)).props.onRemove(player.id);
    expect(hooks.values[1]).toEqual([expect.objectContaining({ destinationSlot: "two_way" })]);
    expect(renderToStaticMarkup(section(drawCard(draw(input), "AAA", values), "Spostamenti contestuali"))).not.toContain("Two-way → G-League");
  });

  it("rimuovendo il ricevuto scompare anche lo spostamento associato", () => {
    const { input, player } = fixture();
    const values = receive(input, player.id);
    move(input, player.id, values);
    const child = drawCard(draw(input), "AAA", values);
    find<{ onRemove: (id: string) => void }>(section(child, "Giocatori ricevuti"), (element) => Array.isArray(element.props.items)).props.onRemove(player.id);
    expect(hooks.values[1]).toEqual([]);
    expect(hooks.values[7]).toEqual([]);
    expect(renderToStaticMarkup(section(drawCard(draw(input), "AAA", values), "Spostamenti contestuali"))).not.toContain(player.name);
  });

  it("non propone spostamenti per un ricevuto senza destinazioni consentite", () => {
    const { input, player } = fixture([]);
    const values = receive(input, player.id);
    const html = renderToStaticMarkup(section(drawCard(draw(input), "AAA", values), "Spostamenti contestuali"));
    expect(html).not.toContain(player.name);
    expect(html).not.toContain(`value="${player.id}"`);
  });
});

describe("importazione del recap compatto e precedente", () => {
  function fixture(format: "current" | "legacy" = "current", omitSnapshots = false) {
    const player: Props["teams"][number]["players"][number] = {
      id: "BBB:player:Importato", name: "Importato", cost: 3, capCost: 3, futureCapCosts: {}, contract: "PENDING", role: "G",
      slot: "regular", cuttable: true, stretchOptions: [2, 3], movementDestinations: [], allowedDestinations: ["regular"],
    };
    const input = props({ teams: teams.map((team) => ({ ...team, currentCost: team.code === "BBB" ? 3 : 0, players: team.code === "BBB" ? [player] : [] })) });
    const imported = hydrateTradeImport({ version: 1, participantCodes: ["AAA", "BBB"], playerMoves: [{ id: player.id, fromTeamCode: "BBB", toTeamCode: "AAA", destinationSlot: "regular" }], pickMoves: [], qualifyingOfferMoves: [], cuts: [], promotions: [], pickClauses: [], existingClauseAgreementIds: [] }, input.teams, []);
    const payload = tradeImportPayload(imported);
    if (omitSnapshots) delete payload.playerSnapshots;
    const text = tradeSimulationRecap({ ...imported, teams: input.teams, existingClauseAgreements: [] }, format);
    return { input, text: withTradeImportPayload(text, payload) };
  }
  function importText(input: Props, text: string) {
    find<{ onClick: () => void }>(draw(input), (element) => element.type === "button" && element.props.children === "Importa scambio tramite testo").props.onClick();
    const panel = find<Record<string, unknown>>(draw(input), (element) => element.props.className === "trade-import-panel");
    find<{ onChange: (event: { target: { value: string } }) => void }>(panel, (element) => element.type === "textarea").props.onChange({ target: { value: text } });
    find<{ onClick: () => void }>(draw(input), (element) => element.type === "button" && element.props.children === "Importa").props.onClick();
  }

  it.each(["current", "legacy"] as const)("importa integralmente il formato %s", (format) => {
    const { input, text } = fixture(format, format === "legacy");
    importText(input, text);
    expect(hooks.values[1]).toEqual([expect.objectContaining({ name: "Importato", toTeamCode: "AAA", destinationSlot: "regular" })]);
    expect(hooks.values[10]).toBe(false);
    expect(hooks.values[12]).toBe("");
  });

  it("rifiuta il testo visibile modificato e non compila nulla", () => {
    const { input, text } = fixture();
    importText(input, text.replace("Riceve: Importato", "Riceve: Diverso"));
    expect(hooks.values[1]).toEqual([]);
    expect(hooks.values[10]).toBe(true);
    expect(hooks.values[12]).toMatch(/non coincide esattamente/);
  });

  it("rifiuta il nuovo testo privo dei dati di confronto dei giocatori", () => {
    const { input, text } = fixture("current", true);
    importText(input, text);
    expect(hooks.values[1]).toEqual([]);
    expect(hooks.values[12]).toMatch(/non coincide esattamente/);
  });

  it("rifiuta una situazione cambiata senza alterare lo scambio già compilato", () => {
    const { input, text } = fixture();
    draw(input);
    hooks.values[2] = [{ ...teams[0].picks[0], fromTeamCode: "AAA", toTeamCode: "BBB", clause: "none" }];
    const before = structuredClone(hooks.values.slice(0, 9));
    const changed = { ...input, teams: input.teams.map((team) => ({ ...team, players: team.players.map((player) => ({ ...player, cost: 4 })) })) };
    importText(changed, text);
    expect(hooks.values.slice(0, 9)).toEqual(before);
    expect(hooks.values[12]).toMatch(/cambiati dopo la simulazione/);
  });
});
