import type { LeaguePhase, RosterEntry } from "@/lib/league-types";

export function advanceSeasonName(name: string) {
  const match = name.match(/^(\d{4})\/(\d{2})$/);
  if (!match) return name;
  const start = Number(match[1]) + 1;
  return `${start}/${String((start + 1) % 100).padStart(2, "0")}`;
}

export function displayedSeasonName(name: string) {
  return name;
}

export function followingSeasonName(name: string, distance = 1) {
  let result = name;
  for (let index = 0; index < distance; index += 1) result = advanceSeasonName(result);
  return result;
}

export function previousSeasonName(name: string) {
  const match = name.match(/^(\d{4})\/(\d{2})$/);
  if (!match) return name;
  const start = Number(match[1]) - 1;
  return `${start}/${String((start + 1) % 100).padStart(2, "0")}`;
}

export function seasonEndYear(name: string) {
  const match = name.match(/^(\d{4})\/(\d{2})$/);
  if (!match) return null;
  const start = Number(match[1]);
  return Math.floor(start / 100) * 100 + Number(match[2]);
}

export function shouldCountTeamOptions(phase: LeaguePhase, teamOptionsResolved: boolean) {
  return phase !== "offseason" || teamOptionsResolved;
}

export function contractCostForSeason(entry: RosterEntry, seasonName: string) {
  const targetEndYear = seasonEndYear(seasonName);
  const expiry = Number(entry.contract.match(/\d{2}/)?.[0] ?? 0);
  if (targetEndYear === null || !expiry) return entry.cost;
  const fullExpiryYear = Math.floor(targetEndYear / 100) * 100 + expiry;
  const doublesInFinalYear = /\((?:2X|X2)\)/i.test(entry.contract) && fullExpiryYear === targetEndYear;
  return entry.cost * (doublesInFinalYear ? 2 : 1);
}

export function calculateCapSpace({
  entries,
  seasonName,
  optionSeasonName,
  countTeamOptions,
}: {
  entries: RosterEntry[];
  seasonName: string;
  optionSeasonName: string;
  countTeamOptions: boolean;
}) {
  const targetEndYear = seasonEndYear(seasonName);
  const optionEndYear = seasonEndYear(optionSeasonName);
  if (targetEndYear === null) return 1000;

  const committed = entries.reduce((total, entry) => {
    if (entry.contract === "T.O.") {
      return countTeamOptions && targetEndYear === optionEndYear ? total + entry.cost : total;
    }
    if (["", "-", "PENDING", "DA ASSEGNARE"].includes(entry.contract.trim().toLocaleUpperCase("it"))) {
      return targetEndYear === optionEndYear ? total + entry.cost : total;
    }
    const expiry = Number(entry.contract.match(/\d{2}/)?.[0] ?? 0);
    const fullExpiryYear = Math.floor(targetEndYear / 100) * 100 + expiry;
    if (fullExpiryYear < targetEndYear) return total;
    return total + contractCostForSeason(entry, seasonName);
  }, 0);
  return 1000 - committed;
}
