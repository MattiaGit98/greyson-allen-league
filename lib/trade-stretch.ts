import type { RosterEntry } from "./league-types";
import type { TradeExistingStretch } from "./rules/trade";
import { calculateCapSpace, followingSeasonName, seasonEndYear } from "./season-time";
import { allowedStretchYears, stretchInstallmentForEntry } from "./stretch-provision";

export type TradeStretchRequest = { id: string; teamCode: string; years: 2 | 3; cost: number; contract: string };

export type TradeStretchContract = Omit<TradeExistingStretch, "years"> & {
  name: string;
  cost: number;
  contract: string;
  stateIndex: number;
};
export type TradeStretchMove = TradeStretchContract & { years: 2 | 3 };

/** Indici dello stato completo: distinguono anche omonimi fra i tagliati, senza collegarli al listone. */
export function tradeStretchContracts(entries: RosterEntry[], seasonName: string, countTeamOptions: boolean): TradeStretchContract[] {
  const endYear = seasonEndYear(seasonName);
  if (endYear === null) throw new Error("Annata non valida.");
  return entries.flatMap((entry, stateIndex) => {
    const stretchOptions = allowedStretchYears(entry, endYear);
    if (!stretchOptions.length) return [];
    const shortExpiry = Number(entry.contract.match(/\d{2}/)![0]);
    const remainingYears = Math.floor(endYear / 100) * 100 + shortExpiry - endYear + 1;
    const charge = (distance: number) => 1000 - calculateCapSpace({
      entries: [entry], seasonName: followingSeasonName(seasonName, distance), optionSeasonName: seasonName, countTeamOptions,
    });
    return [{
      id: `${entry.teamCode}:cut:${stateIndex}:${entry.name}`, teamCode: entry.teamCode, stateIndex,
      name: entry.name, cost: entry.cost, contract: entry.contract,
      currentCapCost: charge(0), residualCost: entry.cost * remainingYears, stretchOptions,
      futureCapCosts: Object.fromEntries([1, 2].map((distance) => [followingSeasonName(seasonName, distance), charge(distance)])),
    }];
  });
}

export function resolveTradeStretches(input: {
  entries: RosterEntry[]; requests: TradeStretchRequest[]; participantCodes: string[]; seasonName: string; countTeamOptions: boolean;
}) {
  const changes: { stateIndex: number; entry: RosterEntry }[] = [];
  const stretches = hydrateTradeStretches(input.requests, tradeStretchContracts(input.entries, input.seasonName, input.countTeamOptions), input.participantCodes);
  for (const source of stretches) {
    const entry = input.entries[source.stateIndex];
    const endYear = seasonEndYear(input.seasonName)!;
    changes.push({ stateIndex: source.stateIndex, entry: {
      ...entry, cost: stretchInstallmentForEntry(entry, endYear, source.years),
      contract: String(endYear + source.years - 1).slice(-2), stretchProvisionApplied: true,
    } });
  }
  return { changes, stretches };
}

export function hydrateTradeStretches(requests: TradeStretchRequest[], contracts: TradeStretchContract[], participantCodes: string[]): TradeStretchMove[] {
  const candidates = new Map(contracts.map((entry) => [entry.id, entry]));
  const seen = new Set<string>();
  return requests.map((request) => {
    const source = candidates.get(request.id);
    if (!source || source.teamCode !== request.teamCode || !participantCodes.includes(request.teamCode)
      || seen.has(request.id) || !source.stretchOptions.includes(request.years)
      || source.cost !== request.cost || source.contract !== request.contract) {
      throw new Error("Una stretch su un contratto già tagliato non è più valida. Controlla squadra, contratto e numero di rate.");
    }
    seen.add(request.id);
    return { ...source, years: request.years };
  });
}
