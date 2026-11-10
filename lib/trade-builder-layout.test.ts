import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TradeBuilder } from "../app/admin/scambi/trade-builder";
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
      return [hooks.values[index], (next: unknown) => {
        hooks.values[index] = typeof next === "function" ? next(hooks.values[index]) : next;
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
function addTeam(node: React.ReactNode) {
  find<{ onClick: () => void }>(node, (element) => element.type === "button" && element.props.children === "+ Aggiungi squadra").props.onClick();
}
function agreement(clause: ExistingTradeClauseAgreement["clause"], overrides: Partial<ExistingTradeClauseAgreement> = {}): ExistingTradeClauseAgreement {
  return { agreementId: clause, subjectPickId: "AAA-pick", counterpartyPickId: "BBB-pick",
    subjectOwnerTeamCode: "AAA", counterpartyOwnerTeamCode: "BBB", subjectYear: 2028, counterpartyYear: 2028,
    subjectRound: "1° giro", counterpartyRound: "1° giro", clause, label: `Fixture ${clause}`, subjectIndex: 0, counterpartyIndex: 1, ...overrides };
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
    expect(mobile).toContain(".trade-toolbar, .trade-participants, .trade-import-panel, .trade-summary-grid, .trade-validation, .trade-submit { margin-right: 8px; margin-left: 8px; }");
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
